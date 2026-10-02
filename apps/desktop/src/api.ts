import type { Pack, Preset, Run, RunRequest, ServerEvent, Settings, SettingsPatch } from '@woltron/shared';

export class ApiClient {
  constructor(public baseUrl: string) {}

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(this.baseUrl + path, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : undefined;
    if (!res.ok) {
      const msg = data && typeof data === 'object' && 'message' in data ? String(data.message) : `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data as T;
  }

  presets = () => this.req<Preset[]>('GET', '/api/presets');
  packs = () => this.req<Pack[]>('GET', '/api/packs');
  runs = (limit = 8) => this.req<Run[]>('GET', `/api/runs?limit=${limit}`);
  settings = () => this.req<Settings>('GET', '/api/settings');
  patchSettings = (patch: SettingsPatch) => this.req<Settings>('PATCH', '/api/settings', patch);
  run = (body: RunRequest) => this.req<Run>('POST', '/api/runs', body);
  confirmRun = (id: string) => this.req<Run>('POST', `/api/runs/${encodeURIComponent(id)}/confirm`);
}

/**
 * Minimal SSE consumer for `/api/events` (fetch + stream parsing; reconnects with backoff).
 * Returns a stop function.
 */
export function subscribeEvents(
  baseUrl: string,
  onEvent: (ev: ServerEvent) => void,
  onStatus?: (connected: boolean) => void,
): () => void {
  let stopped = false;
  let controller: AbortController | undefined;
  let backoff = 1000;

  const loop = async () => {
    while (!stopped) {
      controller = new AbortController();
      try {
        const res = await fetch(baseUrl + '/api/events', {
          headers: { accept: 'text/event-stream' },
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error(`SSE HTTP ${res.status}`);
        onStatus?.(true);
        backoff = 1000;
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += value;
          let idx: number;
          while ((idx = buf.search(/\r?\n\r?\n/)) !== -1) {
            const chunk = buf.slice(0, idx);
            buf = buf.slice(idx).replace(/^\r?\n\r?\n/, '');
            const data = chunk
              .split(/\r?\n/)
              .filter((l) => l.startsWith('data:'))
              .map((l) => l.slice(5).replace(/^ /, ''))
              .join('\n');
            if (!data) continue;
            try {
              onEvent(JSON.parse(data) as ServerEvent);
            } catch {
              /* ignore malformed event */
            }
          }
        }
      } catch {
        /* network error / abort — fall through to retry */
      }
      if (stopped) break;
      onStatus?.(false);
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(backoff * 2, 30_000);
    }
  };
  void loop();

  return () => {
    stopped = true;
    controller?.abort();
  };
}
