/**
 * In-browser mock database seeded from real Wolt catalog fixtures (Tel Aviv).
 * Only loaded in dev (or VITE_MOCK=1) — see main.tsx.
 */
import type {
  Automation, Menu, MenuItem, Pack, Preset, PresetItem, Run, RunLogEntry, Settings, Venue, VenueOrder, ChosenOption,
} from '@woltron/shared';

export interface Fixtures {
  venues: Venue[];
  tags: Array<{ id: string; name: string }>;
  menus: Record<string, { categories: Menu['categories']; items: MenuItem[] }>;
}

export interface MockDB {
  version: number;
  settings: Settings;
  presets: Preset[];
  packs: Pack[];
  automations: Automation[];
  runs: Run[];
  pairingToken: string;
}

export const DB_VERSION = 3;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

let n = 0;
export const id = (p: string) => `${p}_${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function presetItemFrom(item: MenuItem, venue: Venue, quantity = 1, options: ChosenOption[] = []): PresetItem {
  let extra = 0;
  const summary: string[] = [];
  for (const o of options) {
    const g = item.options.find((x) => x.id === o.groupId);
    for (const v of o.valueIds) {
      const val = g?.values.find((x) => x.id === v);
      if (val) {
        extra += val.price.amount;
        summary.push(val.name);
      }
    }
  }
  return {
    key: id('pi'),
    venueId: venue.id,
    venueSlug: venue.slug,
    venueName: venue.name,
    itemId: item.id,
    name: item.name,
    image: item.image,
    unitPrice: { amount: item.price.amount + extra, currency: item.price.currency },
    quantity,
    options,
    optionSummary: summary.join(', ') || undefined,
  };
}

export function seed(fx: Fixtures): MockDB {
  const venue = (slug: string) => fx.venues.find((v) => v.slug === slug)!;
  const item = (slug: string, name: string): MenuItem | undefined => {
    const m = fx.menus[slug];
    if (!m) return undefined;
    return m.items.find((i) => i.name.toLowerCase().includes(name.toLowerCase())) ?? m.items.find((i) => i.price.amount > 0);
  };
  const pi = (slug: string, name: string, q = 1) => {
    const it = item(slug, name);
    return it ? presetItemFrom(it, venue(slug), q) : undefined;
  };
  const items = (...xs: Array<PresetItem | undefined>) => xs.filter(Boolean) as PresetItem[];

  const base = (o: Partial<Preset> & Pick<Preset, 'name' | 'emoji' | 'color' | 'items'>): Preset => ({
    id: id('pre'),
    tags: [],
    favorite: false,
    createdAt: iso(-20 * DAY),
    updatedAt: iso(-2 * DAY),
    runCount: 0,
    ...o,
  });

  const presets: Preset[] = [
    base({
      name: 'Sushi night',
      emoji: '🍣',
      color: 'tongue',
      description: 'Rolls for two and gyoza on the side.',
      items: items(pi('kaido', 'avocado salmon', 2), pi('kaido', 'California'), pi('roll-n-roll', 'gyoza')),
      favorite: true,
      runCount: 14,
      lastRunAt: iso(-3 * DAY),
      tip: { amount: 1000, currency: 'ILS' },
      deliveryNote: 'Leave at the door, ring twice 🐾',
    }),
    base({
      name: 'Burger Friday',
      emoji: '🍔',
      color: 'biscuit',
      items: items(pi('hamosad', 'El Chapo', 1), pi('hamosad', 'Vegan Cheeseburger', 1), pi('america-burgers', 'French Fries', 2)),
      favorite: true,
      runCount: 9,
      lastRunAt: iso(-6 * DAY),
    }),
    base({
      name: 'Pizza & cookies',
      emoji: '🍕',
      color: 'paprika',
      description: 'Two venues, one happy couch.',
      items: items(pi('pizza-yoav', 'Pepperoni'), pi('pizza-yoav', 'Greek'), pi('night-cookie', 'Red Velvet', 2), pi('night-cookie', 'Over the Top')),
      favorite: true,
      runCount: 6,
      lastRunAt: iso(-10 * DAY),
    }),
    base({
      name: 'Poke lunch',
      emoji: '🥗',
      color: 'mint',
      items: items(pi('the-poke-ramat-gan', 'Aloha'), pi('the-poke-ramat-gan', 'Sakura')),
      runCount: 21,
      lastRunAt: iso(-1 * DAY),
      favorite: true,
    }),
    base({
      name: 'Wok it out',
      emoji: '🥡',
      color: 'ball',
      items: items(pi('wok-to-walk-hahashmonain', 'Pro Noodles'), pi('wok-to-walk-hahashmonain', 'Egg Noodles')),
      runCount: 4,
      lastRunAt: iso(-12 * DAY),
    }),
    base({
      name: 'Hummus run',
      emoji: '🧆',
      color: 'biscuit',
      items: items(pi('hummus-gargerim', 'Classic Hummus', 2), pi('hummus-gargerim', 'Matbukha'), pi('abulafia', 'Za\'atar Pita', 3)),
      runCount: 3,
    }),
    base({
      name: 'Gelato emergency',
      emoji: '🍨',
      color: 'lilac',
      items: items(pi('siciliana', '0.5 Kilo Ice Cream')),
      runCount: 2,
    }),
    base({
      name: 'Ramen rescue',
      emoji: '🍜',
      color: 'sky',
      items: items(pi('yokozuna', 'Agedashi'), pi('yokozuna', 'Thai Salad'), pi('kyo', 'Spicy Salmon Onigiri', 2)),
      runCount: 5,
      lastRunAt: iso(-4 * DAY),
    }),
  ].filter((p) => p.items.length > 0);

  const P = (name: string) => presets.find((p) => p.name === name)?.id ?? presets[0]!.id;

  const packs: Pack[] = [
    {
      id: id('pack'),
      name: 'Random Asian',
      emoji: '🥢',
      color: 'tongue',
      description: 'Lunch roulette, but make it umami.',
      members: [
        { presetId: P('Sushi night'), weight: 3 },
        { presetId: P('Poke lunch'), weight: 5 },
        { presetId: P('Wok it out'), weight: 2 },
        { presetId: P('Ramen rescue'), weight: 4 },
      ],
      strategy: 'weighted',
      avoidRepeats: 1,
      cursor: 0,
      history: [
        { presetId: P('Poke lunch'), at: iso(-1 * DAY) },
        { presetId: P('Ramen rescue'), at: iso(-4 * DAY) },
        { presetId: P('Sushi night'), at: iso(-5 * DAY) },
      ],
      favorite: true,
      createdAt: iso(-15 * DAY),
      updatedAt: iso(-1 * DAY),
      lastRunAt: iso(-1 * DAY),
      runCount: 17,
    },
    {
      id: id('pack'),
      name: 'Couch comfort',
      emoji: '🛋️',
      color: 'biscuit',
      description: 'Rotate through the greasy classics.',
      members: [
        { presetId: P('Burger Friday'), weight: 3 },
        { presetId: P('Pizza & cookies'), weight: 3 },
        { presetId: P('Hummus run'), weight: 3 },
      ],
      strategy: 'round-robin',
      avoidRepeats: 1,
      cursor: 1,
      history: [{ presetId: P('Burger Friday'), at: iso(-6 * DAY) }],
      favorite: true,
      createdAt: iso(-15 * DAY),
      updatedAt: iso(-6 * DAY),
      lastRunAt: iso(-6 * DAY),
      runCount: 5,
    },
    {
      id: id('pack'),
      name: 'Surprise me',
      emoji: '🎲',
      color: 'lilac',
      members: presets.slice(0, 6).map((p) => ({ presetId: p.id, weight: 3 })),
      strategy: 'fresh',
      avoidRepeats: 2,
      cursor: 0,
      history: [],
      favorite: false,
      createdAt: iso(-5 * DAY),
      updatedAt: iso(-5 * DAY),
      runCount: 0,
    },
  ];

  const nextWeekday1230 = (() => {
    const d = new Date();
    d.setSeconds(0, 0);
    d.setHours(12, 30);
    while (d.getTime() <= Date.now() || d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    return d.toISOString();
  })();

  const automations: Automation[] = [
    {
      id: id('auto'),
      name: 'Weekday lunch roulette',
      enabled: true,
      target: { kind: 'pack', id: packs[0]!.id },
      trigger: { type: 'schedule', cron: '30 12 * * 1-5', timezone: 'Asia/Jerusalem', humanLabel: 'Weekdays at 12:30' },
      confirm: 'ask',
      confirmWindowMin: 10,
      guards: { maxTotal: { amount: 15000, currency: 'ILS' }, onlyIfAllVenuesOpen: true },
      createdAt: iso(-14 * DAY),
      updatedAt: iso(-2 * DAY),
      lastFiredAt: iso(-1 * DAY),
      nextFireAt: nextWeekday1230,
      fireCount: 11,
    },
    {
      id: id('auto'),
      name: 'Friday night pizza',
      enabled: true,
      target: { kind: 'preset', id: P('Pizza & cookies') },
      trigger: { type: 'schedule', cron: '0 20 * * 5', timezone: 'Asia/Jerusalem', humanLabel: 'Fridays at 20:00' },
      confirm: 'auto',
      confirmWindowMin: 10,
      guards: { onlyIfAllVenuesOpen: true },
      createdAt: iso(-30 * DAY),
      updatedAt: iso(-30 * DAY),
      nextFireAt: (() => {
        const d = new Date();
        d.setHours(20, 0, 0, 0);
        while (d.getDay() !== 5 || d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
        return d.toISOString();
      })(),
      fireCount: 4,
    },
    {
      id: id('auto'),
      name: 'Hey Siri, burgers',
      enabled: true,
      target: { kind: 'preset', id: P('Burger Friday') },
      trigger: { type: 'webhook', secret: 'whsec_' + Math.random().toString(36).slice(2, 14) },
      confirm: 'ask',
      confirmWindowMin: 5,
      guards: { onlyIfAllVenuesOpen: false, maxTotal: { amount: 20000, currency: 'ILS' } },
      createdAt: iso(-9 * DAY),
      updatedAt: iso(-9 * DAY),
      fireCount: 2,
      lastFiredAt: iso(-6 * DAY),
    },
    {
      id: id('auto'),
      name: 'Gelato as soon as they open',
      enabled: false,
      target: { kind: 'preset', id: P('Gelato emergency') },
      trigger: { type: 'venue-online', venueSlug: 'siciliana', venueName: 'Gelateria Siciliana' },
      confirm: 'ask',
      confirmWindowMin: 15,
      guards: { onlyIfAllVenuesOpen: true },
      createdAt: iso(-3 * DAY),
      updatedAt: iso(-3 * DAY),
      fireCount: 0,
    },
    {
      id: id('auto'),
      name: 'Anniversary sushi',
      enabled: true,
      target: { kind: 'preset', id: P('Sushi night') },
      trigger: { type: 'once', at: iso(2 * DAY + 5 * HOUR) },
      confirm: 'auto',
      confirmWindowMin: 10,
      guards: { onlyIfAllVenuesOpen: true },
      createdAt: iso(-1 * DAY),
      updatedAt: iso(-1 * DAY),
      nextFireAt: iso(2 * DAY + 5 * HOUR),
      fireCount: 0,
    },
  ];

  const settings: Settings = {
    location: { lat: 32.0753, lon: 34.7757, address: 'Dizengoff St 50, Tel Aviv-Yafo', label: 'Home' },
    savedLocations: [
      { lat: 32.0753, lon: 34.7757, address: 'Dizengoff St 50, Tel Aviv-Yafo', label: 'Home' },
      { lat: 32.0636, lon: 34.7718, address: 'Rothschild Blvd 22, Tel Aviv-Yafo', label: 'Office' },
    ],
    orderMode: 'dry-run',
    limits: { maxPerRun: { amount: 25000, currency: 'ILS' }, maxPerDay: { amount: 40000, currency: 'ILS' } },
    llm: { model: 'anthropic/claude-sonnet-4.5', hasApiKey: true, keySource: 'env' },
    wolt: { connected: true, user: { name: 'Noa Levi', email: 'noa@example.com' }, expiresAt: iso(25 * DAY) },
    lan: { enabled: true, port: 4321 },
    appearance: { theme: 'system', reducedMotion: false, mascotName: 'Woltie' },
    notifications: { desktop: true, sound: false },
    language: 'en',
  };

  const db: MockDB = { version: DB_VERSION, settings, presets, packs, automations, runs: [], pairingToken: 'wt_' + Math.random().toString(36).slice(2, 18) };

  // Historical runs
  const mk = (preset: Preset, status: Run['status'], ago: number, extra: Partial<Run> = {}): Run => {
    const r = buildRun(db, fx, preset, { mode: 'dry-run', source: 'manual', target: { kind: 'preset', id: preset.id } });
    const at = iso(-ago);
    r.createdAt = at;
    r.updatedAt = at;
    r.status = status;
    r.log = r.log.map((l) => ({ ...l, at }));
    const vs: VenueOrder['status'] =
      status === 'delivered' ? 'delivered' : status === 'placed' ? 'in-delivery' : status === 'simulated' ? 'simulated' : status === 'failed' ? 'failed' : status === 'skipped' ? 'skipped' : 'ready';
    r.venueOrders = r.venueOrders.map((v) => ({ ...v, status: vs }));
    return Object.assign(r, extra);
  };
  const pres = (name: string) => presets.find((p) => p.name === name) ?? presets[0]!;
  db.runs = [
    mk(pres('Poke lunch'), 'awaiting-confirmation', 2 * MIN, {
      source: 'schedule',
      mode: 'live',
      packId: packs[0]!.id,
      packName: packs[0]!.name,
      target: { kind: 'pack', id: packs[0]!.id },
      automationId: automations[0]!.id,
      confirmBy: iso(8 * MIN),
    }),
    mk(pres('Ramen rescue'), 'delivered', 4 * DAY, { mode: 'live', source: 'schedule', automationId: automations[0]!.id }),
    mk(pres('Sushi night'), 'simulated', 3 * DAY, { source: 'manual' }),
    mk(pres('Burger Friday'), 'handed-off', 6 * DAY, { mode: 'handoff', source: 'webhook' }),
    mk(pres('Pizza & cookies'), 'skipped', 7 * DAY, { source: 'schedule' }),
    mk(pres('Wok it out'), 'failed', 12 * DAY, { source: 'tray' }),
  ];
  const ho = db.runs[3]!;
  ho.venueOrders = ho.venueOrders.map((v) => ({ ...v, status: 'handed-off', checkoutUrl: `https://wolt.com/en/isr/tel-aviv/restaurant/${v.venueSlug}` }));
  db.runs[5]!.venueOrders[0]!.error = 'Venue stopped accepting orders mid-checkout';
  db.runs[5]!.log.push({ at: db.runs[5]!.createdAt, level: 'error', message: 'Wolt said no: venue went offline during checkout.' });
  db.runs[4]!.log.push({ at: db.runs[4]!.createdAt, level: 'warn', message: 'Skipped — Night Cookie was closed and “only if all venues open” is on.' });
  return db;
}

export function buildRun(
  _db: MockDB,
  fx: Fixtures,
  preset: Preset,
  o: Pick<Run, 'mode' | 'source' | 'target'> & { packId?: string; packName?: string; automationId?: string },
): Run {
  const groups = new Map<string, PresetItem[]>();
  for (const it of preset.items) groups.set(it.venueId, [...(groups.get(it.venueId) ?? []), it]);
  const venueOrders: VenueOrder[] = [...groups.entries()].map(([venueId, its]) => {
    const v = fx.venues.find((x) => x.id === venueId);
    const currency = its[0]!.unitPrice.currency;
    const subtotal = its.reduce((s, i) => s + i.unitPrice.amount * i.quantity, 0);
    const deliveryFee = v?.deliveryPrice?.amount ?? 990;
    const serviceFee = Math.round(subtotal * 0.05);
    return {
      venueId,
      venueSlug: its[0]!.venueSlug,
      venueName: its[0]!.venueName,
      venueImage: v?.image,
      lines: its.map((i) => ({
        itemId: i.itemId,
        name: i.name,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        available: true,
        optionSummary: i.optionSummary,
        image: i.image,
      })),
      subtotal: { amount: subtotal, currency },
      deliveryFee: { amount: deliveryFee, currency },
      serviceFee: { amount: serviceFee, currency },
      total: { amount: subtotal + deliveryFee + serviceFee, currency },
      status: 'pending',
      etaMinutes: v?.deliveryEstimateMin ?? 30,
    };
  });
  const currency = venueOrders[0]?.total.currency ?? 'ILS';
  const total = venueOrders.reduce((s, v) => s + v.total.amount, 0) + (preset.tip?.amount ?? 0);
  const now = new Date().toISOString();
  const log: RunLogEntry[] = [
    { at: now, level: 'info', message: o.packName ? `Spun “${o.packName}” → ${preset.name}` : `Fetching “${preset.name}”` },
  ];
  return {
    id: id('run'),
    createdAt: now,
    updatedAt: now,
    source: o.source,
    mode: o.mode,
    status: 'pending',
    target: o.target,
    presetId: preset.id,
    presetName: preset.name,
    packId: o.packId,
    packName: o.packName,
    automationId: o.automationId,
    venueOrders,
    total: { amount: total, currency },
    log,
  };
}
