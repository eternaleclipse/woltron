import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Notification, type IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import type { Target } from '@woltron/shared';
import { ApiClient, subscribeEvents } from './api';
import { findDeepLinkArg, parseDeepLink, PROTOCOL } from './deeplink';
import { getLaunchAtLogin, launchedHidden, setLaunchAtLogin } from './login';
import { Notifier } from './notifications';
import { startEmbeddedServer, type RunningServer } from './server';
import { state } from './state';
import { WoltronTray } from './tray';
import { createMainWindow } from './window';

const SHORTCUT = 'CommandOrControl+Shift+W';

app.setName('Woltron');
// Separate profile (e.g. for testing a second copy side by side).
if (process.env.WOLTRON_USER_DATA) app.setPath('userData', path.resolve(process.env.WOLTRON_USER_DATA));
if (process.platform === 'win32') app.setAppUserModelId('dev.woltron.app');

// ── single instance ─────────────────────────────────────────────────────────
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

// ── protocol registration (woltron://) ──────────────────────────────────────
if (process.defaultApp && process.argv.length >= 2) {
  // Dev (`electron .`): register the electron binary + app path.
  app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}

let server: RunningServer | undefined;
let api: ApiClient | undefined;
let win: BrowserWindow | undefined;
let tray: WoltronTray | undefined;
let notifier: Notifier | undefined;
let stopEvents: (() => void) | undefined;
let quitting = false;
let rendererRoutes = false; // web UI registered window.woltronDesktop.onNavigate
const pendingLinks: string[] = [];

// ── window helpers ──────────────────────────────────────────────────────────
function showWindow() {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  if (process.platform === 'darwin') void app.dock?.show();
}

function openApp(routePath?: string) {
  if (!win || win.isDestroyed() || !server) return;
  if (routePath) {
    if (rendererRoutes) win.webContents.send('woltron:navigate', routePath);
    else void win.loadURL(server.url + routePath);
  }
  showWindow();
}

function toggleWindow() {
  if (!win || win.isDestroyed()) return;
  if (win.isVisible() && win.isFocused()) win.hide();
  else showWindow();
}

function notify(title: string, body: string, routePath?: string) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body });
  n.on('click', () => openApp(routePath));
  n.show();
}

// ── actions ─────────────────────────────────────────────────────────────────
async function runTarget(target: Target, source: 'tray' | 'deeplink', label?: string) {
  if (!api) return;
  try {
    const run = await api.run({ target, source });
    tray?.upsertRun(run);
    if (source === 'deeplink') openApp(`/runs/${run.id}`);
  } catch (err) {
    notify(`Couldn't run ${label ?? target.kind}`, err instanceof Error ? err.message : String(err), target.kind === 'preset' ? `/presets/${target.id}` : `/packs/${target.id}`);
  }
}

function handleDeepLink(raw: string) {
  if (!server) {
    pendingLinks.push(raw);
    return;
  }
  const link = parseDeepLink(raw);
  if (!link) return;
  if (link.kind === 'run') void runTarget(link.target, 'deeplink');
  else openApp(link.path);
}

// macOS delivers deep links via open-url (possibly before ready).
app.on('open-url', (e, url) => {
  e.preventDefault();
  handleDeepLink(url);
});

app.on('second-instance', (_e, argv) => {
  const link = findDeepLinkArg(argv);
  if (link) handleDeepLink(link);
  else showWindow();
});

// ── IPC bridge (see preload.ts) ─────────────────────────────────────────────
function fromOurOrigin(e: IpcMainInvokeEvent | Electron.IpcMainEvent) {
  try {
    return !!server && new URL(e.senderFrame?.url ?? '').origin === new URL(server.url).origin;
  } catch {
    return false;
  }
}

ipcMain.handle('woltron:app-info', (e) => {
  if (!fromOurOrigin(e)) throw new Error('forbidden');
  return { version: app.getVersion(), platform: process.platform, serverUrl: server?.url ?? '' };
});
ipcMain.handle('woltron:get-launch-at-login', (e) => {
  if (!fromOurOrigin(e)) throw new Error('forbidden');
  return getLaunchAtLogin();
});
ipcMain.handle('woltron:set-launch-at-login', (e, enabled: unknown) => {
  if (!fromOurOrigin(e)) throw new Error('forbidden');
  const on = setLaunchAtLogin(Boolean(enabled));
  void tray?.refresh();
  return on;
});
ipcMain.on('woltron:navigate-ready', (e, ready: unknown) => {
  if (fromOurOrigin(e) && e.sender === win?.webContents) rendererRoutes = Boolean(ready);
});

// ── boot ────────────────────────────────────────────────────────────────────
async function boot() {
  try {
    server = await startEmbeddedServer();
  } catch (err) {
    dialog.showErrorBox('Woltron could not start', err instanceof Error ? err.message : String(err));
    app.exit(1);
    return;
  }
  console.log(`[woltron] server ready at ${server.url}`);
  api = new ApiClient(server.url);

  win = createMainWindow({
    baseUrl: server.url,
    startHidden: launchedHidden(),
    shouldQuitOnClose: () => quitting,
    onHiddenToTray: () => {
      if (state.get().trayHintShown) return;
      state.set({ trayHintShown: true });
      notify('Woltie is still on duty 🐕', 'Woltron keeps running in the tray so your schedules fire. Quit from the tray menu.');
    },
  });
  // A full page load resets the renderer's onNavigate registration.
  win.webContents.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) rendererRoutes = false;
  });

  tray = new WoltronTray(api, {
    open: openApp,
    run: (target, label) => void runTarget(target, 'tray', label),
    getLaunchAtLogin,
    setLaunchAtLogin: (on) => {
      setLaunchAtLogin(on);
      void tray?.refresh();
    },
    quit: () => {
      quitting = true;
      app.quit();
    },
  });

  notifier = new Notifier({
    settings: () => tray?.currentSettings,
    open: openApp,
    confirmRun: (id) => api!.confirmRun(id),
  });

  let refreshTimer: NodeJS.Timeout | undefined;
  const refreshSoon = () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => void tray?.refresh(), 300);
  };
  stopEvents = subscribeEvents(
    server.url,
    (ev) => {
      notifier?.handle(ev);
      switch (ev.type) {
        case 'run.updated':
          tray?.upsertRun(ev.run);
          break;
        case 'settings.updated':
          tray?.setSettings(ev.settings);
          break;
        case 'preset.changed':
        case 'pack.changed':
        case 'automation.fired':
          refreshSoon();
          break;
      }
    },
    (connected) => {
      tray?.setConnected(connected);
      if (connected) refreshSoon();
    },
  );

  if (!globalShortcut.register(SHORTCUT, toggleWindow)) {
    console.warn(`[woltron] could not register global shortcut ${SHORTCUT}`);
  }

  // Links that arrived before the server was up, plus a link on our own argv (Win/Linux cold start).
  const coldLink = findDeepLinkArg(process.argv);
  if (coldLink) pendingLinks.push(coldLink);
  for (const l of pendingLinks.splice(0)) handleDeepLink(l);
}

app.whenReady().then(boot);

app.on('activate', () => showWindow()); // macOS dock click

// Keep running in the tray when all windows are hidden/closed.
app.on('window-all-closed', () => {
  /* no-op: tray app */
});

// Ctrl+C / kill in dev → graceful quit (closes the server).
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => app.quit());

app.on('before-quit', () => {
  quitting = true;
});

let cleanedUp = false;
app.on('will-quit', (e) => {
  globalShortcut.unregisterAll();
  if (cleanedUp) return;
  e.preventDefault();
  cleanedUp = true;
  stopEvents?.();
  tray?.destroy();
  tray = undefined;
  const closing = server?.close().catch(() => {}) ?? Promise.resolve();
  // Don't let a stuck server shutdown (e.g. lingering keep-alive sockets) block quitting.
  void Promise.race([closing, new Promise((r) => setTimeout(r, 3000))]).then(() => app.exit(0));
});
