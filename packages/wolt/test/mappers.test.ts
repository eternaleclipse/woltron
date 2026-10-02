import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { venueFixtures, venueListing } from '../fixtures/index.js';
import { pointInGeoJson, venueUrl, parseShareUrl } from '../src/geo.js';
import {
  cleanTags,
  dietaryFor,
  estimateServiceFee,
  mapAssortment,
  mapDynamicFees,
  mapGoogleGeocode,
  mapNominatim,
  mapSearch,
  mapVenueDetails,
  mapVenueListPage,
  openState,
  text,
} from '../src/mappers.js';
import { basketPayload, checkoutMenuItems, parseCheckout, purchaseItems, resolveBasket } from '../src/ordering.js';

const sample = (name: string) => JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', 'samples', name), 'utf8'));
const WOLT_CDN = /^https:\/\/[a-z0-9.-]+\.(wolt\.com|woltapi\.com)\//;
const isMinor = (n: number) => Number.isInteger(n) && n >= 0;
const ctx = { language: 'en' };

describe('venue listing', () => {
  const { venues, tags } = mapVenueListPage(venueListing, ctx);

  it('maps all fixture venues with real CDN images and minor-unit currency', () => {
    expect(venues.length).toBeGreaterThanOrEqual(25);
    for (const v of venues) {
      expect(v.id).toMatch(/^[0-9a-f]{24}$/);
      expect(v.slug).toBeTruthy();
      expect(v.currency).toBe('ILS');
      expect(v.image).toMatch(WOLT_CDN);
      expect(v.url).toBe(`https://wolt.com/en/isr/tel-aviv/restaurant/${v.slug}`);
      expect(v.location?.lat).toBeGreaterThan(31);
      expect(v.location?.lon).toBeGreaterThan(34);
      for (const t of v.tags) expect(t).toMatch(/^[a-z]/);
    }
  });

  it('keeps open/closed state and cuisine tags', () => {
    expect(venues.filter((v) => !v.online).length).toBe(2);
    expect(venues.find((v) => v.slug === 'roll-n-roll')?.tags).toContain('sushi');
    expect(tags.find((t) => t.id === 'sushi')?.name).toBe('Sushi');
  });

  it('covers the cuisines Woltron cares about', () => {
    const all = new Set(venues.flatMap((v) => v.tags));
    for (const c of ['sushi', 'ramen', 'thai', 'chinese', 'indian', 'poke', 'pizza', 'burger', 'salad']) expect(all.has(c)).toBe(true);
  });
});

describe('venue details + fees', () => {
  const fx = venueFixtures['burger-station-23'];

  it('maps static + dynamic pages', () => {
    const v = mapVenueDetails(fx.static, fx.dynamic, ctx);
    expect(v.slug).toBe('burger-station-23');
    expect(v.online).toBe(true);
    expect(v.delivers).toBe(true);
    expect(v.image).toMatch(WOLT_CDN);
    expect(v.currency).toBe('ILS');
    expect(isMinor(v.deliveryPrice!.amount)).toBe(true);
    expect(v.deliveryEstimateRange).toMatch(/^\d+-\d+$/);
    expect(v.url).toMatch(/^https:\/\/wolt\.com\/en\/isr\/tel-aviv\/restaurant\/burger-station-23$/);
  });

  it('marks closed venues offline', () => {
    const dyn = structuredClone(fx.dynamic);
    dyn.venue.delivery_open_status.is_open = false;
    expect(openState(dyn).online).toBe(false);
    expect(mapVenueDetails(fx.static, dyn, ctx).online).toBe(false);
    expect(mapVenueDetails(fx.static, undefined, ctx).online).toBe(false);
  });

  it('applies unconditional delivery campaigns', () => {
    const dyn = {
      venue_raw: {
        delivery_specs: { original_delivery_price: 1200, delivery_pricing: { price_ranges: [] } },
        discounts: [
          { id: 'free', effects: { delivery_discount: { amount: 0, fraction: 1 } }, conditions: { basket_contains: [], preorder: null } },
          { id: 'cond', effects: { delivery_discount: { amount: 500 } }, conditions: { min_distance: 3000 } },
        ],
      },
    };
    const fees = mapDynamicFees(dyn);
    expect(fees.originalDeliveryFee).toBe(1200);
    expect(fees.deliveryFee).toBe(0);
    expect(fees.autoDiscountIds).toEqual(['free']);
  });

  it('estimates Wolt service fee + small order surcharge from price ranges', () => {
    // Real Tel Aviv ranges: <50₪ surcharge up to 51₪, 50-60₪ flat 1₪, 5% up to 118₪, then 5.90₪ cap.
    const fees = { autoDiscountIds: [], priceRanges: [
      { min: 0, max: 5000, a: 5100, b: -1 },
      { min: 5000, max: 6000, a: 100, b: 0 },
      { min: 6000, max: 11800, a: 0, b: 0.05 },
      { min: 11800, max: 0, a: 590, b: 0 },
    ] };
    expect(estimateServiceFee(4600, fees)).toBe(500);
    expect(estimateServiceFee(5500, fees)).toBe(100);
    expect(estimateServiceFee(8800, fees)).toBe(440);
    expect(estimateServiceFee(25000, fees)).toBe(590);
    expect(estimateServiceFee(10000, { autoDiscountIds: [], priceRanges: [] }, { min: 100, max: 590, percentage: 5 })).toBe(500);
  });
});

describe('menus (assortment)', () => {
  const slugs = Object.keys(venueFixtures);

  it('has at least 10 full menus', () => expect(slugs.length).toBeGreaterThanOrEqual(10));

  it.each(slugs)('maps %s', (slug) => {
    const fx = venueFixtures[slug];
    const venue = mapVenueDetails(fx.static, fx.dynamic, ctx);
    const menu = mapAssortment(fx.assortment, venue, '2026-01-01T00:00:00.000Z');
    expect(menu.items.length).toBeGreaterThan(5);
    const ids = new Set(menu.items.map((i) => i.id));
    for (const c of menu.categories) for (const id of c.itemIds) expect(ids.has(id)).toBe(true);
    for (const item of menu.items) {
      expect(item.venueSlug).toBe(slug);
      expect(item.venueId).toBe(venue.id);
      expect(isMinor(item.price.amount)).toBe(true);
      expect(item.price.currency).toBe('ILS');
      if (item.image) expect(item.image).toMatch(WOLT_CDN);
      for (const g of item.options) {
        expect(g.min).toBeGreaterThanOrEqual(0);
        expect(g.max === 0 || g.max >= g.min).toBe(true);
        for (const val of g.values) expect(isMinor(val.price.amount)).toBe(true);
      }
    }
    expect(menu.items.filter((i) => i.image).length).toBeGreaterThan(0);
  });

  it('maps option groups from item bindings + shared definitions', () => {
    const fx = venueFixtures['burger-station-23'];
    const menu = mapAssortment(fx.assortment, mapVenueDetails(fx.static, fx.dynamic, ctx));
    const withOptions = menu.items.filter((i) => i.options.length);
    expect(withOptions.length).toBeGreaterThan(0);
    const g = withOptions[0].options[0];
    const raw = fx.assortment.items.find((i: any) => i.id === withOptions[0].id).options[0];
    expect(g.id).toBe(raw.id);
    expect(g.values.length).toBeGreaterThan(0);
  });
});

describe('search', () => {
  const s = sample('search-ramen.json');
  const res = mapSearch([s.venues, s.items], ctx);

  it('maps venues and orderable items with venue references', () => {
    expect(res.venues.length).toBeGreaterThan(0);
    expect(res.items.length).toBeGreaterThan(0);
    for (const { item, venue } of res.items) {
      expect(item.venueId).toBe(venue.id);
      expect(item.venueSlug).toBeTruthy();
      expect(item.price.amount).toBeGreaterThan(0);
      if (item.image) expect(item.image).toMatch(WOLT_CDN);
      expect(venue.url).toMatch(new RegExp(`/(restaurant|venue)/${item.venueSlug}$`));
    }
  });

  it('enriches item venues from known listing data', () => {
    const first = res.items[0];
    const known = new Map([[first.venue.id, { ...first.venue, name: 'Enriched', online: false, tags: ['ramen'] }]]);
    const enriched = mapSearch([s.items], ctx, known);
    expect(enriched.items[0].venue.name).toBe('Enriched');
    expect(enriched.items[0].venue.online).toBe(false);
  });
});

describe('geocoding', () => {
  it('maps Wolt google geocode proxy results', () => {
    const out = mapGoogleGeocode(sample('geocode-dizengoff.json'));
    expect(out[0].address).toMatch(/Dizengoff/);
    expect(out[0].lat).toBeCloseTo(32.075, 2);
    expect(out[0].lon).toBeCloseTo(34.774, 2);
  });
  it('maps Nominatim results', () => {
    expect(mapNominatim([{ lat: '32.1', lon: '34.8', display_name: 'X' }])).toEqual([{ lat: 32.1, lon: 34.8, address: 'X' }]);
  });
});

describe('ordering payloads', () => {
  const fx = venueFixtures['burger-station-23'];
  const itemWithRequired = fx.assortment.items.find((i: any) => (i.options ?? []).some((o: any) => o.multi_choice_config?.total_range?.min > 0));

  it('prices lines with option values', () => {
    const it0 = fx.assortment.items.find((i: any) => i.price > 0 && !(i.options ?? []).some((o: any) => o.multi_choice_config?.total_range?.min > 0));
    const b = resolveBasket(fx.assortment, [{ itemId: it0.id, quantity: 3, options: [] }]);
    expect(b.subtotal).toBe(it0.price * 3);
    expect(b.warnings).toEqual([]);
  });

  it('warns about missing items and missing required choices', () => {
    const b = resolveBasket(fx.assortment, [
      { itemId: 'nope', quantity: 1, options: [] },
      ...(itemWithRequired ? [{ itemId: itemWithRequired.id, quantity: 1, options: [] }] : []),
    ]);
    expect(b.warnings.some((w) => w.includes('no longer on the menu'))).toBe(true);
    if (itemWithRequired) expect(b.warnings.some((w) => w.includes('required choice'))).toBe(true);
  });

  it('adds selected option prices to end_amount and serializes all bindings', () => {
    const it1 = fx.assortment.items.find((i: any) => (i.options ?? []).length > 0);
    const binding = it1.options[0];
    const def = fx.assortment.options.find((o: any) => o.id === binding.option_id);
    const val = def.values[0];
    const b = resolveBasket(fx.assortment, [{ itemId: it1.id, quantity: 2, options: [{ groupId: binding.id, valueIds: [val.id] }] }]);
    expect(b.lines[0].endAmount).toBe((it1.price + val.price) * 2);
    const mi = checkoutMenuItems(b, 'venue1')[0];
    expect(mi.options.length).toBe(it1.options.length);
    expect(mi.options[0]).toEqual({ id: binding.id, values: [{ id: val.id, count: 1, price: val.price }] });
    expect(mi.end_amount).toBe(b.lines[0].endAmount);
    const bp = basketPayload(b, { id: 'venue1', currency: 'ILS' });
    expect(bp.items[0].price).toBe(b.lines[0].endAmount);
    const pi = purchaseItems(b, fx.assortment, 'en')[0];
    expect(pi.options).toHaveLength(1);
    expect(pi.options[0].type).toMatch(/^(Multichoice|Choice|Bool)$/);
    expect(pi.name).toEqual([{ value: it1.name, lang: 'en' }]);
  });

  it('parses a real checkout response', () => {
    const { request, response } = sample('checkout.json');
    const c = parseCheckout(response);
    expect(c.payable).toBe(response.payable_amount);
    const items = request.purchase_plan.menu_items.reduce((s: number, i: any) => s + i.end_amount, 0);
    expect(items + (c.deliveryFee ?? 0) + (c.serviceFee ?? 0)).toBe(c.payable);
    expect(c.etaMinutes).toBeGreaterThan(0);
  });
});

describe('helpers', () => {
  it('cleans internal tags', () => {
    expect(cleanTags(['burger', 'Isr_champion_burger', 'gluten free', 'isr_tag_night', 'recovery_2', 'Wolt Benefits', 'burger'])).toEqual(['burger', 'gluten free']);
  });
  it('infers dietary tags', () => {
    expect(dietaryFor([], 'Vegan Cheeseburger 🌱')).toEqual(expect.arrayContaining(['vegan', 'vegetarian']));
    expect(dietaryFor(['GLUTEN_FREE'], 'El Chapo 🌶')).toEqual(expect.arrayContaining(['gluten-free', 'spicy']));
    expect(dietaryFor([], 'Plain rice')).toBeUndefined();
  });
  it('reads translated text', () => {
    expect(text([{ lang: 'he', value: 'שלום' }, { lang: 'en', value: 'Hi' }], 'en')).toBe('Hi');
    expect(text({ lang: 'en', value: 'Yo' })).toBe('Yo');
  });
  it('point in polygon + urls', () => {
    const square = { type: 'Polygon', coordinates: [[[34, 32], [35, 32], [35, 33], [34, 33], [34, 32]]] };
    expect(pointInGeoJson(square, 32.5, 34.5)).toBe(true);
    expect(pointInGeoJson(square, 31.5, 34.5)).toBe(false);
    expect(pointInGeoJson(null, 1, 1)).toBeUndefined();
    expect(parseShareUrl('https://wolt.com/he/isr/tel-aviv/restaurant/hamosad')).toEqual({ country: 'isr', city: 'tel-aviv', type: 'restaurant', slug: 'hamosad' });
    expect(venueUrl({ slug: 'x', country: 'ISR', city: 'tel-aviv', productLine: 'grocery' })).toBe('https://wolt.com/en/isr/tel-aviv/venue/x');
  });
});
