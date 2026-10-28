import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DashboardLoader } from './dashboard-loader';

describe('DashboardLoader', () => {
  let component: DashboardLoader;
  let fixture: ComponentFixture<DashboardLoader>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardLoader],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardLoader);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
