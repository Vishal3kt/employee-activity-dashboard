import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription, TimeoutError, filter, finalize, interval, switchMap, timeout } from 'rxjs';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';

import { Header } from '../../components/header/header';
import { DashboardLoader } from '../../components/dashboard-loader/dashboard-loader';
import { EmployeeList } from '../../components/employee-list/employee-list';
import { EmployeeDay } from '../../components/employee-day/employee-day';
import { FailedSignIns } from '../../components/failed-sign-ins/failed-sign-ins';
import { ExportDialog, ExportDialogData } from '../../components/export-dialog/export-dialog';
import { FailureReport } from '../../models/report.model';
import { buildFailureReport } from '../../services/sign-in-insights';
import { GraphService, TeamToday } from '../../services/graph';
import { AuthService } from '../../services/auth';
import { EmployeeRow } from '../../models/team.model';
import { EmployeeDayData } from '../../models/day-activity.model';
import { FEATURES } from '../../services/features';

/** Give up and show an error instead of spinning forever. */
const LOAD_TIMEOUT_MS = 45_000;

/** How often Teams status refreshes while the page is open. */
const PRESENCE_REFRESH_MS = 2 * 60 * 1000;

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    DatePipe,
    Header,
    DashboardLoader,
    EmployeeList,
    FailedSignIns,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard implements OnInit {
  private graph = inject(GraphService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private destroyRef = inject(DestroyRef);

  readonly presenceEnabled = FEATURES.teamsPresence;

  readonly rows = signal<EmployeeRow[]>([]);

  /** First load: full-page loader. */
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  /** Refresh: list stays on screen, header button spins. */
  readonly refreshing = signal(false);
  readonly refreshError = signal<string | null>(null);

  readonly lastUpdated = signal<Date | null>(null);

  /** Today's failed sign-ins, analysed. */
  readonly failureReport = signal<FailureReport | null>(null);
  readonly stage = this.graph.stage;

  readonly stats = computed(() => {
    const rows = this.rows();
    const signedIn = rows.filter((r) => r.today.signIns > 0).length;
    return {
      total: rows.length,
      signedIn,
      notYet: rows.length - signedIn,
      withFailures: rows.filter((r) => r.today.failed > 0).length,
      available: rows.filter((r) => r.presence === 'available').length,
      away: rows.filter((r) => r.presence === 'away').length,
    };
  });

  private loadRequest?: Subscription;

  ngOnInit(): void {
    if (!this.auth.isLoggedIn) {
      this.router.navigate(['/login'], { replaceUrl: true });
      return;
    }

    this.loadData();

    if (FEATURES.teamsPresence) {
      this.refreshPresenceRegularly();
    }
  }

  /** First load, or "Try again" after a failed first load. */
  loadData(): void {
    this.loadRequest?.unsubscribe();
    this.loading.set(true);
    this.error.set(null);

    this.loadRequest = this.graph
      .getTeamToday()
      .pipe(
        timeout({ first: LOAD_TIMEOUT_MS }),
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (today) => this.apply(today),
        error: (err) => this.error.set(describeLoadError(err)),
      });
  }

  /**
   * Header "Refresh": reloads in the background. The list, its filters and
   * the current page stay as they are; only the numbers update.
   */
  refresh(): void {
    if (this.loading() || this.refreshing()) {
      return;
    }

    // Nothing on screen yet (first load failed): do a normal load
    if (this.rows().length === 0) {
      this.loadData();
      return;
    }

    this.loadRequest?.unsubscribe();
    this.refreshing.set(true);
    this.refreshError.set(null);

    this.loadRequest = this.graph
      .getTeamToday()
      .pipe(
        timeout({ first: LOAD_TIMEOUT_MS }),
        finalize(() => this.refreshing.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (today) => this.apply(today),
        error: (err) => this.refreshError.set(describeLoadError(err)),
      });
  }

  openExport(): void {
    const data: ExportDialogData = { employees: this.rows() };

    this.dialog.open(ExportDialog, {
      data,
      width: '560px',
      maxWidth: '95vw',
      autoFocus: 'dialog',
    });
  }

  scrollToFailures(): void {
    document
      .getElementById('failed-sign-ins')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  private apply(today: TeamToday): void {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    this.rows.set(today.rows);
    this.failureReport.set(buildFailureReport(today.todayRecords, midnight, now));
    this.lastUpdated.set(now);
  }

  openDay(row: EmployeeRow): void {
    const data: EmployeeDayData = { name: row.name, email: row.email };

    this.dialog.open(EmployeeDay, {
      data,
      position: { top: '0', right: '0' },
      width: '760px',
      maxWidth: '100vw',
      height: '100vh',
      maxHeight: '100vh',
      panelClass: 'employee-day-panel',
      autoFocus: 'dialog',
    });
  }

  /** Updates only the status dots; the rest of the list stays as loaded. */
  private refreshPresenceRegularly(): void {
    interval(PRESENCE_REFRESH_MS)
      .pipe(
        filter(() => !this.loading() && this.rows().length > 0 && !document.hidden),
        switchMap(() => this.graph.getPresence(this.rows().map((r) => r.id))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((presence) => {
        if (presence.size === 0) {
          return;
        }
        this.rows.update((rows) =>
          rows.map((r) => ({ ...r, presence: presence.get(r.id) ?? r.presence })),
        );
      });
  }
}

function describeLoadError(err: any): string {
  if (err instanceof TimeoutError) {
    return 'Microsoft Graph didn’t respond within 45 seconds. Try again in a moment.';
  }

  if (err?.status === 403) {
    return 'Your account can’t read the employee directory or sign-in logs. Ask an administrator for the Reports Reader or Global Reader role.';
  }

  if (err?.status === 401) {
    return 'Your session has expired. Sign out and sign in again.';
  }

  return 'Employee data couldn’t be loaded. Check your connection and try again.';
}
