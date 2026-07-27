import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIcon, MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule
} from '@angular/material/dialog';
import { MatDialogRef } from '@angular/material/dialog';

import { MatTableModule } from '@angular/material/table';

@Component({
  selector: 'app-application-list',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatTableModule,
      MatIconModule,
  MatButtonModule,
  MatIcon
  ],
  templateUrl: './application-list.html',
  styleUrl: './application-list.scss'
})
export class ApplicationListComponent {

  displayedColumns = ['name', 'count'];

constructor(

  @Inject(MAT_DIALOG_DATA)
  public applications: { name:string; count:number }[],

  private dialogRef: MatDialogRef<ApplicationListComponent>

) {}
select(application: string) {

  this.dialogRef.close(application);

}
}