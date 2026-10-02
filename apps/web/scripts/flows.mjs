// Interactive flow checks + "hero" screenshots (fetch results, spin, run sheet, QR, etc).
// Usage: node scripts/flows.mjs [baseUrl] [outDir] [only]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const base = process.argv[2] ?? 'http://127.0.0.1:5173';
const out = resolve(process.argv[3] ?? new URL('../../../docs/screenshots', import.meta.url).pathname);
const only = process.argv[4];
mkdirSync(out, { recursive: true });
const j = (p, init) => fetch(base + p, init).then((r) => r.json());

const browser = await chromium.launch();
const errors = [];
async function ctx(kind, theme = 'light') {
  const vp = kind === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  const c = await browser.newContext({ viewport: vp, deviceScaleFactor: kind === 'mobile' ? 2 : 1, colorScheme: theme, isMobile: kind === 'mobile', hasTouch: kind === 'mobile' });
  await c.addInitScript((t) => localStorage.setItem('woltron.theme', t), theme);
  const page = await c.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  page.on('response', (r) => r.url().includes('/api/') && r.status() >= 400 && errors.push(`${r.status()} ${r.request().method()} ${r.url()}`));
  return { c, page };
}
const want = (n) => !only || n.includes(only);

if (want('fetch')) {
  for (const kind of ['desktop', 'mobile']) {
    const { c, page } = await ctx(kind);
    await page.goto(`${base}/fetch?q=${encodeURIComponent('something spicy & vegan under ₪60')}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
    if (kind === 'desktop') await page.screenshot({ path: `${out}/fetch-loading-desktop.png` });
    await page.waitForSelector('text=Here’s what I found', { timeout: 60000 }).catch(() => errors.push('fetch: no results within 60s'));
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/fetch-${kind}.png` });
    console.log('✓ fetch', kind);
    await c.close();
  }
}

if (want('spin')) {
  const packs = await j('/api/packs');
  const { c, page } = await ctx('desktop');
  await page.goto(`${base}/packs/${packs[0].id}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Spin preview/ }).click();
  await page.waitForTimeout(3200);
  await page.screenshot({ path: `${out}/pack-editor-desktop.png` });
  console.log('✓ spin');
  await c.close();
}

if (want('run')) {
  // Run sheet + confirm flow with ask policy via automation fire if available
  const presets = await j('/api/presets');
  const { c, page } = await ctx('desktop');
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: new RegExp(`^Run ${presets.find((p) => p.favorite)?.name ?? presets[0].name}`) }).first().click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/run-sheet-desktop.png` });
  await page.getByRole('button', { name: /Fetch \(dry run\)|Fill my basket|Order/ }).last().click();
  await page.waitForURL(/\/runs\//, { timeout: 15000 }).catch(() => errors.push('run: did not navigate to run'));
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${out}/run-live-desktop.png` });
  console.log('✓ run');
  await c.close();
}

if (want('confirm')) {
  const presets = await j('/api/presets');
  const ask = presets.find((p) => p.name.includes('Sushi')) ?? presets[0];
  if (ask) {
    const run = await j('/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target: { kind: 'preset', id: ask.id }, confirm: 'ask' }) });
    const { c, page } = await ctx('mobile');
    await page.goto(`${base}/runs/${run.id}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3500);
    await page.screenshot({ path: `${out}/run-confirm-mobile.png` });
    const btn = page.getByRole('button', { name: /Skip it/ });
    if (await btn.count()) {
      await btn.first().click();
      await page.waitForTimeout(1500);
      const r = await j(`/api/runs/${run.id}`);
      if (r.status !== 'cancelled') errors.push(`confirm: cancel → status ${r.status}`);
    } else errors.push(`confirm: no confirm card (status ${(await j(`/api/runs/${run.id}`)).status})`);
    console.log('✓ confirm/cancel');
    await c.close();
  }
}

if (want('settings')) {
  const { c, page } = await ctx('desktop');
  await page.goto(`${base}/settings#devices`, { waitUntil: 'networkidle' });
  const sw = page.getByRole('switch', { name: /Allow devices/ });
  if ((await sw.getAttribute('aria-checked')) !== 'true') await sw.click();
  await page.waitForTimeout(1500);
  await page.locator('#devices').screenshot({ path: `${out}/settings-devices.png` });
  // limits: set then clear
  await page.fill('#lim-run', '250');
  await page.press('#lim-run', 'Enter');
  await page.waitForTimeout(600);
  let s = await j('/api/settings');
  if (s.limits.maxPerRun?.amount !== 25000) errors.push(`settings: maxPerRun=${JSON.stringify(s.limits.maxPerRun)}`);
  await page.fill('#lim-run', '');
  await page.press('#lim-run', 'Enter');
  await page.waitForTimeout(600);
  s = await j('/api/settings');
  if (s.limits.maxPerRun) errors.push(`settings: clear maxPerRun failed ${JSON.stringify(s.limits.maxPerRun)}`);
  await page.goto(`${base}/settings#order-mode`, { waitUntil: 'networkidle' });
  await page.getByRole('radio', { name: /Live orders/ }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/settings-live-confirm.png` });
  console.log('✓ settings');
  await c.close();
}

if (want('cmdk')) {
  const { c, page } = await ctx('desktop', 'dark');
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(500);
  await page.keyboard.type('sushi');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/command-palette-dark.png` });
  console.log('✓ cmdk');
  await c.close();
}

if (want('item')) {
  const venues = await j('/api/wolt/venues');
  const v = venues.venues.find((x) => x.online);
  const { c, page } = await ctx('mobile');
  await page.goto(`${base}/explore/${v.slug}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.locator('main button:has(h3)').first().click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/item-sheet-mobile.png` });
  console.log('✓ item sheet');
  await c.close();
}

await browser.close();
console.log(errors.length ? `\nISSUES:\n${[...new Set(errors)].join('\n')}` : '\nno issues');
