/**
 * REST contract. All routes are prefixed with /api and exchange JSON.
 * Errors: non-2xx with body `ApiError`.
 * Auth: requests from 127.0.0.1/::1 are trusted. Other origins need
 *   `Authorization: Bearer <token>` or `?token=<token>` (SSE).
 */
import type {
  Automation, FetchResponse, GeoLocation, Menu, OrderMode, Pack, PackPreview, Preset,
  Run, RunSource, SearchResult, Settings, Target, Venue, WoltConnection, ID,
} from './domain.js';

export interface ApiError {
  error: string; // machine code, e.g. "not_found", "wolt_unauthorized", "guard_blocked"
  message: string; // human readable
}

// Create/update payloads: server fills ids, timestamps, counters.
export type PresetInput = Omit<Preset, 'id' | 'createdAt' | 'updatedAt' | 'lastRunAt' | 'runCount'>;
export type PackInput = Omit<Pack, 'id' | 'createdAt' | 'updatedAt' | 'lastRunAt' | 'runCount' | 'cursor' | 'history'>;
export type AutomationInput = Omit<Automation, 'id' | 'createdAt' | 'updatedAt' | 'lastFiredAt' | 'nextFireAt' | 'fireCount'>;

export type SettingsPatch = Partial<Omit<Settings, 'wolt' | 'llm'>> & {
  llm?: { model?: string; apiKey?: string | null }; // apiKey null = clear stored key
};

export interface RunRequest {
  target: Target;
  mode?: OrderMode; // defaults to settings.orderMode
  source?: RunSource; // defaults to 'manual'
  confirm?: 'auto' | 'ask'; // default 'auto' for manual
}

export interface PairingInfo {
  enabled: boolean;
  urls: string[]; // e.g. http://192.168.1.10:4321/?token=...
  token: string;
  qrSvg?: string; // QR for urls[0]
}

/**
 * Route table (method, path → request → response).
 * Kept as a type-level map so the web client and server stay in sync.
 */
export interface Routes {
  'GET /api/health': { res: { ok: true; version: string; mockWolt: boolean } };

  // Settings & auth
  'GET /api/settings': { res: Settings };
  'PATCH /api/settings': { body: SettingsPatch; res: Settings };
  'GET /api/wolt/auth': { res: WoltConnection };
  'POST /api/wolt/auth/token': { body: { refreshToken: string }; res: WoltConnection };
  'POST /api/wolt/auth/login': { body: { email: string }; res: { sent: boolean } }; // magic link, if supported
  'POST /api/wolt/auth/verify': { body: { linkOrCode: string }; res: WoltConnection };
  'DELETE /api/wolt/auth': { res: WoltConnection };
  'GET /api/pairing': { res: PairingInfo };
  'POST /api/pairing/rotate': { res: PairingInfo };

  // Wolt catalog (proxied, cached)
  'GET /api/wolt/geocode': { query: { q: string }; res: GeoLocation[] };
  'GET /api/wolt/venues': { query: { lat?: number; lon?: number; tag?: string }; res: { venues: Venue[]; tags: Array<{ id: string; name: string }> } };
  'GET /api/wolt/venues/:slug': { res: Venue };
  'GET /api/wolt/venues/:slug/menu': { res: Menu };
  'GET /api/wolt/search': { query: { q: string; lat?: number; lon?: number }; res: SearchResult };

  // Presets
  'GET /api/presets': { res: Preset[] };
  'POST /api/presets': { body: PresetInput; res: Preset };
  'GET /api/presets/:id': { res: Preset };
  'PUT /api/presets/:id': { body: PresetInput; res: Preset };
  'DELETE /api/presets/:id': { res: { ok: true } };
  'POST /api/presets/:id/duplicate': { res: Preset };

  // Packs
  'GET /api/packs': { res: Pack[] };
  'POST /api/packs': { body: PackInput; res: Pack };
  'GET /api/packs/:id': { res: Pack };
  'PUT /api/packs/:id': { body: PackInput; res: Pack };
  'DELETE /api/packs/:id': { res: { ok: true } };
  'GET /api/packs/:id/preview': { res: PackPreview };

  // Automations
  'GET /api/automations': { res: Automation[] };
  'POST /api/automations': { body: AutomationInput; res: Automation };
  'GET /api/automations/:id': { res: Automation };
  'PUT /api/automations/:id': { body: AutomationInput; res: Automation };
  'DELETE /api/automations/:id': { res: { ok: true } };
  'POST /api/automations/:id/fire': { res: Run }; // run now, as if triggered
  'POST /api/automations/:id/rotate-secret': { res: Automation };
  'POST /api/automations/describe-cron': { body: { cron: string; timezone: string }; res: { label: string; next: string[] } };
  // Public webhook (secret-authenticated, no bearer needed):
  'POST /api/hooks/:id/:secret': { res: { runId: ID } };

  // Runs
  'GET /api/runs': { query: { limit?: number }; res: Run[] };
  'POST /api/runs': { body: RunRequest; res: Run };
  'GET /api/runs/:id': { res: Run };
  'POST /api/runs/:id/confirm': { res: Run };
  'POST /api/runs/:id/cancel': { res: Run };

  // Fetch (LLM)
  'POST /api/fetch': { body: { query: string; limit?: number }; res: FetchResponse };

  // Realtime: GET /api/events → text/event-stream of ServerEvent (JSON in `data:`)
}
