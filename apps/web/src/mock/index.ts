/**
 * In-browser mock of the Woltron REST + SSE API.
 * Installed by main.tsx when VITE_MOCK=1, or automatically in dev when /api/health is unreachable.
 * Never part of a production bundle unless VITE_MOCK=1 at build time.
 */
import type {
  AutomationInput, FetchIntent, FetchResponse, FetchSuggestion, GeoLocation, Menu, MenuItem, Pack, PackInput, PackPreview,
  Preset, PresetInput, Run, RunRequest, ServerEvent, Settings, SettingsPatch, Venue,
} from '@woltron/shared';
import fixturesUrl from './fixtures.json?url';
import { buildRun, DB_VERSION, id, seed, type Fixtures, type MockDB } from './db';

const STORE_KEY = 'woltron.mockdb';
let fx: Fixtures;
let db: MockDB;

// ───────────────────────── persistence ─────────────────────────
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as MockDB;
      if (parsed.version === DB_VERSION) return parsed;
    }
  } catch {
    /* ignore */
  }
  return seed(fx);
}
let saveTimer: ReturnType<typeof setTimeout> | undefined;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(db));
    } catch {
      /* quota */
    }
  }, 150);
}

// ───────────────────────── SSE bus ─────────────────────────
const sources = new Set<FakeEventSource>();
function emit(ev: ServerEvent) {
  const data = JSON.stringify(ev);
  for (const s of sources) s._dispatch(data);
}

class FakeEventSource extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSED = 2;
  readyState = 0;
  withCredentials = false;
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  constructor(public url: string) {
    super();
    setTimeout(() => {
      if (this.readyState === 2) return;
      this.readyState = 1;
      sources.add(this);
      const e = new Event('open');
      this.onopen?.(e);
      this.dispatchEvent(e);
      this._dispatch(JSON.stringify({ type: 'hello', serverTime: new Date().toISOString(), version: '0.1.0-mock' } satisfies ServerEvent));
    }, 60);
  }
  _dispatch(data: string) {
    const e = new MessageEvent('message', { data });
    this.onmessage?.(e);
    this.dispatchEvent(e);
  }
  close() {
    this.readyState = 2;
    sources.delete(this);
  }
}

// ───────────────────────── helpers ─────────────────────────
class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
const notFound = (what: string) => new HttpError(404, 'not_found', `${what} not found`);
const now = () => new Date().toISOString();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function menuFor(slug: string): Menu {
  const venue = fx.venues.find((v) => v.slug === slug);
  if (!venue) throw notFound('Venue');
  const m = fx.menus[slug] ?? { categories: [], items: [] };
  return { venue, categories: m.categories, items: m.items, fetchedAt: now() };
}

function allItems(): Array<{ item: MenuItem; venue: Venue }> {
  const out: Array<{ item: MenuItem; venue: Venue }> = [];
  for (const [slug, m] of Object.entries(fx.menus)) {
    const venue = fx.venues.find((v) => v.slug === slug);
    if (!venue) continue;
    for (const item of m.items) if (item.price.amount > 500 && item.image) out.push({ item, venue });
  }
  return out;
}

function matchesTag(v: Venue, tag: string) {
  const t = tag.toLowerCase().replace(/[-_]/g, ' ').replace(/s$/, '');
  return v.tags.some((x) => x.toLowerCase().replace(/s$/, '').includes(t)) || v.name.toLowerCase().includes(t);
}

function presetById(pid: string) {
  const p = db.presets.find((x) => x.id === pid);
  if (!p) throw notFound('Preset');
  return p;
}

// ───────────────────────── packs ─────────────────────────
function packPreview(pack: Pack): PackPreview {
  const members = pack.members.filter((m) => db.presets.some((p) => p.id === m.presetId));
  if (members.length === 0) return { packId: pack.id, strategy: pack.strategy, odds: [] };
  if (pack.strategy === 'round-robin') {
    const next = members[pack.cursor % members.length]!;
    return { packId: pack.id, strategy: pack.strategy, nextUp: next.presetId, odds: members.map((m) => ({ presetId: m.presetId, probability: m === next ? 1 : 0 })) };
  }
  if (pack.strategy === 'weighted') {
    const total = members.reduce((s, m) => s + m.weight, 0);
    return { packId: pack.id, strategy: pack.strategy, odds: members.map((m) => ({ presetId: m.presetId, probability: m.weight / total })) };
  }
  if (pack.strategy === 'fresh') {
    const recent = new Set(pack.history.slice(0, pack.avoidRepeats).map((h) => h.presetId));
    const pool = members.filter((m) => !recent.has(m.presetId));
    const eff = pool.length ? pool : members;
    return {
      packId: pack.id,
      strategy: pack.strategy,
      odds: members.map((m) => ({ presetId: m.presetId, probability: eff.includes(m) ? 1 / eff.length : 0 })),
    };
  }
  return { packId: pack.id, strategy: pack.strategy, odds: members.map((m) => ({ presetId: m.presetId, probability: 1 / members.length })) };
}

function pickFromPack(pack: Pack): Preset {
  const prev = packPreview(pack);
  if (prev.odds.length === 0) throw new HttpError(400, 'empty_pack', 'This pack has no presets yet.');
  let pid = prev.nextUp;
  if (!pid) {
    let r = Math.random();
    for (const o of prev.odds) {
      r -= o.probability;
      if (r <= 0) {
        pid = o.presetId;
        break;
      }
    }
    pid ??= prev.odds[prev.odds.length - 1]!.presetId;
  }
  if (pack.strategy === 'round-robin') pack.cursor = (pack.cursor + 1) % pack.members.length;
  pack.history.unshift({ presetId: pid, at: now() });
  pack.history = pack.history.slice(0, 50);
  pack.runCount++;
  pack.lastRunAt = now();
  return presetById(pid);
}

// ───────────────────────── runs ─────────────────────────
function updateRun(run: Run, patch: Partial<Run>, log?: Run['log'][number]) {
  Object.assign(run, patch, { updatedAt: now() });
  if (log) run.log.push(log);
  save();
  emit({ type: 'run.updated', run: structuredClone(run) });
}

function startRun(req: RunRequest & { automationId?: string }): Run {
  let preset: Preset;
  let packId: string | undefined;
  let packName: string | undefined;
  if (req.target.kind === 'pack') {
    const pack = db.packs.find((p) => p.id === req.target.id);
    if (!pack) throw notFound('Pack');
    preset = pickFromPack(pack);
    packId = pack.id;
    packName = pack.name;
  } else {
    preset = presetById(req.target.id);
  }
  preset.runCount++;
  preset.lastRunAt = now();
  const mode = req.mode ?? db.settings.orderMode;
  const run = buildRun(db, fx, preset, { mode, source: req.source ?? 'manual', target: req.target, packId, packName, automationId: req.automationId });
  db.runs.unshift(run);
  save();
  simulate(run, req.confirm ?? 'auto');
  return structuredClone(run);
}

async function simulate(run: Run, confirm: 'auto' | 'ask') {
  await sleep(700);
  updateRun(run, { venueOrders: run.venueOrders.map((v) => ({ ...v, status: 'validating' })) }, { at: now(), level: 'info', message: `Sniffing ${run.venueOrders.length} venue${run.venueOrders.length > 1 ? 's' : ''} for availability & prices…` });
  await sleep(1100);
  const limit = db.settings.limits.maxPerRun?.amount;
  if (limit && run.total.amount > limit) {
    updateRun(run, { status: 'skipped', venueOrders: run.venueOrders.map((v) => ({ ...v, status: 'skipped' })) }, { at: now(), level: 'warn', message: 'Over your per-run limit, so I sat and stayed.' });
    emit({ type: 'notification', level: 'warn', title: 'Run skipped', body: `${run.presetName} is over your per-run limit.`, runId: run.id });
    return;
  }
  updateRun(run, { venueOrders: run.venueOrders.map((v) => ({ ...v, status: 'ready' })) }, { at: now(), level: 'success', message: 'Everything’s in stock. Baskets are ready.' });
  if (confirm === 'ask') {
    updateRun(run, { status: 'awaiting-confirmation', confirmBy: new Date(Date.now() + 10 * 60_000).toISOString() }, { at: now(), level: 'info', message: 'Waiting for your OK (10 min).' });
    emit({ type: 'notification', level: 'info', title: 'Ready when you are', body: `${run.presetName} needs your OK.`, runId: run.id });
    return;
  }
  await place(run);
}

async function place(run: Run) {
  updateRun(run, { status: 'placing', venueOrders: run.venueOrders.map((v) => ({ ...v, status: 'placing' })) }, { at: now(), level: 'info', message: run.mode === 'dry-run' ? 'Pretending to place the order (dry run)…' : 'Placing order with Wolt…' });
  await sleep(1500);
  if (run.mode === 'dry-run') {
    updateRun(run, { status: 'simulated', venueOrders: run.venueOrders.map((v) => ({ ...v, status: 'simulated' })) }, { at: now(), level: 'success', message: 'Dry run complete. Nothing was charged.' });
    emit({ type: 'notification', level: 'success', title: 'Good boy! Dry run done', body: `${run.presetName} would cost ${(run.total.amount / 100).toFixed(2)} ${run.total.currency}.`, runId: run.id });
  } else if (run.mode === 'handoff') {
    updateRun(
      run,
      { status: 'handed-off', venueOrders: run.venueOrders.map((v) => ({ ...v, status: 'handed-off', checkoutUrl: `https://wolt.com/en/isr/tel-aviv/restaurant/${v.venueSlug}` })) },
      { at: now(), level: 'success', message: 'Basket is waiting in Wolt — tap Pay to finish.' },
    );
    emit({ type: 'notification', level: 'success', title: 'Basket ready in Wolt', body: 'Finish checkout with one tap.', runId: run.id });
  } else {
    updateRun(
      run,
      { status: 'placed', venueOrders: run.venueOrders.map((v) => ({ ...v, status: 'placed', woltOrderId: id('wolt') })) },
      { at: now(), level: 'success', message: 'Order placed! Tail wagging intensifies.' },
    );
    emit({ type: 'notification', level: 'success', title: 'Good boy! Order placed', body: `${run.presetName} is on its way.`, runId: run.id });
    await sleep(4000);
    updateRun(run, { venueOrders: run.venueOrders.map((v) => ({ ...v, status: 'in-delivery' })) }, { at: now(), level: 'info', message: 'Courier picked it up.' });
  }
}

// ───────────────────────── fetch (LLM) ─────────────────────────
const DIET = ['vegan', 'vegetarian', 'gluten-free', 'spicy', 'healthy', 'kosher'];
const CUISINES = ['sushi', 'ramen', 'pizza', 'burger', 'hummus', 'poke', 'noodles', 'asian', 'italian', 'japanese', 'dessert', 'ice cream', 'gelato', 'cookie', 'falafel', 'shawarma', 'pasta', 'salad', 'chicken', 'wok'];
const MOODS = ['cozy', 'light', 'fancy', 'comfort', 'quick', 'cheap', 'healthy', 'hangover', 'sweet'];

function extractIntent(q: string): FetchIntent {
  const s = q.toLowerCase();
  const price = s.match(/(?:under|below|max|<)\s*[₪$€]?\s*(\d+)/);
  const party = s.match(/for (two|2|three|3|four|4)/);
  const partyN = party ? ({ two: 2, three: 3, four: 4 } as Record<string, number>)[party[1]!] ?? parseInt(party[1]!, 10) : undefined;
  const cuisines = CUISINES.filter((c) => s.includes(c));
  const dietary = DIET.filter((d) => s.includes(d) || (d === 'spicy' && /hot|chili|🌶/.test(s)));
  const excluded = [...s.matchAll(/no ([a-z]+)/g)].map((m) => m[1]!);
  const words = s.replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !['something', 'under', 'with', 'that', 'some', 'food', 'want'].includes(w));
  return {
    searchTerms: [...new Set([...cuisines, ...words])].slice(0, 5),
    cuisines,
    dietary,
    excluded,
    maxPrice: price ? { amount: parseInt(price[1]!, 10) * 100, currency: 'ILS' } : undefined,
    mood: MOODS.find((m) => s.includes(m)),
    partySize: partyN,
  };
}

function fetchSearch(query: string, limit = 9): FetchResponse {
  const t0 = performance.now();
  const intent = extractIntent(query);
  const scored: FetchSuggestion[] = [];
  for (const { item, venue } of allItems()) {
    const hay = `${item.name} ${item.description ?? ''} ${venue.tags.join(' ')} ${venue.name}`.toLowerCase();
    let score = 0.15 + Math.random() * 0.1;
    for (const t of intent.searchTerms) if (hay.includes(t)) score += 0.25;
    for (const c of intent.cuisines) if (hay.includes(c)) score += 0.3;
    for (const d of intent.dietary) {
      if (hay.includes(d) || (d === 'spicy' && hay.includes('🌶')) || (d === 'vegan' && hay.includes('🌱'))) score += 0.35;
      else score -= 0.1;
    }
    if (intent.maxPrice && item.price.amount > intent.maxPrice.amount) score -= 0.8;
    if (intent.excluded.some((x) => hay.includes(x))) score -= 1;
    if (!venue.online) score -= 0.5;
    if (score > 0.3) {
      const bits = [
        intent.dietary.find((d) => hay.includes(d) || (d === 'spicy' && hay.includes('🌶')) || (d === 'vegan' && hay.includes('🌱'))),
        `₪${Math.round(item.price.amount / 100)}`,
        venue.deliveryEstimateRange ? `${venue.deliveryEstimateRange} min` : undefined,
        venue.rating ? `rated ${venue.rating.score}` : undefined,
      ].filter(Boolean);
      const lead = intent.cuisines[0] && hay.includes(intent.cuisines[0]) ? `Proper ${intent.cuisines[0]}` : intent.mood ? `Fits the ${intent.mood} mood` : 'Smells right';
      scored.push({ item, venue, score: Math.min(1, score), reason: `${lead} — ${bits.join(', ')}` });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  const suggestions = scored.filter((s) => (seen.has(s.item.id) ? false : (seen.add(s.item.id), true))).slice(0, limit);
  return { query, intent, suggestions, usedLLM: true, model: db.settings.llm.model, tookMs: Math.round(performance.now() - t0 + 1800) };
}

// ───────────────────────── cron ─────────────────────────
function describeCron(cron: string): { label: string; next: string[] } {
  const f = cron.trim().split(/\s+/);
  if (f.length !== 5) throw new HttpError(400, 'bad_cron', 'Cron needs 5 fields: minute hour day month weekday');
  const [m, h, dom, mon, dow] = f as [string, string, string, string, string];
  const parseList = (s: string, lo: number, hi: number): number[] | null => {
    if (s === '*') return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
    const out: number[] = [];
    for (const part of s.split(',')) {
      const step = part.match(/^\*\/(\d+)$/);
      if (step) {
        for (let i = lo; i <= hi; i += +step[1]!) out.push(i);
        continue;
      }
      const r = part.match(/^(\d+)(?:-(\d+))?$/);
      if (!r) return null;
      for (let i = +r[1]!; i <= +(r[2] ?? r[1]!); i++) out.push(i);
    }
    return out;
  };
  const mins = parseList(m, 0, 59);
  const hours = parseList(h, 0, 23);
  const doms = parseList(dom, 1, 31);
  const mons = parseList(mon, 1, 12);
  const dows = parseList(dow, 0, 7)?.map((d) => d % 7);
  if (!mins || !hours || !doms || !mons || !dows) throw new HttpError(400, 'bad_cron', 'I couldn’t read that cron expression.');
  const next: string[] = [];
  const d = new Date();
  d.setSeconds(0, 0);
  for (let i = 0; i < 60 * 24 * 400 && next.length < 3; i++) {
    d.setMinutes(d.getMinutes() + 1);
    if (mins.includes(d.getMinutes()) && hours.includes(d.getHours()) && doms.includes(d.getDate()) && mons.includes(d.getMonth() + 1) && dows.includes(d.getDay())) next.push(d.toISOString());
    if (!hours.includes(d.getHours())) d.setMinutes(59);
  }
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const time = mins.length === 1 && hours.length === 1 ? `${String(hours[0]).padStart(2, '0')}:${String(mins[0]).padStart(2, '0')}` : null;
  const ds = new Set(dows);
  const days =
    dow === '*' ? 'Every day' : ds.size === 5 && [1, 2, 3, 4, 5].every((x) => ds.has(x)) ? 'Weekdays' : ds.size === 2 && ds.has(0) && ds.has(6) ? 'Weekends' : [...ds].sort().map((x) => names[x]).join(', ');
  const label = time && dom === '*' && mon === '*' ? `${days} at ${time}` : `Custom: ${cron}`;
  return { label, next };
}

function qrSvg(text: string): string {
  // Not a real QR — a deterministic look-alike for the mock.
  let h = 0;
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const N = 25;
  let cells = '';
  const finder = (x: number, y: number) => (x < 7 && y < 7) || (x >= N - 7 && y < 7) || (x < 7 && y >= N - 7);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let on: boolean;
      if (finder(x, y)) {
        const fx_ = x >= N - 7 ? x - (N - 7) : x;
        const fy = y >= N - 7 ? y - (N - 7) : y;
        on = fx_ === 0 || fx_ === 6 || fy === 0 || fy === 6 || (fx_ >= 2 && fx_ <= 4 && fy >= 2 && fy <= 4);
      } else {
        h = (h * 1103515245 + 12345) >>> 0;
        on = (h >> 16) % 2 === 0;
      }
      if (on) cells += `M${x} ${y}h1v1h-1z`;
    }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 ${N + 4} ${N + 4}" shape-rendering="crispEdges"><rect x="-2" y="-2" width="${N + 4}" height="${N + 4}" fill="#fff"/><path d="${cells}" fill="#2b1a33"/></svg>`;
}

// ───────────────────────── router ─────────────────────────
type Handler = (ctx: { params: Record<string, string>; query: URLSearchParams; body: any }) => unknown | Promise<unknown>;
const routes: Array<{ method: string; re: RegExp; keys: string[]; handler: Handler }> = [];
function route(spec: string, handler: Handler) {
  const [method, path] = spec.split(' ') as [string, string];
  const keys: string[] = [];
  const re = new RegExp('^' + path.replace(/:([A-Za-z]+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
  routes.push({ method, re, keys, handler });
}

function defineRoutes() {
  route('GET /api/health', () => ({ ok: true, version: '0.1.0-mock', mockWolt: true }));
  route('GET /api/settings', () => db.settings);
  route('PATCH /api/settings', ({ body }) => {
    const p = body as SettingsPatch;
    const s = db.settings;
    const next: Settings = {
      ...s,
      ...p,
      limits: { ...s.limits, ...(p.limits ?? {}) },
      appearance: { ...s.appearance, ...(p.appearance ?? {}) },
      notifications: { ...s.notifications, ...(p.notifications ?? {}) },
      lan: { ...s.lan, ...(p.lan ?? {}) },
      llm: {
        ...s.llm,
        model: p.llm?.model ?? s.llm.model,
        ...(p.llm && 'apiKey' in p.llm
          ? p.llm.apiKey
            ? { hasApiKey: true, keySource: 'stored' as const }
            : { hasApiKey: false, keySource: 'none' as const }
          : {}),
      },
      wolt: s.wolt,
    };
    db.settings = next;
    save();
    emit({ type: 'settings.updated', settings: next });
    return next;
  });
  route('GET /api/wolt/auth', () => db.settings.wolt);
  route('POST /api/wolt/auth/token', async ({ body }) => {
    await sleep(900);
    if (!body?.refreshToken || String(body.refreshToken).length < 10) throw new HttpError(400, 'wolt_unauthorized', 'That token didn’t work. Copy the whole value of __wrtoken.');
    db.settings.wolt = { connected: true, user: { name: 'Noa Levi', email: 'noa@example.com' }, expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() };
    save();
    return db.settings.wolt;
  });
  route('DELETE /api/wolt/auth', () => {
    db.settings.wolt = { connected: false };
    save();
    return db.settings.wolt;
  });
  route('POST /api/wolt/auth/login', () => ({ sent: true }));
  route('POST /api/wolt/auth/verify', () => db.settings.wolt);
  const pairing = () => {
    const urls = [`http://192.168.1.23:${db.settings.lan.port}/?token=${db.pairingToken}`, `http://woltron.local:${db.settings.lan.port}/?token=${db.pairingToken}`];
    return { enabled: db.settings.lan.enabled, urls, token: db.pairingToken, qrSvg: qrSvg(urls[0]!) };
  };
  route('GET /api/pairing', pairing);
  route('POST /api/pairing/rotate', () => {
    db.pairingToken = 'wt_' + Math.random().toString(36).slice(2, 18);
    save();
    return pairing();
  });

  // catalog
  route('GET /api/wolt/geocode', async ({ query }) => {
    await sleep(250);
    const q = (query.get('q') ?? '').toLowerCase();
    const places: GeoLocation[] = [
      { lat: 32.0753, lon: 34.7757, address: 'Dizengoff St 50, Tel Aviv-Yafo' },
      { lat: 32.0636, lon: 34.7718, address: 'Rothschild Blvd 22, Tel Aviv-Yafo' },
      { lat: 32.0853, lon: 34.7818, address: 'Ibn Gabirol St 71, Tel Aviv-Yafo' },
      { lat: 32.0544, lon: 34.7562, address: 'Yefet St 15, Jaffa' },
      { lat: 32.0822, lon: 34.8065, address: 'Bialik St 3, Ramat Gan' },
      { lat: 32.1093, lon: 34.8555, address: 'HaBarzel St 30, Tel Aviv-Yafo' },
    ];
    const hits = places.filter((p) => p.address!.toLowerCase().includes(q.split(' ')[0] ?? ''));
    return hits.length ? hits : places.slice(0, 3).map((p) => ({ ...p, address: `${query.get('q')} — near ${p.address}` }));
  });
  route('GET /api/wolt/venues', async ({ query }) => {
    await sleep(350);
    const tag = query.get('tag');
    const venues = tag ? fx.venues.filter((v) => matchesTag(v, tag)) : fx.venues;
    return { venues, tags: fx.tags };
  });
  route('GET /api/wolt/venues/:slug', ({ params }) => {
    const v = fx.venues.find((x) => x.slug === params.slug);
    if (!v) throw notFound('Venue');
    return v;
  });
  route('GET /api/wolt/venues/:slug/menu', async ({ params }) => {
    await sleep(400);
    return menuFor(params.slug!);
  });
  route('GET /api/wolt/search', async ({ query }) => {
    await sleep(200);
    const q = (query.get('q') ?? '').toLowerCase();
    const venues = fx.venues.filter((v) => v.name.toLowerCase().includes(q) || v.tags.some((t) => t.includes(q)));
    const items = allItems().filter(({ item }) => item.name.toLowerCase().includes(q)).slice(0, 30);
    return { venues, items };
  });

  // presets
  route('GET /api/presets', () => db.presets);
  route('GET /api/presets/:id', ({ params }) => presetById(params.id!));
  route('POST /api/presets', ({ body }) => {
    const p: Preset = { ...(body as PresetInput), id: id('pre'), createdAt: now(), updatedAt: now(), runCount: 0 };
    db.presets.unshift(p);
    save();
    emit({ type: 'preset.changed', id: p.id });
    return p;
  });
  route('PUT /api/presets/:id', ({ params, body }) => {
    const p = presetById(params.id!);
    Object.assign(p, body as PresetInput, { updatedAt: now() });
    save();
    emit({ type: 'preset.changed', id: p.id });
    return p;
  });
  route('DELETE /api/presets/:id', ({ params }) => {
    db.presets = db.presets.filter((p) => p.id !== params.id);
    for (const pk of db.packs) pk.members = pk.members.filter((m) => m.presetId !== params.id);
    save();
    return { ok: true };
  });
  route('POST /api/presets/:id/duplicate', ({ params }) => {
    const src = presetById(params.id!);
    const p: Preset = { ...structuredClone(src), id: id('pre'), name: `${src.name} (copy)`, createdAt: now(), updatedAt: now(), runCount: 0, lastRunAt: undefined, favorite: false };
    db.presets.unshift(p);
    save();
    return p;
  });

  // packs
  const packById = (pid: string) => {
    const p = db.packs.find((x) => x.id === pid);
    if (!p) throw notFound('Pack');
    return p;
  };
  route('GET /api/packs', () => db.packs);
  route('GET /api/packs/:id', ({ params }) => packById(params.id!));
  route('GET /api/packs/:id/preview', ({ params }) => packPreview(packById(params.id!)));
  route('POST /api/packs', ({ body }) => {
    const p: Pack = { ...(body as PackInput), id: id('pack'), cursor: 0, history: [], createdAt: now(), updatedAt: now(), runCount: 0 };
    db.packs.unshift(p);
    save();
    return p;
  });
  route('PUT /api/packs/:id', ({ params, body }) => {
    const p = packById(params.id!);
    Object.assign(p, body as PackInput, { updatedAt: now() });
    save();
    return p;
  });
  route('DELETE /api/packs/:id', ({ params }) => {
    db.packs = db.packs.filter((p) => p.id !== params.id);
    save();
    return { ok: true };
  });

  // automations
  const autoById = (aid: string) => {
    const a = db.automations.find((x) => x.id === aid);
    if (!a) throw notFound('Automation');
    return a;
  };
  const computeNext = (a: { trigger: AutomationInput['trigger']; enabled: boolean }) => {
    if (!a.enabled) return undefined;
    if (a.trigger.type === 'schedule') {
      try {
        return describeCron(a.trigger.cron).next[0];
      } catch {
        return undefined;
      }
    }
    if (a.trigger.type === 'once') return new Date(a.trigger.at).getTime() > Date.now() ? a.trigger.at : undefined;
    return undefined;
  };
  route('GET /api/automations', () => db.automations);
  route('GET /api/automations/:id', ({ params }) => autoById(params.id!));
  route('POST /api/automations', ({ body }) => {
    const input = body as AutomationInput;
    const trigger = input.trigger.type === 'schedule' ? { ...input.trigger, humanLabel: safeLabel(input.trigger.cron) } : input.trigger;
    const a = { ...input, trigger, id: id('auto'), createdAt: now(), updatedAt: now(), fireCount: 0, nextFireAt: computeNext(input) };
    db.automations.unshift(a);
    save();
    return a;
  });
  route('PUT /api/automations/:id', ({ params, body }) => {
    const a = autoById(params.id!);
    const input = body as AutomationInput;
    const trigger = input.trigger.type === 'schedule' ? { ...input.trigger, humanLabel: safeLabel(input.trigger.cron) } : input.trigger;
    Object.assign(a, input, { trigger, updatedAt: now(), nextFireAt: computeNext(input) });
    save();
    return a;
  });
  route('DELETE /api/automations/:id', ({ params }) => {
    db.automations = db.automations.filter((p) => p.id !== params.id);
    save();
    return { ok: true };
  });
  route('POST /api/automations/:id/fire', ({ params }) => {
    const a = autoById(params.id!);
    a.fireCount++;
    a.lastFiredAt = now();
    const run = startRun({ target: a.target, source: a.trigger.type, confirm: a.confirm, automationId: a.id });
    emit({ type: 'automation.fired', automationId: a.id, runId: run.id });
    return run;
  });
  route('POST /api/automations/:id/rotate-secret', ({ params }) => {
    const a = autoById(params.id!);
    if (a.trigger.type === 'webhook') a.trigger = { type: 'webhook', secret: 'whsec_' + Math.random().toString(36).slice(2, 14) };
    save();
    return a;
  });
  route('POST /api/automations/describe-cron', ({ body }) => describeCron(String(body?.cron ?? '')));

  // runs
  route('GET /api/runs', ({ query }) => db.runs.slice(0, Number(query.get('limit') ?? 50)));
  route('GET /api/runs/:id', ({ params }) => {
    const r = db.runs.find((x) => x.id === params.id);
    if (!r) throw notFound('Run');
    return r;
  });
  route('POST /api/runs', async ({ body }) => {
    await sleep(300);
    return startRun(body as RunRequest);
  });
  route('POST /api/runs/:id/confirm', ({ params }) => {
    const r = db.runs.find((x) => x.id === params.id);
    if (!r) throw notFound('Run');
    if (r.status !== 'awaiting-confirmation') throw new HttpError(409, 'bad_state', 'This run isn’t waiting for confirmation.');
    r.log.push({ at: now(), level: 'info', message: 'You said go. Off I go!' });
    r.confirmBy = undefined;
    void place(r);
    return r;
  });
  route('POST /api/runs/:id/cancel', ({ params }) => {
    const r = db.runs.find((x) => x.id === params.id);
    if (!r) throw notFound('Run');
    updateRun(r, { status: 'cancelled', confirmBy: undefined, venueOrders: r.venueOrders.map((v) => ({ ...v, status: 'skipped' })) }, { at: now(), level: 'warn', message: 'Cancelled. Back to the basket.' });
    return r;
  });

  // fetch
  route('POST /api/fetch', async ({ body }) => {
    await sleep(1800);
    return fetchSearch(String(body?.query ?? ''), body?.limit);
  });

  route('POST /api/mock/reset', () => {
    db = seed(fx);
    save();
    return { ok: true };
  });
}

function safeLabel(cron: string) {
  try {
    return describeCron(cron).label;
  } catch {
    return undefined;
  }
}

// ───────────────────────── install ─────────────────────────
export async function installMock() {
  fx = await (await fetch(fixturesUrl)).json();
  db = load();
  defineRoutes();
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.origin);
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) return realFetch(input, init);
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const r = routes.find((x) => x.method === method && x.re.test(url.pathname));
    await sleep(80 + Math.random() * 120);
    if (!r) return json(404, { error: 'not_found', message: `No mock for ${method} ${url.pathname}` });
    const m = url.pathname.match(r.re)!;
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1]!)]));
    let body: unknown;
    try {
      body = init?.body ? JSON.parse(String(init.body)) : undefined;
    } catch {
      body = undefined;
    }
    try {
      const res = await r.handler({ params, query: url.searchParams, body });
      return json(200, structuredClone(res));
    } catch (e) {
      if (e instanceof HttpError) return json(e.status, { error: e.code, message: e.message });
      console.error('[mock]', e);
      return json(500, { error: 'internal', message: String(e) });
    }
  };
  const RealES = window.EventSource;
  window.EventSource = function (this: unknown, url: string | URL, init?: EventSourceInit) {
    const u = new URL(String(url), window.location.origin);
    if (u.pathname === '/api/events') return new FakeEventSource(u.href);
    return new RealES(url, init);
  } as unknown as typeof EventSource;
  (window as unknown as { __woltronMock: unknown }).__woltronMock = { db: () => db, emit, reset: () => ((db = seed(fx)), save()) };
  console.info('%c🐶 Woltron mock API active', 'color:#2b1a33;background:#d7f25a;padding:2px 6px;border-radius:4px');
}

function json(status: number, data: unknown) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
