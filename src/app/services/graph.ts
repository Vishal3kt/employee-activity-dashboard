import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import {
  EMPTY,
  Observable,
  catchError,
  concatMap,
  defer,
  expand,
  finalize,
  forkJoin,
  from,
  map,
  mergeMap,
  of,
  reduce,
  retry,
  switchMap,
  tap,
  throwError,
  timer,
} from 'rxjs';

import { MsalService } from '@azure/msal-angular';
import { CacheLookupPolicy, InteractionRequiredAuthError } from '@azure/msal-browser';

import { FEATURES } from './features';
import { SignInEvent } from '../models/day-activity.model';
import { BackgroundSignIn, ExportData, ExportMode, SignInRecord } from '../models/report.model';
import { Employee, EmployeeRow, PresenceState, TodaySummary } from '../models/team.model';
import { AuthService, GRAPH_SCOPES } from './auth';
import { WORK_END_HOUR, WORK_START_HOUR } from './day-activity';

/** What the dashboard is waiting on right now. Drives the loader steps. */
export type LoadStage = 'idle' | 'token' | 'fetching' | 'preparing';

const GRAPH_V1 = 'https://graph.microsoft.com/v1.0';
const GRAPH_BETA = 'https://graph.microsoft.com/beta';

/** Page caps: safety limits so a huge tenant can't hang the page. */
const MAX_USER_PAGES = 20; // 20 × 999 users
const MAX_TODAY_PAGES = 20; // 20 × 1000 interactive sign-ins
const MAX_DAY_PAGES = 5; // 5 × 1000 events per type, one person

/** Per day of an export: up to 30 × 1000 interactive sign-ins. */
const MAX_EXPORT_PAGES_PER_DAY = 30;

/**
 * Background sign-ins are read in one-hour slices, this many at a time.
 * 3 is the sweet spot: more makes Microsoft throttle (429) and the export
 * spends longer waiting than it gains.
 */
const BACKGROUND_PARALLEL_SLICES = 3;

/** Per one-hour slice: up to 50 × 1000 background sign-ins. */
const MAX_BACKGROUND_PAGES_PER_HOUR = 50;

/** Graph accepts up to 650 ids per presence request. */
const PRESENCE_BATCH = 650;

/** Progress of an export, reported after each day. */
export interface ExportProgress {
  /** Days fully read */
  done: number;
  total: number;
  /** Requests finished / planned: smoother than days for the progress bar */
  stepsDone: number;
  stepsTotal: number;
  /** Sign-ins read so far (interactive + background) */
  records: number;
}

/** What the dashboard loads for today. */
export interface TeamToday {
  rows: EmployeeRow[];
  /** Every interactive sign-in today (all accounts, all hours) */
  todayRecords: SignInRecord[];
}

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
   * When Microsoft throttles one request, every request waits until this
   * time (ms since epoch) instead of each retrying on its own and getting
   * throttled again. The export dialog shows it as "Pausing…".
   */
  readonly throttledUntil = signal(0);

  /**
   * Everyone in the organisation with today's sign-in summary, plus Teams
   * presence if switched on. Also returns today's raw sign-ins (midnight to
   * now, every account) for the failed sign-ins section.
   */
  getTeamToday(): Observable<TeamToday> {
    this.stage.set('token');
    const start = performance.now();

    return this.accessToken().pipe(
      switchMap((token) => {
        this.stage.set('fetching');

        return forkJoin([this.fetchEmployees(token), this.fetchTodaySignIns(token)]).pipe(
          switchMap(([employees, records]) => {
            this.stage.set('preparing');
            const rows = buildRows(employees, records);

            if (!FEATURES.teamsPresence) {
              return of({ rows, todayRecords: records });
            }

            return this.fetchPresence(
              token,
              rows.map((r) => r.id),
            ).pipe(
              map((presence) => ({ rows: applyPresence(rows, presence), todayRecords: records })),
            );
          }),
        );
      }),

      tap((t) =>
        console.log(
          `[Graph] ${t.rows.length} employees, ${t.todayRecords.length} sign-ins today in ${ms(start)}`,
        ),
      ),
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
   * Everything an Excel export needs, one day at a time:
   * - interactive sign-ins for the whole day (activity and failures)
   * - in "match-app" mode, background sign-ins for working hours too, so the
   *   activity columns are calculated from exactly what the day panel sees.
   *   These are read in one-hour slices, BACKGROUND_PARALLEL_SLICES at a time.
   * A fresh token is taken for each day, so long exports don't expire.
   */
  getExportData(
    days: Date[],
    mode: ExportMode,
    onProgress?: (progress: ExportProgress) => void,
  ): Observable<ExportData> {
    const hours = Array.from(
      { length: WORK_END_HOUR - WORK_START_HOUR },
      (_, i) => WORK_START_HOUR + i,
    );
    const stepsPerDay = 1 + (mode === 'match-app' ? hours.length : 0);

    const progress: ExportProgress = {
      done: 0,
      total: days.length,
      stepsDone: 0,
      stepsTotal: days.length * stepsPerDay,
      records: 0,
    };
    const truncatedDays: Date[] = [];

    const step = (count: number) => {
      progress.stepsDone++;
      progress.records += count;
      onProgress?.({ ...progress });
    };

    return from(days).pipe(
      // Days one after another; a fresh token for each day
      concatMap((day) =>
        this.accessToken().pipe(
          switchMap((token) => {
            const midnight = atHour(day, 0);
            const nextMidnight = new Date(midnight);
            nextMidnight.setDate(nextMidnight.getDate() + 1);

            const interactive$ = this.fetchPages<any, SignInRecord>(
              `${GRAPH_V1}/auditLogs/signIns`,
              new HttpParams()
                .set(
                  '$filter',
                  `createdDateTime ge ${isoUtc(midnight)} and createdDateTime lt ${isoUtc(nextMidnight)}`,
                )
                .set('$top', 1000),
              bearer(token),
              MAX_EXPORT_PAGES_PER_DAY,
              toSignInRecord,
            ).pipe(tap((list) => step(list.length)));

            if (mode !== 'match-app') {
              return interactive$.pipe(
                map((interactive) => ({
                  day,
                  interactive,
                  background: null as BackgroundSignIn[] | null,
                  truncated: false,
                })),
              );
            }

            // Background: one-hour slices, a few in parallel. Paging inside one
            // query is sequential, so splitting the day is what makes it faster.
            let truncated = false;

            const background$ = from(hours).pipe(
              mergeMap(
                (hour) =>
                  this.fetchPages<any, BackgroundSignIn>(
                    `${GRAPH_BETA}/auditLogs/signIns`,
                    new HttpParams()
                      .set(
                        '$filter',
                        `createdDateTime ge ${isoUtc(atHour(day, hour))} and ` +
                          `createdDateTime lt ${isoUtc(atHour(day, hour + 1))} and ` +
                          `signInEventTypes/any(t: t eq 'nonInteractiveUser')`,
                      )
                      .set('$top', 1000),
                    bearer(token),
                    MAX_BACKGROUND_PAGES_PER_HOUR,
                    toBackgroundSignIn,
                  ).pipe(
                    tap((list) => {
                      if (list.length >= MAX_BACKGROUND_PAGES_PER_HOUR * 1000) truncated = true;
                      step(list.length);
                    }),
                  ),
                BACKGROUND_PARALLEL_SLICES,
              ),
              reduce((all, slice) => {
                for (const b of slice) all.push(b);
                return all;
              }, [] as BackgroundSignIn[]),
            );

            return interactive$.pipe(
              concatMap((interactive) =>
                background$.pipe(
                  map((background) => ({ day, interactive, background, truncated })),
                ),
              ),
            );
          }),
          tap(({ day, interactive, truncated }) => {
            if (truncated || interactive.length >= MAX_EXPORT_PAGES_PER_DAY * 1000) {
              truncatedDays.push(day);
            }
            progress.done++;
            onProgress?.({ ...progress });
          }),
        ),
      ),

      reduce(
        (acc, d) => {
          // push in place: concat on hundreds of thousands of rows is slow
          for (const r of d.interactive) acc.interactive.push(r);
          if (d.background && acc.background) {
            for (const b of d.background) acc.background.push(b);
          }
          return acc;
        },
        {
          mode,
          interactive: [] as SignInRecord[],
          background: mode === 'match-app' ? ([] as BackgroundSignIn[]) : null,
          truncatedDays,
        } as ExportData,
      ),
    );
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

  /** Today's interactive sign-ins, midnight to now, every account. */
  private fetchTodaySignIns(token: string): Observable<SignInRecord[]> {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(midnight);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const params = new HttpParams()
      .set(
        '$filter',
        `createdDateTime ge ${isoUtc(midnight)} and createdDateTime lt ${isoUtc(tomorrow)}`,
      )
      .set('$top', 1000);

    return this.fetchPages<any>(
      `${GRAPH_V1}/auditLogs/signIns`,
      params,
      bearer(token),
      MAX_TODAY_PAGES,
    ).pipe(map((items) => items.map(toSignInRecord)));
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

  /**
   * GET with @odata.nextLink paging, up to maxPages pages.
   * mapItem shrinks each page as it arrives, so raw Graph objects for large
   * downloads aren't all held in memory at once.
   */
  private fetchPages<T, R = T>(
    url: string,
    params: HttpParams,
    headers: HttpHeaders,
    maxPages: number,
    mapItem?: (item: T) => R,
  ): Observable<R[]> {
    let pages = 1;

    return this.gatedGet<GraphPage<T>>(url, { params, headers }).pipe(
      expand((page) => {
        const next = page['@odata.nextLink'];
        if (!next || pages >= maxPages) {
          return EMPTY;
        }
        pages++;
        return this.gatedGet<GraphPage<T>>(next, { headers });
      }),
      reduce((all, page) => {
        const items = mapItem ? page.value.map(mapItem) : (page.value as unknown as R[]);
        for (const item of items) all.push(item);
        return all;
      }, [] as R[]),
    );
  }

  /**
   * GET that first waits out any pause Microsoft asked for, and on a 429
   * makes every other request pause too (shared gate), then retries.
   */
  private gatedGet<T>(
    url: string,
    options: { params?: HttpParams; headers: HttpHeaders },
  ): Observable<T> {
    const attempt = defer(() => {
      const wait = this.throttledUntil() - Date.now();
      const request = this.http.get<T>(url, options);
      return wait > 0 ? timer(wait).pipe(switchMap(() => request)) : request;
    });

    return attempt.pipe(
      retryWhenThrottled((waitMs) => {
        // Extend the shared pause; never shorten one already set
        const until = Date.now() + waitMs;
        if (until > this.throttledUntil()) {
          this.throttledUntil.set(until);
        }
      }),
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

function buildRows(employees: Employee[], signIns: SignInRecord[]): EmployeeRow[] {
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

function toSignInRecord(item: any): SignInRecord {
  return {
    id: item.id,
    time: new Date(item.createdDateTime),
    userId: item.userId,
    userPrincipalName: item.userPrincipalName || item.userId || 'unknown',
    userName: item.userDisplayName || item.userPrincipalName || 'Unknown',
    app: item.appDisplayName?.trim() || 'Unknown app',
    success: item.status?.errorCode === 0,
    errorCode: item.status?.errorCode ?? -1,
    failureReason: item.status?.failureReason || undefined,
    ipAddress: item.ipAddress || undefined,
    city: item.location?.city || undefined,
    countryCode: item.location?.countryOrRegion || undefined,
    browser: item.deviceDetail?.browser || undefined,
    operatingSystem: item.deviceDetail?.operatingSystem || undefined,
  };
}

function toBackgroundSignIn(item: any): BackgroundSignIn {
  return {
    userId: item.userId,
    time: new Date(item.createdDateTime),
    app: item.appDisplayName?.trim() || 'Unknown app',
    success: item.status?.errorCode === 0,
  };
}

// ---------- helpers ----------

/**
 * Retries when Graph says "too many requests" (429) or has a temporary
 * problem (503/504), waiting as long as Graph asks (Retry-After).
 * onThrottle lets the caller pause other requests for the same time.
 */
function retryWhenThrottled<T>(onThrottle?: (waitMs: number) => void) {
  return retry<T>({
    count: 8,
    delay: (error, attempt) => {
      const status = error?.status;
      if (status !== 429 && status !== 503 && status !== 504) {
        return throwError(() => error);
      }
      const retryAfter = Number(error?.headers?.get?.('Retry-After'));
      const waitMs =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : Math.min(60_000, 2000 * 2 ** attempt);
      onThrottle?.(waitMs);
      console.info(
        `[Graph] Microsoft asked to slow down (${status}); pausing ${Math.round(waitMs / 1000)} s`,
      );
      return timer(waitMs);
    },
  });
}

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
