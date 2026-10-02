/**
 * Normalise whatever the user pasted as a Wolt refresh token. Browsers show the `__wrtoken`
 * cookie in different shapes: Firefox URL-encodes the surrounding quotes (`%22abc%22`), Chrome
 * shows `"abc"`, and people often copy `__wrtoken=abc`, a whole Cookie header, or a JSON blob.
 */
export function normalizeRefreshToken(input: string): string {
  let s = input.trim();
  const cookie = /(?:^|[;\s])__wrtoken\s*[=:]\s*([^;\s]+)/.exec(s);
  if (cookie) s = cookie[1]!;
  for (let i = 0; i < 3 && /%[0-9a-f]{2}/i.test(s); i++) {
    try {
      s = decodeURIComponent(s);
    } catch {
      break;
    }
  }
  s = s.trim();
  if (s.startsWith('{')) {
    try {
      const o = JSON.parse(s) as Record<string, unknown>;
      const v = o.refresh_token ?? o.refreshToken ?? o.token;
      if (typeof v === 'string') s = v;
    } catch {
      /* not JSON; fall through */
    }
  }
  return s.replace(/^["'`]+|["'`]+$/g, '').trim();
}
