import type { WoltClient } from '@woltron/shared';
import { LiveWoltClient, type LiveClientOptions } from './live-client.js';
import { MockWoltClient } from './mock-client.js';

export interface CreateWoltClientOptions extends LiveClientOptions {
  /** Use fixture data instead of the network. Defaults to env WOLTRON_WOLT_MOCK=1. */
  mock?: boolean;
  /** Wolt content language (menus, labels), e.g. "en", "he". Default "en". */
  language?: string;
  fetchImpl?: typeof fetch;
  logger?: (msg: string) => void;
}

export function createWoltClient(opts: CreateWoltClientOptions = {}): WoltClient {
  const mock = opts.mock ?? process.env.WOLTRON_WOLT_MOCK === '1';
  return mock ? new MockWoltClient(opts) : new LiveWoltClient(opts);
}

export { LiveWoltClient, mapUser, type LiveClientOptions, type WoltQuoteExtras } from './live-client.js';
export { MockWoltClient, type MockClientOptions } from './mock-client.js';
export { HttpCore, HOSTS } from './http.js';
export { DEFAULT_LOCATION, haversineMeters, venueUrl } from './geo.js';
export * as mappers from './mappers.js';
export { resolveBasket } from './ordering.js';
