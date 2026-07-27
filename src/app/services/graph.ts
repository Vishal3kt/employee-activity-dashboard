import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, switchMap, map, catchError, throwError } from 'rxjs';

import { MsalService } from '@azure/msal-angular';
import {
  InteractionRequiredAuthError,
  BrowserAuthError
} from '@azure/msal-browser';

import { EmployeeActivity } from '../models/employee.model';

@Injectable({
  providedIn: 'root'
})
export class GraphService {

  private http = inject(HttpClient);
  private msal = inject(MsalService);

  getEmployees(): Observable<EmployeeActivity[]> {

    const account =
      this.msal.instance.getActiveAccount() ??
      this.msal.instance.getAllAccounts()[0];

    if (!account) {
      this.msal.loginRedirect({
        scopes: [
          'User.Read',
          'AuditLog.Read.All',
          'Directory.Read.All'
        ]
      });

      return throwError(() => new Error('No active account'));
    }

    return this.msal.acquireTokenSilent({
      account,
      scopes: [
        'User.Read',
        'AuditLog.Read.All',
        'Directory.Read.All'
      ]
    }).pipe(

      switchMap(result =>
        this.http.get<any>(
          'https://graph.microsoft.com/v1.0/auditLogs/signIns',
          {
            headers: new HttpHeaders({
              Authorization: `Bearer ${result.accessToken}`
            })
          }
        )
      ),

      map(response =>
        response.value.map((item: any) => ({
          id: item.id,
          name: item.userDisplayName,
          email: item.userPrincipalName,
          application: item.appDisplayName,
          browser: item.deviceDetail?.browser,
          operatingSystem: item.deviceDetail?.operatingSystem,
          device: item.deviceDetail?.displayName,
          ipAddress: item.ipAddress,
          city: item.location?.city,
          country: item.location?.countryOrRegion,
          loginTime: item.createdDateTime,
          status: item.status?.errorCode === 0 ? 'Active' : 'Failed',
          resource: item.resourceDisplayName
        }))
      ),

      catchError(error => {

        console.error('MSAL Error:', error);

        if (
          error instanceof InteractionRequiredAuthError ||
          error instanceof BrowserAuthError
        ) {

          this.msal.loginRedirect({
            scopes: [
              'User.Read',
              'AuditLog.Read.All',
              'Directory.Read.All'
            ]
          });

        }

        return throwError(() => error);

      })

    );

  }

}