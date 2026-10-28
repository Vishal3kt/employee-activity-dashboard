import { AfterViewInit, Component, Input, ViewChild, inject } from '@angular/core';

import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatSelectModule } from '@angular/material/select';
import { MatDialog } from '@angular/material/dialog';

import { EmployeeActivity } from '../../models/employee.model';
import { EmployeeDay } from '../employee-day/employee-day';

@Component({
  selector: 'app-employee-table',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatTableModule,
    MatFormFieldModule,
    MatInputModule,
    MatPaginatorModule,
    MatSortModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatSelectModule,
  ],
  templateUrl: './employee-table.html',
  styleUrl: './employee-table.scss',
})
export class EmployeeTable implements AfterViewInit {
  private dialog = inject(MatDialog);

  private _employees: EmployeeActivity[] = [];
  private _selectedApplication = '';

  @Input()
  set employees(value: EmployeeActivity[]) {
    this._employees = value || [];
    // Fixed: previously the data was overwritten right after filtering,
    // which threw the active filters away.
    this.refreshTable();
  }

  get employees(): EmployeeActivity[] {
    return this._employees;
  }

  @Input()
  set selectedApplication(value: string) {
    this._selectedApplication = value || '';
    this.refreshTable();
  }

  get selectedApplication(): string {
    return this._selectedApplication;
  }

  search = '';

  statusOptions = ['All', 'Active', 'Failed'];
  selectedStatus = 'All';

  displayedColumns = [
    'employee',
    'application',
    'browser',
    'city',
    'loginTime',
    'status',
    'action',
  ];

  dataSource = new MatTableDataSource<EmployeeActivity>();

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  ngAfterViewInit(): void {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;

    this.dataSource.sortingDataAccessor = (item, property) => {
      if (property === 'loginTime') {
        return new Date(item.loginTime).getTime();
      }
      if (property === 'employee') {
        return item.name?.toLowerCase() ?? '';
      }
      return (item[property as keyof EmployeeActivity] as string) ?? '';
    };

    this.refreshTable();
  }

  refreshTable(): void {
    let data = [...this._employees];

    if (this._selectedApplication) {
      data = data.filter((x) => x.application === this._selectedApplication);
    }

    if (this.selectedStatus !== 'All') {
      data = data.filter((x) => x.status === this.selectedStatus);
    }

    const value = this.search.trim().toLowerCase();

    if (value) {
      data = data.filter(
        (x) =>
          x.name?.toLowerCase().includes(value) ||
          x.email?.toLowerCase().includes(value) ||
          x.application?.toLowerCase().includes(value) ||
          x.browser?.toLowerCase().includes(value) ||
          x.city?.toLowerCase().includes(value),
      );
    }

    this.dataSource.data = data;
    this.paginator?.firstPage();
  }

  onStatusChange(): void {
    this.refreshTable();
  }

  clearFilter(): void {
    this._selectedApplication = '';
    this.selectedStatus = 'All';
    this.search = '';
    this.refreshTable();
  }

  /** Opens the employee's day as a full-height panel on the right. */
  viewEmployee(employee: EmployeeActivity): void {
    this.dialog.open(EmployeeDay, {
      data: employee,
      position: { top: '0', right: '0' },
      width: '760px',
      maxWidth: '100vw',
      height: '100vh',
      maxHeight: '100vh',
      panelClass: 'employee-day-panel',
      autoFocus: 'dialog',
    });
  }
}
