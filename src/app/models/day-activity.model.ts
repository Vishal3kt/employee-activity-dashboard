/** One sign-in event (interactive or background) for a single user. */
export interface SignInEvent {
  id: string;
  time: Date;
  app: string;
  resource?: string;
  /** false for background (non-interactive) token renewals */
  interactive: boolean;
  success: boolean;
  failureReason?: string;
  ipAddress?: string;
  city?: string;
  country?: string;
  browser?: string;
  operatingSystem?: string;
}

/** One app's sign-ins per working hour (index 0 = WORK_START_HOUR). */
export interface HourRow {
  app: string;
  counts: number[];
  total: number;
}

/** A timeline entry: a sign-in, a merged run of background sign-ins, or a gap. */
export interface TimelineItem {
  kind: 'signin' | 'gap';
  start: Date;
  end: Date;
  app: string;
  count: number;
  interactive: boolean;
  success: boolean;
  label: string;
}

export interface DaySummary {
  date: Date;
  events: number;
  firstActivity: Date | null;
  lastActivity: Date | null;
  /** Working hours that had at least one sign-in */
  activeHours: number;
  /** Total working hours in the window (e.g. 12 for 6 AM–6 PM) */
  windowHours: number;
  apps: number;
  failed: number;
  /** Gaps of IDLE_GAP_MINUTES or more with no sign-in from any app */
  gaps: number;
  noActivityMinutes: number;
  longestGapMinutes: number;
  hourRows: HourRow[];
  timeline: TimelineItem[];
}
