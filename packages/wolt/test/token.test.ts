import { describe, expect, it } from 'vitest';
import { normalizeRefreshToken as n } from '@woltron/shared';

describe('normalizeRefreshToken', () => {
  it('handles the shapes browsers show for __wrtoken', () => {
    expect(n('%22abc123%22')).toBe('abc123'); // Firefox storage inspector
    expect(n('"abc123"')).toBe('abc123'); // Chrome
    expect(n('  abc123 \n')).toBe('abc123');
    expect(n('__wrtoken=%22abc123%22')).toBe('abc123');
    expect(n('foo=1; __wrtoken="abc123"; bar=2')).toBe('abc123');
    expect(n('{"refresh_token":"abc123"}')).toBe('abc123');
    expect(n('%2522abc123%2522')).toBe('abc123'); // double-encoded
  });
});

import { parseMagicLink, tokenFromUrl } from '../src/auth.js';
import { LiveWoltClient } from '../src/live-client.js';

describe('magic links', () => {
  it('finds the token in query, hash, or returns raw codes', () => {
    expect(parseMagicLink('https://wolt.com/en/me/magic-login?token=abc&email=a%40b.c')).toBe('abc');
    expect(parseMagicLink('<https://wolt.com/login#token=xyz>')).toBe('xyz');
    expect(parseMagicLink('  rawcode ')).toBe('rawcode');
    expect(tokenFromUrl('https://click.example.com/ls/click?upn=zzz')).toBeUndefined();
  });

  it('follows click-tracking redirects to the wolt.com link', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      calls.push(u);
      if (u.startsWith('https://click.example.com')) return new Response(null, { status: 302, headers: { location: 'https://wolt.com/me/magic-login?token=tok123' } });
      if (u.includes('/wauth2/access_token')) {
        expect(String(init?.body)).toContain('tok123');
        return Response.json({ access_token: 'a', refresh_token: 'r', expires_in: 1800 });
      }
      return Response.json({ user: { name: { first_name: 'Test' }, email: 't@e.st' } });
    }) as typeof fetch;
    const c = new LiveWoltClient({ fetchImpl });
    const conn = await c.verifyMagicLink('https://click.example.com/ls/click?upn=zzz');
    expect(conn.connected).toBe(true);
    expect(calls[0]).toContain('click.example.com');
  });
});
