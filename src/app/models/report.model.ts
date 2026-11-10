/** One interactive sign-in record with the fields reports need. */
export interface SignInRecord {
  id: string;
  time: Date;
  userId: string;
  /** Account that was used or attempted (may not exist in the directory) */
  userPrincipalName: string;
  userName: string;
  app: string;
  success: boolean;
  errorCode: number;
  failureReason?: string;
  ipAddress?: string;
  city?: string;
  /** Two-letter country code from Microsoft, e.g. "IN" */
  countryCode?: string;
  browser?: string;
  operatingSystem?: string;
}

/**
 * What a failure most likely means.
 * attack-like: wrong-password, locked, mfa-denied, unknown-account
 * usually harmless: interrupted (extra step shown to the user), blocked, other
 */
export type FailureCategory =
  | 'wrong-password'
  | 'locked'
  | 'mfa-denied'
  | 'unknown-account'
  | 'blocked'
  | 'interrupted'
  | 'other';

export interface FailedSignIn extends SignInRecord {
  category: FailureCategory;
  country: string;
  /** Outside the organisation's usual countries */
  unusualCountry: boolean;
  /** This IP failed many times in the period */
  repeatedFromIp: boolean;
  /** This account failed many times in the period */
  repeatedForAccount: boolean;
}

export interface CountCount {
  key: string;
  label: string;
  attempts: number;
  accounts: number;
  unusual?: boolean;
}

export interface IpSummary {
  ip: string;
  country: string;
  attempts: number;
  accounts: string[];
  lastSeen: Date;
  unusualCountry: boolean;
}

export interface FailureReport {
  from: Date;
  to: Date;
  homeCountries: string[];
  /** All failures, newest first */
  failures: FailedSignIn[];
  /** Failures that look like attacks (not interruptions or policy blocks) */
  suspicious: FailedSignIn[];
  totalAttempts: number;
  suspiciousAttempts: number;
  accountsAffected: number;
  byCategory: CountCount[];
  /** Suspicious attempts per country, most first */
  byCountry: CountCount[];
  /** Suspicious attempts per IP, most first */
  byIp: IpSummary[];
}

/** Minimal background (non-interactive) sign-in, kept small for big exports. */
export interface BackgroundSignIn {
  userId: string;
  time: Date;
  app: string;
  success: boolean;
}

/** Export data mode. */
export type ExportMode =
  /** Interactive + background sign-ins: numbers identical to the day panel */
  | 'match-app'
  /** Interactive sign-ins only: faster, no "No activity" columns */
  | 'interactive';

export interface ExportData {
  mode: ExportMode;
  interactive: SignInRecord[];
  /** null in "interactive" mode */
  background: BackgroundSignIn[] | null;
  /** Days where Graph returned more rows than the safety cap */
  truncatedDays: Date[];
}

/**
 * One employee on one day, for the Excel "Daily activity" sheet.
 * Activity columns are calculated by the same function as the day panel.
 */
export interface DailyActivityRow {
  date: Date;
  name: string;
  email: string;
  department: string;
  jobTitle: string;
  status: 'Active' | 'No sign-in';
  /** First "Windows Sign In" of the day: signed in at an Entra-joined PC */
  windowsSignIn: Date | null;
  firstActivity: Date | null;
  lastActivity: Date | null;
  /** Minutes between first and last activity */
  spanMinutes: number;
  hoursWithActivity: number;
  windowHours: number;
  /** null when background sign-ins weren't loaded */
  noActivityMinutes: number | null;
  gaps: number | null;
  longestGapMinutes: number | null;
  signIns: number;
  backgroundSignIns: number | null;
  failed: number;
  apps: string;
  locations: string;
  ipAddresses: string;
  devices: string;
}
