/**
 * Mock WoltClient backed by fixtures captured from the live API (Tel Aviv).
 * Runs the same mappers as the live client so UI/dev data looks exactly like production.
 */
import {
  WoltError,
  type BasketLineInput,
  type BasketQuote,
  type GeoLocation,
  type Menu,
  type MenuItem,
  type Money,
  type PlacedOrder,
  type SearchResult,
  type Venue,
  type WoltClient,
  type WoltConnection,
  type WoltTokens,
} from '@woltron/shared';
import { venueFixtures, venueListing } from '../fixtures/index.js';
import { DEFAULT_LOCATION, haversineMeters, orderTrackingUrl } from './geo.js';
import { dietaryFor, estimateServiceFee, mapAssortment, mapDynamicFees, mapVenueDetails, mapVenueListPage, type Raw } from './mappers.js';
import { resolveBasket } from './ordering.js';
import type { WoltQuoteExtras } from './live-client.js';

export interface MockClientOptions {
  language?: string;
  logger?: (msg: string) => void;
  /** Simulated latency range in ms. Default [150, 600]; use [0, 0] in tests. */
  latencyMs?: [number, number];
}

const PLACES: Array<GeoLocation & { keys: string[] }> = [
  { lat: 32.0853, lon: 34.7818, address: 'Tel Aviv-Yafo, Israel', label: 'Tel Aviv', keys: ['tel aviv', 'tlv', 'תל אביב'] },
  { lat: 32.0752, lon: 34.7745, address: 'Dizengoff St 50, Tel Aviv-Yafo, Israel', keys: ['dizengoff', 'דיזנגוף'] },
  { lat: 32.0636, lon: 34.7718, address: 'Rothschild Blvd 1, Tel Aviv-Yafo, Israel', keys: ['rothschild', 'רוטשילד'] },
  { lat: 32.0790, lon: 34.7813, address: 'Ibn Gabirol St 67, Tel Aviv-Yafo, Israel', keys: ['ibn gabirol', 'אבן גבירול'] },
  { lat: 32.0719, lon: 34.7869, address: 'Sarona Market, Tel Aviv-Yafo, Israel', keys: ['sarona', 'שרונה'] },
  { lat: 32.0541, lon: 34.7520, address: 'Jaffa Port, Tel Aviv-Yafo, Israel', keys: ['jaffa', 'yafo', 'יפו'] },
  { lat: 32.0577, lon: 34.7694, address: 'Florentin St 1, Tel Aviv-Yafo, Israel', keys: ['florentin', 'פלורנטין'] },
  { lat: 32.0684, lon: 34.8248, address: 'Ramat Gan, Israel', keys: ['ramat gan', 'רמת גן'] },
  { lat: 32.1093, lon: 34.8555, address: 'Ramat HaChayal, Tel Aviv-Yafo, Israel', keys: ['ramat hachayal', 'רמת החייל'] },
];

const ORDER_STAGES = ['received', 'acknowledged', 'production', 'ready', 'fetched', 'delivered'];
const STAGE_MS = 15_000;

export class MockWoltClient implements WoltClient {
  readonly mock = true;
  private readonly language: string;
  private readonly latency: [number, number];
  private readonly log: (m: string) => void;
  private tokens: WoltTokens | null = null;
  private listeners: Array<(t: WoltTokens) => void> = [];
  private readonly orders = new Map<string, { at: number; eta: number }>();
  private listingCache?: { venues: Venue[]; tags: Array<{ id: string; name: string }> };

  constructor(opts: MockClientOptions = {}) {
    this.language = opts.language ?? 'en';
    this.latency = opts.latencyMs ?? [150, 600];
    this.log = opts.logger ?? (() => {});
  }

  private async delay(scale = 1) {
    const [a, b] = this.latency;
    const ms = (a + Math.random() * Math.max(0, b - a)) * scale;
    if (ms > 0) await new Promise((r) => setTimeout(r, ms));
  }

  private listing() {
    if (!this.listingCache) {
      const page = mapVenueListPage(venueListing, { language: this.language });
      // Venues captured while closed have no estimate; give the mock a plausible one.
      const venues = page.venues.map((v, i) => (v.deliveryEstimateRange ? v : { ...v, deliveryEstimateMin: 30 + (i % 3) * 5, deliveryEstimateRange: `${25 + (i % 3) * 5}-${35 + (i % 3) * 5}` }));
      this.listingCache = { venues, tags: page.tags };
    }
    return this.listingCache;
  }

  private listingVenue(slug: string): Venue | undefined {
    return this.listing().venues.find((v) => v.slug === slug);
  }

  /** Fixture venues all deliver in the mock; delivery estimate grows with distance. */
  private adjustForLocation(v: Venue, loc?: GeoLocation): Venue {
    if (!loc || !v.location) return v;
    const km = haversineMeters(loc, v.location) / 1000;
    if (km > 15) return { ...v, delivers: false };
    return v;
  }

  // ───────────────────────────── Catalog ─────────────────────────────

  async geocode(query: string): Promise<GeoLocation[]> {
    await this.delay(0.5);
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const hits = PLACES.filter((p) => p.keys.some((k) => q.includes(k) || k.includes(q)));
    const out = (hits.length ? hits : [{ ...DEFAULT_LOCATION, address: `${query.trim()}, Tel Aviv-Yafo, Israel`, keys: [] }]).map(({ keys: _k, ...g }) => g);
    return out.slice(0, 5);
  }

  async listVenues(loc: GeoLocation): Promise<{ venues: Venue[]; tags: Array<{ id: string; name: string }> }> {
    await this.delay();
    const { venues, tags } = this.listing();
    return { venues: venues.map((v) => this.adjustForLocation(v, loc)), tags };
  }

  async getVenue(slug: string, loc: GeoLocation = DEFAULT_LOCATION): Promise<Venue> {
    await this.delay(0.6);
    return this.venueSync(slug, loc);
  }

  private venueSync(slug: string, loc: GeoLocation = DEFAULT_LOCATION): Venue {
    const fx = venueFixtures[slug];
    const base = this.listingVenue(slug);
    if (fx) {
      const v = mapVenueDetails(fx.static, fx.dynamic, { language: this.language });
      // Listing data carries the curated mock open/closed state.
      return this.adjustForLocation({ ...v, online: base?.online ?? v.online, delivers: base?.delivers ?? v.delivers, tags: v.tags.length ? v.tags : (base?.tags ?? []) }, loc);
    }
    if (base) return this.adjustForLocation(base, loc);
    throw new WoltError('not_found', `Venue "${slug}" not found`, 404);
  }

  async getMenu(slug: string, loc: GeoLocation = DEFAULT_LOCATION): Promise<Menu> {
    await this.delay();
    return this.menuSync(slug, loc);
  }

  private menuSync(slug: string, loc?: GeoLocation): Menu {
    const venue = this.venueSync(slug, loc);
    const fx = venueFixtures[slug];
    if (fx) return mapAssortment(fx.assortment, venue);
    // No full menu captured: build one from the listing's real preview items.
    const raw = (venueListing.sections?.[0]?.items ?? []).find((i: Raw) => i.venue?.slug === slug);
    const items: MenuItem[] = (raw?.venue?.venue_preview_items ?? []).map((p: Raw) => ({
      id: p.id,
      venueId: venue.id,
      venueSlug: slug,
      categoryId: 'popular',
      name: p.name,
      image: p.image?.url || undefined,
      blurhash: p.image?.blurhash || undefined,
      price: { amount: p.price, currency: p.currency ?? venue.currency },
      available: true,
      dietary: dietaryFor([], p.name),
      options: [],
    }));
    return { venue, categories: items.length ? [{ id: 'popular', name: 'Popular', itemIds: items.map((i) => i.id) }] : [], items, fetchedAt: new Date().toISOString() };
  }

  async search(query: string, loc: GeoLocation): Promise<SearchResult> {
    await this.delay();
    const terms = query.toLowerCase().split(/[\s,]+/).filter((t) => t.length > 1);
    if (!terms.length) return { venues: [], items: [] };
    const match = (hay: string) => {
      const h = hay.toLowerCase();
      return terms.filter((t) => h.includes(t)).length;
    };
    const venues: Array<{ v: Venue; s: number }> = [];
    const items: Array<{ item: MenuItem; venue: Venue; s: number }> = [];
    for (const base of this.listing().venues) {
      const v = this.adjustForLocation(base, loc);
      const vs = match([v.name, v.shortDescription ?? '', ...v.tags].join(' '));
      if (vs) venues.push({ v, s: vs + (v.online ? 0.5 : 0) });
      const menu = this.menuSync(v.slug, loc);
      for (const it of menu.items) {
        const s = match([it.name, it.description ?? '', ...(it.dietary ?? []), ...v.tags].join(' ')) + match(it.name);
        if (s && it.available && it.price.amount > 0) items.push({ item: it, venue: menu.venue, s: s + (v.online ? 0.5 : 0) });
      }
    }
    venues.sort((a, b) => b.s - a.s);
    items.sort((a, b) => b.s - a.s);
    return { venues: venues.slice(0, 30).map((x) => x.v), items: items.slice(0, 60).map(({ item, venue }) => ({ item, venue })) };
  }

  // ───────────────────────────── Auth ─────────────────────────────

  setTokens(tokens: WoltTokens | null): void {
    this.tokens = tokens ? { ...tokens } : null;
  }

  onTokensRefreshed(cb: (tokens: WoltTokens) => void): void {
    this.listeners.push(cb);
  }

  private rotate() {
    this.tokens = {
      accessToken: `mock-access-${Math.random().toString(36).slice(2)}`,
      refreshToken: `mock-refresh-${Math.random().toString(36).slice(2)}`,
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    };
    for (const cb of this.listeners) cb({ ...this.tokens });
  }

  async connectWithRefreshToken(refreshToken: string): Promise<WoltConnection> {
    await this.delay();
    if (!refreshToken.trim() || refreshToken.trim() === 'invalid') throw new WoltError('unauthorized', 'Wolt rejected the credentials (401).', 401);
    this.rotate();
    return this.connection();
  }

  async requestMagicLink(email: string): Promise<void> {
    await this.delay();
    if (!/.+@.+\..+/.test(email)) throw new WoltError('unknown', 'Invalid email address.');
    this.log(`[wolt-mock] magic link "sent" to ${email}; paste https://wolt.com/me/magic-login?token=mock`);
  }

  async verifyMagicLink(linkOrCode: string): Promise<WoltConnection> {
    await this.delay();
    if (!linkOrCode.trim()) throw new WoltError('unauthorized', 'No token found in the link');
    this.rotate();
    return this.connection();
  }

  async connection(): Promise<WoltConnection> {
    if (!this.tokens) return { connected: false };
    return { connected: true, user: { name: 'Mock Woofer', email: 'woofer@example.com', phone: '+972500000000' }, expiresAt: this.tokens.expiresAt };
  }

  // ───────────────────────────── Ordering ─────────────────────────────

  async quoteBasket(venueSlug: string, lines: BasketLineInput[], loc: GeoLocation): Promise<BasketQuote & WoltQuoteExtras> {
    await this.delay(1.5);
    const venue = this.venueSync(venueSlug, loc);
    const fx = venueFixtures[venueSlug];
    const assortment = fx?.assortment ?? this.syntheticAssortment(venueSlug);
    const basket = resolveBasket(assortment, lines);
    const warnings = [...basket.warnings];
    if (!basket.lines.length) throw new WoltError('item_unavailable', `None of the requested items are available at ${venue.name}`);
    if (!venue.online) warnings.push(`${venue.name} is closed right now.`);
    if (!venue.delivers) warnings.push(`${venue.name} doesn't deliver to this address.`);
    const fees = fx ? mapDynamicFees(fx.dynamic) : { autoDiscountIds: [], priceRanges: [] as Array<{ min: number; max: number; a: number; b: number }>, deliveryFee: 1200 };
    const deliveryFee = fees.deliveryFee ?? 1200;
    const serviceFee = estimateServiceFee(basket.subtotal, fees, fx?.static?.venue?.service_fee_estimate ?? { min: 100, max: 590, percentage: 5 }) ?? 0;
    const m = (amount: number): Money => ({ amount: Math.round(amount), currency: venue.currency });
    const normLines = basket.lines.map((l) => l.input);
    return {
      venueSlug,
      basketId: this.tokens ? `mock-basket-${venue.id.slice(-6)}-${Date.now().toString(36)}` : undefined,
      subtotal: m(basket.subtotal),
      deliveryFee: m(deliveryFee),
      serviceFee: m(serviceFee),
      total: m(basket.subtotal + deliveryFee + serviceFee),
      etaMinutes: venue.deliveryEstimateMin ?? 30,
      checkoutUrl: this.tokens && venue.url ? `${venue.url}/checkout` : venue.url,
      warnings,
      lines: normLines,
      venueId: venue.id,
      venueName: venue.name,
      currency: venue.currency,
      quotedAt: new Date().toISOString(),
      source: 'client-estimate',
    };
  }

  async placeOrder(quote: BasketQuote, opts: { loc: GeoLocation; deliveryNote?: string; tip?: Money }): Promise<PlacedOrder> {
    if (!this.tokens) throw new WoltError('unauthorized', 'Connect your Wolt account to place orders');
    await this.delay(3);
    const venue = this.venueSync(quote.venueSlug, opts.loc);
    if (!venue.online) throw new WoltError('venue_offline', `${venue.name} is closed right now`);
    const orderId = `mock-${crypto.randomUUID()}`;
    const eta = quote.etaMinutes ?? 30;
    this.orders.set(orderId, { at: Date.now(), eta });
    this.log(`[wolt-mock] placed ${orderId} at ${venue.name} for ${quote.total.amount} ${quote.total.currency}`);
    return { orderId, status: 'received', trackingUrl: orderTrackingUrl(orderId, this.language), etaMinutes: eta };
  }

  async getOrderStatus(orderId: string): Promise<{ status: string; etaMinutes?: number; delivered: boolean }> {
    await this.delay(0.3);
    const o = this.orders.get(orderId);
    if (!o) throw new WoltError('not_found', `Order ${orderId} not found`, 404);
    const elapsed = Date.now() - o.at;
    const stage = Math.min(ORDER_STAGES.length - 1, Math.floor(elapsed / STAGE_MS));
    const status = ORDER_STAGES[stage];
    const remaining = Math.max(0, Math.round(o.eta * (1 - stage / (ORDER_STAGES.length - 1))));
    return { status, etaMinutes: status === 'delivered' ? 0 : remaining, delivered: status === 'delivered' };
  }

  /** Minimal assortment for venues that only have listing preview items. */
  private syntheticAssortment(slug: string): Raw {
    const menu = this.menuSync(slug);
    return {
      categories: menu.categories.map((c) => ({ id: c.id, name: c.name, item_ids: c.itemIds })),
      items: menu.items.map((i) => ({ id: i.id, name: i.name, price: i.price.amount, options: [] })),
      options: [],
    };
  }
}
