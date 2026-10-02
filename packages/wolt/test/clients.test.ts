import { WoltError, type WoltTokens } from '@woltron/shared';
import { describe, expect, it, vi } from 'vitest';
import { venueFixtures } from '../fixtures/index.js';
import { createWoltClient, DEFAULT_LOCATION, HttpCore, LiveWoltClient, MockWoltClient } from '../src/index.js';
import { parseMagicLink } from '../src/auth.js';

const loc = DEFAULT_LOCATION;

describe('mock client', () => {
  const client = new MockWoltClient({ latencyMs: [0, 0] });

  it('is selected by createWoltClient({ mock: true })', () => {
    expect(createWoltClient({ mock: true }).mock).toBe(true);
    expect(createWoltClient({ mock: false }).mock).toBe(false);
  });

  it('lists ~25 venues with tags', async () => {
    const { venues, tags } = await client.listVenues(loc);
    expect(venues.length).toBeGreaterThanOrEqual(25);
    expect(tags.length).toBeGreaterThan(10);
    expect(venues.filter((v) => v.online).length).toBe(venues.length - 2);
  });

  it('serves full menus and preview-item menus', async () => {
    for (const slug of Object.keys(venueFixtures)) {
      const menu = await client.getMenu(slug, loc);
      expect(menu.items.length).toBeGreaterThan(5);
      expect(menu.venue.slug).toBe(slug);
    }
    const preview = await client.getMenu('hamosad', loc);
    expect(preview.items.length).toBeGreaterThan(0);
    await expect(client.getVenue('nope', loc)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('keyword-searches fixture menus', async () => {
    const res = await client.search('sushi', loc);
    expect(res.venues.some((v) => v.tags.includes('sushi'))).toBe(true);
    expect(res.items.length).toBeGreaterThan(0);
    const pizza = await client.search('pizza', loc);
    expect(pizza.items[0].item.name.toLowerCase()).toContain('pizza');
  });

  it('geocodes known places', async () => {
    const [g] = await client.geocode('Dizengoff 50');
    expect(g.address).toMatch(/Dizengoff/);
  });

  it('quotes, requires auth to place, then simulates an order', async () => {
    const slug = 'roll-n-roll';
    const menu = await client.getMenu(slug, loc);
    const item = menu.items.find((i) => i.available && i.price.amount > 0 && i.options.every((g) => g.min === 0))!;
    const quote = await client.quoteBasket(slug, [{ itemId: item.id, quantity: 2, options: [] }], loc);
    expect(quote.subtotal.amount).toBe(item.price.amount * 2);
    expect(quote.total.amount).toBe(quote.subtotal.amount + quote.deliveryFee!.amount + quote.serviceFee!.amount);
    expect(quote.checkoutUrl).toContain(`/restaurant/${slug}`);
    await expect(client.placeOrder(quote, { loc })).rejects.toMatchObject({ code: 'unauthorized' });

    const rotated: WoltTokens[] = [];
    client.onTokensRefreshed((t) => rotated.push(t));
    const conn = await client.connectWithRefreshToken('anything');
    expect(conn.connected).toBe(true);
    expect(rotated).toHaveLength(1);
    const placed = await client.placeOrder(quote, { loc });
    expect(placed.orderId).toMatch(/^mock-/);
    const st = await client.getOrderStatus!(placed.orderId);
    expect(st.delivered).toBe(false);
    expect(st.status).toBe('received');
  });

  it('refuses orders at closed venues', async () => {
    const { venues } = await client.listVenues(loc);
    const closed = venues.find((v) => !v.online)!;
    const menu = await client.getMenu(closed.slug, loc).catch(() => undefined);
    if (!menu?.items.length) return;
    await client.connectWithRefreshToken('x');
    const q = await client.quoteBasket(closed.slug, [{ itemId: menu.items[0].id, quantity: 1, options: [] }], loc);
    expect(q.warnings.join(' ')).toMatch(/closed/);
    await expect(client.placeOrder(q, { loc })).rejects.toMatchObject({ code: 'venue_offline' });
  });
});

/** Fake fetch router for the live client. */
function fakeFetch(routes: Array<[RegExp, (url: string, init: RequestInit) => { status?: number; body?: unknown; headers?: Record<string, string> }]>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = vi.fn(async (input: any, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    const route = routes.find(([re]) => re.test(url));
    if (!route) return new Response('not found', { status: 404 });
    const r = route[1](url, init);
    return new Response(r.body === undefined ? '' : JSON.stringify(r.body), { status: r.status ?? 200, headers: r.headers });
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

describe('live client (fake fetch)', () => {
  it('exchanges + rotates refresh tokens and reads the user', async () => {
    let n = 0;
    const { impl, calls } = fakeFetch([
      [/wauth2\/access_token/, () => ({ body: { access_token: `acc${++n}`, refresh_token: `ref${n}`, expires_in: 1800, token_type: 'Bearer' } })],
      [/\/v1\/user\/me/, () => ({ body: { user: { name: { first_name: 'Rex', last_name: 'Dog' }, email: 'rex@example.com' } } })],
    ]);
    const client = new LiveWoltClient({ fetchImpl: impl, maxAttempts: 1 });
    const rotated: WoltTokens[] = [];
    client.onTokensRefreshed((t) => rotated.push(t));
    const conn = await client.connectWithRefreshToken('  "orig"  ');
    expect(conn).toMatchObject({ connected: true, user: { name: 'Rex Dog', email: 'rex@example.com' } });
    expect(rotated[0]).toMatchObject({ accessToken: 'acc1', refreshToken: 'ref1' });
    const authCall = calls.find((c) => c.url.includes('access_token'))!;
    expect(String(authCall.init.body)).toBe('grant_type=refresh_token&refresh_token=orig');
    const meCall = calls.find((c) => c.url.includes('user/me'))!;
    expect((meCall.init.headers as Record<string, string>).authorization).toBe('Bearer acc1');
  });

  it('refreshes on 401 and retries once', async () => {
    let meCalls = 0;
    const { impl } = fakeFetch([
      [/wauth2\/access_token/, () => ({ body: { access_token: 'fresh', refresh_token: 'r2', expires_in: 1800, token_type: 'Bearer' } })],
      [/\/v1\/user\/me/, (_u, init) => (++meCalls === 1 ? { status: 401, body: { error_code: 304 } } : { body: { user: { email: 'a@b.c' }, auth: (init.headers as any).authorization } })],
    ]);
    const client = new LiveWoltClient({ fetchImpl: impl, maxAttempts: 1 });
    const rotated: WoltTokens[] = [];
    client.onTokensRefreshed((t) => rotated.push(t));
    client.setTokens({ accessToken: 'stale', refreshToken: 'r1', expiresAt: new Date(Date.now() + 3600_000).toISOString() });
    const conn = await client.connection();
    expect(conn.connected).toBe(true);
    expect(meCalls).toBe(2);
    expect(rotated.map((t) => t.refreshToken)).toEqual(['r2']);
  });

  it('maps rejected refresh tokens to unauthorized', async () => {
    const { impl } = fakeFetch([[/wauth2\/access_token/, () => ({ status: 401, body: { error_code: 126, msg: 'invalid credentials' } })]]);
    const client = new LiveWoltClient({ fetchImpl: impl, maxAttempts: 1 });
    await expect(client.connectWithRefreshToken('bad')).rejects.toMatchObject({ code: 'unauthorized' });
    expect((await client.connection()).connected).toBe(false);
  });

  it('placeOrder: unauthorized without session, unsupported unless experimental purchase is enabled', async () => {
    const client = new LiveWoltClient({ fetchImpl: fakeFetch([]).impl, experimentalPurchase: false });
    const quote = { venueSlug: 'x', subtotal: { amount: 1, currency: 'ILS' }, total: { amount: 1, currency: 'ILS' }, warnings: [] };
    await expect(client.placeOrder(quote, { loc })).rejects.toMatchObject({ code: 'unauthorized' });
    client.setTokens({ refreshToken: 'r', accessToken: 'a' });
    const err = await client.placeOrder(quote, { loc }).catch((e) => e);
    expect(err).toBeInstanceOf(WoltError);
    expect(err.code).toBe('unsupported');
  });

  it('parses magic links', () => {
    expect(parseMagicLink('https://wolt.com/en/me/magic-login?email=a%40b.c&token=abc123')).toBe('abc123');
    expect(parseMagicLink(' rawcode ')).toBe('rawcode');
  });
});

describe('http core', () => {
  it('retries 5xx with backoff, caches GETs, sends browser-like headers', async () => {
    let n = 0;
    const { impl, calls } = fakeFetch([[/example\.wolt\.com/, () => (++n < 3 ? { status: 503, body: { msg: 'busy' } } : { body: { ok: n } })]]);
    const http = new HttpCore({ fetchImpl: impl, backoffMs: 1, maxAttempts: 3, language: 'he' });
    const a = await http.json('https://example.wolt.com/x', { cacheTtlMs: 10_000 });
    const b = await http.json('https://example.wolt.com/x', { cacheTtlMs: 10_000 });
    expect(a).toEqual({ ok: 3 });
    expect(b).toBe(a);
    expect(calls).toHaveLength(3);
    const h = calls[0].init.headers as Record<string, string>;
    expect(h['app-language']).toBe('he');
    expect(h['user-agent']).toMatch(/Mozilla/);
  });

  it('maps statuses to WoltError codes and does not retry POSTs on 5xx', async () => {
    const { impl, calls } = fakeFetch([
      [/rate/, () => ({ status: 429, headers: { 'retry-after': '0' } })],
      [/gone/, () => ({ status: 404, body: { detail: 'nope' } })],
      [/post/, () => ({ status: 500 })],
    ]);
    const http = new HttpCore({ fetchImpl: impl, backoffMs: 1, maxAttempts: 2 });
    await expect(http.json('https://a.wolt.com/rate')).rejects.toMatchObject({ code: 'rate_limited', status: 429 });
    await expect(http.json('https://a.wolt.com/gone')).rejects.toMatchObject({ code: 'not_found' });
    await expect(http.json('https://a.wolt.com/post', { method: 'POST', body: {} })).rejects.toMatchObject({ status: 500 });
    expect(calls.filter((c) => c.url.includes('post'))).toHaveLength(1);
    expect(calls.filter((c) => c.url.includes('rate'))).toHaveLength(2);
  });

  it('limits per-host concurrency', async () => {
    let active = 0;
    let peak = 0;
    const impl = (async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    const http = new HttpCore({ fetchImpl: impl, concurrency: 2 });
    await Promise.all(Array.from({ length: 8 }, (_, i) => http.json(`https://h.wolt.com/${i}`)));
    expect(peak).toBe(2);
  });

  it('wraps network failures', async () => {
    const impl = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const http = new HttpCore({ fetchImpl: impl, maxAttempts: 2, backoffMs: 1 });
    await expect(http.json('https://n.wolt.com/')).rejects.toMatchObject({ code: 'network' });
  });
});
