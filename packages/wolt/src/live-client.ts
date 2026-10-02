/**
 * Live implementation of WoltClient against Wolt's unofficial consumer APIs.
 * Endpoint provenance (verified live vs. inferred) is documented in README.md.
 */
import {
  WoltError,
  type BasketLineInput,
  type BasketQuote,
  type GeoLocation,
  type Menu,
  type Money,
  type PlacedOrder,
  type SearchResult,
  type Venue,
  type WoltClient,
  type WoltConnection,
  type WoltTokens,
} from '@woltron/shared';
import { TokenManager, parseMagicLink } from './auth.js';
import { DEFAULT_LOCATION, checkoutUrlFor, haversineMeters, orderTrackingUrl } from './geo.js';
import { HOSTS, HttpCore, HttpError, type HttpOptions, type RequestOptions } from './http.js';
import {
  estimateServiceFee,
  mapAssortment,
  mapDynamicFees,
  mapGeocodeAddress,
  mapGoogleGeocode,
  mapNominatim,
  mapSearch,
  mapVenueDetails,
  mapVenueListPage,
  type Raw,
} from './mappers.js';
import { basketPayload, parseCheckout, purchaseItems, purchasePlan, resolveBasket } from './ordering.js';

export interface LiveClientOptions extends HttpOptions {
  /**
   * Enable the (unverified) headless purchase flow in placeOrder. Off by default:
   * placeOrder then throws WoltError('unsupported') and callers fall back to handoff.
   * Also enabled by env WOLTRON_WOLT_EXPERIMENTAL_PURCHASE=1.
   */
  experimentalPurchase?: boolean;
}

/** Extra fields we attach to BasketQuote so placeOrder can rebuild the order. */
export interface WoltQuoteExtras {
  lines?: BasketLineInput[];
  venueId?: string;
  venueName?: string;
  currency?: string;
  quotedAt?: string;
  source?: 'checkout-api' | 'client-estimate';
}

const TTL = {
  listing: 60_000,
  search: 60_000,
  static: 10 * 60_000,
  dynamic: 30_000,
  assortment: 5 * 60_000,
  geocode: 60 * 60_000,
  user: 5 * 60_000,
};

const r4 = (n: number) => Math.round(n * 1e4) / 1e4;
const enc = encodeURIComponent;

export class LiveWoltClient implements WoltClient {
  readonly mock = false;
  readonly http: HttpCore;
  private readonly auth: TokenManager;
  private readonly log: (m: string) => void;
  private readonly experimentalPurchase: boolean;
  private readonly venueIndex = new Map<string, Venue>();
  private readonly quoteLines = new Map<string, BasketLineInput[]>();
  private userCache?: { at: number; conn: WoltConnection };

  constructor(opts: LiveClientOptions = {}) {
    this.http = new HttpCore(opts);
    this.auth = new TokenManager(this.http);
    this.log = opts.logger ?? (() => {});
    this.experimentalPurchase = opts.experimentalPurchase ?? process.env.WOLTRON_WOLT_EXPERIMENTAL_PURCHASE === '1';
  }

  private get lang() {
    return this.http.language;
  }

  // ───────────────────────────── Catalog ─────────────────────────────

  async geocode(query: string): Promise<GeoLocation[]> {
    const q = query.trim();
    if (!q) return [];
    try {
      const res = await this.http.json(`${HOSTS.restaurant}/v1/google/geocode/json`, { query: { address: q, language: this.lang }, cacheTtlMs: TTL.geocode });
      const out = mapGoogleGeocode(res).slice(0, 5);
      if (out.length) return out;
    } catch (e) {
      this.log(`[wolt] geocode failed, trying autocomplete: ${(e as Error).message}`);
    }
    try {
      const ac = await this.http.json(`${HOSTS.consumer}/v2/google/places/autocomplete/json`, {
        query: { input: q, language: this.lang, types: 'geocode', radius: 100000 },
        cacheTtlMs: TTL.geocode,
      });
      const preds = (Array.isArray(ac?.predictions) ? ac.predictions : []).slice(0, 5);
      const resolved = await Promise.all(
        preds.map(async (p: Raw) => {
          try {
            const r = await this.http.json(`${HOSTS.consumer}/v1/google/geocode-address`, { query: { place_id: p.place_id, language: this.lang }, cacheTtlMs: TTL.geocode });
            const g = mapGeocodeAddress(r);
            const label = [p.address?.main_text, p.address?.secondary_text].filter(Boolean).join(', ');
            return g ? { ...g, address: g.address ?? label } : undefined;
          } catch {
            return undefined;
          }
        }),
      );
      const out = resolved.filter((g): g is GeoLocation => Boolean(g));
      if (out.length) return out;
    } catch (e) {
      this.log(`[wolt] autocomplete failed, falling back to Nominatim: ${(e as Error).message}`);
    }
    const res = await this.http.json('https://nominatim.openstreetmap.org/search', {
      query: { q, format: 'jsonv2', limit: 5, 'accept-language': this.lang },
      headers: { 'user-agent': 'Woltron/0.1 (self-hosted personal Wolt companion app)' },
      cacheTtlMs: TTL.geocode,
    });
    return mapNominatim(res);
  }

  async listVenues(loc: GeoLocation): Promise<{ venues: Venue[]; tags: Array<{ id: string; name: string }> }> {
    const page = await this.http.json(`${HOSTS.restaurant}/v1/pages/restaurants`, { query: { lat: r4(loc.lat), lon: r4(loc.lon) }, cacheTtlMs: TTL.listing });
    const out = mapVenueListPage(page, { language: this.lang });
    for (const v of out.venues) this.venueIndex.set(v.id, v);
    return out;
  }

  private staticPage(slug: string): Promise<Raw> {
    return this.http.json(`${HOSTS.consumer}/order-xp/web/v1/pages/venue/slug/${enc(slug)}/static`, { cacheTtlMs: TTL.static }).catch((e) => {
      if (e instanceof WoltError && e.code === 'not_found') throw new WoltError('not_found', `Venue "${slug}" not found`, 404);
      throw e;
    });
  }

  private dynamicPage(slug: string, loc: GeoLocation): Promise<Raw> {
    return this.http.json(`${HOSTS.consumer}/order-xp/web/v1/venue/slug/${enc(slug)}/dynamic/`, { query: { lat: r4(loc.lat), lon: r4(loc.lon) }, cacheTtlMs: TTL.dynamic });
  }

  private async assortment(slug: string): Promise<Raw> {
    const base = `${HOSTS.consumer}/consumer-api/consumer-assortment/v1/venues/slug/${enc(slug)}/assortment`;
    const a = await this.http.json(base, { query: { language: this.lang }, cacheTtlMs: TTL.assortment });
    if (a?.loading_strategy && a.loading_strategy !== 'full' && !(a.items?.length > 0)) {
      // Large stores load per category (INFERRED shape). Merge the first categories.
      const cats = (a.categories ?? []).filter((c: Raw) => c?.slug).slice(0, 12);
      const parts = await Promise.all(
        cats.map((c: Raw) => this.http.json(`${base}/categories/slug/${enc(c.slug)}`, { query: { language: this.lang }, cacheTtlMs: TTL.assortment }).catch(() => null)),
      );
      a.items = [...(a.items ?? [])];
      a.options = [...(a.options ?? [])];
      for (const p of parts) {
        if (!p) continue;
        a.items.push(...(p.items ?? []));
        a.options.push(...(p.options ?? []));
        for (const pc of p.categories ?? []) {
          const target = a.categories.find((c: Raw) => c.id === pc.id);
          if (target && !(target.item_ids?.length)) target.item_ids = pc.item_ids ?? [];
        }
      }
    }
    return a;
  }

  async getVenue(slug: string, loc: GeoLocation = DEFAULT_LOCATION): Promise<Venue> {
    const [stat, dyn] = await Promise.all([this.staticPage(slug), this.dynamicPage(slug, loc).catch(() => undefined)]);
    const v = mapVenueDetails(stat, dyn, { language: this.lang, loc });
    this.venueIndex.set(v.id, v);
    return v;
  }

  async getMenu(slug: string, loc: GeoLocation = DEFAULT_LOCATION): Promise<Menu> {
    const [venue, assortment] = await Promise.all([this.getVenue(slug, loc), this.assortment(slug)]);
    return mapAssortment(assortment, venue);
  }

  async search(query: string, loc: GeoLocation): Promise<SearchResult> {
    const q = query.trim();
    if (!q) return { venues: [], items: [] };
    const call = (target: string | null) =>
      this.http.json(`${HOSTS.restaurant}/v1/pages/search`, {
        method: 'POST',
        body: { q, target, lat: r4(loc.lat), lon: r4(loc.lon) },
        cacheTtlMs: TTL.search,
        retry: true,
      });
    const [venuesPage, itemsPage] = await Promise.all([call('venues'), call('items')]);
    // Enrich item venues (online/delivery data) from the cached listing; best effort.
    await this.listVenues(loc).catch(() => undefined);
    return mapSearch([venuesPage, itemsPage], { language: this.lang }, this.venueIndex);
  }

  // ───────────────────────────── Auth ─────────────────────────────

  setTokens(tokens: WoltTokens | null): void {
    this.auth.set(tokens);
    this.userCache = undefined;
  }

  onTokensRefreshed(cb: (tokens: WoltTokens) => void): void {
    this.auth.onRefreshed(cb);
  }

  /** Authenticated JSON request; refreshes once on 401. */
  async authed<T = Raw>(url: string, opts: RequestOptions = {}): Promise<T> {
    const go = (token: string) => this.http.json<T>(url, { ...opts, headers: { ...(opts.headers ?? {}), authorization: `Bearer ${token}` } });
    try {
      return await go(await this.auth.accessToken());
    } catch (e) {
      if (e instanceof HttpError && e.status === 401 && this.auth.current?.refreshToken) {
        return go(await this.auth.accessToken(true));
      }
      throw e;
    }
  }

  async connectWithRefreshToken(refreshToken: string): Promise<WoltConnection> {
    const rt = refreshToken.trim().replace(/^"|"$/g, '');
    if (!rt) throw new WoltError('unauthorized', 'Empty refresh token');
    this.setTokens({ refreshToken: rt });
    await this.auth.refresh();
    return this.connection();
  }

  /**
   * INFERRED: `POST authentication.wolt.com/v3/users/email_login`. wolt.com sends an
   * hCaptcha response header with it, so this will usually be rejected server-side.
   */
  async requestMagicLink(email: string): Promise<void> {
    try {
      await this.http.json(`${HOSTS.auth}/v3/users/email_login`, {
        method: 'POST',
        body: { email: email.trim(), audience: 'wolt-com', attribution: 'woltron' },
        retry: false,
        allowEmpty: true,
      });
    } catch (e) {
      if (e instanceof HttpError && e.status && e.status < 500) {
        throw new WoltError('unsupported', `Wolt refused to send a login link without a captcha (${e.status}). Request the link on wolt.com, then paste it here.`, e.status);
      }
      throw e;
    }
  }

  async verifyMagicLink(linkOrCode: string): Promise<WoltConnection> {
    const token = parseMagicLink(linkOrCode);
    if (!token) throw new WoltError('unauthorized', 'No token found in the link');
    this.setTokens(null);
    await this.auth.emailLogin(token);
    return this.connection();
  }

  async connection(): Promise<WoltConnection> {
    if (!this.auth.hasSession) return { connected: false };
    if (this.userCache && Date.now() - this.userCache.at < TTL.user) {
      return { ...this.userCache.conn, expiresAt: this.auth.current?.expiresAt };
    }
    try {
      await this.auth.accessToken();
      let user: WoltConnection['user'];
      try {
        const me = await this.authed(`${HOSTS.restaurant}/v1/user/me`);
        user = mapUser(me);
      } catch (e) {
        if (e instanceof WoltError && e.code === 'unauthorized') throw e;
        this.log(`[wolt] user/me failed: ${(e as Error).message}`);
      }
      const conn: WoltConnection = { connected: true, user, expiresAt: this.auth.current?.expiresAt };
      this.userCache = { at: Date.now(), conn };
      return conn;
    } catch (e) {
      return { connected: false, lastError: (e as Error).message };
    }
  }

  // ───────────────────────────── Ordering ─────────────────────────────

  async quoteBasket(venueSlug: string, lines: BasketLineInput[], loc: GeoLocation): Promise<BasketQuote & WoltQuoteExtras> {
    const [stat, dyn, assortment] = await Promise.all([this.staticPage(venueSlug), this.dynamicPage(venueSlug, loc).catch(() => undefined), this.assortment(venueSlug)]);
    const venue = mapVenueDetails(stat, dyn, { language: this.lang, loc });
    const basket = resolveBasket(assortment, lines);
    const warnings = [...basket.warnings];
    if (!basket.lines.length) throw new WoltError('item_unavailable', `None of the requested items are available at ${venue.name}`);
    if (!venue.online) warnings.push(`${venue.name} is closed right now.`);
    if (!venue.delivers) warnings.push(`${venue.name} doesn't deliver to this address.`);
    const fees = dyn ? mapDynamicFees(dyn) : { autoDiscountIds: [], priceRanges: [] };
    if (fees.orderMinimum && basket.subtotal < fees.orderMinimum) {
      warnings.push(`Below the ${(fees.orderMinimum / 100).toFixed(2)} ${venue.currency} order minimum — a small-order fee applies.`);
    }
    const cur = venue.currency;
    const m = (amount: number): Money => ({ amount: Math.round(amount), currency: cur });
    const country = stat?.venue?.country ?? stat?.venue_raw?.country ?? '';

    let deliveryFee: number | undefined;
    let serviceFee: number | undefined;
    let total: number | undefined;
    let etaMinutes = venue.deliveryEstimateMin;
    let source: WoltQuoteExtras['source'] = 'client-estimate';
    try {
      const body = purchasePlan(basket, { venue: { id: venue.id, country, currency: cur }, loc, discountIds: fees.autoDiscountIds });
      const url = `${HOSTS.consumer}/order-xp/web/v2/pages/checkout`;
      const res = this.auth.hasSession ? await this.authed(url, { method: 'POST', body }) : await this.http.json(url, { method: 'POST', body });
      const c = parseCheckout(res);
      deliveryFee = c.deliveryFee;
      serviceFee = c.serviceFee;
      total = c.payable;
      etaMinutes = c.etaMinutes ?? etaMinutes;
      if (c.disabledReason) warnings.push(`Wolt: ${c.disabledReason}`);
      source = 'checkout-api';
    } catch (e) {
      this.log(`[wolt] checkout quote failed, using client-side estimate: ${(e as Error).message}`);
      warnings.push('Fees are estimated (Wolt price check unavailable).');
      deliveryFee = fees.deliveryFee ?? venue.deliveryPrice?.amount;
      serviceFee = estimateServiceFee(basket.subtotal, fees, stat?.venue?.service_fee_estimate);
      total = basket.subtotal + (deliveryFee ?? 0) + (serviceFee ?? 0);
    }

    let basketId: string | undefined;
    let checkoutUrl = venue.url ?? `https://wolt.com/${this.lang}/search?q=${enc(venueSlug)}`;
    if (this.auth.hasSession) {
      try {
        const saved = await this.authed<Raw>(`${HOSTS.consumer}/order-xp/v1/baskets`, { method: 'POST', body: basketPayload(basket, { id: venue.id, currency: cur }), retry: false });
        basketId = saved?.id ?? undefined;
        checkoutUrl = checkoutUrlFor(checkoutUrl);
      } catch (e) {
        this.log(`[wolt] saving basket failed: ${(e as Error).message}`);
        warnings.push('Could not sync the basket to your Wolt account; add the items on wolt.com.');
      }
    } else {
      warnings.push('Not connected to Wolt: the checkout link opens the venue page; add the items there.');
    }

    const normLines = basket.lines.map((l) => l.input);
    if (basketId) this.quoteLines.set(basketId, normLines);
    return {
      venueSlug,
      basketId,
      subtotal: m(basket.subtotal),
      deliveryFee: deliveryFee !== undefined ? m(deliveryFee) : undefined,
      serviceFee: serviceFee !== undefined ? m(serviceFee) : undefined,
      total: m(total ?? basket.subtotal),
      etaMinutes,
      checkoutUrl,
      warnings,
      lines: normLines,
      venueId: venue.id,
      venueName: venue.name,
      currency: cur,
      quotedAt: new Date().toISOString(),
      source,
    };
  }

  /**
   * Places an order headlessly. Disabled unless `experimentalPurchase` is on (the flow is
   * reconstructed from the wolt.com bundle and has NOT been run against a real account).
   * Requires: a saved delivery address in Wolt near `loc`, and a saved card.
   */
  async placeOrder(quote: BasketQuote, opts: { loc: GeoLocation; deliveryNote?: string; tip?: Money }): Promise<PlacedOrder> {
    if (!this.auth.hasSession) throw new WoltError('unauthorized', 'Connect your Wolt account to place orders');
    if (!this.experimentalPurchase) {
      throw new WoltError('unsupported', 'Headless Wolt purchase is disabled (unverified flow). Use handoff: open the checkout link and tap Pay.');
    }
    const extras = quote as BasketQuote & WoltQuoteExtras;
    const lines = extras.lines ?? (quote.basketId ? this.quoteLines.get(quote.basketId) : undefined);
    if (!lines?.length) throw new WoltError('unsupported', 'Quote is missing its basket lines; re-quote before placing');
    const loc = opts.loc;
    const slug = quote.venueSlug;
    const [stat, dyn, assortment] = await Promise.all([this.staticPage(slug), this.dynamicPage(slug, loc), this.assortment(slug)]);
    const venue = mapVenueDetails(stat, dyn, { language: this.lang, loc });
    if (!venue.online) throw new WoltError('venue_offline', `${venue.name} is closed right now`);
    if (!venue.delivers) throw new WoltError('venue_offline', `${venue.name} doesn't deliver to this address`);
    const basket = resolveBasket(assortment, lines);
    if (basket.lines.length !== lines.length) throw new WoltError('item_unavailable', basket.warnings.join(' ') || 'Some items are unavailable');

    // 1. Saved address closest to loc (restaurant-api /v2/delivery/info).
    const infos = await this.authed<Raw>(`${HOSTS.restaurant}/v2/delivery/info`);
    const addresses: Raw[] = Array.isArray(infos?.results) ? infos.results : [];
    const scored = addresses
      .map((a) => {
        const c = a?.location?.coordinates?.coordinates ?? a?.location?.coordinates;
        const [lon, lat] = Array.isArray(c) ? c : [NaN, NaN];
        return { a, d: Number.isFinite(lat) ? haversineMeters(loc, { lat, lon }) : Infinity };
      })
      .sort((x, y) => x.d - y.d);
    const addr = scored[0];
    if (!addr || addr.d > 300) throw new WoltError('unsupported', 'No saved Wolt address within 300 m of the delivery location — save it in the Wolt app first');
    const addressId: string = addr.a.id?.$oid ?? addr.a.id;

    // 2. Saved card (restaurant-api /v3/user/me/payment_methods).
    const pm = await this.authed<Raw>(`${HOSTS.restaurant}/v3/user/me/payment_methods`);
    const methods: Raw[] = Array.isArray(pm?.results) ? pm.results : Array.isArray(pm) ? pm : [];
    const card = methods.find((p) => (p.type ?? p.method?.type) === 'card' && (p.default ?? p.is_default)) ?? methods.find((p) => (p.type ?? p.method?.type) === 'card');
    const cardId: string | undefined = card?.id?.$oid ?? card?.id ?? card?.method?.id;
    if (!cardId) throw new WoltError('unsupported', 'No saved card on the Wolt account (wallets like Apple/Google Pay cannot be used headlessly)');

    // 3. Fresh checkout with the address + card → checkout id + validation.
    const fees = mapDynamicFees(dyn);
    const tip = opts.tip?.amount ?? 0;
    const plan = purchasePlan(basket, {
      venue: { id: venue.id, country: stat?.venue?.country ?? '', currency: venue.currency },
      loc,
      tip,
      discountIds: fees.autoDiscountIds,
      deliveryInfoId: addressId,
      paymentMethods: [{ id: cardId, type: 'card' }],
    });
    const c = parseCheckout(await this.authed(`${HOSTS.consumer}/order-xp/web/v2/pages/checkout`, { method: 'POST', body: plan }));
    if (c.disabledReason) throw new WoltError('venue_offline', `Wolt disabled purchasing: ${c.disabledReason}`);
    const expected = quote.total.amount + tip;
    if (c.payable > expected * 1.02 + 100) {
      throw new WoltError('unknown', `Price changed since the quote (${quote.total.amount} → ${c.payable - tip}); re-quote`);
    }

    // 4. Purchase (restaurant-api /v2/purchases). Payload mirrors the wolt.com builder.
    const v = c.validation ?? {};
    const est = venue.deliveryEstimateRange ?? '';
    const payload = {
      client_nonce: crypto.randomUUID(),
      signature_datetime: { $date: Date.now() },
      signature: 'N/A',
      type: 'purchase',
      language: this.lang,
      currency: venue.currency,
      client_pre_estimate: est,
      consumer_comment: opts.deliveryNote ?? '',
      delivery_method: 'homedelivery',
      delivery_info: { id: { $oid: addressId }, use_last_100m_address_picker: true },
      delivery_price: v.delivery_price ?? c.deliveryFee ?? 0,
      end_amount: v.end_amount ?? c.payable - tip,
      end_amount_rounding: v.end_amount_rounding ?? undefined,
      items: purchaseItems(basket, assortment, this.lang),
      pricing_model_version: 2023,
      payment_method_type: 'card',
      payment_method_id: cardId,
      tip_amount: tip ? Math.round(tip) : null,
      no_credits_or_tokens: true,
      device_channel: 'browser',
      to_type: 'venue',
      venue_id: venue.id,
      payment_links: { return_url: `https://wolt.com/${this.lang}/me/order-tracking` },
      bag_fee: v.bag_fee ?? undefined,
      credits_amount: v.credits_amount ?? undefined,
      discounts: v.discounts ?? [],
      offers: v.offers ?? [],
      surcharges: v.surcharges ?? [],
      use_token: v.use_token ?? false,
      menu_items_source: 'consumer-assortment',
      checkout_id: c.checkoutId,
      use_self_service_cancellation: true,
    };
    const res = await this.authed<Raw>(`${HOSTS.restaurant}/v2/purchases`, { method: 'POST', body: payload, retry: false });
    const r = res?.results ?? res;
    const orderId: string | undefined = r?.id?.$oid ?? r?.id ?? r?.purchase_id;
    if (!orderId) throw new WoltError('unknown', 'Wolt accepted the purchase request but returned no order id');
    const needsAction = Boolean(r?.payment_plan);
    return {
      orderId,
      status: needsAction ? 'payment_action_required' : String(r?.status ?? 'received'),
      trackingUrl: orderTrackingUrl(orderId, this.lang),
      etaMinutes: c.etaMinutes,
    };
  }

  /** INFERRED: restaurant-api `/v2/order_details/purchase_tracking/{id}`. */
  async getOrderStatus(orderId: string): Promise<{ status: string; etaMinutes?: number; delivered: boolean }> {
    const res = await this.authed<Raw>(`${HOSTS.restaurant}/v2/order_details/purchase_tracking/${enc(orderId)}`);
    const d = res?.order_details ?? res?.results?.[0] ?? res ?? {};
    const status = String(d.status ?? d.purchase_status ?? 'unknown');
    const eta = Number(d.delivery_eta?.$date ?? d.delivery_eta);
    return {
      status,
      etaMinutes: Number.isFinite(eta) && eta > 0 ? Math.max(0, Math.round((eta - Date.now()) / 60_000)) : undefined,
      delivered: status === 'delivered',
    };
  }
}

export function mapUser(me: Raw): WoltConnection['user'] {
  const u = me?.user ?? me?.results?.[0] ?? me ?? {};
  const first = u.name?.first_name ?? u.first_name;
  const last = u.name?.last_name ?? u.last_name;
  const name = [first, last].filter((x) => typeof x === 'string' && x).join(' ') || (typeof u.name === 'string' ? u.name : undefined);
  const email = typeof u.email === 'string' ? u.email : undefined;
  const phone = typeof u.phone_number === 'string' ? u.phone_number : undefined;
  return name || email || phone ? { name, email, phone } : undefined;
}
