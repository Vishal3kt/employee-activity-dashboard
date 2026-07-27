import { Component, OnDestroy, OnInit } from '@angular/core';

import { Header } from '../../components/header/header';
import { DashboardCards } from '../../components/dashboard-cards/dashboard-cards';
import { EmployeeTable } from '../../components/employee-table/employee-table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { GraphService } from '../../services/graph';
import { finalize } from 'rxjs';
import { EmployeeActivity } from '../../models/employee.model';
// import { BrowserChart } from '../../components/browser-chart/browser-chart';
// import { ApplicationChart } from '../../components/application-chart/application-chart';
// import { CityChart } from '../../components/city-chart/city-chart';
import { MsalService } from '@azure/msal-angular';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    Header,
    DashboardCards,
    CommonModule,
    EmployeeTable,
      MatProgressSpinnerModule
    // BrowserChart,
    // ApplicationChart,
    // CityChart
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss'
})
export class Dashboard implements OnInit, OnDestroy {

  employees: EmployeeActivity[] = [];

selectedApplication = '';
loading = true;

  constructor(
    private graph: GraphService,
    private msal: MsalService
  ) {
      console.log('Dashboard Constructor');
  }

 ngOnInit() { console.log('Dashboard OnInit');

  const account =
    this.msal.instance.getActiveAccount() ??
    this.msal.instance.getAllAccounts()[0];

  if (account) {

    this.msal.instance.setActiveAccount(account);

    console.log('Active Account:', account);

    this.loadData();

  } else {

    console.log('No account found');

  }

}

ngOnDestroy() {
  console.log('Dashboard Destroy');
}

loadData() {

  console.log('Loading data...');

  this.loading = false;

  this.graph.getEmployees().subscribe({

    next: data => {
console.log('Next called');
      console.log('Dashboard Next');
      console.log(data.length);

      this.employees = data;
      this.loading = false;
 console.log(this.loading);
  console.log(this.employees.length);
    },

    error: err => {

      console.log('Dashboard Error');
      console.error(err);

      this.loading = false;

    },

    complete: () => {

      console.log('Completed');

    }

  });

}
onApplicationSelected(application: any) {
  this.selectedApplication = application;
}

}