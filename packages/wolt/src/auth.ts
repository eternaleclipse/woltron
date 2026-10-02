/**
 * Wolt session handling.
 *
 * VERIFIED (live, error path): `POST https://authentication.wolt.com/v1/wauth2/access_token`
 *   form-encoded `grant_type=refresh_token&refresh_token=<__wrtoken>` → 401 {error_code:126} when invalid.
 * Success shape `{access_token, refresh_token, expires_in, token_type:"Bearer"}` is from the
 * wolt.com bundle + open-source clients; Wolt ROTATES the refresh token on every exchange.
 * Magic link: `grant_type=email_login&token=<token from link>&audience=wolt-com` (bundle).
 */
import { WoltError, type WoltTokens } from '@woltron/shared';
import { HOSTS, HttpCore, HttpError } from './http.js';

const EARLY_REFRESH_MS = 60_000;

export class TokenManager {
  private tokens: WoltTokens | null = null;
  private listeners: Array<(t: WoltTokens) => void> = [];
  private inflight: Promise<string> | null = null;

  constructor(private readonly http: HttpCore) {}

  get hasSession() {
    return Boolean(this.tokens?.refreshToken || this.tokens?.accessToken);
  }

  get current(): WoltTokens | null {
    return this.tokens ? { ...this.tokens } : null;
  }

  set(tokens: WoltTokens | null) {
    this.tokens = tokens ? { ...tokens } : null;
    this.inflight = null;
  }

  onRefreshed(cb: (t: WoltTokens) => void) {
    this.listeners.push(cb);
  }

  private emit() {
    if (!this.tokens) return;
    const snapshot = { ...this.tokens };
    for (const cb of this.listeners) {
      try {
        cb(snapshot);
      } catch {
        /* listener errors must not break auth */
      }
    }
  }

  /** Returns a valid access token, refreshing (single-flight) when missing/expiring. */
  async accessToken(force = false): Promise<string> {
    if (!this.tokens) throw new WoltError('unauthorized', 'Not connected to Wolt');
    const { accessToken, refreshToken, expiresAt } = this.tokens;
    const exp = expiresAt ? Date.parse(expiresAt) : NaN;
    // Unknown expiry: use the token and rely on the 401 → force-refresh path.
    const fresh = Boolean(accessToken) && (!Number.isFinite(exp) || exp - Date.now() > EARLY_REFRESH_MS);
    if (!force && fresh) return accessToken!;
    if (!refreshToken) throw new WoltError('unauthorized', 'Wolt session expired and no refresh token is available');
    this.inflight ??= this.refresh().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  /** Exchange the refresh token. Stores rotated tokens and notifies listeners. */
  async refresh(): Promise<string> {
    const rt = this.tokens?.refreshToken;
    if (!rt) throw new WoltError('unauthorized', 'No Wolt refresh token');
    const res = await this.grant(new URLSearchParams({ grant_type: 'refresh_token', refresh_token: rt }));
    return this.adopt(res);
  }

  /** Exchange a magic-link token (email login). */
  async emailLogin(token: string): Promise<string> {
    const res = await this.grant(new URLSearchParams({ grant_type: 'email_login', token, audience: 'wolt-com' }));
    return this.adopt(res);
  }

  private async grant(body: URLSearchParams): Promise<any> {
    try {
      return await this.http.json(`${HOSTS.auth}/v1/wauth2/access_token`, { method: 'POST', body, retry: false });
    } catch (e) {
      if (e instanceof HttpError && (e.status === 400 || e.status === 401 || e.status === 403)) {
        throw new WoltError('unauthorized', `Wolt rejected the login (${e.status}). Request a fresh login link from wolt.com and paste it here.`, e.status);
      }
      throw e;
    }
  }

  private adopt(res: any): string {
    if (res && (res.access_confirmation || res.status === 'accessConfirmationRequired' || res.mfa_required)) {
      throw new WoltError('unsupported', 'Wolt requires an extra verification step (SMS/MFA) for this login; finish it on wolt.com and paste the __wrtoken instead.');
    }
    const access = res?.access_token;
    if (typeof access !== 'string' || !access) throw new WoltError('unknown', 'Wolt token response had no access_token');
    const expiresIn = Number(res.expires_in) || 1800;
    this.tokens = {
      accessToken: access,
      refreshToken: typeof res.refresh_token === 'string' && res.refresh_token ? res.refresh_token : (this.tokens?.refreshToken ?? ''),
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    };
    this.emit();
    return access;
  }
}

const TOKEN_KEYS = ['token', 'magic_token', 'login_token', 'email_token'];

/** Token from a wolt.com login URL (query or #hash), or undefined if this URL doesn't carry one. */
export function tokenFromUrl(url: string): string | undefined {
  try {
    const u = new URL(url);
    for (const params of [u.searchParams, new URLSearchParams(u.hash.replace(/^#/, ''))]) {
      for (const k of TOKEN_KEYS) {
        const t = params.get(k);
        if (t) return t;
      }
    }
  } catch {
    /* not a URL */
  }
  return undefined;
}

export const isUrl = (s: string) => /^https?:\/\//i.test(s.trim());

/** Extract the magic-link token from a pasted link (…?token=…&email=…) or return the raw code. */
export function parseMagicLink(linkOrCode: string): string {
  const s = linkOrCode.trim().replace(/^["'<]+|["'>]+$/g, '');
  return tokenFromUrl(s) ?? s;
}
