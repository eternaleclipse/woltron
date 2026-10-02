/**
 * Bridge exposed to the Woltron web UI as `window.woltronDesktop`.
 * The web app feature-detects it (`if (window.woltronDesktop) …`). See apps/desktop/README.md.
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

const bridge = {
  isDesktop: true as const,
  platform: process.platform,
  getAppInfo: (): Promise<{ version: string; platform: string; serverUrl: string }> =>
    ipcRenderer.invoke('woltron:app-info'),
  getLaunchAtLogin: (): Promise<boolean> => ipcRenderer.invoke('woltron:get-launch-at-login'),
  setLaunchAtLogin: (enabled: boolean): Promise<boolean> =>
    ipcRenderer.invoke('woltron:set-launch-at-login', Boolean(enabled)),
  /**
   * Called when the desktop shell wants the UI to route somewhere (tray, notification click,
   * deep link). `path` is an in-app path like "/runs/abc123". Returns an unsubscribe function.
   * Once a listener is registered the shell stops doing full page loads for navigation.
   */
  onNavigate: (cb: (path: string) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, path: string) => cb(path);
    ipcRenderer.on('woltron:navigate', listener);
    ipcRenderer.send('woltron:navigate-ready', true);
    return () => {
      ipcRenderer.removeListener('woltron:navigate', listener);
      if (ipcRenderer.listenerCount('woltron:navigate') === 0) ipcRenderer.send('woltron:navigate-ready', false);
    };
  },
};

export type WoltronDesktopBridge = typeof bridge;

contextBridge.exposeInMainWorld('woltronDesktop', bridge);
