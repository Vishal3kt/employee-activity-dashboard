import { Component, Input } from '@angular/core';
import { EmployeeActivity } from '../../models/employee.model';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-application-chart',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './application-chart.html',
  styleUrl: './application-chart.scss',
})
export class ApplicationChart {
  @Input()
employees: EmployeeActivity[] = [];
}
