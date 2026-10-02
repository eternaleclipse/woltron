/**
 * Stand-in WoltClient used when `@woltron/wolt` can't be loaded (or as a last resort in
 * mock mode). Data in `fixtures.json` was captured from the live Wolt API around Tel Aviv
 * (venue list + English assortments), so ids and image URLs are real.
 *
 * Behaviour:
 *  - catalog: served from fixtures; search = token match over item/venue text.
 *  - auth: any refresh token "connects" a demo user.
 *  - quoteBasket: works without auth (computed from fixture prices).
 *  - placeOrder: requires a connection, otherwise throws WoltError('unauthorized')
 *    so the engine's handoff fallback can be exercised.
 */
import type {
  BasketLineInput,
  BasketQuote,
  GeoLocation,
  Menu,
  MenuItem,
  MenuCategory,
  PlacedOrder,
  SearchResult,
  Venue,
  WoltClient,
  WoltConnection,
  WoltTokens,
} from '@woltron/shared';
import { WoltError } from '@woltron/shared';
import fixtures from './fixtures.json' with { type: 'json' };

interface Fixtures {
  venues: Venue[];
  menus: Record<string, { categories: MenuCategory[]; items: MenuItem[] }>;
}
const data = fixtures as unknown as Fixtures;

const PLACES: GeoLocation[] = [
  { lat: 32.0853, lon: 34.7818, address: 'Tel Aviv-Yafo, Israel', label: 'Tel Aviv' },
  { lat: 32.0809, lon: 34.7806, address: 'Dizengoff Square, Tel Aviv', label: 'Dizengoff Square' },
  { lat: 32.0641, lon: 34.7718, address: 'Rothschild Blvd 1, Tel Aviv', label: 'Rothschild' },
  { lat: 32.0545, lon: 34.7561, address: 'Jaffa Clock Tower, Tel Aviv-Yafo', label: 'Jaffa' },
  { lat: 32.0684, lon: 34.8248, address: 'Ramat Gan, Israel', label: 'Ramat Gan' },
  { lat: 32.0719, lon: 34.7925, address: 'Sarona Market, Tel Aviv', label: 'Sarona' },
];

const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createFallbackMockClient(opts: { latencyMs?: number } = {}): WoltClient {
  const latency = opts.latencyMs ?? 60;
  let tokens: WoltTokens | null = null;
  const refreshCbs: Array<(t: WoltTokens) => void> = [];
  let orderSeq = 1000;

  const venueBySlug = (slug: string): Venue => {
    const v = data.venues.find((x) => x.slug === slug);
    if (!v) throw new WoltError('not_found', `Venue "${slug}" not found`, 404);
    return structuredClone(v);
  };
  const conn = (): WoltConnection =>
    tokens
      ? { connected: true, user: { name: 'Demo Doggo', email: 'demo@woltron.local' }, expiresAt: tokens.expiresAt }
      : { connected: false };

  const client: WoltClient = {
    mock: true,

    async geocode(query) {
      await sleep(latency);
      const q = query.toLowerCase().trim();
      const hits = PLACES.filter((p) => `${p.label} ${p.address}`.toLowerCase().includes(q));
      return hits.length ? hits : [{ ...PLACES[0]!, address: `${query} (approx.), Tel Aviv` }];
    },

    async listVenues() {
      await sleep(latency);
      const venues = structuredClone(data.venues);
      const tagSet = new Map<string, string>();
      for (const v of venues) for (const t of v.tags) tagSet.set(t, t.replace(/\b\w/g, (c) => c.toUpperCase()));
      return { venues, tags: [...tagSet].map(([id, name]) => ({ id, name })) };
    },

    async getVenue(slug) {
      await sleep(latency);
      return venueBySlug(slug);
    },

    async getMenu(slug): Promise<Menu> {
      await sleep(latency);
      const venue = venueBySlug(slug);
      const m = data.menus[slug];
      if (!m) throw new WoltError('not_found', `Menu for "${slug}" not found`, 404);
      return { venue, categories: structuredClone(m.categories), items: structuredClone(m.items), fetchedAt: new Date().toISOString() };
    },

    async search(query): Promise<SearchResult> {
      await sleep(latency);
      const q = words(query);
      if (q.length === 0) return { venues: [], items: [] };
      const score = (text: string) => {
        const w = new Set(words(text));
        let s = 0;
        for (const t of q) if (w.has(t) || [...w].some((x) => x.startsWith(t) || (t.length > 3 && x.includes(t)))) s++;
        return s;
      };
      const venues = data.venues.filter((v) => score(`${v.name} ${v.shortDescription ?? ''} ${v.tags.join(' ')}`) > 0);
      const items: SearchResult['items'] = [];
      for (const v of data.venues) {
        const vText = `${v.tags.join(' ')} ${v.shortDescription ?? ''}`;
        for (const it of data.menus[v.slug]?.items ?? []) {
          const s = score(`${it.name} ${it.description ?? ''} ${(it.dietary ?? []).join(' ')}`) * 2 + score(vText);
          if (s > 0) items.push({ item: structuredClone(it), venue: structuredClone(v), _s: s } as never);
        }
      }
      items.sort((a, b) => (b as unknown as { _s: number })._s - (a as unknown as { _s: number })._s);
      for (const i of items) delete (i as unknown as { _s?: number })._s;
      return { venues: structuredClone(venues), items: items.slice(0, 40) };
    },

    setTokens(t) {
      tokens = t;
    },
    onTokensRefreshed(cb) {
      refreshCbs.push(cb);
    },
    async connectWithRefreshToken(refreshToken) {
      await sleep(latency);
      if (!refreshToken || refreshToken.length < 8) throw new WoltError('unauthorized', 'That refresh token looks too short', 401);
      tokens = { refreshToken, accessToken: `mock-${Date.now()}`, expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() };
      for (const cb of refreshCbs) cb(tokens);
      return conn();
    },
    async requestMagicLink() {
      await sleep(latency);
    },
    async verifyMagicLink(linkOrCode) {
      return client.connectWithRefreshToken(`magic-${linkOrCode}`);
    },
    async connection() {
      return conn();
    },

    async quoteBasket(venueSlug, lines: BasketLineInput[]): Promise<BasketQuote> {
      await sleep(latency);
      const venue = venueBySlug(venueSlug);
      const menu = data.menus[venueSlug]!;
      const warnings: string[] = [];
      let subtotal = 0;
      for (const l of lines) {
        const it = menu.items.find((i) => i.id === l.itemId);
        if (!it) {
          warnings.push(`Item ${l.itemId} is not on the menu`);
          continue;
        }
        let unit = it.price.amount;
        for (const o of l.options) {
          const g = it.options.find((x) => x.id === o.groupId);
          for (const vid of o.valueIds) unit += g?.values.find((v) => v.id === vid)?.price.amount ?? 0;
        }
        subtotal += unit * l.quantity;
      }
      const cur = venue.currency;
      const deliveryFee = venue.deliveryPrice ?? { amount: 900, currency: cur };
      const serviceFee = { amount: Math.min(1000, Math.round(subtotal * 0.05)), currency: cur };
      return {
        venueSlug,
        basketId: `mock-basket-${venueSlug}-${Date.now()}`,
        subtotal: { amount: subtotal, currency: cur },
        deliveryFee,
        serviceFee,
        total: { amount: subtotal + deliveryFee.amount + serviceFee.amount, currency: cur },
        etaMinutes: venue.deliveryEstimateMin,
        checkoutUrl: venue.url ?? `https://wolt.com/en/isr/tel-aviv/restaurant/${venueSlug}`,
        warnings,
      };
    },

    async placeOrder(quote): Promise<PlacedOrder> {
      await sleep(latency);
      if (!tokens) throw new WoltError('unauthorized', 'Connect your Wolt account to place live orders', 401);
      const orderId = `mock-order-${++orderSeq}`;
      return { orderId, status: 'received', trackingUrl: `https://wolt.com/en/me/order-history`, etaMinutes: quote.etaMinutes };
    },

    async getOrderStatus() {
      return { status: 'delivered', delivered: true };
    },
  };
  return client;
}
