import { useEffect, useSyncExternalStore } from 'react';
import { useSettings } from './queries';

/**
 * Appearance prefs live in Settings (server) but are mirrored to localStorage so the
 * very first paint (see index.html) already has the right theme.
 */
type Theme = 'system' | 'light' | 'dark';

function systemDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function applyTheme(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && systemDark());
  document.documentElement.classList.toggle('dark', dark);
  try {
    localStorage.setItem('woltron.theme', theme);
  } catch {
    /* ignore */
  }
  const meta = document.querySelectorAll('meta[name="theme-color"]');
  meta.forEach((m) => m.setAttribute('content', dark ? '#1b1220' : '#f6efe9'));
  notify();
}

export function applyReducedMotion(on: boolean) {
  if (on) document.documentElement.dataset.motion = 'reduce';
  else delete document.documentElement.dataset.motion;
  try {
    localStorage.setItem('woltron.reducedMotion', on ? '1' : '0');
  } catch {
    /* ignore */
  }
  notify();
}

const subs = new Set<() => void>();
function notify() {
  subs.forEach((s) => s());
}
function subscribe(cb: () => void) {
  subs.add(cb);
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mq2 = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', cb);
  mq2.addEventListener('change', cb);
  return () => {
    subs.delete(cb);
    mq.removeEventListener('change', cb);
    mq2.removeEventListener('change', cb);
  };
}

/** True if the OS or the in-app toggle asks for reduced motion. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, () =>
    document.documentElement.dataset.motion === 'reduce' || window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
}

export function useIsDark(): boolean {
  return useSyncExternalStore(subscribe, () => document.documentElement.classList.contains('dark'));
}

/** Keep DOM prefs in sync with server settings. */
export function useAppearanceSync() {
  const { data } = useSettings();
  const theme = data?.appearance.theme;
  const rm = data?.appearance.reducedMotion;
  useEffect(() => {
    if (theme) applyTheme(theme);
  }, [theme]);
  useEffect(() => {
    if (rm !== undefined) applyReducedMotion(rm);
  }, [rm]);
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => applyTheme('system');
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [theme]);
}

export function useMascotName(): string {
  const { data } = useSettings();
  return data?.appearance.mascotName || 'Woltie';
}

export function useMediaQuery(q: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(q);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia(q).matches,
  );
}

export const useIsDesktop = () => useMediaQuery('(min-width: 1024px)');
