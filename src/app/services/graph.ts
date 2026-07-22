import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, switchMap, map } from 'rxjs';
import { MsalService } from '@azure/msal-angular';

import { EmployeeActivity } from '../models/employee.model';

@Injectable({
  providedIn: 'root'
})
export class GraphService {

  private http = inject(HttpClient);
  private msal = inject(MsalService);

  getEmployees(): Observable<EmployeeActivity[]> {

    const account = this.msal.instance.getActiveAccount()
      ?? this.msal.instance.getAllAccounts()[0];

    return this.msal.acquireTokenSilent({
      account,
      scopes: [
        'User.Read',
        'AuditLog.Read.All',
        'Directory.Read.All'
      ]
    }).pipe(

      switchMap(result => {

        console.log('TOKEN', result.accessToken);

        return this.http.get<any>(
          'https://graph.microsoft.com/v1.0/auditLogs/signIns?$top=500',
          {
            headers: new HttpHeaders({
              Authorization: `Bearer ${result.accessToken}`
            })
          }
        );

      }),

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
      )

    );

  }

}