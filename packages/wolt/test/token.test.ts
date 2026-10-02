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
