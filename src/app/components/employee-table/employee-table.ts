import { AfterViewInit, Component, Input, OnChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';

import { MatTableDataSource, MatTableModule, } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';

import { MatButtonModule } from '@angular/material/button';

import { MatIconModule } from '@angular/material/icon';

import { MatChipsModule } from '@angular/material/chips';

import { FormsModule } from '@angular/forms';

import { EmployeeActivity } from '../../models/employee.model';
import { CdkTableDataSourceInput } from '@angular/cdk/table';

@Component({
  selector: 'app-employee-table',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatTableModule,
    MatFormFieldModule,
    MatInputModule,
    MatChipsModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatPaginator
],
  templateUrl: './employee-table.html',
  styleUrl: './employee-table.scss'
})
export class EmployeeTable implements OnChanges,AfterViewInit{

  @Input() employees: EmployeeActivity[] = [];

  search = '';

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
filteredEmployees: CdkTableDataSourceInput<any> | undefined;

ngOnChanges() {
  this.dataSource.data = this.employees;

  this.dataSource.filterPredicate = (data, filter) => {

    filter = filter.trim().toLowerCase();

    return (
      data.name.toLowerCase().includes(filter) ||
      data.email.toLowerCase().includes(filter) ||
      data.application.toLowerCase().includes(filter) ||
      data.city.toLowerCase().includes(filter)
    );

  };
}

ngAfterViewInit() {

  this.dataSource.paginator = this.paginator;
  this.dataSource.sort = this.sort;

  this.dataSource.sortingDataAccessor = (item, property) => {

    if (property === 'loginTime') {
      return new Date(item.loginTime).getTime();
    }

    return item[property as keyof EmployeeActivity] as any;

  };

}

applyFilter(event: Event) {

  const value = (event.target as HTMLInputElement).value;

  this.dataSource.filter = value.trim().toLowerCase();

}

}