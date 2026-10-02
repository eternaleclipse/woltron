// Screenshot every screen at desktop + mobile widths (light, plus a few dark).
// Usage: node scripts/screenshots.mjs [baseUrl=http://127.0.0.1:5173] [outDir=../../docs/screenshots] [filter]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const base = process.argv[2] ?? 'http://127.0.0.1:5173';
const out = resolve(process.argv[3] ?? new URL('../../../docs/screenshots', import.meta.url).pathname);
const filter = process.argv[4];
const full = process.env.FULL === '1';
mkdirSync(out, { recursive: true });

const j = (p) => fetch(base + p).then((r) => r.json());
const presets = await j('/api/presets');
const packs = await j('/api/packs');
const autos = await j('/api/automations');
const runs = await j('/api/runs');
const venues = await j('/api/wolt/venues');
const venue = venues.venues.find((v) => v.online) ?? venues.venues[0];
const multi = presets.find((p) => new Set(p.items.map((i) => i.venueId)).size > 1) ?? presets[0];
const sched = autos.find((a) => a.trigger.type === 'schedule') ?? autos[0];
const run = runs.find((r) => r.venueOrders.length > 1) ?? runs[0];

const shots = [
  ['home', '/'],
  ['fetch', '/fetch'],
  ['explore', '/explore'],
  ['venue', `/explore/${venue?.slug}`],
  ['presets', '/presets'],
  ['preset-editor', `/presets/${multi?.id}`],
  ['packs', '/packs'],
  ['pack-editor', `/packs/${packs[0]?.id}`],
  ['automations', '/automations'],
  ['automation-editor', `/automations/${sched?.id}`],
  ['runs', '/runs'],
  ['run-detail', `/runs/${run?.id}`],
  ['settings', '/settings'],
];

const browser = await chromium.launch();
const vps = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };
for (const [vpName, vp] of Object.entries(vps)) {
  for (const theme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: vpName === 'mobile' ? 2 : 1, colorScheme: theme, isMobile: vpName === 'mobile', hasTouch: vpName === 'mobile' });
    await ctx.addInitScript((t) => localStorage.setItem('woltron.theme', t), theme);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.error('pageerror', e.message));
    for (const [name, path] of shots) {
      const file = `${name}-${vpName}${theme === 'dark' ? '-dark' : ''}.png`;
      if (filter && !file.includes(filter)) continue;
      await page.goto(base + path, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${out}/${file}`, fullPage: full });
      console.log('✓', file);
    }
    await ctx.close();
  }
}
await browser.close();
