import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';

import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { EmployeeActivity } from '../../models/employee.model';
import { DaySummary, TimelineItem } from '../../models/day-activity.model';
import { GraphService } from '../../services/graph';
import {
  IDLE_GAP_MINUTES,
  WORK_END_HOUR,
  WORK_START_HOUR,
  buildDaySummary,
  formatMinutes,
  startOfDay,
  toDateInputValue,
} from '../../services/day-activity';

@Component({
  selector: 'app-employee-day',
  standalone: true,
  imports: [DatePipe, MatDialogModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './employee-day.html',
  styleUrl: './employee-day.scss',
})
export class EmployeeDay implements OnInit {
  readonly employee = inject<EmployeeActivity>(MAT_DIALOG_DATA);

  private graph = inject(GraphService);
  private dialogRef = inject(MatDialogRef<EmployeeDay>);
  private destroyRef = inject(DestroyRef);

  /** Opens on the day of the row that was clicked. */
  readonly day = signal(startOfDay(new Date(this.employee.loginTime)));

  readonly summary = signal<DaySummary | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly today = startOfDay(new Date());
  readonly todayValue = toDateInputValue(this.today);
  readonly isToday = computed(() => this.day().getTime() >= this.today.getTime());
  readonly dayValue = computed(() => toDateInputValue(this.day()));

  /** Clock hours in the working window: 6, 7, … 17 */
  readonly hours = Array.from(
    { length: WORK_END_HOUR - WORK_START_HOUR },
    (_, i) => WORK_START_HOUR + i,
  );

  readonly windowLabel = `${this.hourLabel(WORK_START_HOUR, true)}–${this.hourLabel(WORK_END_HOUR, true)}`;
  readonly idleThreshold = formatMinutes(IDLE_GAP_MINUTES);
  readonly formatMinutes = formatMinutes;

  readonly initials = (this.employee.name || this.employee.email || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');

  private request?: Subscription;

  ngOnInit(): void {
    this.load();
  }

  shiftDay(days: number): void {
    const next = new Date(this.day());
    next.setDate(next.getDate() + days);
    if (next.getTime() > this.today.getTime()) {
      return;
    }
    this.setDay(next);
  }

  goToday(): void {
    this.setDay(this.today);
  }

  pickDate(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (!value) {
      return;
    }
    const [y, m, d] = value.split('-').map(Number);
    this.setDay(new Date(y, m - 1, d));
  }

  load(): void {
    this.request?.unsubscribe();
    this.loading.set(true);
    this.error.set(null);

    const day = this.day();

    this.request = this.graph
      .getUserDay(this.employee.email, day)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (events) => {
          this.summary.set(buildDaySummary(day, events));
          this.loading.set(false);
        },
        error: (err) => {
          console.error(err);
          this.error.set(
            err?.status === 403
              ? 'Your account can’t read background sign-ins. Ask an administrator for the Reports Reader or Security Reader role.'
              : 'This day couldn’t be loaded. Check your connection and try again.',
          );
          this.loading.set(false);
        },
      });
  }

  close(): void {
    this.dialogRef.close();
  }

  /** 0 = none, 1 = light, 2 = medium, 3 = heavy use in that hour. */
  level(count: number): number {
    if (count === 0) return 0;
    if (count <= 2) return 1;
    if (count <= 5) return 2;
    return 3;
  }

  /** 6 → "6a" (or "6 AM" when long), 12 → "12p", 18 → "6p" */
  hourLabel(hour: number, long = false): string {
    const suffix = hour < 12 || hour === 24 ? (long ? ' AM' : 'a') : long ? ' PM' : 'p';
    const h = hour % 12 === 0 ? 12 : hour % 12;
    return `${h}${suffix}`;
  }

  /** slot = index within the working window (0 = 6 AM) */
  cellTitle(app: string, slot: number, count: number): string {
    if (!count) return '';
    const hour = WORK_START_HOUR + slot;
    return `${app}: ${count} sign-in${count === 1 ? '' : 's'}, ${this.hourLabel(hour)}–${this.hourLabel(hour + 1)}`;
  }

  trackItem(index: number, item: TimelineItem): string {
    return `${item.start.getTime()}-${item.app}-${index}`;
  }

  private setDay(day: Date): void {
    this.day.set(startOfDay(day));
    this.load();
  }
}
