/**
 * Human-friendly cron descriptions ("Weekdays at 12:30") + next fire times.
 */
import { Cron } from 'croner';
import { badRequest } from './errors.js';
import { humanList } from './format.js';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_ALIASES: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

const isNum = (s: string) => /^\d+$/.test(s);

/** Expand a dow field into a sorted set of 0–6, or undefined if it's not a simple list/range. */
function parseDow(field: string): number[] | undefined {
  if (field === '*' || field === '?') return [0, 1, 2, 3, 4, 5, 6];
  const out = new Set<number>();
  for (const part of field.toLowerCase().split(',')) {
    const m = part.match(/^([a-z]{3}|\d)(?:-([a-z]{3}|\d))?$/);
    if (!m) return undefined;
    const a = isNum(m[1]!) ? Number(m[1]) % 7 : DAY_ALIASES[m[1]!];
    const b = m[2] === undefined ? a : isNum(m[2]) ? Number(m[2]) : DAY_ALIASES[m[2]];
    if (a === undefined || b === undefined) return undefined;
    if (b === 7 && a === 0) return [0, 1, 2, 3, 4, 5, 6];
    for (let d = a; d <= (b === 7 ? 6 : b); d++) out.add(d % 7);
    if (b === 7) out.add(0);
  }
  return [...out].sort((x, y) => x - y);
}

function describeDays(days: number[]): string {
  const key = days.join(',');
  if (days.length === 7) return 'Every day';
  if (key === '1,2,3,4,5') return 'Weekdays';
  if (key === '0,6') return 'Weekends';
  if (key === '0,1,2,3,4') return 'Sunday to Thursday';
  if (key === '5,6') return 'Fridays & Saturdays';
  if (days.length === 1) return `${DAY_NAMES[days[0]!]}s`;
  return humanList(days.map((d) => DAY_SHORT[d]!));
}

const pad = (n: number) => String(n).padStart(2, '0');

export function describeCron(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return `Custom schedule (${expr.trim()})`;
  const [min, hour, dom, mon, dow] = parts as [string, string, string, string, string];

  // Interval patterns
  const everyMin = min.match(/^\*\/(\d+)$/);
  if (everyMin && hour === '*' && dom === '*' && mon === '*' && dow === '*') return `Every ${everyMin[1]} minutes`;
  if (min === '*' && hour === '*' && dom === '*' && mon === '*' && dow === '*') return 'Every minute';
  if (isNum(min) && hour === '*' && dom === '*' && mon === '*' && dow === '*') return `Every hour at :${pad(Number(min))}`;
  const everyHour = hour.match(/^\*\/(\d+)$/);
  if (isNum(min) && everyHour && dom === '*' && mon === '*' && dow === '*') return `Every ${everyHour[1]} hours at :${pad(Number(min))}`;

  // Time of day: single or list of hours with one minute
  if (!isNum(min)) return `Custom schedule (${expr.trim()})`;
  const hours = hour.split(',');
  if (!hours.every(isNum)) return `Custom schedule (${expr.trim()})`;
  const times = humanList(hours.map((h) => `${pad(Number(h))}:${pad(Number(min))}`));

  let when: string | undefined;
  if (dom === '*' && mon === '*') {
    const days = parseDow(dow);
    if (days) when = describeDays(days);
  } else if (isNum(dom) && dow === '*') {
    if (mon === '*') when = `On the ${ordinal(Number(dom))} of every month`;
    else if (isNum(mon)) when = `Every ${MONTHS[Number(mon) - 1]} ${Number(dom)}`;
  }
  if (!when) return `Custom schedule (${expr.trim()})`;
  return `${when} at ${times}`;
}

export function validateCron(expr: string, timezone?: string): Cron {
  try {
    return new Cron(expr, { timezone: timezone || undefined, paused: true, mode: '5-or-6-parts' });
  } catch (e) {
    throw badRequest(`Invalid cron expression: ${(e as Error).message}`, 'invalid_cron');
  }
}

export function validateTimezone(tz: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
  } catch {
    throw badRequest(`Unknown timezone "${tz}"`, 'invalid_timezone');
  }
}

export function nextRuns(expr: string, timezone: string, n = 5, from?: Date): string[] {
  validateTimezone(timezone);
  const job = validateCron(expr, timezone);
  try {
    return job.nextRuns(n, from).map((d) => d.toISOString());
  } finally {
    job.stop();
  }
}
