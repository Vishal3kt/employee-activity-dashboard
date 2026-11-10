import { DaySummary, HourRow, SignInEvent, TimelineItem } from '../models/day-activity.model';

/** Working window shown in the panel and fetched from Graph (local time). */
export const WORK_START_HOUR = 6; // 6 AM
export const WORK_END_HOUR = 18; // 6 PM

/**
 * A stretch with no sign-in from any app this long or longer counts as
 * "no activity". Apps renew sign-ins about hourly while open, so shorter
 * gaps are normal even while someone is working.
 */
export const IDLE_GAP_MINUTES = 90;

/**
 * How many days of sign-in logs Microsoft Entra ID keeps.
 * 30 days with Entra ID P1/P2 (needed to read sign-in logs through Graph).
 * Older days can't be fetched, so the date picker stops here.
 */
export const SIGN_IN_RETENTION_DAYS = 30;

/** Background sign-ins to the same app closer than this become one entry. */
const MERGE_WINDOW_MS = 60 * 60 * 1000;

const MINUTE = 60 * 1000;

/** Turns a day's sign-in events into what the activity panel shows. */
export function buildDaySummary(date: Date, events: SignInEvent[]): DaySummary {
  const windowHours = WORK_END_HOUR - WORK_START_HOUR;

  const sorted = events
    .filter((e) => e.time.getHours() >= WORK_START_HOUR && e.time.getHours() < WORK_END_HOUR)
    .sort((a, b) => a.time.getTime() - b.time.getTime());

  // ---- Apps by hour (rows in order of first use) ----
  const rows = new Map<string, HourRow>();
  const activeHours = new Set<number>();

  for (const event of sorted) {
    const slot = event.time.getHours() - WORK_START_HOUR;
    activeHours.add(slot);

    let row = rows.get(event.app);
    if (!row) {
      row = { app: event.app, counts: new Array(windowHours).fill(0), total: 0 };
      rows.set(event.app, row);
    }
    row.counts[slot]++;
    row.total++;
  }

  // ---- Timeline with gaps ----
  const timeline: TimelineItem[] = [];
  let noActivityMinutes = 0;
  let longestGapMinutes = 0;
  let gaps = 0;
  let previous: SignInEvent | null = null;

  for (const event of sorted) {
    if (previous) {
      const gapMinutes = Math.floor((event.time.getTime() - previous.time.getTime()) / MINUTE);

      if (gapMinutes >= IDLE_GAP_MINUTES) {
        gaps++;
        noActivityMinutes += gapMinutes;
        longestGapMinutes = Math.max(longestGapMinutes, gapMinutes);

        timeline.push({
          kind: 'gap',
          start: previous.time,
          end: event.time,
          app: 'No activity',
          count: 0,
          interactive: false,
          success: true,
          label: `No sign-in from any app for ${formatMinutes(gapMinutes)}`,
        });
      }
    }

    previous = event;

    const last = timeline[timeline.length - 1];

    const canMerge =
      last &&
      last.kind === 'signin' &&
      !event.interactive &&
      event.success &&
      !last.interactive &&
      last.success &&
      last.app === event.app &&
      event.time.getTime() - last.end.getTime() <= MERGE_WINDOW_MS;

    if (canMerge) {
      last.end = event.time;
      last.count++;
      last.label = `${last.count} background sign-ins`;
      continue;
    }

    timeline.push({
      kind: 'signin',
      start: event.time,
      end: event.time,
      app: event.app,
      count: 1,
      interactive: event.interactive,
      success: event.success,
      label: labelFor(event),
    });
  }

  return {
    date,
    events: sorted.length,
    firstActivity: sorted[0]?.time ?? null,
    lastActivity: sorted[sorted.length - 1]?.time ?? null,
    activeHours: activeHours.size,
    windowHours,
    apps: rows.size,
    failed: sorted.filter((e) => !e.success).length,
    gaps,
    noActivityMinutes,
    longestGapMinutes,
    hourRows: [...rows.values()],
    timeline,
  };
}

/** 135 → "2 h 15 min", 45 → "45 min", 120 → "2 h" */
export function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m} min`;
  if (!m) return `${h} h`;
  return `${h} h ${m} min`;
}

function labelFor(event: SignInEvent): string {
  if (!event.success) {
    return `Sign-in failed: ${event.failureReason || 'no reason given'}`;
  }

  const where = [
    event.browser && event.operatingSystem
      ? `${event.browser} on ${event.operatingSystem}`
      : event.browser || event.operatingSystem,
    event.city,
  ]
    .filter(Boolean)
    .join(', ');

  const kind = event.interactive ? 'Signed in' : 'Background sign-in';
  return where ? `${kind}, ${where}` : kind;
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** yyyy-mm-dd in local time, for <input type="date">. */
export function toDateInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
