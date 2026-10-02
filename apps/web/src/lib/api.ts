/**
 * Tiny typed REST client over the `Routes` map from @woltron/shared.
 *   api('GET /api/presets/:id', { params: { id } })
 */
import type { ApiError as ApiErrorBody, Routes } from '@woltron/shared';

const TOKEN_KEY = 'woltron.token';

export type RouteKey = keyof Routes;
type PathOf<K> = K extends `${string} ${infer P}` ? P : never;
type ParamNames<P> = P extends `${string}:${infer Name}/${infer Rest}`
  ? Name | ParamNames<Rest>
  : P extends `${string}:${infer Name}`
    ? Name
    : never;
type Params<K> = [ParamNames<PathOf<K>>] extends [never] ? { params?: undefined } : { params: Record<ParamNames<PathOf<K>>, string> };
type BodyOpt<K extends RouteKey> = Routes[K] extends { body: infer B } ? { body: B } : { body?: undefined };
type QueryOpt<K extends RouteKey> = Routes[K] extends { query: infer Q } ? { query?: Q } : { query?: undefined };
export type ApiOptions<K extends RouteKey> = Params<K> & BodyOpt<K> & QueryOpt<K> & { signal?: AbortSignal };
export type ApiRes<K extends RouteKey> = Routes[K]['res'];

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/** If the URL carries ?token=…, remember it and strip it from the address bar. */
export function captureTokenFromUrl() {
  const url = new URL(window.location.href);
  const token = url.searchParams.get('token');
  if (!token) return;
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* private mode */
  }
  url.searchParams.delete('token');
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
}

export function buildPath(path: string, params?: Record<string, string>, query?: Record<string, unknown>) {
  let p = path.replace(/:([A-Za-z]+)/g, (_, name: string) => encodeURIComponent(params?.[name] ?? ''));
  if (query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    const s = qs.toString();
    if (s) p += `?${s}`;
  }
  return p;
}

export async function api<K extends RouteKey>(key: K, ...[opts]: {} extends ApiOptions<K> ? [ApiOptions<K>?] : [ApiOptions<K>]): Promise<ApiRes<K>> {
  const [method, path] = (key as string).split(' ') as [string, string];
  const o = (opts ?? {}) as { params?: Record<string, string>; body?: unknown; query?: Record<string, unknown>; signal?: AbortSignal };
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (o.body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(buildPath(path, o.params, o.query), {
      method,
      headers,
      body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
      signal: o.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError('network', 'Can’t reach the Woltron server. Is it running?', 0);
  }
  const text = await res.text();
  let data: unknown = undefined;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = undefined;
  }
  if (!res.ok) {
    const err = (data ?? {}) as Partial<ApiErrorBody>;
    throw new ApiError(err.error ?? `http_${res.status}`, err.message ?? (res.statusText || 'Request failed'), res.status);
  }
  return data as ApiRes<K>;
}

export function eventsUrl(): string {
  const token = getToken();
  return token ? `/api/events?token=${encodeURIComponent(token)}` : '/api/events';
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong';
}
