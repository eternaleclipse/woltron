/**
 * Woltron domain model — the single source of truth shared by server, web and desktop.
 * Money is always in minor units (agorot/cents) as integers, plus a currency code.
 */

export type ID = string;
export type ISODate = string;

export interface Money {
  amount: number; // minor units
  currency: string; // ISO 4217, e.g. "ILS", "EUR"
}

export interface GeoLocation {
  lat: number;
  lon: number;
  address?: string;
  label?: string; // "Home", "Office"
}

// ───────────────────────────── Wolt catalog ─────────────────────────────

export interface Venue {
  id: string;
  slug: string;
  name: string;
  shortDescription?: string;
  image?: string; // cover image URL
  logo?: string; // brand image URL
  blurhash?: string;
  address?: string;
  location?: { lat: number; lon: number };
  rating?: { score: number; volume?: number }; // score 0-10
  priceRange?: number; // 1-4
  deliveryEstimateMin?: number; // minutes
  deliveryEstimateRange?: string; // "25-35"
  deliveryPrice?: Money;
  online: boolean; // currently accepting orders
  delivers: boolean;
  tags: string[]; // cuisine/category tags
  currency: string;
  url?: string; // wolt.com URL
}

export interface MenuOptionValue {
  id: string;
  name: string;
  price: Money;
  isDefault?: boolean;
}

export interface MenuOptionGroup {
  id: string;
  name: string;
  min: number;
  max: number; // 0 = unlimited
  values: MenuOptionValue[];
}

export interface MenuItem {
  id: string;
  venueId: string;
  venueSlug: string;
  categoryId?: string;
  name: string;
  description?: string;
  image?: string;
  blurhash?: string;
  price: Money;
  available: boolean;
  dietary?: string[]; // "vegan", "vegetarian", "gluten-free", "spicy"…
  options: MenuOptionGroup[];
}

export interface MenuCategory {
  id: string;
  name: string;
  description?: string;
  itemIds: string[];
}

export interface Menu {
  venue: Venue;
  categories: MenuCategory[];
  items: MenuItem[];
  fetchedAt: ISODate;
}

export interface SearchResult {
  venues: Venue[];
  items: Array<{ item: MenuItem; venue: Venue }>;
}

// ───────────────────────────── Presets & Packs ─────────────────────────────

export interface ChosenOption {
  groupId: string;
  valueIds: string[];
}

export interface PresetItem {
  key: ID; // local unique key within preset
  venueId: string;
  venueSlug: string;
  venueName: string;
  itemId: string;
  name: string;
  image?: string;
  unitPrice: Money; // incl. chosen options, at time of saving
  quantity: number;
  options: ChosenOption[];
  optionSummary?: string; // "Large, extra cheese"
  note?: string;
}

export interface Preset {
  id: ID;
  name: string;
  emoji: string;
  color: string; // accent token name or hex
  description?: string;
  items: PresetItem[];
  tags: string[];
  deliveryNote?: string;
  tip?: Money;
  favorite: boolean;
  createdAt: ISODate;
  updatedAt: ISODate;
  lastRunAt?: ISODate;
  runCount: number;
}

export type PackStrategy = 'shuffle' | 'weighted' | 'round-robin' | 'fresh';

export interface PackMember {
  presetId: ID;
  weight: number; // 1-5 "bones", used by weighted
}

export interface Pack {
  id: ID;
  name: string;
  emoji: string;
  color: string;
  description?: string;
  members: PackMember[];
  strategy: PackStrategy;
  avoidRepeats: number; // for 'fresh': exclude last N picks
  cursor: number; // for 'round-robin'
  history: Array<{ presetId: ID; at: ISODate; runId?: ID }>; // newest first, capped 50
  favorite: boolean;
  createdAt: ISODate;
  updatedAt: ISODate;
  lastRunAt?: ISODate;
  runCount: number;
}

export interface PackPreview {
  packId: ID;
  strategy: PackStrategy;
  nextUp?: ID; // deterministic strategies
  odds: Array<{ presetId: ID; probability: number }>;
}

// ───────────────────────────── Automations ─────────────────────────────

export type Target = { kind: 'preset'; id: ID } | { kind: 'pack'; id: ID };

export type Trigger =
  | { type: 'schedule'; cron: string; timezone: string; humanLabel?: string }
  | { type: 'once'; at: ISODate }
  | { type: 'webhook'; secret: string }
  | { type: 'venue-online'; venueSlug: string; venueName?: string };

export type ConfirmPolicy = 'auto' | 'ask';

export interface AutomationGuards {
  maxTotal?: Money; // skip if run total exceeds
  onlyIfAllVenuesOpen: boolean;
  skipDates?: string[]; // YYYY-MM-DD
}

export interface Automation {
  id: ID;
  name: string;
  enabled: boolean;
  target: Target;
  trigger: Trigger;
  confirm: ConfirmPolicy;
  confirmWindowMin: number; // for 'ask'
  guards: AutomationGuards;
  createdAt: ISODate;
  updatedAt: ISODate;
  lastFiredAt?: ISODate;
  nextFireAt?: ISODate; // computed by server
  fireCount: number;
}

// ───────────────────────────── Runs (orders) ─────────────────────────────

export type OrderMode = 'dry-run' | 'live' | 'handoff';

export type RunSource = 'manual' | 'schedule' | 'once' | 'webhook' | 'venue-online' | 'fetch' | 'tray' | 'deeplink';

export type RunStatus =
  | 'pending'
  | 'awaiting-confirmation'
  | 'placing'
  | 'placed' // live order accepted by Wolt
  | 'handed-off' // basket built; user finishes on wolt.com
  | 'simulated' // dry-run complete
  | 'delivered'
  | 'skipped' // guard prevented the run
  | 'failed'
  | 'cancelled'
  | 'expired'; // confirmation window passed

export type VenueOrderStatus =
  | 'pending'
  | 'validating'
  | 'ready'
  | 'placing'
  | 'placed'
  | 'handed-off'
  | 'simulated'
  | 'in-delivery'
  | 'delivered'
  | 'failed'
  | 'skipped';

export interface RunLine {
  itemId: string;
  name: string;
  quantity: number;
  unitPrice: Money; // current price at validation time
  available: boolean;
  optionSummary?: string;
  image?: string;
}

export interface VenueOrder {
  venueId: string;
  venueSlug: string;
  venueName: string;
  venueImage?: string;
  lines: RunLine[];
  subtotal: Money;
  deliveryFee?: Money;
  serviceFee?: Money;
  total: Money;
  status: VenueOrderStatus;
  woltOrderId?: string;
  checkoutUrl?: string; // handoff / tracking URL
  etaMinutes?: number;
  error?: string;
}

export interface RunLogEntry {
  at: ISODate;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
}

export interface Run {
  id: ID;
  createdAt: ISODate;
  updatedAt: ISODate;
  source: RunSource;
  mode: OrderMode;
  status: RunStatus;
  target: Target;
  presetId: ID; // resolved preset (packs resolve to a preset)
  presetName: string;
  packId?: ID;
  packName?: string;
  automationId?: ID;
  venueOrders: VenueOrder[];
  total: Money;
  confirmBy?: ISODate; // for awaiting-confirmation
  log: RunLogEntry[];
}

// ───────────────────────────── Fetch (LLM search) ─────────────────────────────

export interface FetchIntent {
  searchTerms: string[];
  cuisines: string[];
  dietary: string[];
  excluded: string[];
  maxPrice?: Money;
  mood?: string;
  partySize?: number;
}

export interface FetchSuggestion {
  item: MenuItem;
  venue: Venue;
  score: number; // 0-1
  reason: string; // one-liner shown in UI
}

export interface FetchResponse {
  query: string;
  intent: FetchIntent;
  suggestions: FetchSuggestion[];
  usedLLM: boolean;
  model?: string;
  tookMs: number;
}

// ───────────────────────────── Settings ─────────────────────────────

export interface Settings {
  location?: GeoLocation;
  savedLocations: GeoLocation[];
  orderMode: OrderMode; // default 'dry-run'
  limits: {
    maxPerRun?: Money;
    maxPerDay?: Money;
  };
  llm: {
    model: string;
    hasApiKey: boolean; // read-only: env or stored key available
    keySource: 'env' | 'stored' | 'none'; // read-only
  };
  wolt: WoltConnection; // read-only on client
  lan: {
    enabled: boolean;
    port: number;
  };
  appearance: {
    theme: 'system' | 'light' | 'dark';
    reducedMotion: boolean;
    mascotName: string; // default "Woltie"
  };
  notifications: {
    desktop: boolean;
    sound: boolean;
  };
  language: string; // wolt content language, e.g. "en"
}

export interface WoltConnection {
  connected: boolean;
  user?: { name?: string; email?: string; phone?: string };
  expiresAt?: ISODate;
  lastError?: string;
}

// ───────────────────────────── Realtime events (SSE) ─────────────────────────────

export type ServerEvent =
  | { type: 'run.updated'; run: Run }
  | { type: 'preset.changed'; id: ID }
  | { type: 'pack.changed'; id: ID }
  | { type: 'automation.changed'; id: ID }
  | { type: 'automation.fired'; automationId: ID; runId: ID }
  | { type: 'settings.updated'; settings: Settings }
  | { type: 'notification'; level: 'info' | 'success' | 'warn' | 'error'; title: string; body?: string; runId?: ID }
  | { type: 'hello'; serverTime: ISODate; version: string };
