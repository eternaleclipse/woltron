# @woltron/desktop

The Electron shell for Woltron. It runs the Woltron server **in-process**, opens the web UI in a
window, and lives in the tray so schedules and triggers keep firing when the window is closed.

## Run it

```bash
# from the repo root
npm install
npm run build                       # builds apps/web/dist + apps/server/dist
npm -w @woltron/desktop run dev     # bundles main/preload and starts Electron

# Fake Wolt data
WOLTRON_WOLT_MOCK=1 npm -w @woltron/desktop run dev

# No server build yet? Use the bundled stub server (placeholder page + a few /api routes):
npm -w @woltron/desktop run dev:stub
```

On Linux distributions that restrict unprivileged user namespaces (e.g. Ubuntu 24.04) the dev
Electron binary may abort with *"The SUID sandbox helper binary was found, but is not configured
correctly"*. For local development pass `--no-sandbox`: `npm -w @woltron/desktop run dev -- --no-sandbox`.
Packaged builds (deb/AppImage) don't need this.

### Environment variables

| Variable | Effect |
|---|---|
| `WOLTRON_WOLT_MOCK=1` | Start the server with `mockWolt: true` (fixture data). |
| `WOLTRON_PORT` | Preferred port (default `4321`; falls back to the next free one). |
| `WOLTRON_SERVER_URL` | Attach to an already running server (e.g. `http://127.0.0.1:4321` from `npm run dev`) instead of starting one. |
| `WOLTRON_SERVER_ENTRY` / `WOLTRON_WEB_DIR` | Override the server bundle / web build paths (relative to `apps/desktop`). |
| `WOLTRON_DATA_DIR` | Server data dir (default: Electron `userData`). |
| `WOLTRON_USER_DATA` | Use a different Electron profile directory (run a second copy side by side). |
| `WOLTRON_DEBUG=1` | Log the tray menu whenever it is rebuilt. |

## What it does

- **Single instance.** A second launch focuses the existing window (and forwards deep links).
- **Server.** `import()`s `startServer()` from `apps/server/dist/index.js` (dev) or
  `<resources>/server/index.js` (packaged) with `{ port, host: '127.0.0.1', dataDir: userData, webDir, mockWolt }`.
- **Window.** 1280×840 (min 380×600), cream background, `hiddenInset` title bar on macOS; bounds
  persisted in `userData/desktop-state.json`. Closing hides to the tray; quit from the tray.
  Links to other origins open in the default browser.
- **Tray.** Open Woltron · Run preset ▸ · Run pack ▸ (favourites first) · Recent runs ▸ ·
  Dry-run mode · Launch at login · Quit. Kept fresh from `/api/events` (SSE) and every 60 s.
  Running from the tray is `POST /api/runs { target, source: 'tray' }`. Unticking *Dry-run mode*
  never switches to live directly: it opens `/settings#order-mode`, where the typed confirmation lives.
  Ticking it again switches back to dry-run immediately.
- **Notifications.** SSE `notification` events become native notifications (click → `/runs/<runId>`).
  Runs entering `awaiting-confirmation` get a notification with a **Confirm** action
  (macOS/Windows; elsewhere click opens the run).
- **Global shortcut.** `Ctrl/Cmd+Shift+W` shows/hides the window.
- **Deep links.** `woltron://run/preset/<id>`, `woltron://run/pack/<id>` (runs with
  `source: 'deeplink'` and opens the run), `woltron://open/<path>` (e.g. `woltron://open/automations`).

## `window.woltronDesktop` bridge (for the web UI)

The preload script exposes a small API. Feature-detect it, since it doesn't exist in a normal browser:

```ts
declare global {
  interface Window {
    woltronDesktop?: {
      isDesktop: true;
      platform: 'darwin' | 'win32' | 'linux' | string;
      getAppInfo(): Promise<{ version: string; platform: string; serverUrl: string }>;
      getLaunchAtLogin(): Promise<boolean>;
      setLaunchAtLogin(enabled: boolean): Promise<boolean>; // resolves to the new state
      /** Shell asks the UI to route (tray, notification click, deep link). Returns unsubscribe. */
      onNavigate(cb: (path: string) => void): () => void;
    };
  }
}

// e.g. in the router root:
useEffect(() => window.woltronDesktop?.onNavigate((path) => navigate(path)), [navigate]);
```

- If the UI registers `onNavigate`, the shell sends paths such as `/runs/abc123`,
  `/settings#order-mode`, `/presets/p1` and the UI routes client-side. If no handler is registered,
  the shell does a full `loadURL(serverUrl + path)`, so the server must serve the SPA for deep paths.
- Use `platform === 'darwin'` to leave room for the traffic lights (≈ 78 px from the left, top
  bar ≈ 40 px). The window uses `titleBarStyle: 'hiddenInset'`, so make the header draggable with
  `-webkit-app-region: drag` (and `no-drag` on its buttons).
- Launch at login uses the OS login items on macOS/Windows and `~/.config/autostart/woltron.desktop`
  on Linux. When started that way the app opens hidden in the tray.

## Packaging

```bash
npm run build                          # at the repo root: web + server
npm -w @woltron/desktop run dist       # → apps/desktop/release (AppImage + deb / dmg / nsis per OS)
npm -w @woltron/desktop run dist:dir   # unpacked app only, for a quick check
```

`electron-builder.yml` copies `apps/server/dist` → `resources/server` (plus a `{"type":"module"}`
package.json), `apps/web/dist` → `resources/web`, and the tray/window icons. Main and preload are
bundled by esbuild, so no `node_modules` are shipped. **The server bundle has to be
self-contained** (dependencies bundled in by tsup), because there are no `node_modules` next to it
in the packaged app.

Icons come from `assets/icon` (`icon.icns`, `icon.ico`, `png/NxN.png`). Regenerate all artwork with
`python3 assets/scripts/build_assets.py`.
