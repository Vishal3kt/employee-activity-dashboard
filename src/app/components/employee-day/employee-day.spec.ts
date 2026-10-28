import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EmployeeDay } from './employee-day';

describe('EmployeeDay', () => {
  let component: EmployeeDay;
  let fixture: ComponentFixture<EmployeeDay>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EmployeeDay],
    }).compileComponents();

    fixture = TestBed.createComponent(EmployeeDay);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
