/**
 * Live smoke test of the public catalog + unauthenticated quote.
 *   npx tsx packages/wolt/scripts/smoke.ts [query] [--mock] [--verbose]
 * Optional: WOLT_REFRESH_TOKEN=<__wrtoken> also exercises auth (rotated token is printed redacted).
 */
import { formatMoney } from '@woltron/shared';
import { createWoltClient, DEFAULT_LOCATION } from '../src/index.js';

const args = process.argv.slice(2);
const mock = args.includes('--mock');
const verbose = args.includes('--verbose');
const query = args.find((a) => !a.startsWith('--')) ?? 'ramen';
const loc = DEFAULT_LOCATION;
const client = createWoltClient({ mock, logger: verbose ? (m) => console.error(m) : undefined });
const t0 = Date.now();
const step = async <T>(name: string, fn: () => Promise<T>): Promise<T | undefined> => {
  const s = Date.now();
  try {
    const r = await fn();
    console.log(`✔ ${name} (${Date.now() - s}ms)`);
    return r;
  } catch (e) {
    console.log(`✘ ${name}: ${(e as Error).message}`);
    process.exitCode = 1;
    return undefined;
  }
};

console.log(`Woltron Wolt smoke — ${mock ? 'MOCK' : 'LIVE'} @ ${loc.lat},${loc.lon}\n`);

const geo = await step('geocode "Dizengoff 50"', () => client.geocode('Dizengoff 50, Tel Aviv'));
if (geo?.[0]) console.log(`   → ${geo[0].address} (${geo[0].lat.toFixed(4)}, ${geo[0].lon.toFixed(4)})`);

const list = await step('listVenues', () => client.listVenues(loc));
if (list) {
  const open = list.venues.filter((v) => v.online && v.delivers);
  console.log(`   → ${list.venues.length} venues, ${open.length} open+delivering, ${list.tags.length} cuisine tags`);
  for (const v of open.slice(0, 5)) console.log(`     · ${v.name} [${v.tags.join(', ')}] ★${v.rating?.score ?? '-'} ${v.deliveryEstimateRange ?? ''}min ${v.image ? '🖼' : ''}`);
}

const target = list?.venues.find((v) => v.online && v.delivers) ?? list?.venues[0];
if (target) {
  const venue = await step(`getVenue ${target.slug}`, () => client.getVenue(target.slug, loc));
  if (venue) console.log(`   → ${venue.name}: online=${venue.online} delivers=${venue.delivers} delivery=${formatMoney(venue.deliveryPrice)} eta=${venue.deliveryEstimateRange} ${venue.url}`);
  const menu = await step(`getMenu ${target.slug}`, () => client.getMenu(target.slug, loc));
  if (menu) {
    const withOpts = menu.items.filter((i) => i.options.length);
    console.log(`   → ${menu.categories.length} categories, ${menu.items.length} items (${withOpts.length} with options, ${menu.items.filter((i) => i.image).length} with images)`);
    for (const i of menu.items.slice(0, 4)) console.log(`     · ${i.name} ${formatMoney(i.price)} ${i.available ? '' : '(unavailable)'}`);
    // Quote the cheapest available item (with required options satisfied by defaults/first value).
    const item = menu.items.filter((i) => i.available && i.price.amount > 0).sort((a, b) => a.price.amount - b.price.amount)[Math.floor(menu.items.length / 3)] ?? menu.items[0];
    if (item) {
      const options = item.options.filter((g) => g.min > 0).map((g) => ({ groupId: g.id, valueIds: (g.values.filter((v) => v.isDefault).length ? g.values.filter((v) => v.isDefault) : g.values).slice(0, g.min).map((v) => v.id) }));
      const quote = await step(`quoteBasket 2× ${item.name}`, () => client.quoteBasket(target.slug, [{ itemId: item.id, quantity: 2, options }], loc));
      if (quote) {
        console.log(`   → subtotal ${formatMoney(quote.subtotal)} + delivery ${formatMoney(quote.deliveryFee)} + service ${formatMoney(quote.serviceFee)} = ${formatMoney(quote.total)} · eta ${quote.etaMinutes}min · source=${(quote as any).source}`);
        console.log(`   → checkoutUrl ${quote.checkoutUrl}`);
        for (const w of quote.warnings) console.log(`     ! ${w}`);
      }
      await step('placeOrder without auth → unauthorized', async () => {
        try {
          await client.placeOrder(quote!, { loc });
          throw new Error('expected unauthorized');
        } catch (e) {
          if ((e as any).code !== 'unauthorized') throw e;
        }
      });
    }
  }
}

const res = await step(`search "${query}"`, () => client.search(query, loc));
if (res) {
  console.log(`   → ${res.venues.length} venues, ${res.items.length} items`);
  for (const { item, venue } of res.items.slice(0, 5)) console.log(`     · ${item.name} — ${venue.name} ${formatMoney(item.price)} ${venue.online ? '' : '(closed)'}`);
}

const rt = process.env.WOLT_REFRESH_TOKEN;
if (rt) {
  client.onTokensRefreshed((t) => console.log(`   ↻ tokens rotated (refresh …${t.refreshToken.slice(-4)}, expires ${t.expiresAt})`));
  const conn = await step('connectWithRefreshToken', () => client.connectWithRefreshToken(rt));
  if (conn) console.log(`   → connected=${conn.connected} user=${conn.user?.name ?? '?'} <${conn.user?.email ?? '?'}>`);
} else {
  await step('connectWithRefreshToken(bogus) → unauthorized', async () => {
    try {
      await client.connectWithRefreshToken('invalid');
      throw new Error('expected unauthorized');
    } catch (e) {
      if ((e as any).code !== 'unauthorized') throw e;
    }
  });
}

console.log(`\nDone in ${Date.now() - t0}ms`);
