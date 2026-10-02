import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatMoney, type Money, type Preset, type PresetItem } from '@woltron/shared';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const fmt = (m: Money | undefined) => formatMoney(m, 'en');

/** Compact money: ₪48 instead of ₪48.00 when whole. */
export function fmtShort(m: Money | undefined): string {
  if (!m) return '—';
  const whole = m.amount % 100 === 0;
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency: m.currency,
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(m.amount / 100);
  } catch {
    return formatMoney(m);
  }
}

export function currencySymbol(currency: string): string {
  try {
    return (
      new Intl.NumberFormat('en', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
        .formatToParts(0)
        .find((p) => p.type === 'currency')?.value ?? currency
    );
  } catch {
    return currency;
  }
}

export function presetTotal(p: Pick<Preset, 'items' | 'tip'>): Money {
  const currency = p.items[0]?.unitPrice.currency ?? p.tip?.currency ?? 'ILS';
  const amount = p.items.reduce((s, i) => s + i.unitPrice.amount * i.quantity, 0) + (p.tip?.amount ?? 0);
  return { amount, currency };
}

export function groupByVenue(items: PresetItem[]) {
  const map = new Map<string, { venueId: string; venueSlug: string; venueName: string; items: PresetItem[] }>();
  for (const it of items) {
    const g = map.get(it.venueId) ?? { venueId: it.venueId, venueSlug: it.venueSlug, venueName: it.venueName, items: [] };
    g.items.push(it);
    map.set(it.venueId, g);
  }
  return [...map.values()];
}

export function presetImages(p: Pick<Preset, 'items'>, max = 4): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const i of p.items) {
    if (i.image && !seen.has(i.image)) {
      seen.add(i.image);
      out.push(i.image);
    }
    if (out.length >= max) break;
  }
  return out;
}

/** Wolt CDN supports width hints on imageproxy URLs; others pass through. */
export function sized(url: string | undefined, w: number): string | undefined {
  if (!url) return url;
  if (url.includes('imageproxy.wolt.com') && !url.includes('?')) return `${url}?w=${w}`;
  return url;
}

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
export function relTime(iso: string | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const s = 1000, m = 60 * s, h = 60 * m, d = 24 * h;
  if (abs < 45 * s) return diff < 0 ? 'just now' : 'in a moment';
  if (abs < 45 * m) return rtf.format(Math.round(diff / m), 'minute');
  if (abs < 22 * h) return rtf.format(Math.round(diff / h), 'hour');
  if (abs < 7 * d) return rtf.format(Math.round(diff / d), 'day');
  return new Date(iso).toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

export function countdownParts(ms: number) {
  const clamped = Math.max(0, ms);
  const days = Math.floor(clamped / 86400000);
  const hours = Math.floor((clamped % 86400000) / 3600000);
  const minutes = Math.floor((clamped % 3600000) / 60000);
  const seconds = Math.floor((clamped % 60000) / 1000);
  return { days, hours, minutes, seconds };
}

export function fmtCountdown(ms: number): string {
  const { days, hours, minutes, seconds } = countdownParts(ms);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function fmtDateTime(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(Date.now() + 86400000);
  const time = d.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false });
  if (d.toDateString() === today.toDateString()) return `Today ${time}`;
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow ${time}`;
  return `${d.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}, ${time}`;
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

export function greeting(d = new Date()): { hello: string; line: string } {
  const h = d.getHours();
  if (h < 5) return { hello: 'Still up?', line: 'Late-night snack run? I never sleep when there’s food.' };
  if (h < 11) return { hello: 'Good morning', line: 'Breakfast? I can already smell the shakshuka.' };
  if (h < 15) return { hello: 'Lunchtime', line: 'Tail’s wagging. What are we fetching today?' };
  if (h < 18) return { hello: 'Good afternoon', line: 'Snack o’clock is a real time. I checked.' };
  if (h < 22) return { hello: 'Good evening', line: 'Dinner plans? Point me at a bowl.' };
  return { hello: 'Good night', line: 'One last fetch before the couch?' };
}

export function uid(prefix = ''): string {
  return prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
export const modKey = isMac ? '⌘' : 'Ctrl';

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export const PRESET_COLORS: Array<{ id: string; name: string; hex: string }> = [
  { id: 'ball', name: 'Tennis ball', hex: '#d7f25a' },
  { id: 'tongue', name: 'Tongue', hex: '#ff6f91' },
  { id: 'biscuit', name: 'Biscuit', hex: '#f4b860' },
  { id: 'mint', name: 'Mint', hex: '#2fbf8f' },
  { id: 'sky', name: 'Puddle', hex: '#6aa8ff' },
  { id: 'lilac', name: 'Lilac', hex: '#b48cff' },
  { id: 'paprika', name: 'Paprika', hex: '#ff8a4c' },
  { id: 'collar', name: 'Collar', hex: '#4d3456' },
];

export function colorHex(c: string | undefined): string {
  if (!c) return PRESET_COLORS[0]!.hex;
  if (c.startsWith('#')) return c;
  return PRESET_COLORS.find((p) => p.id === c)?.hex ?? PRESET_COLORS[0]!.hex;
}
