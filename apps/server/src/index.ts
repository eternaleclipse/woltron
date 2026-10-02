/**
 * Programmatic entry — Electron imports this and calls `startServer()`.
 */
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { createAdaptorServer } from '@hono/node-server';
import type { WoltConnection } from '@woltron/shared';
import { createApp, type AppContext } from './app.js';
import { DEFAULT_PORT, VERSION, defaultDataDir, envMock, envPort } from './config.js';
import { RunEngine } from './engine.js';
import { errorMessage } from './errors.js';
import { EventHub } from './events.js';
import { Scheduler } from './scheduler.js';
import { seedDemoData } from './seed.js';
import { Store } from './store.js';
import { loadWoltClient } from './wolt/index.js';

export { VERSION } from './config.js';
export type { EventHub } from './events.js';

export interface StartServerOptions {
  /** Port to bind (0 = random free port). Default: env WOLTRON_PORT → settings.lan.port → 4321. */
  port?: number;
  /** Host to bind. Default: 127.0.0.1, or 0.0.0.0 when LAN access is enabled in settings. */
  host?: string;
  /** Data directory. Default: env WOLTRON_DATA_DIR → ~/.woltron */
  dataDir?: string;
  /** Directory with the web build. Default: env WOLTRON_WEB_DIR → <server pkg>/../web/dist */
  webDir?: string;
  /** Use mock Wolt data. Default: env WOLTRON_WOLT_MOCK=1 */
  mockWolt?: boolean;
  /** Seed demo data when the store is empty. Default: true (env WOLTRON_SEED=0 disables). */
  seed?: boolean;
  /** Silence console logging. */
  quiet?: boolean;
}

export interface RunningServer {
  /** Loopback URL, e.g. http://127.0.0.1:4321 */
  url: string;
  port: number;
  close(): Promise<void>;
  /** Emits 'event' with every `ServerEvent` (same stream as SSE). */
  events: EventHub;
}

function defaultWebDir(): string | undefined {
  if (process.env.WOLTRON_WEB_DIR) return process.env.WOLTRON_WEB_DIR;
  try {
    const here = path.dirname(fileURLToPath(import.meta.url)); // apps/server/{src,dist}
    const dir = path.resolve(here, '../../web/dist');
    return fs.existsSync(dir) ? dir : undefined;
  } catch {
    return undefined;
  }
}

function listen(server: Server, port: number, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (e: Error) => {
      server.off('listening', onListening);
      reject(e);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve((server.address() as AddressInfo).port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    if (!server.listening) return resolve();
    server.close(() => resolve());
    server.closeAllConnections?.();
  });
}

export async function startServer(opts: StartServerOptions = {}): Promise<RunningServer> {
  const log = opts.quiet ? () => undefined : (m: string) => console.log(m);
  const dataDir = opts.dataDir ?? defaultDataDir();
  const store = new Store(dataDir);
  const events = new EventHub();

  const requestedMock = opts.mockWolt ?? envMock();
  const loaded = await loadWoltClient({ mock: requestedMock, language: store.data.settings.language });
  const wolt = loaded.client;
  const mockWolt = wolt.mock;
  wolt.onTokensRefreshed((tokens) => store.updateSecrets({ woltTokens: tokens }));
  if (store.secrets.woltTokens) wolt.setTokens(store.secrets.woltTokens);

  const engine = new RunEngine({ store, events, wolt: () => wolt });
  const scheduler = new Scheduler({ store, events, engine, wolt: () => wolt });

  const seedEnabled = opts.seed ?? process.env.WOLTRON_SEED !== '0';
  if (seedEnabled && store.isEmpty) {
    try {
      await seedDemoData(store, wolt, log);
    } catch (e) {
      log(`[woltron] seeding failed: ${errorMessage(e)}`);
    }
  }

  let woltConnection: WoltConnection = { connected: false };
  let boundPort = 0;
  const ctx: AppContext = {
    store,
    events,
    engine,
    scheduler,
    wolt: () => wolt,
    mockWolt,
    get woltConnection() {
      return woltConnection;
    },
    set woltConnection(c: WoltConnection) {
      woltConnection = c;
    },
    port: () => boundPort,
    webDir: opts.webDir ?? defaultWebDir(),
    log,
  };

  const app = createApp(ctx);
  const server = createAdaptorServer({ fetch: app.fetch }) as Server;
  const port = opts.port ?? envPort() ?? store.data.settings.lan.port ?? DEFAULT_PORT;
  const hostFor = (lan: boolean) => opts.host ?? (lan ? '0.0.0.0' : '127.0.0.1');
  let host = hostFor(store.data.settings.lan.enabled);
  boundPort = await listen(server, port, host);

  ctx.onLanChange = async (enabled) => {
    if (opts.host) return; // host pinned by caller
    const next = hostFor(enabled);
    if (next === host) return;
    await closeServer(server);
    host = next;
    boundPort = await listen(server, boundPort, host);
    log(`[woltron] LAN access ${enabled ? 'enabled' : 'disabled'} — now listening on ${host}:${boundPort}`);
  };

  engine.resume();
  scheduler.start();

  // Learn the Wolt connection state in the background (may hit the network).
  void Promise.race([wolt.connection(), new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000).unref())])
    .then((c) => (woltConnection = c))
    .catch((e) => (woltConnection = { connected: !!store.secrets.woltTokens, lastError: errorMessage(e) }));

  const url = `http://127.0.0.1:${boundPort}`;
  log(
    `[woltron] v${VERSION} 🐕 listening on http://${host}:${boundPort} · data ${dataDir} · wolt ${loaded.source}${mockWolt ? ' (mock)' : ''} · web ${ctx.webDir ?? '(not built)'}`,
  );

  let closed = false;
  return {
    url,
    port: boundPort,
    events,
    async close() {
      if (closed) return;
      closed = true;
      scheduler.stop();
      engine.stop();
      store.flush();
      await closeServer(server);
    },
  };
}
