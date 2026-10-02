/** Small TTL + in-flight-dedupe cache for catalog proxy routes. */
export class TtlCache {
  private entries = new Map<string, { at: number; value: Promise<unknown> }>();

  constructor(private readonly maxEntries = 500) {}

  async get<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const hit = this.entries.get(key);
    if (hit && now - hit.at < ttlMs) return hit.value as Promise<T>;
    const value = load();
    this.entries.set(key, { at: now, value });
    value.catch(() => this.entries.delete(key)); // never cache failures
    if (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    return value;
  }

  clear(): void {
    this.entries.clear();
  }
}

export const TTL = {
  venues: 2 * 60_000,
  venue: 60_000,
  menu: 5 * 60_000,
  search: 2 * 60_000,
  geocode: 60 * 60_000,
};
