import type { ApiError } from '@woltron/shared';
import { WoltError } from '@woltron/shared';

/** Error that maps 1:1 to an `ApiError` response body. */
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }

  toJSON(): ApiError {
    return { error: this.code, message: this.message };
  }
}

export const notFound = (what: string) => new HttpError(404, 'not_found', `${what} not found`);
export const badRequest = (message: string, code = 'bad_request') => new HttpError(400, code, message);

const woltStatus: Record<WoltError['code'], number> = {
  unauthorized: 401,
  not_found: 404,
  venue_offline: 409,
  item_unavailable: 409,
  rate_limited: 429,
  unsupported: 501,
  network: 502,
  unknown: 502,
};

/** Duck-typed WoltError check: the real client may ship its own copy of the class. */
export function isWoltError(e: unknown): e is WoltError {
  return (
    e instanceof WoltError ||
    (typeof e === 'object' && e !== null && (e as { name?: string }).name === 'WoltError' && typeof (e as { code?: unknown }).code === 'string')
  );
}

export function toHttpError(e: unknown): HttpError {
  if (e instanceof HttpError) return e;
  if (isWoltError(e)) return new HttpError(woltStatus[e.code] ?? 502, `wolt_${e.code}`, e.message);
  const message = e instanceof Error ? e.message : String(e);
  return new HttpError(500, 'internal', message);
}

export const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));
