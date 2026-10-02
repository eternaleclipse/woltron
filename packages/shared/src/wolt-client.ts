/**
 * Interface the server codes against. Implemented by packages/wolt
 * (`createWoltClient({ mock })`). Keep it free of HTTP details.
 */
import type { GeoLocation, Menu, Money, SearchResult, Venue, WoltConnection, ChosenOption } from './domain.js';

export interface WoltTokens {
  accessToken?: string;
  refreshToken: string;
  expiresAt?: string; // ISO
}

export interface BasketLineInput {
  itemId: string;
  quantity: number;
  options: ChosenOption[];
}

export interface BasketQuote {
  venueSlug: string;
  basketId?: string;
  subtotal: Money;
  deliveryFee?: Money;
  serviceFee?: Money;
  total: Money;
  etaMinutes?: number;
  checkoutUrl?: string; // URL that opens this basket on wolt.com
  warnings: string[];
}

export interface PlacedOrder {
  orderId: string;
  status: string;
  trackingUrl?: string;
  etaMinutes?: number;
}

export interface WoltClient {
  readonly mock: boolean;

  // Public catalog
  geocode(query: string): Promise<GeoLocation[]>;
  listVenues(loc: GeoLocation): Promise<{ venues: Venue[]; tags: Array<{ id: string; name: string }> }>;
  getVenue(slug: string, loc?: GeoLocation): Promise<Venue>;
  getMenu(slug: string, loc?: GeoLocation): Promise<Menu>;
  search(query: string, loc: GeoLocation): Promise<SearchResult>;

  // Auth
  setTokens(tokens: WoltTokens | null): void;
  onTokensRefreshed(cb: (tokens: WoltTokens) => void): void;
  connectWithRefreshToken(refreshToken: string): Promise<WoltConnection>;
  requestMagicLink?(email: string): Promise<void>;
  verifyMagicLink?(linkOrCode: string): Promise<WoltConnection>;
  connection(): Promise<WoltConnection>;

  // Ordering (requires auth)
  quoteBasket(venueSlug: string, lines: BasketLineInput[], loc: GeoLocation): Promise<BasketQuote>;
  placeOrder(quote: BasketQuote, opts: { loc: GeoLocation; deliveryNote?: string; tip?: Money }): Promise<PlacedOrder>;
  getOrderStatus?(orderId: string): Promise<{ status: string; etaMinutes?: number; delivered: boolean }>;
}

export class WoltError extends Error {
  constructor(
    public code: 'unauthorized' | 'not_found' | 'venue_offline' | 'item_unavailable' | 'rate_limited' | 'unsupported' | 'network' | 'unknown',
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'WoltError';
  }
}
