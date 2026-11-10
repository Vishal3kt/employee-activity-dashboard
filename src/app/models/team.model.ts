/** One person from the organisation's directory. */
export interface Employee {
  /** Permanent Entra ID object id. Use this, not the name, to identify people. */
  id: string;
  name: string;
  /** userPrincipalName: the unique sign-in name, e.g. arun.p@company.com */
  email: string;
  jobTitle?: string;
  department?: string;
  officeLocation?: string;
}

/** What the person did today between the start of the working day and now. */
export interface TodaySummary {
  signIns: number;
  failed: number;
  firstSignIn: Date | null;
  lastSignIn: Date | null;
  lastApp?: string;
}

/** Simplified Teams presence. */
export type PresenceState =
  'available' | 'busy' | 'meeting' | 'dnd' | 'away' | 'offline' | 'unknown';

export const PRESENCE_LABELS: Record<PresenceState, string> = {
  available: 'Available',
  busy: 'Busy',
  meeting: 'In a meeting',
  dnd: 'Do not disturb',
  away: 'Away',
  offline: 'Offline',
  unknown: 'Unknown',
};

/** One row in the employee list. */
export interface EmployeeRow extends Employee {
  today: TodaySummary;
  /** Only set when FEATURES.teamsPresence is on. */
  presence?: PresenceState;
}
