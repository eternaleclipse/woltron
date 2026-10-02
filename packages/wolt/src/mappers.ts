/**
 * Pure mappers from raw (unofficial) Wolt JSON to the shared Woltron domain types.
 * All functions are defensive: Wolt payloads change often and fields go missing.
 * Money is always integer minor units (Wolt already uses minor units).
 */
import type { GeoLocation, Menu, MenuCategory, MenuItem, MenuOptionGroup, MenuOptionValue, Money, SearchResult, Venue } from '@woltron/shared';
import { parseShareUrl, pointInGeoJson, venueUrl } from './geo.js';

// Raw Wolt payloads are deliberately typed loosely.
export type Raw = any;

export interface MapContext {
  language: string;
  /** Wolt city slug from the page response (e.g. "tel-aviv"), used for URLs. */
  city?: string;
}

const money = (amount: unknown, currency: string): Money => ({ amount: Math.round(Number(amount) || 0), currency });
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
};
const arr = <T = Raw>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Wolt sometimes returns translated strings as [{lang, value}] — pick the best. */
export function text(v: unknown, language = 'en'): string | undefined {
  if (typeof v === 'string') return str(v);
  if (Array.isArray(v)) {
    const hit = v.find((x) => x?.lang === language) ?? v[0];
    return str(hit?.value);
  }
  if (v && typeof v === 'object' && 'value' in (v as Raw)) return str((v as Raw).value);
  return undefined;
}

/** Drop internal/marketing tags such as "Isr_champion_burger", "recovery_2", "Wolt Benefits". */
export function cleanTags(tags: unknown): string[] {
  const out: string[] = [];
  for (const t of arr<string>(tags)) {
    if (typeof t !== 'string') continue;
    const s = t.trim();
    if (!/^[a-z][a-z &'’-]*$/.test(s)) continue;
    if (!out.includes(s)) out.push(s);
  }
  return out;
}

function rangeParts(range: unknown): { min?: number; max?: number } {
  if (typeof range !== 'string') return {};
  const m = range.match(/(\d+)\s*[-–]\s*(\d+)/);
  return m ? { min: Number(m[1]), max: Number(m[2]) } : {};
}

// ───────────────────────────── Venues ─────────────────────────────

/** A venue entry from `v1/pages/restaurants` or `v1/pages/search` (section item with `.venue`). */
export function mapListingVenue(item: Raw, ctx: MapContext): Venue | undefined {
  const v = item?.venue;
  if (!v?.id || !v?.slug) return undefined;
  const currency = str(v.currency) ?? 'EUR';
  const loc = arr<number>(v.location);
  const rating = v.rating && num(v.rating.score) !== undefined ? { score: num(v.rating.score)!, volume: num(v.rating.volume) } : undefined;
  const estimateRange = str(v.estimate_range) ?? str(v.estimate_box?.title);
  return {
    id: v.id,
    slug: v.slug,
    name: str(v.name) ?? str(item.title) ?? v.slug,
    shortDescription: text(v.short_description_v2, ctx.language) ?? str(v.short_description),
    image: str(item.image?.url),
    blurhash: str(item.image?.blurhash) ?? str(item.link?.venue_mainimage_blurhash),
    logo: str(v.brand_image?.url),
    address: str(v.address),
    location: loc.length >= 2 ? { lat: loc[1], lon: loc[0] } : undefined,
    rating,
    priceRange: num(v.price_range),
    deliveryEstimateMin: num(v.estimate) ?? rangeParts(estimateRange).min,
    deliveryEstimateRange: estimateRange,
    deliveryPrice: num(v.delivery_price_int) !== undefined ? money(v.delivery_price_int, currency) : undefined,
    online: v.online === true,
    delivers: v.delivers === true,
    tags: cleanTags(v.tags),
    currency,
    url: venueUrl({ language: ctx.language, country: v.country, city: ctx.city, slug: v.slug, productLine: v.product_line }),
  };
}

/** Tag filters (cuisines) from the listing page's `filtering.filters[id=primary]`. */
export function mapListingTags(page: Raw): Array<{ id: string; name: string }> {
  const primary = arr(page?.filtering?.filters).find((f: Raw) => f?.id === 'primary');
  return arr(primary?.values)
    .filter((v: Raw) => str(v?.id) && str(v?.name))
    .map((v: Raw) => ({ id: v.id, name: v.name }));
}

export function mapVenueListPage(page: Raw, ctx: Omit<MapContext, 'city'>): { venues: Venue[]; tags: Array<{ id: string; name: string }> } {
  const city = str(page?.city) ?? str(page?.city_data?.slug);
  const seen = new Set<string>();
  const venues: Venue[] = [];
  for (const section of arr(page?.sections)) {
    for (const item of arr(section?.items)) {
      if (!item?.venue) continue;
      const v = mapListingVenue(item, { ...ctx, city });
      if (v && !seen.has(v.id)) {
        seen.add(v.id);
        venues.push(v);
      }
    }
  }
  return { venues, tags: mapListingTags(page) };
}

export interface FeeInfo {
  /** Delivery fee the user pays right now (after unconditional campaigns). */
  deliveryFee?: number;
  /** Fee before campaigns. */
  originalDeliveryFee?: number;
  /** Discount ids that apply unconditionally (pass as use_promo_discount_ids). */
  autoDiscountIds: string[];
  orderMinimum?: number;
  /** Service-fee / small-order price ranges ({min,max,a,b}: fee = a + b*subtotal). */
  priceRanges: Array<{ min: number; max: number; a: number; b: number }>;
}

function isUnconditional(conditions: Raw, deliveryMethod = 'homedelivery'): boolean {
  if (!conditions || typeof conditions !== 'object') return true;
  for (const [k, val] of Object.entries(conditions)) {
    if (val === null || val === undefined) continue;
    if (Array.isArray(val) && val.length === 0) continue;
    if (k === 'delivery_methods' && Array.isArray(val) && val.includes(deliveryMethod)) continue;
    return false;
  }
  return true;
}

/** Fee details from the `order-xp/web/v1/venue/slug/{slug}/dynamic` response. */
export function mapDynamicFees(dyn: Raw): FeeInfo {
  const raw = dyn?.venue_raw ?? {};
  const specs = raw.delivery_specs ?? {};
  const original = num(specs.original_delivery_price);
  let fee = original;
  const autoDiscountIds: string[] = [];
  for (const d of arr(raw.discounts)) {
    const eff = d?.effects?.delivery_discount;
    if (!eff || d.optional || d.tap_to_apply || !isUnconditional(d.conditions)) continue;
    if (fee !== undefined) {
      let cut = (num(eff.amount) ?? 0) + Math.round(fee * (num(eff.fraction) ?? 0));
      if (num(eff.max_amount)) cut = Math.min(cut, eff.max_amount);
      fee = Math.max(0, fee - cut);
    }
    if (str(d.id)) autoDiscountIds.push(d.id);
  }
  const priceRanges = arr(specs.delivery_pricing?.price_ranges)
    .map((r: Raw) => ({ min: num(r.min) ?? 0, max: num(r.max) ?? 0, a: num(r.a) ?? 0, b: num(r.b) ?? 0 }));
  return { deliveryFee: fee, originalDeliveryFee: original, autoDiscountIds, orderMinimum: num(dyn?.order_minimum) ?? num(specs.order_minimum_no_surcharge), priceRanges };
}

/** Service fee (+ small order surcharge) estimate from Wolt's price_ranges. */
export function estimateServiceFee(subtotal: number, fees: FeeInfo, fallback?: { min?: number; max?: number; percentage?: number }): number | undefined {
  const r = fees.priceRanges.find((p) => subtotal >= p.min && (p.max === 0 || subtotal < p.max));
  if (r) return Math.max(0, Math.round(r.a + r.b * subtotal));
  if (fallback?.percentage !== undefined) {
    const pct = Math.round((subtotal * fallback.percentage) / 100);
    return Math.min(fallback.max ?? pct, Math.max(fallback.min ?? 0, pct));
  }
  return undefined;
}

export function openState(dyn: Raw): { online: boolean; opensAt?: string; closesAt?: string } {
  const v = dyn?.venue ?? {};
  const status = v.delivery_open_status ?? v.open_status;
  const open = status?.is_open;
  return {
    online: v.online === true && open !== false && dyn?.venue_raw?.alive !== false,
    opensAt: str(status?.next_open),
    closesAt: str(status?.next_close),
  };
}

/**
 * Full venue from the static page (`order-xp/web/v1/pages/venue/slug/{slug}/static`) plus the
 * location-dependent dynamic page (`.../venue/slug/{slug}/dynamic/?lat&lon`).
 */
export function mapVenueDetails(stat: Raw, dyn: Raw | undefined, ctx: MapContext & { loc?: GeoLocation }): Venue {
  const sv = stat?.venue ?? {};
  const sr = stat?.venue_raw ?? {};
  const currency = str(sv.currency) ?? str(sr.currency) ?? 'EUR';
  const coords = arr<number>(sr.location?.coordinates);
  const share = parseShareUrl(str(sv.share_url) ?? str(sr.share_url));
  const fees = dyn ? mapDynamicFees(dyn) : undefined;
  const homeCfg = arr(dyn?.venue?.delivery_configs).find((c: Raw) => c?.method === 'homedelivery' && c?.schedule === 'standard')
    ?? arr(dyn?.venue?.delivery_configs).find((c: Raw) => c?.method === 'homedelivery');
  const est = homeCfg?.estimate ?? dyn?.venue_raw?.preestimate_total;
  const ratingScore = num(sv.rating?.score_raw) ?? num(sv.rating?.score) ?? num(sr.rating?.score);
  const geo = dyn?.venue_raw?.delivery_specs?.geo_range ?? sv.delivery_geo_range;
  const inRange = ctx.loc ? pointInGeoJson(geo, ctx.loc.lat, ctx.loc.lon) : undefined;
  const deliveryEnabled = dyn?.venue_raw?.delivery_specs?.delivery_enabled ?? arr(sv.delivery_methods).includes('homedelivery');
  const fallbackFee = num(sv.zero_distance_fees?.delivery_price) ?? num(sv.delivery_base_price);
  const deliveryFee = fees?.deliveryFee ?? fallbackFee;
  const slug = str(sv.slug) ?? share.slug ?? '';
  return {
    id: str(sv.id) ?? str(sr.id) ?? '',
    slug,
    name: str(sv.name) ?? text(sr.name, ctx.language) ?? slug,
    shortDescription: text(sr.short_description, ctx.language) ?? str(sv.description),
    image: str(sv.image_url) ?? str(sr.image_url),
    logo: str(sv.brand_logo_image_url) ?? str(sr.brand_logo_image_url),
    blurhash: str(sv.image_blurhash) ?? str(sr.image_blurhash),
    address: str(sv.address),
    location: coords.length >= 2 ? { lat: coords[1], lon: coords[0] } : undefined,
    rating: ratingScore !== undefined ? { score: ratingScore, volume: num(sv.rating?.volume) ?? num(sr.rating?.volume) } : undefined,
    priceRange: num(sr.price_range),
    deliveryEstimateMin: num(est?.mean) ?? num(est?.min),
    deliveryEstimateRange: num(est?.min) !== undefined && num(est?.max) !== undefined ? `${est.min}-${est.max}` : undefined,
    deliveryPrice: deliveryFee !== undefined ? money(deliveryFee, currency) : undefined,
    online: dyn ? openState(dyn).online : false,
    delivers: Boolean(deliveryEnabled) && inRange !== false,
    tags: cleanTags(sr.food_tags),
    currency,
    url: venueUrl({ language: ctx.language, country: share.country ?? sv.country, city: share.city ?? ctx.city, slug, productLine: sv.product_line }),
  };
}

// ───────────────────────────── Menu ─────────────────────────────

const DIETARY_RULES: Array<[string, RegExp]> = [
  ['vegan', /\bvegan\b|🌱|טבעוני/i],
  ['vegetarian', /\bvegetarian\b|\bveggie\b|צמחוני/i],
  ['gluten-free', /gluten[\s-]?free|ללא גלוטן/i],
  ['spicy', /\bspicy\b|\bhot chil|🌶|חריף/i],
  ['dairy-free', /dairy[\s-]?free|lactose[\s-]?free|ללא לקטוז/i],
];

/** Normalize Wolt dietary_preferences (e.g. "VEGAN", "gluten_free") and infer from text. */
export function dietaryFor(prefs: unknown, ...texts: Array<string | undefined>): string[] | undefined {
  const out = new Set<string>();
  for (const p of arr(prefs)) {
    const id = typeof p === 'string' ? p : (p?.id ?? p?.name ?? p?.type);
    if (typeof id === 'string' && id) out.add(id.toLowerCase().replace(/[_\s]+/g, '-'));
  }
  const hay = texts.filter(Boolean).join(' \n ');
  for (const [tag, re] of DIETARY_RULES) if (re.test(hay)) out.add(tag);
  if (out.has('vegan')) out.add('vegetarian');
  return out.size ? [...out] : undefined;
}

function defaultValueIds(def: Raw): Set<string> {
  const d = def?.default_value ?? def?.default_values;
  if (typeof d === 'string') return new Set([d]);
  return new Set(arr<string>(d).filter((x) => typeof x === 'string'));
}

export function mapOptionGroup(binding: Raw, def: Raw | undefined, currency: string): MenuOptionGroup | undefined {
  if (!binding?.id) return undefined;
  const range = binding.multi_choice_config?.total_range ?? def?.multi_choice_config?.total_range ?? {};
  const defaults = defaultValueIds(def);
  const values: MenuOptionValue[] = arr(def?.values)
    .filter((v: Raw) => v?.id)
    .map((v: Raw) => ({ id: v.id, name: str(v.name) ?? '', price: money(v.price, currency), ...(defaults.has(v.id) ? { isDefault: true } : {}) }));
  const conditional = arr(binding.prerequisite_values).length > 0;
  const type = String(def?.type ?? '');
  const max = num(range.max) ?? (type === 'choice' || type === 'single_choice' ? 1 : 0);
  return {
    id: binding.id,
    name: str(binding.name) ?? str(def?.name) ?? '',
    // Groups that only apply when another value is picked can't be expressed in our model:
    // treat them as optional so presets never become unsatisfiable.
    min: conditional ? 0 : (num(range.min) ?? 0),
    max,
    values,
  };
}

export function mapAssortmentItem(it: Raw, defs: Map<string, Raw>, venue: Pick<Venue, 'id' | 'slug' | 'currency'>, categoryId?: string): MenuItem {
  const currency = venue.currency;
  const name = str(it.name) ?? '';
  const description = str(it.description);
  const img = arr(it.images).find((i: Raw) => str(i?.url));
  return {
    id: it.id,
    venueId: venue.id,
    venueSlug: venue.slug,
    categoryId,
    name,
    description,
    image: str(img?.url),
    blurhash: str(img?.blurhash),
    price: money(it.price, currency),
    available: !it.disabled_info && it.is_wolt_plus_only !== true && Number.isFinite(Number(it.price)),
    dietary: dietaryFor(it.dietary_preferences, name, description),
    options: arr(it.options)
      .map((b: Raw) => mapOptionGroup(b, defs.get(b?.option_id), currency))
      .filter((g): g is MenuOptionGroup => Boolean(g)),
  };
}

/** Map `consumer-assortment/v1/venues/slug/{slug}/assortment` to a Menu. */
export function mapAssortment(assortment: Raw, venue: Venue, fetchedAt = new Date().toISOString()): Menu {
  const defs = new Map<string, Raw>();
  for (const o of arr(assortment?.options)) if (o?.id) defs.set(o.id, o);
  const rawItems = arr(assortment?.items).filter((i: Raw) => i?.id);
  const itemIds = new Set(rawItems.map((i: Raw) => i.id as string));

  const categories: MenuCategory[] = [];
  const catOfItem = new Map<string, string>();
  const walk = (cats: Raw[], prefix?: string) => {
    for (const c of cats) {
      if (!c?.id) continue;
      const ids = arr<string>(c.item_ids).filter((id) => itemIds.has(id));
      const name = str(c.name) ?? '';
      if (ids.length) {
        categories.push({ id: c.id, name: prefix && name ? `${prefix} · ${name}` : name, description: str(c.description), itemIds: ids });
        for (const id of ids) if (!catOfItem.has(id)) catOfItem.set(id, c.id);
      }
      walk(arr(c.subcategories), name || prefix);
    }
  };
  walk(arr(assortment?.categories));

  const items = rawItems.map((it: Raw) => mapAssortmentItem(it, defs, venue, catOfItem.get(it.id)));
  // Items not in any category still get listed.
  const orphans = items.filter((i) => !i.categoryId).map((i) => i.id);
  if (orphans.length) categories.push({ id: 'uncategorized', name: 'More', itemIds: orphans });
  return { venue, categories, items, fetchedAt };
}

// ───────────────────────────── Search ─────────────────────────────

/** A menu-item search hit (`sections[name=items].items[]`). */
export function mapSearchItem(hit: Raw, ctx: MapContext): { item: MenuItem; venue: Venue } | undefined {
  const mi = hit?.menu_item;
  const det = hit?.link?.menu_item_details ?? {};
  if (!mi?.id) return undefined;
  const currency = str(mi.currency) ?? str(det.currency) ?? 'EUR';
  const venueId = str(mi.venue_id) ?? str(det.venue_id) ?? '';
  const venueSlug = str(det.venue_slug) ?? '';
  const name = str(mi.name) ?? str(det.name) ?? '';
  const description = str(det.description) ?? str(mi.description);
  const range = str(mi.estimate_range) ?? str(det.estimate_range);
  const rating = det.venue_rating ?? mi.venue_rating;
  const venue: Venue = {
    id: venueId,
    slug: venueSlug,
    name: str(mi.venue_name) ?? str(det.venue_name) ?? venueSlug,
    image: str(det.venue_image?.url),
    blurhash: str(det.venue_image?.blurhash),
    rating: num(rating?.score) !== undefined ? { score: num(rating.score)!, volume: num(rating.volume) } : undefined,
    deliveryEstimateRange: range,
    deliveryEstimateMin: rangeParts(range).min,
    online: mi.is_available !== false,
    delivers: true,
    tags: [],
    currency,
    url: venueSlug ? venueUrl({ language: ctx.language, country: str(det.country) ?? str(mi.country), city: str(det.city_slug) ?? ctx.city, slug: venueSlug, productLine: str(det.product_line) }) : undefined,
  };
  const item: MenuItem = {
    id: mi.id,
    venueId,
    venueSlug,
    name,
    description,
    image: str(mi.image?.url) ?? str(det.image?.url),
    blurhash: str(mi.image?.blurhash),
    price: money(mi.price ?? det.price, currency),
    available: mi.is_available !== false,
    dietary: dietaryFor(mi.dietary_preferences, name, description),
    options: [],
  };
  return { item, venue };
}

/**
 * Map `v1/pages/search` responses. Pass the `target:"venues"` and `target:"items"` pages
 * (or a single combined page). `known` enriches item venues with full listing data.
 */
export function mapSearch(pages: Raw[], ctx: Omit<MapContext, 'city'>, known?: Map<string, Venue>): SearchResult {
  const venues: Venue[] = [];
  const items: SearchResult['items'] = [];
  const seenV = new Set<string>();
  const seenI = new Set<string>();
  for (const page of pages) {
    const city = str(page?.city);
    for (const section of arr(page?.sections)) {
      for (const hit of arr(section?.items)) {
        if (hit?.venue) {
          const v = mapListingVenue(hit, { ...ctx, city });
          if (v && !seenV.has(v.id)) {
            seenV.add(v.id);
            venues.push(known?.get(v.id) ? { ...v, ...pickDefined(known.get(v.id)!) } : v);
          }
        } else if (hit?.menu_item) {
          const m = mapSearchItem(hit, { ...ctx, city });
          // Zero-price hits are menu notices ("Dear customers…"), not orderable dishes.
          if (!m || seenI.has(m.item.id) || m.item.price.amount <= 0) continue;
          seenI.add(m.item.id);
          const full = known?.get(m.venue.id) ?? venues.find((v) => v.id === m.venue.id);
          // Item hits carry no venue open-state. If we have the delivering listing and this venue
          // isn't in it, it doesn't deliver here right now — don't let item availability claim it's open.
          const venue = full ?? (known?.size ? { ...m.venue, online: false, delivers: false } : m.venue);
          items.push({ item: m.item, venue });
        }
      }
    }
  }
  return { venues, items };
}

function pickDefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

// ───────────────────────────── Geocoding ─────────────────────────────

/** `restaurant-api.wolt.com/v1/google/geocode/json` (Google Geocoding API shape). */
export function mapGoogleGeocode(res: Raw): GeoLocation[] {
  return arr(res?.results)
    .filter((r: Raw) => num(r?.geometry?.location?.lat) !== undefined)
    .map((r: Raw) => ({ lat: r.geometry.location.lat, lon: r.geometry.location.lng, address: str(r.formatted_address) }));
}

/** `consumer-api.wolt.com/v1/google/geocode-address?place_id=` */
export function mapGeocodeAddress(res: Raw, label?: string): GeoLocation | undefined {
  const r = res?.result;
  if (num(r?.coordinates?.lat) === undefined) return undefined;
  return { lat: r.coordinates.lat, lon: r.coordinates.lng, address: str(r.formatted_address), ...(label ? { label } : {}) };
}

/** OSM Nominatim `/search?format=jsonv2` fallback. */
export function mapNominatim(res: Raw): GeoLocation[] {
  return arr(res)
    .filter((r: Raw) => num(r?.lat) !== undefined && num(r?.lon) !== undefined)
    .map((r: Raw) => ({ lat: Number(r.lat), lon: Number(r.lon), address: str(r.display_name) }));
}
