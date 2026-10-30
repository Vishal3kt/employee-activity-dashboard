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
  of,
  reduce,
  switchMap,
  tap,
  throwError,
} from 'rxjs';

import { MsalService } from '@azure/msal-angular';
import { CacheLookupPolicy, InteractionRequiredAuthError } from '@azure/msal-browser';

import { FEATURES } from './features';
import { SignInEvent } from '../models/day-activity.model';
import {
  Employee,
  EmployeeRow,
  PresenceState,
  SignInLite,
  TodaySummary,
} from '../models/team.model';
import { AuthService, GRAPH_SCOPES } from './auth';
import { WORK_END_HOUR, WORK_START_HOUR } from './day-activity';

/** What the dashboard is waiting on right now. Drives the loader steps. */
export type LoadStage = 'idle' | 'token' | 'fetching' | 'preparing';

const GRAPH_V1 = 'https://graph.microsoft.com/v1.0';
const GRAPH_BETA = 'https://graph.microsoft.com/beta';

/** Page caps: safety limits so a huge tenant can't hang the page. */
const MAX_USER_PAGES = 20; // 20 × 999 users
const MAX_TODAY_PAGES = 10; // 10 × 1000 interactive sign-ins
const MAX_DAY_PAGES = 5; // 5 × 1000 events per type, one person

/** Graph accepts up to 650 ids per presence request. */
const PRESENCE_BATCH = 650;

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

  /**
   * Everyone in the organisation, each with today's sign-in summary
   * (working day start until now), plus Teams presence if switched on.
   */
  getTeamToday(): Observable<EmployeeRow[]> {
    this.stage.set('token');
    const start = performance.now();

    return this.accessToken().pipe(
      switchMap((token) => {
        this.stage.set('fetching');

        return forkJoin([this.fetchEmployees(token), this.fetchTodaySignIns(token)]).pipe(
          switchMap(([employees, signIns]) => {
            this.stage.set('preparing');
            const rows = buildRows(employees, signIns);

            if (!FEATURES.teamsPresence) {
              return of(rows);
            }

            return this.fetchPresence(
              token,
              rows.map((r) => r.id),
            ).pipe(map((presence) => applyPresence(rows, presence)));
          }),
        );
      }),

      tap((rows) => console.log(`[Graph] ${rows.length} employees in ${ms(start)}`)),
      finalize(() => this.stage.set('idle')),
    );
  }

  /** Current Teams presence for these users. Only used when switched on. */
  getPresence(userIds: string[]): Observable<Map<string, PresenceState>> {
    if (!FEATURES.teamsPresence || userIds.length === 0) {
      return of(new Map());
    }

    return this.accessToken().pipe(switchMap((token) => this.fetchPresence(token, userIds)));
  }

  /**
   * Every sign-in one person made during working hours on one day:
   * interactive sign-ins plus background token renewals (Graph beta).
   */
  getUserDay(userPrincipalName: string, day: Date): Observable<SignInEvent[]> {
    const from = atHour(day, WORK_START_HOUR);
    const to = atHour(day, WORK_END_HOUR);

    const upn = userPrincipalName.replace(/'/g, "''");
    const base =
      `userPrincipalName eq '${upn}' and ` +
      `createdDateTime ge ${isoUtc(from)} and createdDateTime lt ${isoUtc(to)}`;

    const start = performance.now();

    return this.accessToken().pipe(
      switchMap((token) => {
        const page = (filter: string) =>
          this.fetchPages<any>(
            `${GRAPH_BETA}/auditLogs/signIns`,
            new HttpParams().set('$filter', filter).set('$top', 1000),
            bearer(token),
            MAX_DAY_PAGES,
          );

        return forkJoin([
          page(`${base} and signInEventTypes/any(t: t eq 'interactiveUser')`).pipe(
            map((items) => items.map((i) => toSignInEvent(i, true))),
          ),
          page(`${base} and signInEventTypes/any(t: t eq 'nonInteractiveUser')`).pipe(
            map((items) => items.map((i) => toSignInEvent(i, false))),
          ),
        ]);
      }),
      map(([interactive, background]) =>
        [...interactive, ...background].sort((a, b) => a.time.getTime() - b.time.getTime()),
      ),
      tap((events) =>
        console.log(`[Graph] ${events.length} events for ${userPrincipalName} in ${ms(start)}`),
      ),
    );
  }

  // ---------- requests ----------

  /** Enabled member accounts (optionally licensed only). */
  private fetchEmployees(token: string): Observable<Employee[]> {
    const filters = ['accountEnabled eq true', "userType eq 'Member'"];
    let headers = bearer(token);
    let params = new HttpParams()
      .set('$select', 'id,displayName,mail,userPrincipalName,jobTitle,department,officeLocation')
      .set('$top', 999);

    if (FEATURES.licensedUsersOnly) {
      // Counting licenses is an "advanced query": needs $count and this header
      filters.push('assignedLicenses/$count ne 0');
      params = params.set('$count', 'true');
      headers = headers.set('ConsistencyLevel', 'eventual');
    }

    params = params.set('$filter', filters.join(' and '));

    return this.fetchPages<any>(`${GRAPH_V1}/users`, params, headers, MAX_USER_PAGES).pipe(
      map((users) => users.map(toEmployee)),
    );
  }

  /** Today's interactive sign-ins, from the start of the working day. */
  private fetchTodaySignIns(token: string): Observable<SignInLite[]> {
    const today = new Date();
    const from = atHour(today, WORK_START_HOUR);
    const to = atHour(today, WORK_END_HOUR);

    const params = new HttpParams()
      .set('$filter', `createdDateTime ge ${isoUtc(from)} and createdDateTime lt ${isoUtc(to)}`)
      .set('$top', 1000);

    return this.fetchPages<any>(
      `${GRAPH_V1}/auditLogs/signIns`,
      params,
      bearer(token),
      MAX_TODAY_PAGES,
    ).pipe(
      map((items) =>
        items.map((item) => ({
          userId: item.userId,
          time: new Date(item.createdDateTime),
          success: item.status?.errorCode === 0,
          app: item.appDisplayName?.trim() || 'Unknown app',
        })),
      ),
    );
  }

  /** Presence for any number of users, in batches of 650. */
  private fetchPresence(token: string, userIds: string[]): Observable<Map<string, PresenceState>> {
    const batches: string[][] = [];
    for (let i = 0; i < userIds.length; i += PRESENCE_BATCH) {
      batches.push(userIds.slice(i, i + PRESENCE_BATCH));
    }

    if (batches.length === 0) {
      return of(new Map());
    }

    return forkJoin(
      batches.map((ids) =>
        this.http.post<{ value: any[] }>(
          `${GRAPH_V1}/communications/getPresencesByUserId`,
          { ids },
          { headers: bearer(token) },
        ),
      ),
    ).pipe(
      map((responses) => {
        const result = new Map<string, PresenceState>();
        for (const response of responses) {
          for (const p of response.value) {
            result.set(p.id, toPresenceState(p.availability, p.activity));
          }
        }
        return result;
      }),
      // Presence is a bonus: if it fails, show the list without it
      catchError((err) => {
        console.warn('[Graph] Presence unavailable', err);
        return of(new Map<string, PresenceState>());
      }),
    );
  }

  /** GET with @odata.nextLink paging, up to maxPages pages. */
  private fetchPages<T>(
    url: string,
    params: HttpParams,
    headers: HttpHeaders,
    maxPages: number,
  ): Observable<T[]> {
    let pages = 1;

    return this.http.get<GraphPage<T>>(url, { params, headers }).pipe(
      expand((page) => {
        const next = page['@odata.nextLink'];
        if (!next || pages >= maxPages) {
          return EMPTY;
        }
        pages++;
        return this.http.get<GraphPage<T>>(next, { headers });
      }),
      reduce((all, page) => all.concat(page.value), [] as T[]),
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

// ---------- mapping ----------

function buildRows(employees: Employee[], signIns: SignInLite[]): EmployeeRow[] {
  const byUser = new Map<string, TodaySummary>();

  for (const s of signIns) {
    let today = byUser.get(s.userId);
    if (!today) {
      today = { signIns: 0, failed: 0, firstSignIn: null, lastSignIn: null };
      byUser.set(s.userId, today);
    }

    today.signIns++;
    if (!s.success) {
      today.failed++;
    }
    if (!today.firstSignIn || s.time < today.firstSignIn) {
      today.firstSignIn = s.time;
    }
    if (!today.lastSignIn || s.time > today.lastSignIn) {
      today.lastSignIn = s.time;
      today.lastApp = s.app;
    }
  }

  return employees
    .map((e) => ({
      ...e,
      today: byUser.get(e.id) ?? { signIns: 0, failed: 0, firstSignIn: null, lastSignIn: null },
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function applyPresence(rows: EmployeeRow[], presence: Map<string, PresenceState>): EmployeeRow[] {
  return rows.map((r) => ({ ...r, presence: presence.get(r.id) ?? 'unknown' }));
}

function toEmployee(u: any): Employee {
  return {
    id: u.id,
    name: u.displayName || u.userPrincipalName,
    email: u.userPrincipalName,
    jobTitle: u.jobTitle ?? undefined,
    department: u.department ?? undefined,
    officeLocation: u.officeLocation ?? undefined,
  };
}

/** Teams availability + activity → one simple state. */
function toPresenceState(availability: string, activity: string): PresenceState {
  if (
    activity === 'InAMeeting' ||
    activity === 'InACall' ||
    activity === 'InAConferenceCall' ||
    activity === 'Presenting'
  ) {
    return 'meeting';
  }

  switch (availability) {
    case 'Available':
      return 'available';
    case 'Busy':
      return 'busy';
    case 'DoNotDisturb':
      return 'dnd';
    case 'AvailableIdle':
    case 'BusyIdle':
    case 'BeRightBack':
    case 'Away':
      return 'away';
    case 'Offline':
      return 'offline';
    default:
      return 'unknown';
  }
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

// ---------- helpers ----------

function bearer(token: string): HttpHeaders {
  return new HttpHeaders({ Authorization: `Bearer ${token}` });
}

function atHour(day: Date, hour: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour);
}

/** Graph filters want UTC without milliseconds: 2026-10-28T00:30:00Z */
function isoUtc(date: Date): string {
  return date.toISOString().split('.')[0] + 'Z';
}

function ms(start: number): string {
  return `${Math.round(performance.now() - start)} ms`;
}
