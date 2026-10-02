import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Automation, Pack, Preset, Run, Settings } from '@woltron/shared';
import { createApp, type AppContext } from '../src/app.js';
import { RunEngine } from '../src/engine.js';
import { EventHub } from '../src/events.js';
import { Scheduler } from '../src/scheduler.js';
import { seedDemoData } from '../src/seed.js';
import { Store } from '../src/store.js';
import { createFallbackMockClient } from '../src/wolt/fallback-mock.js';
import { tmpDir } from './helpers.js';

let ctx: AppContext;
let app: ReturnType<typeof createApp>;
let scheduler: Scheduler;

const LOCAL = { incoming: { socket: { remoteAddress: '127.0.0.1' } } };
const REMOTE = { incoming: { socket: { remoteAddress: '192.168.1.50' } } };

async function call<T = unknown>(method: string, path: string, body?: unknown, env: object = LOCAL, headers: Record<string, string> = {}) {
  const res = await app.request(
    path,
    { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) },
    env as never,
  );
  return { status: res.status, body: (await res.json().catch(() => undefined)) as T };
}

beforeEach(async () => {
  const store = new Store(tmpDir(), 0);
  const events = new EventHub();
  const wolt = createFallbackMockClient({ latencyMs: 0 });
  const engine = new RunEngine({ store, events, wolt: () => wolt });
  scheduler = new Scheduler({ store, events, engine, wolt: () => wolt });
  await seedDemoData(store, wolt, () => undefined);
  ctx = { store, events, engine, scheduler, wolt: () => wolt, mockWolt: true, woltConnection: { connected: false }, port: () => 4321 };
  app = createApp(ctx);
});
afterEach(() => scheduler.stop());

describe('auth', () => {
  it('trusts loopback, requires the pairing token from LAN', async () => {
    expect((await call('GET', '/api/presets')).status).toBe(200);
    const denied = await call<{ error: string }>('GET', '/api/presets', undefined, REMOTE);
    expect(denied.status).toBe(401);
    expect(denied.body.error).toBe('unauthorized');
    const token = ctx.store.secrets.pairingToken;
    expect((await call('GET', '/api/presets', undefined, REMOTE, { authorization: `Bearer ${token}` })).status).toBe(200);
    expect((await call('GET', `/api/presets?token=${token}`, undefined, REMOTE)).status).toBe(200);
    expect((await call('GET', '/api/presets?token=wrong', undefined, REMOTE)).status).toBe(401);
  });

  it('webhooks are authenticated only by their secret', async () => {
    const hook = ctx.store.data.automations.find((a) => a.trigger.type === 'webhook')!;
    const secret = (hook.trigger as { secret: string }).secret;
    expect((await call('POST', `/api/hooks/${hook.id}/nope`, undefined, REMOTE)).status).toBe(404);
    const ok = await call<{ runId: string }>('POST', `/api/hooks/${hook.id}/${secret}`, undefined, REMOTE);
    expect(ok.status).toBe(200);
    expect(ctx.store.getRun(ok.body.runId)!.source).toBe('webhook');
  });
});

describe('settings', () => {
  it('derives llm/wolt fields and never leaks secrets', async () => {
    const prev = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    try {
      let s = (await call<Settings>('GET', '/api/settings')).body;
      expect(s.llm).toMatchObject({ hasApiKey: false, keySource: 'none' });
      s = (await call<Settings>('PATCH', '/api/settings', { llm: { apiKey: 'sk-secret-123' }, limits: { maxPerRun: { amount: 10000, currency: 'ILS' } } })).body;
      expect(s.llm).toMatchObject({ hasApiKey: true, keySource: 'stored' });
      expect(s.limits.maxPerRun?.amount).toBe(10000);
      expect(JSON.stringify(s)).not.toContain('sk-secret-123');
      s = (await call<Settings>('PATCH', '/api/settings', { llm: { apiKey: null }, limits: { maxPerRun: null } })).body;
      expect(s.llm.keySource).toBe('none');
      expect(s.limits.maxPerRun).toBeUndefined();
      process.env.OPENROUTER_API_KEY = 'env-key';
      expect((await call<Settings>('GET', '/api/settings')).body.llm.keySource).toBe('env');
    } finally {
      if (prev === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = prev;
    }
  });

  it('validates patches', async () => {
    const r = await call<{ error: string }>('PATCH', '/api/settings', { orderMode: 'yolo' });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('validation');
  });
});

describe('seed + CRUD + runs', () => {
  it('seeds presets, packs and automations with real ids', async () => {
    const presets = (await call<Preset[]>('GET', '/api/presets')).body;
    expect(presets.length).toBeGreaterThanOrEqual(4);
    expect(presets.some((p) => new Set(p.items.map((i) => i.venueId)).size > 1)).toBe(true);
    const packs = (await call<Pack[]>('GET', '/api/packs')).body;
    expect(packs.find((p) => p.name === 'Random Asian')?.strategy).toBe('fresh');
    const autos = (await call<Automation[]>('GET', '/api/automations')).body;
    expect(autos.map((a) => a.trigger.type).sort()).toEqual(['schedule', 'webhook']);
  });

  it('create preset → dry-run → simulated', async () => {
    const menu = await ctx.wolt().getMenu('kaido');
    const it0 = menu.items[0]!;
    const created = await call<Preset>('POST', '/api/presets', {
      name: 'Test',
      items: [{ key: 'k1', venueId: it0.venueId, venueSlug: 'kaido', venueName: 'Kaido', itemId: it0.id, name: it0.name, unitPrice: it0.price, quantity: 1, options: [] }],
    });
    expect(created.status).toBe(201);
    expect(created.body.runCount).toBe(0);
    const run = await call<Run>('POST', '/api/runs', { target: { kind: 'preset', id: created.body.id } });
    expect(run.status).toBe(201);
    expect(run.body.status).toBe('simulated');
    expect(run.body.mode).toBe('dry-run');
    expect((await call<Preset>('GET', `/api/presets/${created.body.id}`)).body.runCount).toBe(1);
    expect((await call('POST', '/api/runs', { target: { kind: 'preset', id: 'missing' } })).status).toBe(404);
  });

  it('deleting a preset removes it from packs', async () => {
    const pack = ctx.store.data.packs[0]!;
    const victim = pack.members[0]!.presetId;
    expect((await call('DELETE', `/api/presets/${victim}`)).status).toBe(200);
    expect(ctx.store.getPack(pack.id)!.members.some((m) => m.presetId === victim)).toBe(false);
  });

  it('automations: schedule gets a label + nextFireAt; webhook secret is server-owned', async () => {
    const target = { kind: 'preset', id: ctx.store.data.presets[0]!.id };
    const a = (await call<Automation>('POST', '/api/automations', { name: 'Fri', target, trigger: { type: 'schedule', cron: '0 19 * * 5', timezone: 'Asia/Jerusalem' } })).body;
    expect(a.trigger).toMatchObject({ humanLabel: 'Fridays at 19:00' });
    expect(a.nextFireAt).toBeDefined();
    const h = (await call<Automation>('POST', '/api/automations', { name: 'Hook', target, trigger: { type: 'webhook', secret: 'mine' } })).body;
    const secret = (h.trigger as { secret: string }).secret;
    expect(secret).not.toBe('mine');
    const put = (await call<Automation>('PUT', `/api/automations/${h.id}`, { name: 'Hook 2', target, trigger: { type: 'webhook', secret: 'x' } })).body;
    expect((put.trigger as { secret: string }).secret).toBe(secret);
    const rotated = (await call<Automation>('POST', `/api/automations/${h.id}/rotate-secret`)).body;
    expect((rotated.trigger as { secret: string }).secret).not.toBe(secret);
    const bad = await call<{ error: string }>('POST', '/api/automations', { name: 'Bad', target, trigger: { type: 'schedule', cron: '61 * * * *', timezone: 'UTC' } });
    expect(bad.status).toBe(400);
  });

  it('pack preview', async () => {
    const pack = ctx.store.data.packs.find((p) => p.strategy === 'fresh')!;
    const pv = (await call<{ odds: Array<{ probability: number }> }>('GET', `/api/packs/${pack.id}/preview`)).body;
    expect(pv.odds.reduce((s, o) => s + o.probability, 0)).toBeCloseTo(1);
  });

  it('describe-cron', async () => {
    const r = await call<{ label: string; next: string[] }>('POST', '/api/automations/describe-cron', { cron: '30 12 * * 1-5', timezone: 'Asia/Jerusalem' });
    expect(r.body.label).toBe('Weekdays at 12:30');
    expect(r.body.next).toHaveLength(5);
  });
});
