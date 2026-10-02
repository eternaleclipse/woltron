import { app } from 'electron';
import { existsSync } from 'node:fs';
import net from 'node:net';
import { pathToFileURL } from 'node:url';
import type { EventEmitter } from 'node:events';
import { serverPaths } from './paths';

/** Contract of `apps/server/dist/index.js`. */
export interface StartServerOptions {
  port?: number;
  host?: string;
  dataDir?: string;
  webDir?: string;
  mockWolt?: boolean;
}
export interface RunningServer {
  url: string;
  port: number;
  close(): Promise<void>;
  events?: EventEmitter;
}
type StartServer = (opts?: StartServerOptions) => Promise<RunningServer>;

export const DEFAULT_PORT = 4321;
const HOST = '127.0.0.1';

function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, HOST);
  });
}

function ephemeralPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, HOST, () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

/** Default port 4321 (or WOLTRON_PORT), then 4322…4330, then any free port. */
export async function pickPort(): Promise<number> {
  const preferred = Number(process.env.WOLTRON_PORT) || DEFAULT_PORT;
  for (let p = preferred; p < preferred + 10; p++) {
    if (await portFree(p)) return p;
  }
  return ephemeralPort();
}

/**
 * Start the Woltron server in-process. If WOLTRON_SERVER_URL is set we attach to an
 * already-running server instead (handy with `npm run dev` at the repo root).
 */
export async function startEmbeddedServer(): Promise<RunningServer> {
  const external = process.env.WOLTRON_SERVER_URL;
  if (external) {
    const url = external.replace(/\/+$/, '');
    return { url, port: Number(new URL(url).port) || 80, close: async () => {} };
  }

  const { entry, webDir } = serverPaths();
  if (!existsSync(entry)) {
    throw new Error(
      `Woltron server bundle not found at ${entry}.\n` +
        'Build it first (npm run build at the repo root), or set WOLTRON_SERVER_URL to attach to a running server.',
    );
  }
  // Dynamic import of the ESM bundle; keep it a real import() (not require) via Function.
  const dynamicImport = new Function('u', 'return import(u)') as (u: string) => Promise<{ startServer?: StartServer; default?: { startServer?: StartServer } }>;
  const mod = await dynamicImport(pathToFileURL(entry).href);
  const startServer = mod.startServer ?? mod.default?.startServer;
  if (typeof startServer !== 'function') throw new Error(`${entry} does not export startServer()`);

  const mock = process.env.WOLTRON_WOLT_MOCK;
  return startServer({
    port: await pickPort(),
    host: HOST,
    dataDir: process.env.WOLTRON_DATA_DIR || app.getPath('userData'),
    webDir,
    mockWolt: mock ? mock !== '0' && mock !== 'false' : undefined,
  });
}
