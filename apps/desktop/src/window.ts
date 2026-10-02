import { BrowserWindow, nativeTheme, screen, shell } from 'electron';
import { assetPath, preloadPath } from './paths';
import { state, type WindowBounds } from './state';

export const CREAM = '#FFF4E4';
export const NIGHT = '#1B1411';

const DEFAULT_BOUNDS: WindowBounds = { width: 1280, height: 840 };

function visibleOnSomeDisplay(b: WindowBounds): boolean {
  if (b.x === undefined || b.y === undefined) return false;
  return screen.getAllDisplays().some(({ workArea: a }) =>
    b.x! + 80 > a.x && b.y! + 40 > a.y && b.x! < a.x + a.width - 80 && b.y! < a.y + a.height - 40,
  );
}

function restoredBounds(): WindowBounds {
  const saved = state.get().window;
  if (!saved) return DEFAULT_BOUNDS;
  const b = { ...saved, width: Math.max(380, saved.width), height: Math.max(600, saved.height) };
  if (!visibleOnSomeDisplay(b)) {
    delete b.x;
    delete b.y;
  }
  return b;
}

export interface MainWindowOptions {
  baseUrl: string;
  startHidden: boolean;
  /** Return true to actually close, false to hide to tray. */
  shouldQuitOnClose: () => boolean;
  onHiddenToTray?: () => void;
}

export function createMainWindow(opts: MainWindowOptions): BrowserWindow {
  const bounds = restoredBounds();
  const isMac = process.platform === 'darwin';

  const win = new BrowserWindow({
    ...bounds,
    minWidth: 380,
    minHeight: 600,
    show: false,
    title: 'Woltron',
    icon: process.platform === 'linux' ? assetPath('icon', 'png', '512x512.png') : undefined,
    backgroundColor: nativeTheme.shouldUseDarkColors ? NIGHT : CREAM,
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: isMac ? { x: 16, y: 18 } : undefined,
    autoHideMenuBar: !isMac,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });
  if (bounds.maximized) win.maximize();

  win.once('ready-to-show', () => {
    if (!opts.startHidden) win.show();
  });

  // ── persist bounds ──
  let saveTimer: NodeJS.Timeout | undefined;
  const saveBounds = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return;
      const maximized = win.isMaximized();
      const b = maximized ? (state.get().window ?? win.getNormalBounds()) : win.getBounds();
      state.set({ window: { x: b.x, y: b.y, width: b.width, height: b.height, maximized } });
    }, 400);
  };
  win.on('resize', saveBounds);
  win.on('move', saveBounds);
  win.on('maximize', saveBounds);
  win.on('unmaximize', saveBounds);

  // ── close → hide to tray (server + automations keep running) ──
  win.on('close', (e) => {
    if (opts.shouldQuitOnClose()) return;
    e.preventDefault();
    if (win.isFullScreen()) {
      win.once('leave-full-screen', () => win.hide());
      win.setFullScreen(false);
    } else {
      win.hide();
    }
    opts.onHiddenToTray?.();
  });

  // ── links: our origin stays in-app, everything else → default browser ──
  const origin = new URL(opts.baseUrl).origin;
  const isInternal = (url: string) => {
    try {
      return new URL(url).origin === origin;
    } catch {
      return false;
    }
  };
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!isInternal(url) && /^(https?|mailto):/i.test(url)) void shell.openExternal(url);
    else if (isInternal(url)) void win.loadURL(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (isInternal(url)) return;
    e.preventDefault();
    if (/^(https?|mailto):/i.test(url)) void shell.openExternal(url);
  });

  // Recover from a page that failed to load (e.g. server still warming up).
  win.webContents.on('did-fail-load', (_e, code, _desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3 /* aborted */) return;
    setTimeout(() => {
      if (!win.isDestroyed()) void win.loadURL(url || opts.baseUrl);
    }, 1500);
  });

  void win.loadURL(opts.baseUrl);
  return win;
}
