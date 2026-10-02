/** Friendly ↔ cron conversion for the schedule builder (5-field cron: m h dom mon dow). */

export const DAYS = [
  { n: 1, short: 'Mon', letter: 'M' },
  { n: 2, short: 'Tue', letter: 'T' },
  { n: 3, short: 'Wed', letter: 'W' },
  { n: 4, short: 'Thu', letter: 'T' },
  { n: 5, short: 'Fri', letter: 'F' },
  { n: 6, short: 'Sat', letter: 'S' },
  { n: 0, short: 'Sun', letter: 'S' },
] as const;

export interface SimpleSchedule {
  days: number[]; // 0=Sun … 6=Sat
  time: string; // "HH:MM"
}

export function toCron({ days, time }: SimpleSchedule): string {
  const [h, m] = time.split(':').map((x) => parseInt(x, 10));
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  const dow = sorted.length === 0 || sorted.length === 7 ? '*' : compress(sorted);
  return `${m ?? 0} ${h ?? 12} * * ${dow}`;
}

function compress(days: number[]): string {
  // 1,2,3,4,5 → 1-5
  const parts: string[] = [];
  let start = days[0]!;
  let prev = start;
  for (let i = 1; i <= days.length; i++) {
    const d = days[i];
    if (d === prev + 1) {
      prev = d;
      continue;
    }
    parts.push(prev - start >= 2 ? `${start}-${prev}` : start === prev ? `${start}` : `${start},${prev}`);
    if (d !== undefined) {
      start = d;
      prev = d;
    }
  }
  return parts.join(',');
}

/** Returns a SimpleSchedule if the cron is expressible in the builder, else null. */
export function fromCron(cron: string): SimpleSchedule | null {
  const f = cron.trim().split(/\s+/);
  if (f.length !== 5) return null;
  const [m, h, dom, mon, dow] = f as [string, string, string, string, string];
  if (!/^\d+$/.test(m) || !/^\d+$/.test(h) || dom !== '*' || mon !== '*') return null;
  const days = parseDow(dow);
  if (!days) return null;
  return { days, time: `${h.padStart(2, '0')}:${m.padStart(2, '0')}` };
}

function parseDow(s: string): number[] | null {
  if (s === '*') return [0, 1, 2, 3, 4, 5, 6];
  const out = new Set<number>();
  for (const part of s.split(',')) {
    const r = part.match(/^(\d)(?:-(\d))?$/);
    if (!r) return null;
    const a = +r[1]!;
    const b = r[2] ? +r[2] : a;
    for (let i = a; i <= b; i++) out.add(i % 7);
  }
  return [...out];
}

/** Local fallback label if the server can't describe it. */
export function describeSimple(s: SimpleSchedule): string {
  const set = new Set(s.days);
  let when: string;
  if (set.size === 7 || set.size === 0) when = 'Every day';
  else if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) when = 'Weekdays';
  else if (set.size === 2 && set.has(0) && set.has(6)) when = 'Weekends';
  else when = DAYS.filter((d) => set.has(d.n)).map((d) => d.short).join(', ');
  return `${when} at ${s.time}`;
}

export const TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
