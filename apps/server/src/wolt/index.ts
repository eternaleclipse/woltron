import type { WoltClient } from '@woltron/shared';
import { createFallbackMockClient } from './fallback-mock.js';

export { createFallbackMockClient };

export interface LoadedWolt {
  client: WoltClient;
  /** 'package' = @woltron/wolt, 'fallback' = built-in stand-in fixtures */
  source: 'package' | 'fallback';
}

/**
 * Load the real client from `@woltron/wolt`; fall back to the built-in stand-in if the
 * package can't be resolved or fails to construct.
 */
export async function loadWoltClient(opts: { mock: boolean; language?: string }): Promise<LoadedWolt> {
  try {
    // @ts-ignore -- optional workspace package; may not exist in every checkout
    const mod = (await import('@woltron/wolt')) as { createWoltClient?: (o: { mock: boolean; language?: string }) => WoltClient | Promise<WoltClient> };
    if (typeof mod.createWoltClient === 'function') {
      const client = await mod.createWoltClient({ mock: opts.mock, language: opts.language });
      return { client, source: 'package' };
    }
    console.warn('[woltron] @woltron/wolt has no createWoltClient export; using built-in stand-in');
  } catch (e) {
    console.warn(`[woltron] @woltron/wolt unavailable (${(e as Error).message?.split('\n')[0]}); using built-in stand-in`);
  }
  return { client: createFallbackMockClient(), source: 'fallback' };
}
