import type { Money } from '@woltron/shared';
import { formatMoney } from '@woltron/shared';

/** "₪48" / "₪6.40" — drop trailing .00 for friendlier log lines. */
export const fmt = (m: Money | undefined): string => formatMoney(m).replace(/\.00(?=\D*$)/, '');

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Join for humans: "a", "a & b", "a, b & c" */
export const humanList = (xs: string[]): string =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} & ${xs[xs.length - 1]}`;

/** YYYY-MM-DD in a given IANA timezone (default: server local). */
export function dayKey(d: Date, timeZone?: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  } catch {
    return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  }
}

export function clockTime(d: Date, timeZone?: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit' }).format(d);
  } catch {
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(d);
  }
}
