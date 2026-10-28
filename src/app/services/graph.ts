import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import {
  EMPTY,
  Observable,
  catchError,
  defer,
  expand,
  finalize,
  forkJoin,
  map,
  reduce,
  switchMap,
  tap,
  throwError,
} from 'rxjs';

import { MsalService } from '@azure/msal-angular';
import { CacheLookupPolicy, InteractionRequiredAuthError } from '@azure/msal-browser';

import { EmployeeActivity } from '../models/employee.model';
import { SignInEvent } from '../models/day-activity.model';
import { AuthService, GRAPH_SCOPES } from './auth';
import { WORK_END_HOUR, WORK_START_HOUR } from './day-activity';

/** What the dashboard is waiting on right now. Drives the loader steps. */
export type LoadStage = 'idle' | 'token' | 'fetching' | 'preparing';

/** How far back the dashboard loads sign-ins. Smaller = faster. */
const SIGN_IN_DAYS = 7;

/** Rows per dashboard request. Bigger pages are much slower. */
const PAGE_SIZE = 500;

/** Safety cap for one person's day: 5 pages of 1000 events per type. */
const DAY_MAX_PAGES = 5;

const SIGN_INS_V1 = 'https://graph.microsoft.com/v1.0/auditLogs/signIns';

/**
 * Background (non-interactive) sign-ins are only available on the beta API.
 * Same permission (AuditLog.Read.All). Microsoft may change beta APIs.
 */
const SIGN_INS_BETA = 'https://graph.microsoft.com/beta/auditLogs/signIns';

interface GraphPage<T> {
  value: T[];
  '@odata.nextLink'?: string;
}

@Injectable({ providedIn: 'root' })
export class GraphService {
  private http = inject(HttpClient);
  private msal = inject(MsalService);
  private auth = inject(AuthService);

  readonly stage = signal<LoadStage>('idle');

  /** Dashboard list: interactive sign-ins for the last few days. */
  getEmployees(): Observable<EmployeeActivity[]> {
    this.stage.set('token');

    return this.accessToken().pipe(
      switchMap((token) => {
        this.stage.set('fetching');

        const params = new HttpParams()
          .set('$filter', `createdDateTime ge ${isoUtc(daysAgo(SIGN_IN_DAYS))}`)
          .set('$top', PAGE_SIZE);

        const start = performance.now();

        return this.http
          .get<GraphPage<any>>(SIGN_INS_V1, {
            params,
            headers: bearer(token),
          })
          .pipe(tap((res) => console.log(`[Graph] ${res.value.length} sign-ins in ${ms(start)}`)));
      }),

      tap(() => this.stage.set('preparing')),
      map((res) => res.value.map(toEmployeeActivity)),
      finalize(() => this.stage.set('idle')),
    );
  }

  /**
   * Every sign-in one person made during working hours (6 AM–6 PM local)
   * on one day: interactive sign-ins plus background token renewals.
   * Only that window is requested, so nothing outside it is downloaded.
   */
  getUserDay(userPrincipalName: string, day: Date): Observable<SignInEvent[]> {
    const from = new Date(day.getFullYear(), day.getMonth(), day.getDate(), WORK_START_HOUR);
    const to = new Date(day.getFullYear(), day.getMonth(), day.getDate(), WORK_END_HOUR);

    const upn = userPrincipalName.replace(/'/g, "''");
    const base =
      `userPrincipalName eq '${upn}' and ` +
      `createdDateTime ge ${isoUtc(from)} and createdDateTime lt ${isoUtc(to)}`;

    const start = performance.now();

    return this.accessToken().pipe(
      switchMap((token) =>
        forkJoin([
          this.fetchAll(`${base} and signInEventTypes/any(t: t eq 'interactiveUser')`, token).pipe(
            map((items) => items.map((i) => toSignInEvent(i, true))),
          ),

          this.fetchAll(
            `${base} and signInEventTypes/any(t: t eq 'nonInteractiveUser')`,
            token,
          ).pipe(map((items) => items.map((i) => toSignInEvent(i, false)))),
        ]),
      ),
      map(([interactive, background]) =>
        [...interactive, ...background].sort((a, b) => a.time.getTime() - b.time.getTime()),
      ),
      tap((events) =>
        console.log(`[Graph] ${events.length} events for ${userPrincipalName} in ${ms(start)}`),
      ),
    );
  }

  // ---------- internals ----------

  /** Follows @odata.nextLink up to DAY_MAX_PAGES pages. */
  private fetchAll(filter: string, token: string): Observable<any[]> {
    const headers = bearer(token);
    const params = new HttpParams().set('$filter', filter).set('$top', 1000);
    let pages = 1;

    return this.http.get<GraphPage<any>>(SIGN_INS_BETA, { params, headers }).pipe(
      expand((page) => {
        const next = page['@odata.nextLink'];
        if (!next || pages >= DAY_MAX_PAGES) {
          return EMPTY;
        }
        pages++;
        return this.http.get<GraphPage<any>>(next, { headers });
      }),
      reduce((all, page) => all.concat(page.value), [] as any[]),
    );
  }

  /** Token from cache or refresh token only; never a redirect or hidden iframe. */
  private accessToken(): Observable<string> {
    return defer(() => {
      const account = this.msal.instance.getActiveAccount();

      if (!account) {
        return throwError(() => new Error('No signed-in account'));
      }

      return this.msal
        .acquireTokenSilent({
          account,
          scopes: GRAPH_SCOPES,
          cacheLookupPolicy: CacheLookupPolicy.AccessTokenAndRefreshToken,
        })
        .pipe(
          map((result) => result.accessToken),
          catchError((error) => {
            if (error instanceof InteractionRequiredAuthError) {
              this.auth.sessionExpired();
            }
            return throwError(() => error);
          }),
        );
    });
  }
}

function toEmployeeActivity(item: any): EmployeeActivity {
  return {
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
    resource: item.resourceDisplayName,
  } as EmployeeActivity;
}

function toSignInEvent(item: any, interactive: boolean): SignInEvent {
  return {
    id: item.id,
    time: new Date(item.createdDateTime),
    app: item.appDisplayName?.trim() || 'Unknown app',
    resource: item.resourceDisplayName,
    interactive,
    success: item.status?.errorCode === 0,
    failureReason: item.status?.failureReason,
    ipAddress: item.ipAddress,
    city: item.location?.city,
    country: item.location?.countryOrRegion,
    browser: item.deviceDetail?.browser,
    operatingSystem: item.deviceDetail?.operatingSystem,
  };
}

function bearer(token: string): HttpHeaders {
  return new HttpHeaders({ Authorization: `Bearer ${token}` });
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

/** Graph filters want UTC without milliseconds: 2026-10-28T00:00:00Z */
function isoUtc(date: Date): string {
  return date.toISOString().split('.')[0] + 'Z';
}

function ms(start: number): string {
  return `${Math.round(performance.now() - start)} ms`;
}
