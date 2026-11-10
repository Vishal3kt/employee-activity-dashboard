import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ExportDialog } from './export-dialog';

describe('ExportDialog', () => {
  let component: ExportDialog;
  let fixture: ComponentFixture<ExportDialog>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExportDialog],
    }).compileComponents();

    fixture = TestBed.createComponent(ExportDialog);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
