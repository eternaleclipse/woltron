import os from 'node:os';
import path from 'node:path';
import type { GeoLocation } from '@woltron/shared';

export const VERSION = '0.1.0';
export const DEFAULT_PORT = 4321;
export const DEFAULT_MODEL = 'anthropic/claude-sonnet-4.5';
/** Used if the configured model is rejected by OpenRouter. */
export const FALLBACK_MODEL = 'anthropic/claude-haiku-4.5';
export const DEFAULT_LOCATION: GeoLocation = { lat: 32.0853, lon: 34.7818, address: 'Tel Aviv', label: 'Tel Aviv' };
export const RUNS_CAP = 500;
export const PACK_HISTORY_CAP = 50;

export const defaultDataDir = (): string => process.env.WOLTRON_DATA_DIR || path.join(os.homedir(), '.woltron');

export const envPort = (): number | undefined => {
  const p = Number(process.env.WOLTRON_PORT);
  return Number.isInteger(p) && p > 0 ? p : undefined;
};

export const envMock = (): boolean => ['1', 'true', 'yes'].includes((process.env.WOLTRON_WOLT_MOCK ?? '').toLowerCase());
