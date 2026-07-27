import { Component, OnInit } from '@angular/core';

import { Header } from '../../components/header/header';
import { DashboardCards } from '../../components/dashboard-cards/dashboard-cards';
import { EmployeeTable } from '../../components/employee-table/employee-table';

import { GraphService } from '../../services/graph';

import { EmployeeActivity } from '../../models/employee.model';
// import { BrowserChart } from '../../components/browser-chart/browser-chart';
// import { ApplicationChart } from '../../components/application-chart/application-chart';
// import { CityChart } from '../../components/city-chart/city-chart';
import { MsalService } from '@azure/msal-angular';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    Header,
    DashboardCards,
    EmployeeTable,
    // BrowserChart,
    // ApplicationChart,
    // CityChart
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss'
})
export class Dashboard implements OnInit {

  employees: EmployeeActivity[] = [];

  constructor(
    private graph: GraphService,
    private msal: MsalService
  ) {}

  ngOnInit() {
console.log("Accounts:", this.msal.instance.getAllAccounts());
    this.loadData();

  }

 loadData() {

  this.graph.getEmployees().subscribe({

    next: (data) => {

      console.log('Dashboard Employees', data);

      this.employees = data;

    },

    error: (err) => {

      console.error(err);

    }

  });

}

}