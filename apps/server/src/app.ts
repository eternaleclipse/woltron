/**
 * Hono app: REST routes (see packages/shared/src/api.ts), SSE, auth, static SPA.
 */
import { timingSafeEqual } from 'node:crypto';
import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import type { HttpBindings } from '@hono/node-server';
import { nanoid } from 'nanoid';
import type {
  Automation,
  GeoLocation,
  Pack,
  Preset,
  Settings,
  WoltClient,
  WoltConnection,
} from '@woltron/shared';
import { normalizeRefreshToken } from '@woltron/shared';
import { DEFAULT_LOCATION, VERSION } from './config.js';
import { describeCron, nextRuns, validateCron, validateTimezone } from './cron.js';
import type { RunEngine } from './engine.js';
import { badRequest, errorMessage, HttpError, isWoltError, notFound, toHttpError } from './errors.js';
import type { EventHub } from './events.js';
import { runFetch } from './fetch.js';
import { previewPack } from './packs.js';
import { pairingInfo } from './pairing.js';
import type { Scheduler } from './scheduler.js';
import { serveSpa } from './static.js';
import type { Store } from './store.js';
import {
  automationInput,
  describeCronRequest,
  fetchRequest,
  packInput,
  parse,
  presetInput,
  runRequest,
  settingsPatch,
} from './validation.js';
import { TTL, TtlCache } from './wolt/cache.js';

export interface AppContext {
  store: Store;
  events: EventHub;
  engine: RunEngine;
  scheduler: Scheduler;
  wolt: () => WoltClient;
  mockWolt: boolean;
  /** Last known Wolt connection state (refreshed on auth routes and at startup). */
  woltConnection: WoltConnection;
  /** Port actually bound (for pairing URLs). */
  port: () => number;
  webDir?: string;
  /** Called when `lan.enabled` flips so the listener can rebind. */
  onLanChange?: (enabled: boolean) => void | Promise<void>;
  cache?: TtlCache;
  log?: (msg: string) => void;
}

type Env = { Bindings: HttpBindings };

const LOOPBACK = /^(127\.|::1$|::ffff:127\.)/;
export function isLoopback(c: Context<Env>): boolean {
  const addr = c.env?.incoming?.socket?.remoteAddress;
  return typeof addr === 'string' && LOOPBACK.test(addr);
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

const DEV_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;

export function publicSettings(ctx: AppContext): Settings {
  const s = ctx.store.data.settings;
  const envKey = !!process.env.OPENROUTER_API_KEY?.trim();
  const stored = !!ctx.store.secrets.openrouterKey;
  return {
    ...structuredClone(s),
    llm: { model: s.llm.model, hasApiKey: envKey || stored, keySource: envKey ? 'env' : stored ? 'stored' : 'none' },
    wolt: { ...ctx.woltConnection },
  };
}

export function llmKey(ctx: AppContext): string | undefined {
  return process.env.OPENROUTER_API_KEY?.trim() || ctx.store.secrets.openrouterKey || undefined;
}

async function body(c: Context): Promise<unknown> {
  const text = await c.req.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw badRequest('Request body must be JSON');
  }
}

function num(v: string | undefined): number | undefined {
  if (v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function createApp(ctx: AppContext) {
  const { store, events, engine, scheduler } = ctx;
  const cache = ctx.cache ?? new TtlCache();
  const app = new Hono<Env>();
  const now = () => new Date().toISOString();

  const location = (c: Context): GeoLocation => {
    const lat = num(c.req.query('lat'));
    const lon = num(c.req.query('lon'));
    if (lat !== undefined && lon !== undefined) return { lat, lon };
    return store.data.settings.location ?? DEFAULT_LOCATION;
  };
  const locKey = (l: GeoLocation) => `${l.lat.toFixed(4)},${l.lon.toFixed(4)}`;

  app.onError((err, c) => {
    const e = toHttpError(err);
    if (e.status >= 500) ctx.log?.(`[woltron] ${c.req.method} ${c.req.path} → ${e.status} ${e.message}`);
    return c.json(e.toJSON(), e.status as 400);
  });

  // ── CORS (dev: Vite on :5173) ──
  app.use(
    '/api/*',
    cors({
      origin: (origin) => (origin && DEV_ORIGIN.test(origin) ? origin : null),
      allowHeaders: ['Authorization', 'Content-Type'],
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      maxAge: 600,
    }),
  );

  // ── Auth: loopback trusted; LAN needs the pairing token; hooks use their own secret ──
  app.use('/api/*', async (c, next) => {
    if (c.req.method === 'OPTIONS' || c.req.path.startsWith('/api/hooks/') || c.req.path === '/api/health') return next();
    if (isLoopback(c)) return next();
    const header = c.req.header('authorization');
    const token = header?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? c.req.query('token');
    if (token && safeEqual(token, store.secrets.pairingToken)) return next();
    throw new HttpError(401, 'unauthorized', 'Pair this device first: scan the QR code in Settings → Devices');
  });

  // ── Health ──
  app.get('/api/health', (c) => c.json({ ok: true as const, version: VERSION, mockWolt: ctx.mockWolt }));

  // ── SSE ──
  app.get('/api/events', (c) =>
    streamSSE(c, async (stream) => {
      const queue: string[] = [];
      let wake: (() => void) | undefined;
      const unsub = events.subscribe((e) => {
        queue.push(JSON.stringify(e));
        wake?.();
      });
      const ping = setInterval(() => {
        stream.writeSSE({ event: 'ping', data: now() }).catch(() => undefined);
      }, 25_000);
      stream.onAbort(() => {
        clearInterval(ping);
        unsub();
        wake?.();
      });
      try {
        await stream.writeSSE({ data: JSON.stringify({ type: 'hello', serverTime: now(), version: VERSION }) });
        while (!stream.aborted) {
          while (queue.length && !stream.aborted) await stream.writeSSE({ data: queue.shift()! });
          if (stream.aborted) break;
          await new Promise<void>((r) => (wake = r));
          wake = undefined;
        }
      } finally {
        clearInterval(ping);
        unsub();
      }
    }),
  );

  // ── Settings ──
  app.get('/api/settings', (c) => c.json(publicSettings(ctx)));
  app.patch('/api/settings', async (c) => {
    const p = parse(settingsPatch, await body(c));
    const s = store.data.settings;
    const lanBefore = s.lan.enabled;
    if (p.location === null) delete s.location;
    else if (p.location) s.location = p.location;
    if (p.savedLocations) s.savedLocations = p.savedLocations;
    if (p.orderMode) s.orderMode = p.orderMode;
    if (p.limits) {
      for (const k of ['maxPerRun', 'maxPerDay'] as const) {
        const v = p.limits[k];
        if (v === null) delete s.limits[k];
        else if (v) s.limits[k] = v;
      }
    }
    if (p.llm?.model) s.llm.model = p.llm.model;
    if (p.llm && 'apiKey' in p.llm) {
      const k = p.llm.apiKey?.trim();
      store.updateSecrets({ openrouterKey: k ? k : undefined });
    }
    if (p.lan) s.lan = { ...s.lan, ...p.lan };
    if (p.appearance) s.appearance = { ...s.appearance, ...p.appearance };
    if (p.notifications) s.notifications = { ...s.notifications, ...p.notifications };
    if (p.language) s.language = p.language;
    store.save();
    if (p.location !== undefined) cache.clear();
    const settings = publicSettings(ctx);
    events.publish({ type: 'settings.updated', settings });
    if (s.lan.enabled !== lanBefore && ctx.onLanChange) {
      // Rebind after this response has been flushed (rebinding drops open connections).
      const enabled = s.lan.enabled;
      setTimeout(() => void Promise.resolve(ctx.onLanChange?.(enabled)).catch((e) => ctx.log?.(`[woltron] rebind failed: ${errorMessage(e)}`)), 250);
    }
    return c.json(settings);
  });

  // ── Wolt auth ──
  const setConnection = (conn: WoltConnection) => {
    ctx.woltConnection = conn;
    events.publish({ type: 'settings.updated', settings: publicSettings(ctx) });
    return conn;
  };
  app.get('/api/wolt/auth', async (c) => {
    try {
      ctx.woltConnection = await ctx.wolt().connection();
    } catch (e) {
      ctx.woltConnection = { ...ctx.woltConnection, lastError: errorMessage(e) };
    }
    return c.json(ctx.woltConnection);
  });
  app.post('/api/wolt/auth/token', async (c) => {
    const b = (await body(c)) as { refreshToken?: unknown };
    const token = typeof b.refreshToken === 'string' ? normalizeRefreshToken(b.refreshToken) : '';
    if (!token) throw badRequest('Paste your Wolt refresh token');
    const prev = store.secrets.woltTokens;
    store.updateSecrets({ woltTokens: { refreshToken: token } });
    try {
      return c.json(setConnection(await ctx.wolt().connectWithRefreshToken(token)));
    } catch (e) {
      store.updateSecrets({ woltTokens: prev });
      ctx.wolt().setTokens(prev ?? null);
      setConnection({ connected: false, lastError: errorMessage(e) });
      throw e;
    }
  });
  app.post('/api/wolt/auth/login', async (c) => {
    const b = (await body(c)) as { email?: unknown };
    if (typeof b.email !== 'string' || !b.email.includes('@')) throw badRequest('Enter a valid email');
    const w = ctx.wolt();
    if (!w.requestMagicLink) throw new HttpError(501, 'unsupported', 'Email login isn’t supported yet — paste a refresh token instead');
    try {
      await w.requestMagicLink(b.email.trim());
    } catch (e) {
      if (isWoltError(e) && e.code === 'unsupported')
        throw new HttpError(
          501,
          'wolt_unsupported',
          'Wolt wants a captcha before it emails a login link, so I can’t ask for one. Request the link on wolt.com, then paste the link from the email here (or paste a refresh token).',
        );
      throw e;
    }
    return c.json({ sent: true });
  });
  app.post('/api/wolt/auth/verify', async (c) => {
    const b = (await body(c)) as { linkOrCode?: unknown };
    if (typeof b.linkOrCode !== 'string' || !b.linkOrCode.trim()) throw badRequest('Paste the link or code from the email');
    const w = ctx.wolt();
    if (!w.verifyMagicLink) throw new HttpError(501, 'unsupported', 'Email login isn’t supported yet — paste a refresh token instead');
    return c.json(setConnection(await w.verifyMagicLink(b.linkOrCode.trim())));
  });
  app.delete('/api/wolt/auth', (c) => {
    ctx.wolt().setTokens(null);
    store.updateSecrets({ woltTokens: undefined });
    return c.json(setConnection({ connected: false }));
  });

  // ── Pairing ──
  const pairing = () => pairingInfo({ enabled: store.data.settings.lan.enabled, port: ctx.port(), token: store.secrets.pairingToken });
  app.get('/api/pairing', async (c) => c.json(await pairing()));
  app.post('/api/pairing/rotate', async (c) => {
    store.updateSecrets({ pairingToken: nanoid(32) });
    return c.json(await pairing());
  });

  // ── Catalog proxy ──
  app.get('/api/wolt/geocode', async (c) => {
    const q = c.req.query('q')?.trim();
    if (!q) throw badRequest('Missing ?q=');
    return c.json(await cache.get(`geo:${q.toLowerCase()}`, TTL.geocode, () => ctx.wolt().geocode(q)));
  });
  app.get('/api/wolt/venues', async (c) => {
    const loc = location(c);
    const res = await cache.get(`venues:${locKey(loc)}`, TTL.venues, () => ctx.wolt().listVenues(loc));
    const tag = c.req.query('tag')?.toLowerCase();
    if (!tag) return c.json(res);
    return c.json({ ...res, venues: res.venues.filter((v) => v.tags.some((t) => t.toLowerCase() === tag)) });
  });
  app.get('/api/wolt/venues/:slug', async (c) => {
    const loc = location(c);
    const slug = c.req.param('slug');
    return c.json(await cache.get(`venue:${slug}:${locKey(loc)}`, TTL.venue, () => ctx.wolt().getVenue(slug, loc)));
  });
  app.get('/api/wolt/venues/:slug/menu', async (c) => {
    const loc = location(c);
    const slug = c.req.param('slug');
    return c.json(await cache.get(`menu:${slug}:${locKey(loc)}`, TTL.menu, () => ctx.wolt().getMenu(slug, loc)));
  });
  app.get('/api/wolt/search', async (c) => {
    const q = c.req.query('q')?.trim();
    if (!q) throw badRequest('Missing ?q=');
    const loc = location(c);
    return c.json(await cache.get(`search:${q.toLowerCase()}:${locKey(loc)}`, TTL.search, () => ctx.wolt().search(q, loc)));
  });

  // ── Presets ──
  app.get('/api/presets', (c) => c.json(store.data.presets));
  app.get('/api/presets/:id', (c) => {
    const p = store.getPreset(c.req.param('id'));
    if (!p) throw notFound('Preset');
    return c.json(p);
  });
  app.post('/api/presets', async (c) => {
    const input = parse(presetInput, await body(c));
    const t = now();
    const preset: Preset = { ...input, id: nanoid(10), createdAt: t, updatedAt: t, runCount: 0 };
    store.mutate((d) => d.presets.push(preset));
    events.publish({ type: 'preset.changed', id: preset.id });
    return c.json(preset, 201);
  });
  app.put('/api/presets/:id', async (c) => {
    const existing = store.getPreset(c.req.param('id'));
    if (!existing) throw notFound('Preset');
    const input = parse(presetInput, await body(c));
    const updated: Preset = { ...input, id: existing.id, createdAt: existing.createdAt, updatedAt: now(), runCount: existing.runCount, lastRunAt: existing.lastRunAt };
    store.mutate((d) => (d.presets[d.presets.indexOf(existing)] = updated));
    events.publish({ type: 'preset.changed', id: existing.id });
    return c.json(updated);
  });
  app.delete('/api/presets/:id', (c) => {
    const id = c.req.param('id');
    if (!store.getPreset(id)) throw notFound('Preset');
    const touchedPacks: string[] = [];
    store.mutate((d) => {
      d.presets = d.presets.filter((p) => p.id !== id);
      for (const pack of d.packs) {
        if (pack.members.some((m) => m.presetId === id)) {
          pack.members = pack.members.filter((m) => m.presetId !== id);
          pack.updatedAt = now();
          touchedPacks.push(pack.id);
        }
      }
    });
    events.publish({ type: 'preset.changed', id });
    for (const p of touchedPacks) events.publish({ type: 'pack.changed', id: p });
    return c.json({ ok: true as const });
  });
  app.post('/api/presets/:id/duplicate', (c) => {
    const src = store.getPreset(c.req.param('id'));
    if (!src) throw notFound('Preset');
    const t = now();
    const copy: Preset = {
      ...structuredClone(src),
      id: nanoid(10),
      name: `${src.name} (copy)`,
      items: src.items.map((i) => ({ ...structuredClone(i), key: nanoid(8) })),
      favorite: false,
      createdAt: t,
      updatedAt: t,
      runCount: 0,
      lastRunAt: undefined,
    };
    store.mutate((d) => d.presets.push(copy));
    events.publish({ type: 'preset.changed', id: copy.id });
    return c.json(copy, 201);
  });

  // ── Packs ──
  const presetExists = (id: string) => !!store.getPreset(id);
  const checkMembers = (members: Pack['members']) => {
    const missing = members.filter((m) => !presetExists(m.presetId));
    if (missing.length) throw badRequest(`Unknown preset id(s): ${missing.map((m) => m.presetId).join(', ')}`, 'validation');
  };
  app.get('/api/packs', (c) => c.json(store.data.packs));
  app.get('/api/packs/:id', (c) => {
    const p = store.getPack(c.req.param('id'));
    if (!p) throw notFound('Pack');
    return c.json(p);
  });
  app.post('/api/packs', async (c) => {
    const input = parse(packInput, await body(c));
    checkMembers(input.members);
    const t = now();
    const pack: Pack = { ...input, id: nanoid(10), cursor: 0, history: [], createdAt: t, updatedAt: t, runCount: 0 };
    store.mutate((d) => d.packs.push(pack));
    events.publish({ type: 'pack.changed', id: pack.id });
    return c.json(pack, 201);
  });
  app.put('/api/packs/:id', async (c) => {
    const existing = store.getPack(c.req.param('id'));
    if (!existing) throw notFound('Pack');
    const input = parse(packInput, await body(c));
    checkMembers(input.members);
    const updated: Pack = {
      ...input,
      id: existing.id,
      cursor: input.strategy === existing.strategy ? existing.cursor : 0,
      history: existing.history,
      createdAt: existing.createdAt,
      updatedAt: now(),
      runCount: existing.runCount,
      lastRunAt: existing.lastRunAt,
    };
    store.mutate((d) => (d.packs[d.packs.indexOf(existing)] = updated));
    events.publish({ type: 'pack.changed', id: existing.id });
    return c.json(updated);
  });
  app.delete('/api/packs/:id', (c) => {
    const id = c.req.param('id');
    if (!store.getPack(id)) throw notFound('Pack');
    store.mutate((d) => (d.packs = d.packs.filter((p) => p.id !== id)));
    events.publish({ type: 'pack.changed', id });
    return c.json({ ok: true as const });
  });
  app.get('/api/packs/:id/preview', (c) => {
    const p = store.getPack(c.req.param('id'));
    if (!p) throw notFound('Pack');
    return c.json(previewPack(p, presetExists));
  });

  // ── Automations ──
  const checkTarget = (t: Automation['target']) => {
    if (t.kind === 'preset' && !store.getPreset(t.id)) throw badRequest('Target preset not found', 'validation');
    if (t.kind === 'pack' && !store.getPack(t.id)) throw badRequest('Target pack not found', 'validation');
  };
  const normalizeTrigger = (trigger: ReturnType<typeof parse<typeof automationInput>>['trigger'], existing?: Automation): Automation['trigger'] => {
    switch (trigger.type) {
      case 'schedule': {
        validateTimezone(trigger.timezone);
        validateCron(trigger.cron, trigger.timezone).stop();
        const prevCron = existing?.trigger.type === 'schedule' ? existing.trigger.cron : undefined;
        const humanLabel = trigger.humanLabel && trigger.cron === prevCron ? trigger.humanLabel : trigger.humanLabel || describeCron(trigger.cron);
        return { type: 'schedule', cron: trigger.cron.trim(), timezone: trigger.timezone, humanLabel };
      }
      case 'once':
        return { type: 'once', at: new Date(trigger.at).toISOString() };
      case 'webhook':
        // Secrets are server-owned: keep the existing one, generate on create. Rotate via /rotate-secret.
        return { type: 'webhook', secret: existing?.trigger.type === 'webhook' ? existing.trigger.secret : nanoid(24) };
      case 'venue-online':
        return { type: 'venue-online', venueSlug: trigger.venueSlug, venueName: trigger.venueName };
    }
  };
  const getAutomation = (id: string) => {
    const a = store.getAutomation(id);
    if (!a) throw notFound('Automation');
    return a;
  };
  app.get('/api/automations', (c) => c.json(store.data.automations));
  app.post('/api/automations/describe-cron', async (c) => {
    const { cron, timezone } = parse(describeCronRequest, await body(c));
    return c.json({ label: describeCron(cron), next: nextRuns(cron, timezone, 5) });
  });
  app.get('/api/automations/:id', (c) => c.json(getAutomation(c.req.param('id'))));
  app.post('/api/automations', async (c) => {
    const input = parse(automationInput, await body(c));
    checkTarget(input.target);
    const t = now();
    const a: Automation = { ...input, trigger: normalizeTrigger(input.trigger), id: nanoid(10), createdAt: t, updatedAt: t, fireCount: 0 };
    store.mutate((d) => d.automations.push(a));
    scheduler.sync(a.id, false);
    events.publish({ type: 'automation.changed', id: a.id });
    return c.json(a, 201);
  });
  app.put('/api/automations/:id', async (c) => {
    const existing = getAutomation(c.req.param('id'));
    const input = parse(automationInput, await body(c));
    checkTarget(input.target);
    const updated: Automation = {
      ...input,
      trigger: normalizeTrigger(input.trigger, existing),
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: now(),
      lastFiredAt: existing.lastFiredAt,
      fireCount: existing.fireCount,
    };
    store.mutate((d) => (d.automations[d.automations.indexOf(existing)] = updated));
    if (updated.trigger.type !== 'venue-online' || existing.trigger.type !== 'venue-online' || updated.trigger.venueSlug !== existing.trigger.venueSlug)
      delete store.data.meta.venueOnline[updated.id];
    scheduler.sync(updated.id, false);
    events.publish({ type: 'automation.changed', id: updated.id });
    return c.json(store.getAutomation(updated.id));
  });
  app.delete('/api/automations/:id', (c) => {
    const id = getAutomation(c.req.param('id')).id;
    scheduler.unschedule(id);
    store.mutate((d) => {
      d.automations = d.automations.filter((a) => a.id !== id);
      delete d.meta.venueOnline[id];
    });
    events.publish({ type: 'automation.changed', id });
    return c.json({ ok: true as const });
  });
  app.post('/api/automations/:id/fire', async (c) => {
    const a = getAutomation(c.req.param('id'));
    checkTarget(a.target);
    return c.json(await scheduler.fire(a));
  });
  app.post('/api/automations/:id/rotate-secret', (c) => {
    const a = getAutomation(c.req.param('id'));
    if (a.trigger.type !== 'webhook') throw badRequest('Only webhook automations have a secret');
    a.trigger.secret = nanoid(24);
    a.updatedAt = now();
    store.save();
    events.publish({ type: 'automation.changed', id: a.id });
    return c.json(a);
  });

  // ── Webhooks (secret-authenticated) ──
  const hook = async (c: Context<Env>) => {
    const a = store.getAutomation(c.req.param('id') ?? '');
    const secret = c.req.param('secret') ?? '';
    if (!a || a.trigger.type !== 'webhook' || !safeEqual(secret, a.trigger.secret)) throw notFound('Webhook');
    if (!a.enabled) throw new HttpError(409, 'disabled', 'This automation is turned off');
    const run = await scheduler.fire(a, 'webhook');
    return c.json({ runId: run.id, status: run.status });
  };
  app.post('/api/hooks/:id/:secret', hook);
  app.get('/api/hooks/:id/:secret', hook); // convenience for simple URL-only integrations

  // ── Runs ──
  app.get('/api/runs', (c) => {
    const limit = Math.max(1, Math.min(500, Math.floor(num(c.req.query('limit')) ?? 50)));
    return c.json(store.data.runs.slice(0, limit));
  });
  app.post('/api/runs', async (c) => {
    const req = parse(runRequest, await body(c));
    engine.assertTarget(req.target);
    return c.json(await engine.start(req), 201);
  });
  app.get('/api/runs/:id', (c) => {
    const r = store.getRun(c.req.param('id'));
    if (!r) throw notFound('Run');
    return c.json(r);
  });
  app.post('/api/runs/:id/confirm', async (c) => c.json(await engine.confirm(c.req.param('id'))));
  app.post('/api/runs/:id/cancel', (c) => c.json(engine.cancel(c.req.param('id'))));

  // ── Fetch (LLM) ──
  app.post('/api/fetch', async (c) => {
    const { query, limit } = parse(fetchRequest, await body(c));
    const res = await runFetch(query, limit ?? 8, {
      wolt: ctx.wolt(),
      location: store.data.settings.location ?? DEFAULT_LOCATION,
      apiKey: llmKey(ctx),
      model: store.data.settings.llm.model,
      log: ctx.log,
    });
    return c.json(res);
  });

  app.all('/api/*', () => {
    throw new HttpError(404, 'not_found', 'No such API route');
  });

  // ── SPA ──
  app.get('*', serveSpa(ctx.webDir));

  return app;
}
