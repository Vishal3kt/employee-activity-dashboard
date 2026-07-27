import {
  AfterViewInit,
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
    MatCardModule
  ],
  templateUrl: './employee-table.html',
  styleUrl: './employee-table.scss'
})
export class EmployeeTable implements OnChanges, AfterViewInit {

  @Input() employees: EmployeeActivity[] = [];

  search = '';

  selectedEmployee?: EmployeeActivity;

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

  @ViewChild(MatPaginator)
  paginator!: MatPaginator;

  @ViewChild(MatSort)
  sort!: MatSort;

  ngOnChanges(): void {

    this.dataSource.data = this.employees;

    this.dataSource.filterPredicate = (data, filter) => {

      filter = filter.trim().toLowerCase();

      return (
        data.name.toLowerCase().includes(filter) ||
        data.email.toLowerCase().includes(filter) ||
        data.application.toLowerCase().includes(filter) ||
        data.browser.toLowerCase().includes(filter) ||
        data.city.toLowerCase().includes(filter)
      );

    };

    if (this.paginator) {
      this.dataSource.paginator = this.paginator;
    }

  }

  ngAfterViewInit(): void {

    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;

    this.dataSource.sortingDataAccessor = (item, property) => {

      if (property === 'loginTime') {
        return new Date(item.loginTime).getTime();
      }

      return item[property as keyof EmployeeActivity] ?? '';

    };

  }

  applyFilter(event: Event): void {

    const value = (event.target as HTMLInputElement).value;

    this.dataSource.filter = value.trim().toLowerCase();

    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }

  }

  viewEmployee(employee: EmployeeActivity): void {
    this.selectedEmployee = employee;
  }

}