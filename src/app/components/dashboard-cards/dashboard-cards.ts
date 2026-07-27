import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';

import { EmployeeActivity } from '../../models/employee.model';
import { ApplicationListComponent } from '../application-list/application-list';
import { Output, EventEmitter } from '@angular/core';
@Component({
  selector: 'app-dashboard-cards',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatDialogModule
  ],
  templateUrl: './dashboard-cards.html',
  styleUrl: './dashboard-cards.scss'
})
export class DashboardCards implements OnChanges {

  @Input()
  employees: EmployeeActivity[] = [];
@Output()
applicationSelected = new EventEmitter<string>();
  totalEmployees = 0;
  activeToday = 0;
  totalApps = 0;
  totalDevices = 0;
  totalCities = 0;

  applications: {
    name: string;
    count: number;
  }[] = [];

  constructor(
    private dialog: MatDialog
  ) {}

  ngOnChanges(): void {

    // Total Employees
    this.totalEmployees =
      new Set(
        this.employees
          .map(x => x.email)
          .filter(Boolean)
      ).size;

    // Today's Sign-ins
    this.activeToday =
      this.employees.filter(x =>
        new Date(x.loginTime).toDateString() ===
        new Date().toDateString()
      ).length;

    // Devices
    this.totalDevices =
      new Set(
        this.employees
          .map(x => x.device)
          .filter(Boolean)
      ).size;

    // Cities
    this.totalCities =
      new Set(
        this.employees
          .map(x => x.city)
          .filter(Boolean)
      ).size;

    // Applications
    const appMap = new Map<string, number>();

    this.employees.forEach(emp => {

      const app = emp.application?.trim() || 'Unknown';

      appMap.set(
        app,
        (appMap.get(app) || 0) + 1
      );

    });

    this.applications = Array.from(appMap.entries())
      .map(([name, count]) => ({
        name,
        count
      }))
      .sort((a, b) => b.count - a.count);

    this.totalApps = this.applications.length;

  }

 openApplications(): void {

  const dialogRef = this.dialog.open(ApplicationListComponent, {
    width: '700px',
    maxHeight: '80vh',
    data: this.applications
  });

  dialogRef.afterClosed().subscribe(app => {

    if (app) {
      this.applicationSelected.emit(app);
    }

  });

}

}