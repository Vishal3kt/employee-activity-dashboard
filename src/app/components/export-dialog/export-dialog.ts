import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription, from, interval, switchMap, tap } from 'rxjs';

import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { Employee } from '../../models/team.model';
import { ExportMode } from '../../models/report.model';
import { GraphService } from '../../services/graph';
import { AuthService } from '../../services/auth';
import { downloadActivityWorkbook } from '../../services/excel-export';
import {
  SIGN_IN_RETENTION_DAYS,
  WORK_END_HOUR,
  WORK_START_HOUR,
  startOfDay,
  toDateInputValue,
} from '../../services/day-activity';

export interface ExportDialogData {
  employees: Employee[];
}

type ExportState = 'choose' | 'loading' | 'building' | 'done' | 'error';

type Preset = 'today' | 'yesterday' | '7' | '15' | '30' | 'custom';

/** Remembers how long one day took last time, per mode, for estimates. */
const SPEED_KEY = 'employee-activity.export-ms-per-day';

@Component({
  selector: 'app-export-dialog',
  standalone: true,
  imports: [DatePipe, MatDialogModule, MatButtonModule, MatIconModule, MatProgressBarModule],
  templateUrl: './export-dialog.html',
  styleUrl: './export-dialog.scss',
})
export class ExportDialog {
  private data = inject<ExportDialogData>(MAT_DIALOG_DATA);
  private graph = inject(GraphService);
  private auth = inject(AuthService);
  private dialogRef = inject(MatDialogRef<ExportDialog>);
  private destroyRef = inject(DestroyRef);

  readonly employeeCount = this.data.employees.length;

  // ---------- period ----------

  readonly today = startOfDay(new Date());
  readonly oldest = addDays(this.today, -SIGN_IN_RETENTION_DAYS);
  readonly todayValue = toDateInputValue(this.today);
  readonly oldestValue = toDateInputValue(this.oldest);
  readonly retentionDays = SIGN_IN_RETENTION_DAYS;

  readonly presets: { value: Preset; label: string }[] = [
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: '7', label: 'Last 7 days' },
    { value: '15', label: 'Last 15 days' },
    { value: '30', label: 'Last 30 days' },
    { value: 'custom', label: 'Custom' },
  ];

  readonly preset = signal<Preset>('yesterday');

  /** Used when preset is "custom" */
  readonly customFrom = signal(addDays(this.today, -1));
  readonly customTo = signal(addDays(this.today, -1));

  /** The days that will be exported, oldest first. */
  readonly days = computed<Date[]>(() => {
    switch (this.preset()) {
      case 'today':
        return [this.today];
      case 'yesterday':
        return [addDays(this.today, -1)];
      case '7':
        return range(addDays(this.today, -6), this.today);
      case '15':
        return range(addDays(this.today, -14), this.today);
      case '30':
        return range(addDays(this.today, -29), this.today);
      case 'custom':
        return this.customValid() ? range(this.customFrom(), this.customTo()) : [];
    }
  });

  readonly customValid = computed(
    () =>
      this.customFrom().getTime() <= this.customTo().getTime() &&
      this.customFrom().getTime() >= this.oldest.getTime() &&
      this.customTo().getTime() <= this.today.getTime(),
  );

  readonly customFromValue = computed(() => toDateInputValue(this.customFrom()));
  readonly customToValue = computed(() => toDateInputValue(this.customTo()));

  // ---------- data mode ----------

  readonly modes: { value: ExportMode; title: string; text: string }[] = [
    {
      value: 'match-app',
      title: 'Match the app',
      text: 'Includes background sign-ins, so First and Last activity, Hours with activity and No activity are identical to the app. Slow: best for a few days.',
    },
    {
      value: 'interactive',
      title: 'Faster',
      text: 'Interactive sign-ins only. Good for attendance over many days. No activity columns are left blank.',
    },
  ];
  readonly mode = signal<ExportMode>('match-app');

  /** Estimate from the last export in this mode, if there was one. */
  readonly estimate = computed(() => {
    const perDay = readSpeed()[this.mode()];
    const n = this.days().length;
    if (!perDay || !n) return '';
    return formatDuration(perDay * n);
  });

  // ---------- progress ----------

  readonly state = signal<ExportState>('choose');
  readonly done = signal(0);
  readonly total = signal(0);
  readonly stepsDone = signal(0);
  readonly stepsTotal = signal(0);
  readonly records = signal(0);
  readonly error = signal<string | null>(null);

  private startedAt = 0;
  private readonly now = signal(0);

  readonly percent = computed(() => {
    if (this.state() === 'building' || this.state() === 'done') return 100;
    return this.stepsTotal() ? Math.round((this.stepsDone() / this.stepsTotal()) * 100) : 0;
  });

  /** Based on requests finished so far, so it appears early and gets more accurate. */
  readonly timeLeft = computed(() => {
    const doneSteps = this.stepsDone();
    const totalSteps = this.stepsTotal();
    const now = this.now();
    if (doneSteps < 2 || doneSteps >= totalSteps || !this.startedAt) return '';
    const msLeft = ((now - this.startedAt) / doneSteps) * (totalSteps - doneSteps);
    return `${formatDuration(msLeft)} left`;
  });

  readonly busy = computed(() => this.state() === 'loading' || this.state() === 'building');

  /** Seconds left in a pause Microsoft asked for (429), or 0. */
  readonly pausedFor = computed(() =>
    Math.max(0, Math.ceil((this.graph.throttledUntil() - this.now()) / 1000)),
  );

  private request?: Subscription;
  private ticker?: Subscription;

  // ---------- actions ----------

  setCustomFrom(event: Event): void {
    const d = parseDateInput((event.target as HTMLInputElement).value);
    if (d) this.customFrom.set(d);
  }

  setCustomTo(event: Event): void {
    const d = parseDateInput((event.target as HTMLInputElement).value);
    if (d) this.customTo.set(d);
  }

  start(): void {
    const days = this.days();
    if (!days.length) {
      return;
    }

    const mode = this.mode();

    this.state.set('loading');
    this.error.set(null);
    this.done.set(0);
    this.total.set(days.length);
    this.stepsDone.set(0);
    this.stepsTotal.set(0);
    this.records.set(0);
    this.startedAt = Date.now();
    this.now.set(this.startedAt);

    // Keep the dialog open until the export finishes or is cancelled
    this.dialogRef.disableClose = true;

    // Keeps the pause countdown and time-left moving between progress updates
    this.ticker?.unsubscribe();
    this.ticker = interval(1000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.now.set(Date.now()));

    this.request = this.graph
      .getExportData(days, mode, (p) => {
        this.done.set(p.done);
        this.total.set(p.total);
        this.stepsDone.set(p.stepsDone);
        this.stepsTotal.set(p.stepsTotal);
        this.records.set(p.records);
        this.now.set(Date.now());
      })
      .pipe(
        tap(() => {
          saveSpeed(mode, (Date.now() - this.startedAt) / days.length);
          this.state.set('building');
        }),
        switchMap((data) =>
          from(
            downloadActivityWorkbook({
              employees: this.data.employees,
              data,
              days,
              generatedBy: this.auth.account?.name || this.auth.account?.username || 'Unknown',
              workStartHour: WORK_START_HOUR,
              workEndHour: WORK_END_HOUR,
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.ticker?.unsubscribe();
          this.state.set('done');
          this.dialogRef.disableClose = false;
        },
        error: (err) => {
          console.error('[Export] failed', err);
          this.error.set(
            err?.status === 403
              ? 'Your account can’t read sign-in logs for this period.'
              : 'The export couldn’t be completed. Check your connection and try again.',
          );
          this.ticker?.unsubscribe();
          this.state.set('error');
          this.dialogRef.disableClose = false;
        },
      });
  }

  cancel(): void {
    this.request?.unsubscribe();
    this.ticker?.unsubscribe();
    this.dialogRef.close();
  }

  close(): void {
    this.dialogRef.close();
  }
}

// ---------- helpers ----------

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return startOfDay(d);
}

/** Every day from first to last, inclusive. */
function range(first: Date, last: Date): Date[] {
  const days: Date[] = [];
  for (let d = startOfDay(first); d.getTime() <= last.getTime(); d = addDays(d, 1)) {
    days.push(d);
  }
  return days;
}

function parseDateInput(value: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return 'Less than a minute';
  if (minutes < 60) return `About ${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `About ${h} h ${m} min` : `About ${h} h`;
}

function readSpeed(): Partial<Record<ExportMode, number>> {
  try {
    return JSON.parse(localStorage.getItem(SPEED_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveSpeed(mode: ExportMode, msPerDay: number): void {
  try {
    localStorage.setItem(
      SPEED_KEY,
      JSON.stringify({ ...readSpeed(), [mode]: Math.round(msPerDay) }),
    );
  } catch {
    /* storage unavailable: no estimate next time */
  }
}
