import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Menu, MenuItem, Preset, PresetItem, Venue, WoltClient } from '@woltron/shared';
import { WoltError } from '@woltron/shared';

export const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'woltron-test-'));

export const ils = (amount: number) => ({ amount, currency: 'ILS' });

export function venue(slug: string, over: Partial<Venue> = {}): Venue {
  return {
    id: `v-${slug}`,
    slug,
    name: slug[0]!.toUpperCase() + slug.slice(1),
    online: true,
    delivers: true,
    tags: [],
    currency: 'ILS',
    deliveryPrice: ils(900),
    deliveryEstimateMin: 25,
    url: `https://wolt.com/x/${slug}`,
    ...over,
  };
}

export function item(venueSlug: string, id: string, price: number, over: Partial<MenuItem> = {}): MenuItem {
  return { id, venueId: `v-${venueSlug}`, venueSlug, name: id, price: ils(price), available: true, options: [], ...over };
}

export interface FakeWolt extends WoltClient {
  venues: Map<string, Venue>;
  menus: Map<string, MenuItem[]>;
  calls: string[];
  placeError?: WoltError;
  quoteError?: WoltError;
}

export function fakeWolt(): FakeWolt {
  const venues = new Map<string, Venue>();
  const menus = new Map<string, MenuItem[]>();
  const calls: string[] = [];
  const self: FakeWolt = {
    mock: true,
    venues,
    menus,
    calls,
    async geocode() {
      return [];
    },
    async listVenues() {
      return { venues: [...venues.values()], tags: [] };
    },
    async getVenue(slug) {
      calls.push(`getVenue:${slug}`);
      const v = venues.get(slug);
      if (!v) throw new WoltError('not_found', 'nope');
      return structuredClone(v);
    },
    async getMenu(slug): Promise<Menu> {
      calls.push(`getMenu:${slug}`);
      const v = venues.get(slug);
      if (!v) throw new WoltError('not_found', 'nope');
      return { venue: v, categories: [], items: structuredClone(menus.get(slug) ?? []), fetchedAt: new Date().toISOString() };
    },
    async search(q) {
      const items = [...menus.entries()].flatMap(([slug, its]) =>
        its.filter((i) => `${i.name} ${i.description ?? ''}`.toLowerCase().includes(q.toLowerCase())).map((i) => ({ item: i, venue: venues.get(slug)! })),
      );
      return { venues: [], items };
    },
    setTokens() {},
    onTokensRefreshed() {},
    async connectWithRefreshToken() {
      return { connected: true };
    },
    async connection() {
      return { connected: false };
    },
    async quoteBasket(slug, lines) {
      calls.push(`quote:${slug}`);
      if (self.quoteError) throw self.quoteError;
      const menu = menus.get(slug) ?? [];
      const sub = lines.reduce((s, l) => {
        const it = menu.find((m) => m.id === l.itemId)!;
        const extra = l.options.flatMap((o) => o.valueIds.map((v) => it.options.find((g) => g.id === o.groupId)?.values.find((x) => x.id === v)?.price.amount ?? 0)).reduce((a, b) => a + b, 0);
        return s + (it.price.amount + extra) * l.quantity;
      }, 0);
      return { venueSlug: slug, subtotal: ils(sub), deliveryFee: ils(900), serviceFee: ils(100), total: ils(sub + 1000), etaMinutes: 30, checkoutUrl: `https://wolt.com/checkout/${slug}`, warnings: [] };
    },
    async placeOrder(q) {
      calls.push(`place:${q.venueSlug}`);
      if (self.placeError) throw self.placeError;
      return { orderId: `o-${q.venueSlug}`, status: 'received', etaMinutes: 33 };
    },
  };
  return self;
}

export function presetItem(venueSlug: string, itemId: string, unit: number, over: Partial<PresetItem> = {}): PresetItem {
  return {
    key: `${venueSlug}-${itemId}`,
    venueId: `v-${venueSlug}`,
    venueSlug,
    venueName: venueSlug,
    itemId,
    name: itemId,
    unitPrice: ils(unit),
    quantity: 1,
    options: [],
    ...over,
  };
}

export function preset(id: string, items: PresetItem[], over: Partial<Preset> = {}): Preset {
  return { id, name: `Preset ${id}`, emoji: '🍱', color: 'amber', items, tags: [], favorite: false, createdAt: '', updatedAt: '', runCount: 0, ...over };
}
