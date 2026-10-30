import {
  AfterViewInit,
  Component,
  ViewChild,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';

import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { EmployeeRow, PRESENCE_LABELS, PresenceState } from '../../models/team.model';

type StatusFilter = 'all' | 'signed-in' | 'not-signed-in' | 'failed' | PresenceState;

@Component({
  selector: 'app-employee-list',
  standalone: true,
  imports: [
    DatePipe,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: './employee-list.html',
  styleUrl: './employee-list.scss',
})
export class EmployeeList implements AfterViewInit {
  readonly rows = input.required<EmployeeRow[]>();

  /** Shows the Teams status column and filters (FEATURES.teamsPresence). */
  readonly presenceEnabled = input(false);

  readonly view = output<EmployeeRow>();

  readonly search = signal('');
  readonly department = signal('all');
  readonly status = signal<StatusFilter>('all');

  readonly departments = computed(() =>
    [
      ...new Set(
        this.rows()
          .map((r) => r.department)
          .filter((d): d is string => !!d),
      ),
    ].sort((a, b) => a.localeCompare(b)),
  );

  readonly statusOptions = computed(() => {
    const options: { value: StatusFilter; label: string }[] = [
      { value: 'all', label: 'All employees' },
      { value: 'signed-in', label: 'Signed in today' },
      { value: 'not-signed-in', label: 'Not signed in yet' },
      { value: 'failed', label: 'Failed sign-ins today' },
    ];
    if (this.presenceEnabled()) {
      options.push(
        { value: 'available', label: 'Available now' },
        { value: 'busy', label: 'Busy now' },
        { value: 'meeting', label: 'In a meeting now' },
        { value: 'away', label: 'Away now' },
        { value: 'offline', label: 'Offline now' },
      );
    }
    return options;
  });

  readonly displayedColumns = computed(() => [
    'employee',
    'department',
    ...(this.presenceEnabled() ? ['presence'] : []),
    'firstSignIn',
    'lastSignIn',
    'signIns',
    'action',
  ]);

  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const department = this.department();
    const status = this.status();

    return this.rows().filter((r) => {
      if (
        term &&
        !(
          r.name.toLowerCase().includes(term) ||
          r.email.toLowerCase().includes(term) ||
          r.jobTitle?.toLowerCase().includes(term)
        )
      ) {
        return false;
      }

      if (department !== 'all' && r.department !== department) {
        return false;
      }

      switch (status) {
        case 'all':
          return true;
        case 'signed-in':
          return r.today.signIns > 0;
        case 'not-signed-in':
          return r.today.signIns === 0;
        case 'failed':
          return r.today.failed > 0;
        default:
          return r.presence === status;
      }
    });
  });

  readonly hasFilters = computed(
    () => !!this.search().trim() || this.department() !== 'all' || this.status() !== 'all',
  );

  readonly dataSource = new MatTableDataSource<EmployeeRow>([]);

  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild(MatPaginator) paginator!: MatPaginator;

  /** Last filter combination, to tell a filter change from a data refresh. */
  private lastFilterKey = '';

  constructor() {
    // Keep the table in step with the data and filters.
    // Go back to page 1 only when the filters change, not on a refresh.
    effect(() => {
      const rows = this.filtered();
      const key = `${this.search()}|${this.department()}|${this.status()}`;

      this.dataSource.data = rows;

      if (key !== this.lastFilterKey) {
        this.lastFilterKey = key;
        this.paginator?.firstPage();
      }
    });
  }

  ngAfterViewInit(): void {
    this.dataSource.sort = this.sort;
    this.dataSource.paginator = this.paginator;

    this.dataSource.sortingDataAccessor = (row, column) => {
      switch (column) {
        case 'employee':
          return row.name.toLowerCase();
        case 'department':
          return (row.department ?? '').toLowerCase();
        case 'presence':
          return row.presence ?? '';
        // People who haven't signed in sort last
        case 'firstSignIn':
          return row.today.firstSignIn?.getTime() ?? Number.MAX_SAFE_INTEGER;
        case 'lastSignIn':
          return row.today.lastSignIn?.getTime() ?? 0;
        case 'signIns':
          return row.today.signIns;
        default:
          return '';
      }
    };
  }

  onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  clearFilters(): void {
    this.search.set('');
    this.department.set('all');
    this.status.set('all');
  }

  presenceLabel(state: PresenceState | undefined): string {
    return PRESENCE_LABELS[state ?? 'unknown'];
  }

  initials(name: string): string {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join('');
  }
}
