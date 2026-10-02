import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { captureTokenFromUrl } from './lib/api';
import { markDesktopPlatform } from './lib/desktop';

// Mock API is only ever included in dev builds or when explicitly enabled at build time.
const MOCK_ALLOWED = import.meta.env.DEV || import.meta.env.VITE_MOCK === '1';

async function shouldMock(): Promise<boolean> {
  if (import.meta.env.VITE_MOCK === '1') return true;
  if (new URLSearchParams(location.search).get('mock') === '1') return true;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch('/api/health', { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return true;
    const body = await res.json().catch(() => null);
    return !body?.ok;
  } catch {
    return true;
  }
}

async function boot() {
  captureTokenFromUrl();
  markDesktopPlatform();
  if (MOCK_ALLOWED && (await shouldMock())) {
    const { installMock } = await import('./mock');
    await installMock();
  }
  const { App } = await import('./App');
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

void boot();
