import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EmployeeActivity } from '../../models/employee.model';

@Component({
  selector: 'app-city-chart',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './city-chart.html',
  styleUrl: './city-chart.scss'
})
export class CityChart {

  @Input()
  employees: EmployeeActivity[] = [];

}