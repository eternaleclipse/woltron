import type { WoltClient } from '@woltron/shared';
import { createFallbackMockClient } from './fallback-mock.js';

export { createFallbackMockClient };

export interface LoadedWolt {
  client: WoltClient;
  /** 'package' = @woltron/wolt (live or its own mock), 'fallback' = built-in stand-in fixtures */
  source: 'package' | 'fallback';
}

/**
 * Load the client from `@woltron/wolt` (bundled into dist). The built-in stand-in is only a
 * last resort if the package can't be loaded or fails to construct.
 */
export async function loadWoltClient(opts: { mock: boolean; language?: string; logger?: (m: string) => void }): Promise<LoadedWolt> {
  try {
    const mod = await import('@woltron/wolt');
    const client = mod.createWoltClient({ mock: opts.mock, language: opts.language, logger: opts.logger });
    return { client, source: 'package' };
  } catch (e) {
    console.warn(`[woltron] @woltron/wolt unavailable (${(e as Error).message?.split('\n')[0]}); using built-in stand-in`);
  }
  return { client: createFallbackMockClient(), source: 'fallback' };
}
