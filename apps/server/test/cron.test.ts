import { describe, expect, it } from 'vitest';
import { describeCron, nextRuns } from '../src/cron.js';

describe('describeCron', () => {
  it.each([
    ['30 12 * * 1-5', 'Weekdays at 12:30'],
    ['0 19 * * 5', 'Fridays at 19:00'],
    ['0 9 * * *', 'Every day at 09:00'],
    ['0 10 * * 0,6', 'Weekends at 10:00'],
    ['0 10 * * 6,0', 'Weekends at 10:00'],
    ['0 12 * * 0-4', 'Sunday to Thursday at 12:00'],
    ['15 10 * * mon,wed,fri', 'Mon, Wed & Fri at 10:15'],
    ['0 8,13 * * *', 'Every day at 08:00 & 13:00'],
    ['*/15 * * * *', 'Every 15 minutes'],
    ['5 * * * *', 'Every hour at :05'],
    ['0 9 1 * *', 'On the 1st of every month at 09:00'],
    ['0 9 22 * *', 'On the 22nd of every month at 09:00'],
    ['0 9 1-7 * 1', 'Custom schedule (0 9 1-7 * 1)'],
  ])('%s → %s', (cron, label) => expect(describeCron(cron)).toBe(label));
});

describe('nextRuns', () => {
  it('returns 5 ISO times honoring the timezone', () => {
    const from = new Date('2026-10-02T00:00:00Z'); // Friday
    const next = nextRuns('30 12 * * 1-5', 'Asia/Jerusalem', 5, from);
    expect(next).toHaveLength(5);
    expect(next[0]).toBe('2026-10-02T09:30:00.000Z'); // 12:30 IDT = 09:30Z
    expect(next[1]).toBe('2026-10-05T09:30:00.000Z'); // skips the weekend
  });
  it('rejects garbage', () => {
    expect(() => nextRuns('nope', 'UTC')).toThrow(/Invalid cron/);
    expect(() => nextRuns('0 9 * * *', 'Mars/Olympus')).toThrow(/Unknown timezone/);
  });
});
