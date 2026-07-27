import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  Input,
  OnChanges,
  ViewChild
} from '@angular/core';

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

import { EmployeeActivity } from '../../models/employee.model';
import { MatDialog } from '@angular/material/dialog';
import { EmployeeDetails } from '../employee-details/employee-details';
import { MatSelectModule } from '@angular/material/select';
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
    MatSelectModule
  ],
  templateUrl: './employee-table.html',
  styleUrl: './employee-table.scss'
})
export class EmployeeTable implements AfterViewInit {

private _employees: EmployeeActivity[] = [];

@Input()
set employees(value: EmployeeActivity[]) {

  this._employees = value || [];

   this.refreshTable();

  this.dataSource.data = this._employees;

  if (this.paginator) {
    this.dataSource.paginator = this.paginator;
  }

  if (this.sort) {
    this.dataSource.sort = this.sort;
  }
}

get employees() {
  return this._employees;
}
private _selectedApplication = '';

@Input()
set selectedApplication(value: string) {

  this._selectedApplication = value || '';

  this.refreshTable();

}

get selectedApplication(): string {
  return this._selectedApplication;
}

  search = '';

  selectedEmployee?: EmployeeActivity;

  statusOptions = [
  'All',
  'Active',
  'Failed'
];

selectedStatus = 'All';

  displayedColumns = [
    'employee',
    'application',
    'browser',
    'city',
    'loginTime',
    'status',
    'action'
  ];

  dataSource = new MatTableDataSource<EmployeeActivity>();

constructor(
  private dialog: MatDialog,
   private cdr: ChangeDetectorRef
) {}

  @ViewChild(MatPaginator)
  paginator!: MatPaginator;

  @ViewChild(MatSort)
  sort!: MatSort;

  // ngOnChanges(): void {

  //    let data = [...this.employees];

  // if (this.selectedApplication) {

  //   data = data.filter(x =>
  //     x.application === this.selectedApplication
  //   );

  // }

  // this.dataSource.data = data;

  //   this.dataSource.filterPredicate = (data, filter) => {

  //     filter = filter.trim().toLowerCase();

  //     return (
  //       data.name.toLowerCase().includes(filter) ||
  //       data.email.toLowerCase().includes(filter) ||
  //       data.application.toLowerCase().includes(filter) ||
  //       data.browser.toLowerCase().includes(filter) ||
  //       data.city.toLowerCase().includes(filter)
  //     );

  //   };

  //   if (this.paginator) {
  //     this.dataSource.paginator = this.paginator;
  //   }

  // }

ngAfterViewInit(): void {

  this.dataSource.paginator = this.paginator;
  this.dataSource.sort = this.sort;

  this.dataSource.sortingDataAccessor = (item, property) => {

    if (property === 'loginTime') {
      return new Date(item.loginTime).getTime();
    }

    return item[property as keyof EmployeeActivity] ?? '';

  };

  this.refreshTable();
}

refreshTable(): void {

  let data = [...this._employees];

  // Application Filter
  if (this._selectedApplication) {
    data = data.filter(x => x.application === this._selectedApplication);
  }

  // Status Filter
  if (this.selectedStatus !== 'All') {
    data = data.filter(x => x.status === this.selectedStatus);
  }

  // Search Filter
  if (this.search.trim()) {

    const value = this.search.toLowerCase();

    data = data.filter(x =>
      x.name.toLowerCase().includes(value) ||
      x.email.toLowerCase().includes(value) ||
      x.application.toLowerCase().includes(value) ||
      x.browser?.toLowerCase().includes(value) ||
      x.city?.toLowerCase().includes(value)
    );

  }

  this.dataSource.data = data;

  if (this.paginator) {
    this.paginator.firstPage();
  }

}

applyFilter(event: Event): void {

  this.search = (event.target as HTMLInputElement).value;

  this.refreshTable();

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

viewEmployee(employee: EmployeeActivity): void {

  this.dialog.open(EmployeeDetails, {
width: '900px',
  maxWidth: '95vw',
  maxHeight: '90vh',
  data: employee
  });

}

}