import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FailedSignIns } from './failed-sign-ins';

describe('FailedSignIns', () => {
  let component: FailedSignIns;
  let fixture: ComponentFixture<FailedSignIns>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FailedSignIns],
    }).compileComponents();

    fixture = TestBed.createComponent(FailedSignIns);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
