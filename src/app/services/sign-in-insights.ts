import { Employee } from '../models/team.model';
import { SignInEvent } from '../models/day-activity.model';
import { buildDaySummary } from './day-activity';
import {
  BackgroundSignIn,
  CountCount,
  DailyActivityRow,
  FailedSignIn,
  FailureCategory,
  FailureReport,
  IpSummary,
  SignInRecord,
} from '../models/report.model';
import { SECURITY } from './features';

// ---------- failure categories ----------

/** Entra error codes → category. Codes not listed fall back to "other". */
const CATEGORY_BY_CODE: Record<number, FailureCategory> = {
  50126: 'wrong-password', // Invalid username or password
  50053: 'locked', // Smart lockout / malicious IP
  50034: 'unknown-account', // Account doesn't exist in the tenant
  50057: 'blocked', // Account disabled
  53003: 'blocked', // Blocked by Conditional Access
  530032: 'blocked', // Blocked by security policy
  530034: 'blocked',
  500121: 'mfa-denied', // MFA failed or denied
  50074: 'interrupted', // MFA needed: shown the MFA step
  50076: 'interrupted', // MFA needed (location/policy)
  50079: 'interrupted', // MFA registration needed
  50140: 'interrupted', // "Stay signed in?" prompt
  50058: 'interrupted', // Silent sign-in needed the user
  50072: 'interrupted', // MFA setup required
  50097: 'interrupted', // Device authentication required
  16000: 'interrupted', // Account selection
  16003: 'interrupted',
  65001: 'interrupted', // Consent needed
  50125: 'interrupted', // Password reset/registration interrupt
  81010: 'interrupted', // Seamless SSO failed, user prompted
  50055: 'other', // Password expired
  50173: 'other', // Token revoked after password change
};

export const CATEGORY_LABELS: Record<FailureCategory, string> = {
  'wrong-password': 'Wrong password',
  locked: 'Account locked',
  'mfa-denied': 'MFA denied or failed',
  'unknown-account': 'Account doesn’t exist',
  blocked: 'Blocked by policy',
  interrupted: 'Interrupted (usually normal)',
  other: 'Other',
};

/** Categories that can indicate password guessing or account takeover. */
const SUSPICIOUS: FailureCategory[] = ['wrong-password', 'locked', 'mfa-denied', 'unknown-account'];

export function categorise(errorCode: number): FailureCategory {
  return CATEGORY_BY_CODE[errorCode] ?? 'other';
}

export function isSuspicious(category: FailureCategory): boolean {
  return SUSPICIOUS.includes(category);
}

// ---------- countries ----------

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' });
  } catch {
    return null;
  }
})();

/** "IN" → "India". Unknown or missing codes are returned as they are. */
export function countryName(code?: string): string {
  if (!code) return 'Unknown';
  try {
    return regionNames?.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/**
 * The organisation's usual countries: from SECURITY.homeCountries if set,
 * otherwise the countries that produced at least 5% of successful sign-ins.
 */
export function detectHomeCountries(records: SignInRecord[]): string[] {
  if (SECURITY.homeCountries.length) {
    return SECURITY.homeCountries.map((c: any) => c.toUpperCase());
  }

  const counts = new Map<string, number>();
  let total = 0;

  for (const r of records) {
    if (r.success && r.countryCode) {
      counts.set(r.countryCode, (counts.get(r.countryCode) ?? 0) + 1);
      total++;
    }
  }

  return [...counts.entries()]
    .filter(([, n]) => total > 0 && n / total >= 0.05)
    .map(([code]) => code);
}

// ---------- failure report ----------

export function buildFailureReport(
  records: SignInRecord[],
  from: Date,
  to: Date,
  homeCountries = detectHomeCountries(records),
): FailureReport {
  const failedRecords = records.filter((r) => !r.success);

  // Repeats are counted on suspicious categories only
  const perIp = new Map<string, number>();
  const perAccount = new Map<string, number>();

  for (const r of failedRecords) {
    if (!isSuspicious(categorise(r.errorCode))) continue;
    if (r.ipAddress) perIp.set(r.ipAddress, (perIp.get(r.ipAddress) ?? 0) + 1);
    const acct = r.userPrincipalName.toLowerCase();
    perAccount.set(acct, (perAccount.get(acct) ?? 0) + 1);
  }

  const failures: FailedSignIn[] = failedRecords
    .map((r) => {
      const category = categorise(r.errorCode);
      const suspicious = isSuspicious(category);
      return {
        ...r,
        category,
        country: countryName(r.countryCode),
        unusualCountry:
          !!r.countryCode && homeCountries.length > 0 && !homeCountries.includes(r.countryCode),
        repeatedFromIp:
          suspicious &&
          !!r.ipAddress &&
          (perIp.get(r.ipAddress) ?? 0) >= SECURITY.repeatedIpThreshold,
        repeatedForAccount:
          suspicious &&
          (perAccount.get(r.userPrincipalName.toLowerCase()) ?? 0) >=
            SECURITY.repeatedAccountThreshold,
      };
    })
    .sort((a, b) => b.time.getTime() - a.time.getTime());

  const suspicious = failures.filter((f) => isSuspicious(f.category));

  return {
    from,
    to,
    homeCountries,
    failures,
    suspicious,
    totalAttempts: failures.length,
    suspiciousAttempts: suspicious.length,
    accountsAffected: new Set(failures.map((f) => f.userPrincipalName.toLowerCase())).size,
    byCategory: countBy(
      failures,
      (f) => f.category,
      (f) => CATEGORY_LABELS[f.category],
    ),
    byCountry: countBy(
      suspicious,
      (f) => f.countryCode ?? 'unknown',
      (f) => f.country,
    ).map((c) => ({
      ...c,
      unusual: c.key !== 'unknown' && homeCountries.length > 0 && !homeCountries.includes(c.key),
    })),
    byIp: summariseIps(suspicious),
  };
}

function countBy(
  items: FailedSignIn[],
  keyOf: (f: FailedSignIn) => string,
  labelOf: (f: FailedSignIn) => string,
): CountCount[] {
  const map = new Map<string, { label: string; attempts: number; accounts: Set<string> }>();

  for (const f of items) {
    const key = keyOf(f);
    let entry = map.get(key);
    if (!entry) {
      entry = { label: labelOf(f), attempts: 0, accounts: new Set() };
      map.set(key, entry);
    }
    entry.attempts++;
    entry.accounts.add(f.userPrincipalName.toLowerCase());
  }

  return [...map.entries()]
    .map(([key, e]) => ({ key, label: e.label, attempts: e.attempts, accounts: e.accounts.size }))
    .sort((a, b) => b.attempts - a.attempts);
}

function summariseIps(items: FailedSignIn[]): IpSummary[] {
  const map = new Map<string, IpSummary & { accountSet: Set<string> }>();

  for (const f of items) {
    if (!f.ipAddress) continue;
    let entry = map.get(f.ipAddress);
    if (!entry) {
      entry = {
        ip: f.ipAddress,
        country: f.country,
        attempts: 0,
        accounts: [],
        accountSet: new Set(),
        lastSeen: f.time,
        unusualCountry: f.unusualCountry,
      };
      map.set(f.ipAddress, entry);
    }
    entry.attempts++;
    entry.accountSet.add(f.userPrincipalName);
    if (f.time > entry.lastSeen) entry.lastSeen = f.time;
  }

  return [...map.values()]
    .map(({ accountSet, ...rest }) => ({ ...rest, accounts: [...accountSet] }))
    .sort((a, b) => b.attempts - a.attempts);
}

// ---------- daily activity ----------

/** App name Microsoft logs when someone signs in to an Entra-joined Windows PC. */
const WINDOWS_SIGN_IN_APP = 'windows sign in';

/**
 * One row per employee per day. First/last activity, hours with activity and
 * no-activity gaps come from buildDaySummary: the same function the day panel
 * uses, so the numbers match when the same data is loaded.
 * Employees with nothing that day get a "No sign-in" row (attendance view).
 */
export function buildDailyRows(
  employees: Employee[],
  interactive: SignInRecord[],
  background: BackgroundSignIn[] | null,
  days: Date[],
): DailyActivityRow[] {
  // userId → day → events (same shape the day panel uses)
  const events = new Map<string, Map<string, SignInEvent[]>>();
  // userId → day → interactive records (locations, devices, Windows sign-in)
  const records = new Map<string, Map<string, SignInRecord[]>>();

  for (const r of interactive) {
    push(records, r.userId, dayKey(r.time), r);
    push(events, r.userId, dayKey(r.time), {
      id: r.id,
      time: r.time,
      app: r.app,
      interactive: true,
      success: r.success,
      failureReason: r.failureReason,
      ipAddress: r.ipAddress,
      city: r.city,
      country: r.countryCode,
      browser: r.browser,
      operatingSystem: r.operatingSystem,
    });
  }

  let backgroundCount: Map<string, Map<string, number>> | null = null;

  if (background) {
    backgroundCount = new Map();
    for (const b of background) {
      const key = dayKey(b.time);
      push(events, b.userId, key, {
        id: '',
        time: b.time,
        app: b.app,
        interactive: false,
        success: b.success,
      });
      let byDay = backgroundCount.get(b.userId);
      if (!byDay) {
        byDay = new Map();
        backgroundCount.set(b.userId, byDay);
      }
      byDay.set(key, (byDay.get(key) ?? 0) + 1);
    }
  }

  const rows: DailyActivityRow[] = [];
  const sortedEmployees = [...employees].sort((a, b) => a.name.localeCompare(b.name));

  for (const day of days) {
    const key = dayKey(day);

    for (const e of sortedEmployees) {
      const summary = buildDaySummary(day, events.get(e.id)?.get(key) ?? []);
      const dayRecords = (records.get(e.id)?.get(key) ?? []).sort(
        (a, b) => a.time.getTime() - b.time.getTime(),
      );
      const ok = dayRecords.filter((r) => r.success);

      const windows = ok.find((r) => r.app.toLowerCase() === WINDOWS_SIGN_IN_APP);
      const first = summary.firstActivity;
      const last = summary.lastActivity;

      rows.push({
        date: day,
        name: e.name,
        email: e.email,
        department: e.department ?? '',
        jobTitle: e.jobTitle ?? '',
        status: summary.events > 0 ? 'Active' : 'No sign-in',
        windowsSignIn: windows?.time ?? null,
        firstActivity: first,
        lastActivity: last,
        spanMinutes: first && last ? Math.round((last.getTime() - first.getTime()) / 60000) : 0,
        hoursWithActivity: summary.activeHours,
        windowHours: summary.windowHours,
        noActivityMinutes: background ? summary.noActivityMinutes : null,
        gaps: background ? summary.gaps : null,
        longestGapMinutes: background ? summary.longestGapMinutes : null,
        signIns: ok.length,
        backgroundSignIns: backgroundCount ? (backgroundCount.get(e.id)?.get(key) ?? 0) : null,
        failed: summary.failed,
        apps: summary.hourRows.map((r) => r.app).join(', '),
        locations: unique(
          ok.map((r) => [r.city, countryName(r.countryCode)].filter(Boolean).join(', ')),
        ).join('; '),
        ipAddresses: unique(ok.map((r) => r.ipAddress ?? '')).join(', '),
        devices: unique(
          ok.map((r) => [r.browser, r.operatingSystem].filter(Boolean).join(' on ')),
        ).join('; '),
      });
    }
  }

  return rows;
}

function push<T>(index: Map<string, Map<string, T[]>>, userId: string, key: string, item: T): void {
  let byDay = index.get(userId);
  if (!byDay) {
    byDay = new Map();
    index.set(userId, byDay);
  }
  let list = byDay.get(key);
  if (!list) {
    list = [];
    byDay.set(key, list);
  }
  list.push(item);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}
