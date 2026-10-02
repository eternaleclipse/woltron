// Throwaway stand-in for apps/server/dist/index.js so the desktop shell can be developed
// and tested on its own:  npm -w @woltron/desktop run dev:stub
// Implements the same `startServer()` signature and a sliver of the REST/SSE contract.
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, '../../web/public');
const now = () => new Date().toISOString();

const presets = [
  { id: 'p1', name: 'Friday Ramen', emoji: '🍜', color: 'tangerine', items: [], tags: [], favorite: true, createdAt: now(), updatedAt: now(), runCount: 4, lastRunAt: now() },
  { id: 'p2', name: 'Pizza Night', emoji: '🍕', color: 'coral', items: [], tags: [], favorite: false, createdAt: now(), updatedAt: now(), runCount: 1 },
  { id: 'p3', name: 'Sushi Combo', emoji: '🍣', color: 'plum', items: [], tags: [], favorite: true, createdAt: now(), updatedAt: now(), runCount: 0 },
];
const packs = [
  { id: 'k1', name: 'Random Asian', emoji: '🥢', color: 'tangerine', members: [{ presetId: 'p1', weight: 3 }, { presetId: 'p3', weight: 2 }], strategy: 'fresh', avoidRepeats: 1, cursor: 0, history: [], favorite: true, createdAt: now(), updatedAt: now(), runCount: 2 },
];
const runs = [];
let settings = {
  savedLocations: [], orderMode: 'dry-run', limits: {},
  llm: { model: 'stub', hasApiKey: false, keySource: 'none' },
  wolt: { connected: false }, lan: { enabled: false, port: 4321 },
  appearance: { theme: 'system', reducedMotion: false, mascotName: 'Woltie' },
  notifications: { desktop: true, sound: true }, language: 'en',
};

const page = (url) => `<!doctype html><html><head><meta charset="utf-8"><title>Woltron (stub)</title>
<link rel="icon" href="/favicon.svg">
<style>
  body{margin:0;font-family:system-ui,sans-serif;background:#FFF4E4;color:#2A1A14;display:grid;place-items:center;min-height:100vh}
  main{text-align:center;max-width:640px;padding:24px}
  .row{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
  .row img{width:96px;height:96px}
  h1{font-size:44px;margin:8px 0}
  code{background:#FFE6C7;padding:2px 6px;border-radius:6px}
  #route{color:#FF7A1A;font-weight:700}
  a{color:#FF5A3C}
</style></head><body><main>
<img src="/mascot/happy.png" width="220" height="220" alt="Woltie">
<h1>Woltron desktop shell</h1>
<p>Stub server at <code>${url}</code> · route <span id="route"></span></p>
<div class="row">${['idle', 'happy', 'sniffing', 'sleeping', 'eating', 'sad'].map((s) => `<img src="/mascot/${s}.png" alt="${s}" title="${s}">`).join('')}</div>
<p id="bridge"></p>
<p><a href="https://wolt.com" target="_blank">External link test (opens browser)</a></p>
<script>
  const show = () => document.getElementById('route').textContent = location.pathname + location.hash;
  show();
  const b = window.woltronDesktop;
  document.getElementById('bridge').textContent = b ? 'window.woltronDesktop ✓ (' + b.platform + ')' : 'no desktop bridge';
  if (b) {
    b.onNavigate((p) => { history.pushState(null, '', p); show(); });
    b.getLaunchAtLogin().then((v) => document.getElementById('bridge').textContent += ' · launchAtLogin=' + v);
  }
</script></main></body></html>`;

const types = { '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

export async function startServer(opts = {}) {
  const events = new EventEmitter();
  const clients = new Set();
  const broadcast = (ev) => {
    events.emit('event', ev);
    for (const res of clients) res.write(`data: ${JSON.stringify(ev)}\n\n`);
  };
  const json = (res, code, body) => {
    res.writeHead(code, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const readBody = (req) => new Promise((r) => {
    let s = '';
    req.on('data', (c) => (s += c));
    req.on('end', () => r(s ? JSON.parse(s) : {}));
  });

  let url = '';
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    const p = u.pathname;
    const key = `${req.method} ${p}`;
    if (p.startsWith('/api/')) console.log('[stub]', key);
    if (key === 'GET /api/health') return json(res, 200, { ok: true, version: 'stub', mockWolt: true });
    if (key === 'GET /api/presets') return json(res, 200, presets);
    if (key === 'GET /api/packs') return json(res, 200, packs);
    if (key === 'GET /api/runs') return json(res, 200, runs.slice(0, Number(u.searchParams.get('limit')) || 20));
    if (key === 'GET /api/settings') return json(res, 200, settings);
    if (key === 'PATCH /api/settings') {
      settings = { ...settings, ...(await readBody(req)) };
      broadcast({ type: 'settings.updated', settings });
      return json(res, 200, settings);
    }
    if (key === 'POST /api/runs') {
      const body = await readBody(req);
      const preset = body.target.kind === 'preset' ? presets.find((x) => x.id === body.target.id) : presets[0];
      const pack = body.target.kind === 'pack' ? packs.find((x) => x.id === body.target.id) : undefined;
      if (!preset) return json(res, 404, { error: 'not_found', message: 'No such preset' });
      const run = {
        id: 'r' + Date.now().toString(36), createdAt: now(), updatedAt: now(), source: body.source ?? 'manual',
        mode: settings.orderMode, status: 'pending', target: body.target, presetId: preset.id, presetName: preset.name,
        packId: pack?.id, packName: pack?.name, venueOrders: [], total: { amount: 5800, currency: 'ILS' }, log: [],
      };
      runs.unshift(run);
      broadcast({ type: 'run.updated', run });
      setTimeout(() => {
        Object.assign(run, { status: 'simulated', updatedAt: now() });
        broadcast({ type: 'run.updated', run });
        broadcast({ type: 'notification', level: 'success', title: `${preset.emoji} ${preset.name} — dry run done`, body: 'Woltie fetched it (pretend mode).', runId: run.id });
      }, 1500);
      return json(res, 200, run);
    }
    const confirm = p.match(/^\/api\/runs\/([^/]+)\/confirm$/);
    if (req.method === 'POST' && confirm) {
      const run = runs.find((r) => r.id === confirm[1]);
      if (!run) return json(res, 404, { error: 'not_found', message: 'No such run' });
      Object.assign(run, { status: 'simulated', updatedAt: now() });
      broadcast({ type: 'run.updated', run });
      return json(res, 200, run);
    }
    if (key === 'GET /api/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      res.write(`data: ${JSON.stringify({ type: 'hello', serverTime: now(), version: 'stub' })}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (p.startsWith('/api/')) return json(res, 404, { error: 'not_found', message: 'stub' });
    // static: public assets, else SPA page
    const ext = path.extname(p);
    if (types[ext]) {
      try {
        const file = path.join(publicDir, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
        const data = await readFile(file);
        res.writeHead(200, { 'content-type': types[ext] });
        return res.end(data);
      } catch {
        res.writeHead(404);
        return res.end();
      }
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(page(url));
  });

  const host = opts.host ?? '127.0.0.1';
  await new Promise((r) => server.listen(opts.port ?? 4321, host, r));
  const port = server.address().port;
  url = `http://${host}:${port}`;
  // Simulate an automation asking for confirmation shortly after boot (WOLTRON_STUB_ASK=1).
  if (process.env.WOLTRON_STUB_ASK) {
    setTimeout(() => {
      const run = { id: 'ask1', createdAt: now(), updatedAt: now(), source: 'schedule', mode: 'dry-run', status: 'awaiting-confirmation', target: { kind: 'preset', id: 'p1' }, presetId: 'p1', presetName: 'Friday Ramen', venueOrders: [], total: { amount: 6400, currency: 'ILS' }, log: [] };
      runs.unshift(run);
      broadcast({ type: 'run.updated', run });
    }, 4000);
  }
  return {
    url, port, events,
    close: () => new Promise((r) => {
      for (const c of clients) c.end();
      server.close(() => r());
    }),
  };
}
