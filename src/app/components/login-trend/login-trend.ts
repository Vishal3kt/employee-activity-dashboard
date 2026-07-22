import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

import { EmployeeActivity } from '../../models/employee.model';

@Component({
  selector: 'app-login-trend',
  standalone: true,
  imports: [
    CommonModule,
  ],
  templateUrl: './login-trend.html'
})
export class LoginTrend implements OnChanges {

  @Input()
  employees: EmployeeActivity[] = [];

  ngOnChanges() {

    const data = new Map<string, number>();

    this.employees.forEach(x => {

      const day = new Date(x.loginTime)
        .toLocaleDateString();

      data.set(
        day,
        (data.get(day) || 0) + 1
      );

    });

    // this.chartOptions = {

    //   title: {
    //     text: 'Login Trend'
    //   },

    //   xAxis: {
    //     categories: [...data.keys()]
    //   },

    //   series: [

    //     {

    //       type: 'column',

    //       data: [...data.values()]

    //     }

    //   ]

    // };

  }

}