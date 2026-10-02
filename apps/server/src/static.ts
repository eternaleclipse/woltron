import fs from 'node:fs';
import path from 'node:path';
import type { Context } from 'hono';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.lottie': 'application/zip',
};

const PLACEHOLDER = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Woltron</title>
<style>body{font-family:system-ui,sans-serif;background:#fff8ef;color:#3b2a1a;display:grid;place-items:center;min-height:100vh;margin:0}main{text-align:center;padding:24px}code{background:#f3e3cf;padding:2px 6px;border-radius:6px}</style></head>
<body><main><div style="font-size:64px">🐕</div><h1>Woltron server is running</h1><p>The web app isn’t built yet. Run <code>npm run build</code> (or <code>npm run dev</code> and open the Vite URL).</p><p>API: <a href="/api/health">/api/health</a></p></main></body></html>`;

function fileIfExists(p: string): string | undefined {
  try {
    return fs.statSync(p).isFile() ? p : undefined;
  } catch {
    return undefined;
  }
}

/** Serve the SPA build with index.html fallback for client-side routes. */
export function serveSpa(webDir: string | undefined) {
  const root = webDir ? path.resolve(webDir) : undefined;
  return async (c: Context) => {
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') return c.notFound();
    if (!root) return c.html(PLACEHOLDER);
    let rel: string;
    try {
      rel = decodeURIComponent(new URL(c.req.url).pathname);
    } catch {
      return c.text('Bad request', 400);
    }
    const target = path.resolve(root, `.${rel}`);
    const inside = target === root || target.startsWith(root + path.sep);
    let file = inside ? fileIfExists(target) : undefined;
    let isIndex = false;
    if (!file && inside && !path.extname(rel)) {
      file = fileIfExists(path.join(root, 'index.html'));
      isIndex = true;
    }
    if (!file) {
      if (!fileIfExists(path.join(root, 'index.html'))) return c.html(PLACEHOLDER);
      return c.text('Not found', 404);
    }
    const ext = path.extname(file).toLowerCase();
    const headers: Record<string, string> = { 'Content-Type': MIME[ext] ?? 'application/octet-stream' };
    if (isIndex || ext === '.html' || rel.endsWith('sw.js') || rel.endsWith('.webmanifest')) headers['Cache-Control'] = 'no-cache';
    else if (rel.startsWith('/assets/')) headers['Cache-Control'] = 'public, max-age=31536000, immutable';
    else headers['Cache-Control'] = 'public, max-age=3600';
    const body = c.req.method === 'HEAD' ? null : await fs.promises.readFile(file);
    return c.body(body as never, 200, headers);
  };
}
