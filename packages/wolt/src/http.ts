/**
 * HTTP core for the Wolt client: browser-like headers, retries with backoff on
 * 429/5xx/network errors, a per-host concurrency limit and a small in-memory
 * TTL cache for catalog reads. No dependencies beyond global fetch.
 */
import { WoltError } from '@woltron/shared';

export const HOSTS = {
  restaurant: 'https://restaurant-api.wolt.com',
  consumer: 'https://consumer-api.wolt.com',
  auth: 'https://authentication.wolt.com',
  web: 'https://wolt.com',
} as const;

/** Mirrors what the wolt.com web app sends (see README "Headers"). */
export const WEB_CLIENT_VERSION = '1.16.144';
export const BROWSER_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

export interface HttpOptions {
  fetchImpl?: typeof fetch;
  language?: string;
  logger?: (msg: string) => void;
  /** Max parallel requests per host. */
  concurrency?: number;
  /** Max attempts per request (1 = no retry). */
  maxAttempts?: number;
  /** Base backoff in ms (doubles each attempt, plus jitter). */
  backoffMs?: number;
  timeoutMs?: number;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  query?: Record<string, string | number | boolean | undefined | null>;
  /** JSON body (object) or pre-encoded form body (URLSearchParams). */
  body?: unknown;
  headers?: Record<string, string>;
  /** Cache key TTL in ms; only honoured for GET or explicitly cacheable POSTs. */
  cacheTtlMs?: number;
  cacheKey?: string;
  /** Retry non-idempotent requests (POST) on 5xx? Defaults to true for GET, false otherwise. */
  retry?: boolean;
  /** Accept 'null'/empty bodies. */
  allowEmpty?: boolean;
}

class Semaphore {
  private active = 0;
  private queue: Array<() => void> = [];
  constructor(private readonly max: number) {}
  async acquire(): Promise<() => void> {
    if (this.active >= this.max) await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active++;
    return () => {
      this.active--;
      this.queue.shift()?.();
    };
  }
}

interface CacheEntry {
  expires: number;
  value: Promise<unknown>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class HttpError extends WoltError {
  constructor(
    code: WoltError['code'],
    message: string,
    status?: number,
    public body?: unknown,
  ) {
    super(code, message, status);
    this.name = 'WoltError';
  }
}

export function codeForStatus(status: number): WoltError['code'] {
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 404 || status === 410) return 'not_found';
  if (status === 429) return 'rate_limited';
  return 'unknown';
}

export class HttpCore {
  readonly fetchImpl: typeof fetch;
  language: string;
  private readonly log: (msg: string) => void;
  private readonly sems = new Map<string, Semaphore>();
  private readonly cache = new Map<string, CacheEntry>();
  private readonly maxCacheEntries = 400;
  private readonly concurrency: number;
  private readonly maxAttempts: number;
  private readonly backoffMs: number;
  private readonly timeoutMs: number;

  constructor(opts: HttpOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.language = opts.language ?? 'en';
    this.log = opts.logger ?? (() => {});
    this.concurrency = opts.concurrency ?? 4;
    this.maxAttempts = opts.maxAttempts ?? 3;
    this.backoffMs = opts.backoffMs ?? 400;
    this.timeoutMs = opts.timeoutMs ?? 20_000;
  }

  defaultHeaders(): Record<string, string> {
    return {
      accept: 'application/json, text/plain, */*',
      'user-agent': BROWSER_UA,
      'app-language': this.language,
      'app-locale': this.language,
      platform: 'Web',
      'client-version': WEB_CLIENT_VERSION,
      clientversionnumber: WEB_CLIENT_VERSION,
      origin: 'https://wolt.com',
      referer: 'https://wolt.com/',
    };
  }

  clearCache(prefix?: string) {
    if (!prefix) return this.cache.clear();
    for (const k of this.cache.keys()) if (k.startsWith(prefix)) this.cache.delete(k);
  }

  private sem(host: string) {
    let s = this.sems.get(host);
    if (!s) this.sems.set(host, (s = new Semaphore(this.concurrency)));
    return s;
  }

  buildUrl(url: string, query?: RequestOptions['query']): string {
    if (!query) return url;
    const u = new URL(url);
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
    return u.toString();
  }

  /** Request JSON with retries/caching. Throws WoltError on failure. */
  async json<T = any>(url: string, opts: RequestOptions = {}): Promise<T> {
    const method = opts.method ?? 'GET';
    const full = this.buildUrl(url, opts.query);
    const ttl = opts.cacheTtlMs ?? 0;
    const key = opts.cacheKey ?? `${method} ${full} ${method === 'GET' ? '' : JSON.stringify(opts.body ?? null)}`;
    if (ttl > 0) {
      const hit = this.cache.get(key);
      if (hit && hit.expires > Date.now()) return hit.value as Promise<T>;
      const value = this.doRequest<T>(full, method, opts);
      this.cache.set(key, { expires: Date.now() + ttl, value });
      value.catch(() => this.cache.delete(key));
      if (this.cache.size > this.maxCacheEntries) {
        const now = Date.now();
        for (const [k, e] of this.cache) if (e.expires <= now || this.cache.size > this.maxCacheEntries) this.cache.delete(k);
      }
      return value;
    }
    return this.doRequest<T>(full, method, opts);
  }

  private async doRequest<T>(url: string, method: string, opts: RequestOptions): Promise<T> {
    const host = new URL(url).host;
    const canRetry = opts.retry ?? method === 'GET';
    const headers: Record<string, string> = { ...this.defaultHeaders(), ...(opts.headers ?? {}) };
    let body: BodyInit | undefined;
    if (opts.body instanceof URLSearchParams) {
      body = opts.body.toString();
      headers['content-type'] = 'application/x-www-form-urlencoded';
    } else if (opts.body !== undefined) {
      body = JSON.stringify(opts.body);
      headers['content-type'] = 'application/json';
    }

    let lastErr: unknown;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      const release = await this.sem(host).acquire();
      let res: Response | undefined;
      const started = Date.now();
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
        try {
          res = await this.fetchImpl(url, { method, headers, body, signal: ctrl.signal });
        } finally {
          clearTimeout(timer);
        }
      } catch (e) {
        lastErr = new HttpError('network', `Network error calling ${method} ${redact(url)}: ${(e as Error).message}`);
      } finally {
        release();
      }

      if (res) {
        this.log(`[wolt] ${method} ${redact(url)} -> ${res.status} (${Date.now() - started}ms)`);
        const text = await res.text().catch(() => '');
        if (res.ok) {
          if (!text || text === 'null') {
            if (opts.allowEmpty) return null as T;
            throw new HttpError('unknown', `Empty response from ${method} ${redact(url)}`, res.status);
          }
          try {
            return JSON.parse(text) as T;
          } catch {
            throw new HttpError('unknown', `Non-JSON response from ${method} ${redact(url)}`, res.status, text.slice(0, 500));
          }
        }
        const parsed = safeJson(text);
        const msg = errorMessage(parsed) ?? (text.slice(0, 200) || res.statusText);
        const err = new HttpError(codeForStatus(res.status), `Wolt ${method} ${redact(url)} failed (${res.status}): ${msg}`, res.status, parsed ?? text);
        const retryable = res.status === 429 || (res.status >= 500 && canRetry);
        if (!retryable || attempt === this.maxAttempts) throw err;
        lastErr = err;
        const retryAfter = Number(res.headers.get('retry-after'));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 10_000) : this.backoff(attempt);
        await sleep(wait);
        continue;
      }
      if (!canRetry && method !== 'GET') break;
      if (attempt < this.maxAttempts) await sleep(this.backoff(attempt));
    }
    throw lastErr instanceof Error ? lastErr : new HttpError('unknown', String(lastErr));
  }

  private backoff(attempt: number) {
    return this.backoffMs * 2 ** (attempt - 1) + Math.floor(Math.random() * this.backoffMs);
  }
}

function safeJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function errorMessage(body: any): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const m = body.msg ?? body.message ?? body.error_description ?? body.error ?? body.detail;
  const code = body.error_code !== undefined ? ` [error_code ${body.error_code}]` : '';
  return typeof m === 'string' ? `${m}${code}` : undefined;
}

/** Never log tokens that might be in query strings. */
function redact(url: string) {
  return url.replace(/(token|refresh_token|access_token)=[^&]+/gi, '$1=***');
}
