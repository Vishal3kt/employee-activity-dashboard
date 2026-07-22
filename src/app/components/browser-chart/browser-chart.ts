import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EmployeeActivity } from '../../models/employee.model';

@Component({
  selector: 'app-browser-chart',
  standalone: true,
  imports: [CommonModule],
  template: `<p>Browser Chart Works!</p>`
})
export class BrowserChart {

  @Input()
  employees: EmployeeActivity[] = [];

}