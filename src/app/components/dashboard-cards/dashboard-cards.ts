import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

import { EmployeeActivity } from '../../models/employee.model';

@Component({
  selector: 'app-dashboard-cards',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule
  ],
  templateUrl: './dashboard-cards.html',
  styleUrl: './dashboard-cards.scss'
})
export class DashboardCards implements OnChanges {

  @Input()
  employees: EmployeeActivity[] = [];

  totalEmployees = 0;
  activeToday = 0;
 totalApps = 0;
totalDevices = 0;
totalCities = 0;

  ngOnChanges() {

    this.totalEmployees =
      new Set(this.employees.map(x => x.email)).size;

    this.activeToday =
      this.employees.filter(x =>
        new Date(x.loginTime).toDateString() ===
        new Date().toDateString()
      ).length;

    this.totalApps =
  new Set(this.employees.map(x => x.application)).size;

this.totalDevices =
  new Set(this.employees.map(x => x.device)).size;

this.totalCities =
  new Set(this.employees.map(x => x.city)).size;
  }

}