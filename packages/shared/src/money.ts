import type { Money } from './domain.js';

export const money = (amount: number, currency: string): Money => ({ amount: Math.round(amount), currency });

export const addMoney = (a: Money, b: Money): Money => {
  if (a.currency !== b.currency) throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  return { amount: a.amount + b.amount, currency: a.currency };
};

export const sumMoney = (items: Money[], currency: string): Money =>
  items.reduce((acc, m) => addMoney(acc, m), money(0, currency));

export const formatMoney = (m: Money | undefined, locale = 'en'): string => {
  if (!m) return '—';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: m.currency }).format(m.amount / 100);
  } catch {
    return `${(m.amount / 100).toFixed(2)} ${m.currency}`;
  }
};
