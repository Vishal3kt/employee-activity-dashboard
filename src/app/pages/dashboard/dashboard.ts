import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TimeoutError, finalize, timeout } from 'rxjs';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { Header } from '../../components/header/header';
import { DashboardCards } from '../../components/dashboard-cards/dashboard-cards';
import { EmployeeTable } from '../../components/employee-table/employee-table';
import { DashboardLoader } from '../../components/dashboard-loader/dashboard-loader';
import { GraphService } from '../../services/graph';
import { AuthService } from '../../services/auth';
import { EmployeeActivity } from '../../models/employee.model';

/** Give up and show an error instead of spinning forever. */
const LOAD_TIMEOUT_MS = 45_000;

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [Header, DashboardCards, EmployeeTable, DashboardLoader, MatButtonModule, MatIconModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard implements OnInit {
  private graph = inject(GraphService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  // Signals update the view reliably, with or without zone.js
  readonly employees = signal<EmployeeActivity[]>([]);
  readonly selectedApplication = signal('');
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly stage = this.graph.stage;

  ngOnInit(): void {
    // Old code stopped here with the spinner still showing.
    // Now a missing account goes back to the login page.
    if (!this.auth.isLoggedIn) {
      console.warn('[Dashboard] No account, returning to login');
      this.router.navigate(['/login'], { replaceUrl: true });
      return;
    }

    this.loadData();
  }

  loadData(): void {
    this.loading.set(true);
    this.error.set(null);

    const start = performance.now();

    this.graph
      .getEmployees()
      .pipe(
        timeout({ first: LOAD_TIMEOUT_MS }),
        finalize(() => {
          this.loading.set(false);
          console.log(`[Dashboard] finished in ${Math.round(performance.now() - start)} ms`);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (data) => this.employees.set(data),
        error: (err) => this.error.set(describeLoadError(err)),
      });
  }

  onApplicationSelected(application: string): void {
    this.selectedApplication.set(application);
  }
}

function describeLoadError(err: any): string {
  if (err instanceof TimeoutError) {
    return 'Microsoft Graph didn’t respond within 45 seconds. Try again, or load a shorter date range.';
  }

  if (err?.status === 403) {
    return 'Your account can’t read sign-in logs. Ask an administrator for the Reports Reader or Security Reader role.';
  }

  if (err?.status === 401) {
    return 'Your session has expired. Sign out and sign in again.';
  }

  return 'Sign-in activity couldn’t be loaded. Check your connection and try again.';
}
