/**
 * First-run demo data, built from whatever the WoltClient returns so ids are real.
 */
import { nanoid } from 'nanoid';
import type { Automation, ChosenOption, GeoLocation, Menu, MenuItem, Pack, Preset, PresetItem, Venue, WoltClient } from '@woltron/shared';
import { errorMessage } from './errors.js';
import type { Store } from './store.js';
import { createFallbackMockClient } from './wolt/fallback-mock.js';

type Want = { key: string; tags: string[] };
const WANTS: Want[] = [
  { key: 'sushi', tags: ['sushi'] },
  { key: 'noodles', tags: ['noodles', 'ramen', 'wok', 'thai', 'chinese', 'vietnamese'] },
  { key: 'poke', tags: ['poke', 'japanese', 'asian'] },
  { key: 'pizza', tags: ['pizza'] },
  { key: 'burger', tags: ['burger', 'hamburger'] },
  { key: 'veg', tags: ['vegan', 'hummus', 'vegetarian', 'healthy', 'salad'] },
];

function candidates(venues: Venue[]): Map<string, Venue[]> {
  const ranked = [...venues].filter((v) => v.online && v.delivers).sort((a, b) => (b.rating?.score ?? 0) - (a.rating?.score ?? 0));
  const out = new Map<string, Venue[]>();
  for (const w of WANTS) {
    const list: Venue[] = [];
    for (const tag of w.tags) {
      for (const v of ranked) if (!list.includes(v) && v.tags.some((t) => t.toLowerCase() === tag)) list.push(v);
    }
    out.set(w.key, list);
  }
  return out;
}

const hasUsableItems = (menu: Menu) => menu.items.some((i) => i.available && i.price.amount > 0);

function defaultOptions(item: MenuItem): { options: ChosenOption[]; extra: number; summary: string[] } {
  const options: ChosenOption[] = [];
  const summary: string[] = [];
  let extra = 0;
  for (const g of item.options) {
    if (g.min < 1 || g.values.length === 0) continue;
    const vals = [...g.values].sort((a, b) => Number(!!b.isDefault) - Number(!!a.isDefault) || a.price.amount - b.price.amount).slice(0, g.min);
    options.push({ groupId: g.id, valueIds: vals.map((v) => v.id) });
    for (const v of vals) {
      extra += v.price.amount;
      summary.push(v.name);
    }
  }
  return { options, extra, summary };
}

function pickItems(menu: Menu, n: number): PresetItem[] {
  const ok = menu.items.filter((i) => i.available && i.price.amount > 0);
  const nice = ok.filter((i) => i.image && i.price.amount >= 2500 && i.price.amount <= 12000);
  const chosen = (nice.length >= n ? nice : ok).slice(0, n);
  return chosen.map((item) => {
    const { options, extra, summary } = defaultOptions(item);
    return {
      key: nanoid(8),
      venueId: menu.venue.id,
      venueSlug: menu.venue.slug,
      venueName: menu.venue.name,
      itemId: item.id,
      name: item.name,
      image: item.image,
      unitPrice: { amount: item.price.amount + extra, currency: item.price.currency },
      quantity: 1,
      options,
      ...(summary.length ? { optionSummary: summary.join(', ') } : {}),
    };
  });
}

async function buildFrom(client: WoltClient, loc: GeoLocation) {
  const { venues } = await client.listVenues(loc);
  const used = new Set<string>();
  const menus = new Map<string, Menu>();
  // Sequential on purpose: each want takes the best-rated venue not already used whose menu has orderable items.
  for (const [key, list] of candidates(venues)) {
    for (const v of list.slice(0, 6)) {
      if (used.has(v.slug)) continue;
      try {
        const menu = await client.getMenu(v.slug, loc);
        if (!hasUsableItems(menu)) continue;
        menus.set(key, menu);
        used.add(v.slug);
        break;
      } catch {
        /* try the next candidate */
      }
    }
  }
  return menus;
}

export async function seedDemoData(store: Store, client: WoltClient, log: (m: string) => void = console.log): Promise<boolean> {
  if (!store.isEmpty) return false;
  const loc = store.data.settings.location ?? { lat: 32.0853, lon: 34.7818 };
  let menus: Map<string, Menu> = new Map();
  try {
    menus = await buildFrom(client, loc);
  } catch (e) {
    log(`[woltron] seed: wolt client failed (${errorMessage(e)}), using built-in fixtures`);
  }
  if (menus.size < 4) menus = await buildFrom(createFallbackMockClient({ latencyMs: 0 }), loc);

  const now = new Date().toISOString();
  const presets: Preset[] = [];
  const mk = (key: string, p: Pick<Preset, 'name' | 'emoji' | 'color' | 'description' | 'tags'> & { n?: number; favorite?: boolean }) => {
    const menu = menus.get(key);
    if (!menu) return undefined;
    const items = pickItems(menu, p.n ?? 2);
    if (!items.length) return undefined;
    const preset: Preset = {
      id: nanoid(10),
      name: p.name,
      emoji: p.emoji,
      color: p.color,
      description: p.description,
      items,
      tags: p.tags,
      favorite: p.favorite ?? false,
      createdAt: now,
      updatedAt: now,
      runCount: 0,
    };
    presets.push(preset);
    return preset;
  };

  const sushi = mk('sushi', { name: 'Sushi Night', emoji: '🍣', color: 'rose', description: 'Rolls for two, no thinking required.', tags: ['asian', 'sushi'], favorite: true });
  const noodles = mk('noodles', { name: 'Noodle Rescue', emoji: '🍜', color: 'orange', description: 'Slurpable comfort for rainy evenings.', tags: ['asian', 'noodles'] });
  const poke = mk('poke', { name: 'Poke & Bites', emoji: '🥢', color: 'teal', description: 'Light, fresh, and just a little fancy.', tags: ['asian', 'healthy'], n: 2 });
  const pizza = mk('pizza', { name: 'Pizza Friday', emoji: '🍕', color: 'red', description: 'Because it’s Friday. Or any day, really.', tags: ['pizza', 'sharing'], n: 1, favorite: true });
  const burger = mk('burger', { name: 'Burger Fix', emoji: '🍔', color: 'amber', description: 'One serious burger, delivered fast.', tags: ['burger'], n: 1 });

  // Multi-venue preset: one thing from each of three different places.
  const multiKeys = ['veg', 'pizza', 'sushi'].filter((k) => menus.has(k));
  if (multiKeys.length >= 2) {
    const items = multiKeys.flatMap((k) => pickItems(menus.get(k)!, 1).map((i) => (k === 'veg' ? { ...i, quantity: 2 } : i)));
    presets.push({
      id: nanoid(10),
      name: 'Office Feast',
      emoji: '🎉',
      color: 'violet',
      description: 'Something for everyone — one order per restaurant, all at once.',
      items,
      tags: ['team', 'multi-venue'],
      deliveryNote: 'Leave at reception, please 🙏',
      favorite: false,
      createdAt: now,
      updatedAt: now,
      runCount: 0,
    });
  }

  const packs: Pack[] = [];
  const asian = [sushi, noodles, poke].filter((p): p is Preset => !!p);
  if (asian.length >= 2) {
    packs.push({
      id: nanoid(10),
      name: 'Random Asian',
      emoji: '🥡',
      color: 'rose',
      description: 'Can’t decide? Let the dog pick — never the same thing twice in a row.',
      members: asian.map((p) => ({ presetId: p.id, weight: 3 })),
      strategy: 'fresh',
      avoidRepeats: 1,
      cursor: 0,
      history: [],
      favorite: true,
      createdAt: now,
      updatedAt: now,
      runCount: 0,
    });
  }
  const comfort = [pizza, burger, noodles].filter((p): p is Preset => !!p);
  if (comfort.length >= 2) {
    packs.push({
      id: nanoid(10),
      name: 'Comfort Roulette',
      emoji: '🎰',
      color: 'amber',
      description: 'Weighted towards burgers, because priorities.',
      members: comfort.map((p) => ({ presetId: p.id, weight: p === burger ? 4 : p === pizza ? 3 : 2 })),
      strategy: 'weighted',
      avoidRepeats: 0,
      cursor: 0,
      history: [],
      favorite: false,
      createdAt: now,
      updatedAt: now,
      runCount: 0,
    });
  }

  const automations: Automation[] = [];
  const lunchTarget = packs[0] ? { kind: 'pack' as const, id: packs[0].id } : presets[0] ? { kind: 'preset' as const, id: presets[0].id } : undefined;
  if (lunchTarget) {
    automations.push({
      id: nanoid(10),
      name: 'Weekday lunch',
      enabled: true,
      target: lunchTarget,
      trigger: { type: 'schedule', cron: '30 12 * * 1-5', timezone: 'Asia/Jerusalem', humanLabel: 'Weekdays at 12:30' },
      confirm: 'ask',
      confirmWindowMin: 20,
      guards: { maxTotal: { amount: 25000, currency: 'ILS' }, onlyIfAllVenuesOpen: false, skipDates: [] },
      createdAt: now,
      updatedAt: now,
      fireCount: 0,
    });
  }
  const hookTarget = burger ?? presets[0];
  if (hookTarget) {
    automations.push({
      id: nanoid(10),
      name: 'Hey Siri, feed me',
      enabled: true,
      target: { kind: 'preset', id: hookTarget.id },
      trigger: { type: 'webhook', secret: nanoid(24) },
      confirm: 'auto',
      confirmWindowMin: 15,
      guards: { onlyIfAllVenuesOpen: true },
      createdAt: now,
      updatedAt: now,
      fireCount: 0,
    });
  }

  store.mutate((d) => {
    d.presets.push(...presets);
    d.packs.push(...packs);
    d.automations.push(...automations);
    d.meta.seededAt = now;
  });
  log(`[woltron] seeded demo data: ${presets.length} presets, ${packs.length} packs, ${automations.length} automations`);
  return true;
}
