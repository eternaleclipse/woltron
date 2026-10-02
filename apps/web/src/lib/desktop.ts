/** Feature-detected bridge to the Electron shell (apps/desktop preload). Absent in normal browsers. */
import { useEffect } from 'react';
import { useNavigate } from 'react-router';

export interface WoltronDesktopBridge {
  isDesktop: true;
  platform: 'darwin' | 'win32' | 'linux' | string;
  getAppInfo(): Promise<{ version: string; platform: string; serverUrl: string }>;
  getLaunchAtLogin(): Promise<boolean>;
  setLaunchAtLogin(enabled: boolean): Promise<boolean>;
  onNavigate(cb: (path: string) => void): () => void;
}

declare global {
  interface Window {
    woltronDesktop?: WoltronDesktopBridge;
  }
}

export const desktop = (): WoltronDesktopBridge | undefined => (typeof window !== 'undefined' ? window.woltronDesktop : undefined);

/** Tag <html> so CSS can make room for macOS traffic lights and a drag region. */
export function markDesktopPlatform() {
  const d = desktop();
  if (!d) return;
  document.documentElement.dataset.desktop = d.platform;
}

/** Route when the shell asks (tray, notification click, deep link). */
export function useDesktopNavigation() {
  const navigate = useNavigate();
  useEffect(() => desktop()?.onNavigate((path) => navigate(path)), [navigate]);
}
