/**
 * Captures realistic mock fixtures from the LIVE Wolt API (Tel Aviv).
 *   npx tsx packages/wolt/scripts/capture-fixtures.ts
 * Writes packages/wolt/fixtures/{venues.json, venues/<slug>.json, index.ts}.
 * Fixtures keep real Wolt CDN image URLs; payloads are trimmed to the fields our mappers read.
 * Mock mode marks all captured venues open except MOCK_CLOSED (captures often run at night).
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOSTS, HttpCore } from '../src/http.js';
import { purchasePlan, resolveBasket } from '../src/ordering.js';

const LAT = 32.0853;
const LON = 34.7818;
const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const http = new HttpCore({ language: 'en', logger: (m) => process.stderr.write(m + '\n') });

type Raw = any;

// [label, primary tag, fallback tag, excluded tags, how many venues, how many get full menus]
const PLAN: Array<[string, RegExp, RegExp | null, RegExp | null, number, number]> = [
  ['sushi', /^sushi$/, null, null, 2, 1],
  ['ramen', /^ramen$/, /^noodles$/, null, 2, 1],
  ['thai', /^thai$/, null, null, 2, 1],
  ['chinese', /^chinese$/, /^wok$/, null, 2, 1],
  ['indian', /^indian$/, /^curry$/, null, 2, 1],
  ['poke', /^poke$/, /^bowl$/, null, 1, 1],
  ['vietnamese', /^vietnamese$/, null, null, 1, 1],
  ['pizza', /^pizza$/, null, null, 2, 1],
  ['burger', /^(burger|hamburger)$/, null, null, 2, 1],
  ['salad', /^salad$/, /^healthy$/, /^(pizza|sandwich|street food|burger|bakery|pasta|grill)$/, 2, 1],
  ['mexican', /^mexican$/, /^(burrito|tortilla)$/, null, 1, 1],
  ['vegan', /^vegan$/, null, /^(ice cream|dessert|sweets|café|bakery|smoothie)$/, 1, 1],
  ['hummus', /^hummus$/, /^falafel$/, null, 1, 0],
  ['shawarma', /^shawarma$/, /^kebab$/, null, 1, 0],
  ['italian', /^pasta$/, /^italian$/, /^pizza$/, 1, 0],
  ['dessert', /^ice cream$/, /^dessert$/, null, 1, 0],
  ['bakery', /^bakery$/, /^café$/, null, 1, 0],
];
const MOCK_CLOSED_LABELS = new Set(['bakery', 'shawarma']);
const MAX_ITEMS = 70;

function score(it: Raw) {
  const v = it.venue;
  const r = v.rating?.score ?? 0;
  const vol = Math.min(v.rating?.volume ?? 0, 3000);
  return r * 10 + vol / 300 + (v.brand_image ? 3 : 0) + Math.min(v.venue_preview_items?.length ?? 0, 6) + (v.online ? 5 : 0);
}

function trimListingItem(it: Raw) {
  const v = it.venue;
  return {
    image: it.image,
    link: { venue_mainimage_blurhash: it.link?.venue_mainimage_blurhash },
    title: it.title,
    venue: {
      id: v.id, slug: v.slug, name: v.name, address: v.address, country: v.country, currency: v.currency,
      delivers: v.delivers, online: v.online, estimate: v.estimate, estimate_range: v.estimate_range,
      location: v.location, price_range: v.price_range, product_line: v.product_line, rating: v.rating,
      short_description: v.short_description, short_description_v2: v.short_description_v2, tags: v.tags,
      brand_image: v.brand_image,
      venue_preview_items: (v.venue_preview_items ?? []).map((p: Raw) => ({ id: p.id, name: p.name, price: p.price, currency: p.currency, image: p.image })),
    },
  };
}

function trimStatic(s: Raw) {
  const v = s.venue ?? {};
  const r = s.venue_raw ?? {};
  return {
    venue: {
      id: v.id, slug: v.slug, name: v.name, description: v.description, image_url: v.image_url, image_blurhash: v.image_blurhash,
      brand_logo_image_url: v.brand_logo_image_url, address: v.address, rating: v.rating, share_url: v.share_url,
      currency: v.currency, country: v.country, delivery_methods: v.delivery_methods, timezone: v.timezone,
      product_line: v.product_line, delivery_base_price: v.delivery_base_price, service_fee_estimate: v.service_fee_estimate,
      zero_distance_fees: v.zero_distance_fees, opening_times_schedule: v.opening_times_schedule,
    },
    venue_raw: { id: r.id, location: r.location, price_range: r.price_range, food_tags: r.food_tags, short_description: r.short_description },
    order_minimum: s.order_minimum,
  };
}

function trimDynamic(d: Raw) {
  const v = d.venue ?? {};
  const r = d.venue_raw ?? {};
  const specs = r.delivery_specs ?? {};
  return {
    venue: { id: v.id, online: v.online, open_status: v.open_status, delivery_open_status: v.delivery_open_status, delivery_configs: v.delivery_configs },
    venue_raw: {
      id: r.id, alive: r.alive, preestimate_total: r.preestimate_total,
      discounts: (r.discounts ?? []).map((x: Raw) => ({ id: x.id, effects: x.effects, conditions: x.conditions, optional: x.optional, tap_to_apply: x.tap_to_apply, description: { title: x.description?.title } })),
      delivery_specs: {
        delivery_enabled: specs.delivery_enabled, original_delivery_price: specs.original_delivery_price,
        order_minimum_no_surcharge: specs.order_minimum_no_surcharge,
        delivery_pricing: { base_price: specs.delivery_pricing?.base_price, price_ranges: specs.delivery_pricing?.price_ranges },
      },
    },
    order_minimum: d.order_minimum,
  };
}

function trimAssortment(a: Raw) {
  const items: Raw[] = (a.items ?? []).slice(0, MAX_ITEMS);
  const keep = new Set(items.map((i) => i.id));
  const usedOptions = new Set(items.flatMap((i) => (i.options ?? []).map((o: Raw) => o.option_id)));
  const trimCat = (c: Raw): Raw => ({ id: c.id, name: c.name, description: c.description || undefined, slug: c.slug, item_ids: (c.item_ids ?? []).filter((id: string) => keep.has(id)), subcategories: (c.subcategories ?? []).map(trimCat) });
  return {
    assortment_id: a.assortment_id,
    loading_strategy: a.loading_strategy,
    primary_language: a.primary_language,
    selected_language: a.selected_language,
    categories: (a.categories ?? []).map(trimCat).filter((c: Raw) => c.item_ids.length || c.subcategories.length),
    items: items.map((i) => ({
      id: i.id, name: i.name, description: i.description, price: i.price, images: (i.images ?? []).slice(0, 1),
      options: i.options, dietary_preferences: i.dietary_preferences, disabled_info: i.disabled_info, tags: (i.tags ?? []).map((t: Raw) => ({ id: t.id, label: t.label })),
      alcohol_permille: i.alcohol_permille, restrictions: i.restrictions, checksum: i.checksum,
      vat_category_code: i.vat_category_code, vat_percentage: i.vat_percentage, is_wolt_plus_only: i.is_wolt_plus_only,
    })),
    options: (a.options ?? []).filter((o: Raw) => usedOptions.has(o.id)).map((o: Raw) => ({
      id: o.id, name: o.name, type: o.type, default_value: o.default_value,
      values: (o.values ?? []).map((v: Raw) => ({ id: v.id, name: v.name, price: v.price })),
    })),
  };
}

function forceOpen(d: Raw, open: boolean) {
  const status = { is_open: open, value: open ? 'Open' : 'Closed', style: { type: open ? 'OPEN' : 'CLOSED' } };
  d.venue.online = open;
  d.venue.open_status = { ...(d.venue.open_status ?? {}), ...status };
  d.venue.delivery_open_status = { ...(d.venue.delivery_open_status ?? {}), ...status };
  d.venue_raw.alive = true;
  d.venue_raw.delivery_specs.delivery_enabled = true;
}

async function main() {
  const page = await http.json(`${HOSTS.restaurant}/v1/pages/restaurants`, { query: { lat: LAT, lon: LON } });
  const all: Raw[] = page.sections.flatMap((s: Raw) => (s.items ?? []).filter((i: Raw) => i.venue));
  const chosen: Array<{ label: string; item: Raw; full: boolean }> = [];
  const used = new Set<string>();
  for (const [label, primary, fallback, exclude, n, full] of PLAN) {
    const tagsOf = (i: Raw): string[] => (i.venue.tags ?? []).map((t: string) => t.toLowerCase());
    const ok = (i: Raw, re: RegExp) => !used.has(i.venue.id) && tagsOf(i).some((t) => re.test(t)) && !(exclude && tagsOf(i).some((t) => exclude.test(t)));
    const byScore = (a: Raw, b: Raw) => score(b) - score(a);
    const cands = [...all.filter((i) => ok(i, primary)).sort(byScore), ...(fallback ? all.filter((i) => !ok(i, primary) && ok(i, fallback)).sort(byScore) : [])];
    cands.slice(0, n).forEach((item, idx) => {
      used.add(item.venue.id);
      chosen.push({ label, item, full: idx < full });
    });
  }
  console.error(`chosen ${chosen.length} venues`);

  rmSync(join(root, 'venues'), { recursive: true, force: true });
  mkdirSync(join(root, 'venues'), { recursive: true });
  const listingItems: Raw[] = [];
  const menus: string[] = [];
  for (const { label, item, full } of chosen) {
    const t = trimListingItem(item);
    const open = !MOCK_CLOSED_LABELS.has(label);
    t.venue.online = open;
    t.venue.delivers = open;
    (t as Raw).mock_category = label;
    listingItems.push(t);
    if (!full) continue;
    const slug = item.venue.slug;
    try {
      const [s, d, a] = await Promise.all([
        http.json(`${HOSTS.consumer}/order-xp/web/v1/pages/venue/slug/${slug}/static`),
        http.json(`${HOSTS.consumer}/order-xp/web/v1/venue/slug/${slug}/dynamic/`, { query: { lat: LAT, lon: LON } }),
        http.json(`${HOSTS.consumer}/consumer-api/consumer-assortment/v1/venues/slug/${slug}/assortment`, { query: { language: 'en' } }),
      ]);
      const dyn = trimDynamic(d);
      forceOpen(dyn, open);
      const fx = { captured_at: new Date().toISOString(), location: { lat: LAT, lon: LON }, static: trimStatic(s), dynamic: dyn, assortment: trimAssortment(a) };
      writeFileSync(join(root, 'venues', `${slug}.json`), JSON.stringify(fx, null, 1));
      menus.push(slug);
      console.error(`  ${label.padEnd(10)} ${slug} (${fx.assortment.items.length} items)`);
    } catch (e) {
      console.error(`  ! ${slug}: ${(e as Error).message}`);
    }
  }
  const primary = (page.filtering?.filters ?? []).find((f: Raw) => f.id === 'primary');
  const listing = {
    captured_at: new Date().toISOString(),
    city: page.city,
    filtering: { filters: primary ? [{ id: 'primary', values: primary.values }] : [] },
    sections: [{ name: 'restaurants-delivering-venues', items: listingItems }],
  };
  writeFileSync(join(root, 'venues.json'), JSON.stringify(listing, null, 1));

  const files = readdirSync(join(root, 'venues')).filter((f) => f.endsWith('.json')).sort();
  const ident = (f: string) => 'v_' + f.replace(/\.json$/, '').replace(/[^a-zA-Z0-9]/g, '_');
  const index = [
    '// Generated by scripts/capture-fixtures.ts — do not edit by hand.',
    "import listing from './venues.json';",
    ...files.map((f) => `import ${ident(f)} from './venues/${f}';`),
    '',
    'export const venueListing: any = listing;',
    'export const venueFixtures: Record<string, any> = {',
    ...files.map((f) => `  ${JSON.stringify(f.replace(/\.json$/, ''))}: ${ident(f)},`),
    '};',
    '',
  ].join('\n');
  writeFileSync(join(root, 'index.ts'), index);
  console.error(`wrote ${listingItems.length} venues, ${menus.length} full menus`);

  // Raw response samples for mapper tests (not used by the mock client).
  mkdirSync(join(root, 'samples'), { recursive: true });
  const search = async (target: string) => {
    const p = await http.json(`${HOSTS.restaurant}/v1/pages/search`, { method: 'POST', body: { q: 'ramen', target, lat: LAT, lon: LON } });
    return { city: p.city, sections: (p.sections ?? []).map((s: Raw) => ({ name: s.name, items: (s.items ?? []).slice(0, 8) })) };
  };
  writeFileSync(join(root, 'samples', 'search-ramen.json'), JSON.stringify({ venues: await search('venues'), items: await search('items') }, null, 1));
  writeFileSync(
    join(root, 'samples', 'geocode-dizengoff.json'),
    JSON.stringify(await http.json(`${HOSTS.restaurant}/v1/google/geocode/json`, { query: { address: 'Dizengoff 50, Tel Aviv', language: 'en' } }), null, 1),
  );
  const slug = menus[0];
  if (slug) {
    const fx = JSON.parse(readFileSync(join(root, 'venues', `${slug}.json`), 'utf8'));
    const item = fx.assortment.items.find((i: Raw) => i.price > 0 && !(i.options ?? []).some((o: Raw) => o.multi_choice_config?.total_range?.min > 0));
    const basket = resolveBasket(fx.assortment, [{ itemId: item.id, quantity: 2, options: [] }]);
    const body = purchasePlan(basket, { venue: { id: fx.static.venue.id, country: fx.static.venue.country, currency: fx.static.venue.currency }, loc: { lat: LAT, lon: LON } });
    const res = await http.json(`${HOSTS.consumer}/order-xp/web/v2/pages/checkout`, { method: 'POST', body });
    writeFileSync(join(root, 'samples', 'checkout.json'), JSON.stringify({ venue: slug, item_id: item.id, request: body, response: res }, null, 1));
  }
  console.error('wrote samples');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
