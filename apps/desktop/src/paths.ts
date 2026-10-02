import { app } from 'electron';
import { existsSync } from 'node:fs';
import path from 'node:path';

/** apps/desktop (dev) — main.cjs lives in apps/desktop/dist. */
const desktopRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(desktopRoot, '..', '..');

export interface ServerPaths {
  entry: string;
  webDir?: string;
}

/**
 * Where the server bundle and web build live.
 *  - packaged: <resources>/server/index.js + <resources>/web (see electron-builder.yml extraResources)
 *  - dev:      apps/server/dist/index.js + apps/web/dist
 *  - override: WOLTRON_SERVER_ENTRY (path, relative to apps/desktop or absolute), WOLTRON_WEB_DIR
 */
export function serverPaths(): ServerPaths {
  const override = process.env.WOLTRON_SERVER_ENTRY;
  if (override) {
    return {
      entry: path.resolve(desktopRoot, override),
      webDir: process.env.WOLTRON_WEB_DIR ? path.resolve(desktopRoot, process.env.WOLTRON_WEB_DIR) : undefined,
    };
  }
  if (app.isPackaged) {
    return {
      entry: path.join(process.resourcesPath, 'server', 'index.js'),
      webDir: path.join(process.resourcesPath, 'web'),
    };
  }
  const webDir = path.join(repoRoot, 'apps', 'web', 'dist');
  return {
    entry: path.join(repoRoot, 'apps', 'server', 'dist', 'index.js'),
    webDir: existsSync(webDir) ? webDir : undefined,
  };
}

/** Static desktop assets (icons). Packaged: <resources>/assets, dev: <repo>/assets. */
export function assetPath(...parts: string[]): string {
  const base = app.isPackaged ? path.join(process.resourcesPath, 'assets') : path.join(repoRoot, 'assets');
  return path.join(base, ...parts);
}

export function preloadPath(): string {
  return path.join(__dirname, 'preload.cjs');
}
