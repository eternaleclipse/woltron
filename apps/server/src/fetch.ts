/**
 * "Go fetch!" — free-text food search: LLM intent → Wolt search → LLM rerank.
 * Falls back to keyword search + heuristic ranking without an API key (or if the LLM fails).
 */
import type { FetchIntent, FetchResponse, FetchSuggestion, GeoLocation, MenuItem, Venue, WoltClient } from '@woltron/shared';
import { badRequest, errorMessage } from './errors.js';
import { fmt } from './format.js';
import { chatJson } from './llm.js';

export interface FetchDeps {
  wolt: WoltClient;
  location: GeoLocation;
  apiKey?: string;
  model: string;
  currency?: string;
  fetchImpl?: typeof fetch;
  log?: (msg: string) => void;
}

const MAX_CANDIDATES = 60;
const SEARCH_CONCURRENCY = 4;
const MAX_TERMS = 6;
const MAX_PER_VENUE = 4;
const RETAIL_TAGS = new Set(['grocery', 'groceries', 'convenience', 'kiosk', 'pharmacy', 'alcohol', 'flowers', 'retail', 'pet', 'electronics', 'beauty', 'milk']);
const RETAIL_WORDS = /grocer|supermarket|kiosk|snack|drinks|beer|wine|pharmacy/i;
const isRetail = (v: Venue) => v.tags.some((t) => RETAIL_TAGS.has(t.toLowerCase()));

type Candidate = { item: MenuItem; venue: Venue; terms: Set<string> };

const DIETARY_WORDS = ['vegan', 'vegetarian', 'gluten-free', 'gluten free', 'spicy', 'kosher', 'dairy-free', 'halal', 'keto', 'healthy', 'low-carb'];
const STOPWORDS = new Set(
  'a an the and or for with without some something somethin anything me i im i\'m want wanna would like to of in on at my please get order food meal dinner lunch breakfast tonight today now under below less than max cheap around about craving feel feeling eat hungry really very good nice that is not no but two three four five six people person us guys quick fast delivery cosy cozy tasty yummy light'.split(' '),
);

const norm = (s: string) => s.toLowerCase();
const tokens = (s: string) => norm(s).split(/[^\p{L}\p{N}-]+/u).filter((w) => w.length > 1);

function itemText(c: { item: MenuItem; venue: Venue }) {
  return norm(`${c.item.name} ${c.item.description ?? ''} ${(c.item.dietary ?? []).join(' ')} ${c.venue.name} ${c.venue.tags.join(' ')}`);
}

function itemDietary(item: MenuItem): string[] {
  const text = norm(`${item.name} ${item.description ?? ''}`);
  const out = new Set(item.dietary ?? []);
  if (/\bvegan\b|🌱/.test(text)) out.add('vegan');
  if (/vegetarian|veggie/.test(text)) out.add('vegetarian');
  if (/spicy|chili|chilli|hot\b|🌶/.test(text)) out.add('spicy');
  if (/gluten[- ]free/.test(text)) out.add('gluten-free');
  return [...out];
}

// ───────────────────────── keyword fallback ─────────────────────────

export function heuristicIntent(query: string, currency = 'ILS'): FetchIntent {
  const q = norm(query);
  let maxPrice: FetchIntent['maxPrice'];
  const price = q.match(/(?:under|below|less than|max|up to|<)\s*[₪$€£]?\s*(\d+(?:\.\d+)?)/) ?? q.match(/[₪$€£]\s*(\d+(?:\.\d+)?)/);
  if (price) maxPrice = { amount: Math.round(Number(price[1]) * 100), currency };
  const dietary = DIETARY_WORDS.filter((d) => q.includes(d)).map((d) => d.replace(' ', '-'));
  const excluded = [...q.matchAll(/\b(?:no|without|not|nothing|avoid)\s+([\p{L}-]+)/gu)].map((m) => m[1]!);
  const cleaned = q
    .replace(/(?:under|below|less than|max|up to|<)\s*[₪$€£]?\s*\d+(?:\.\d+)?/g, ' ')
    .replace(/[₪$€£]\s*\d+(?:\.\d+)?/g, ' ')
    .replace(/\b(?:no|without|not|nothing|avoid)\s+[\p{L}-]+/gu, ' ');
  const words = tokens(cleaned).filter((w) => !STOPWORDS.has(w) && !/^\d+$/.test(w) && !DIETARY_WORDS.includes(w));
  const searchTerms = [...new Set(words)].slice(0, 4);
  if (searchTerms.length === 0) searchTerms.push(...(dietary.length ? dietary.slice(0, 2) : [query.trim()]));
  return { searchTerms, cuisines: [], dietary, excluded, maxPrice, mood: undefined };
}

function heuristicScore(c: Candidate, intent: FetchIntent): number {
  const text = itemText(c);
  const words = [...intent.searchTerms, ...intent.cuisines].flatMap(tokens);
  const hits = words.filter((w) => text.includes(w)).length;
  const termScore = words.length ? hits / words.length : 0;
  const diet = itemDietary(c.item);
  const dietScore = intent.dietary.length ? intent.dietary.filter((d) => diet.includes(d) || text.includes(d)).length / intent.dietary.length : 0;
  const rating = (c.venue.rating?.score ?? 7) / 10;
  const nameHit = words.some((w) => norm(c.item.name).includes(w)) ? 0.2 : 0;
  return Math.min(1, 0.45 * termScore + 0.25 * dietScore + 0.2 * rating + nameHit + (c.item.image ? 0.02 : 0));
}

function heuristicReason(c: Candidate, intent: FetchIntent): string {
  const bits: string[] = [];
  const diet = itemDietary(c.item).filter((d) => intent.dietary.includes(d) || d === 'spicy' || d === 'vegan');
  if (diet.length) bits.push(diet.map((d) => d[0]!.toUpperCase() + d.slice(1)).join(', '));
  else {
    const t = [...c.terms][0];
    if (t) bits.push(`Matches “${t}”`);
  }
  bits.push(fmt(c.item.price));
  if (c.venue.deliveryEstimateMin) bits.push(`${c.venue.deliveryEstimateMin} min`);
  if (c.venue.rating?.score) bits.push(`★ ${c.venue.rating.score.toFixed(1)}`);
  return bits.join(' · ');
}

// ───────────────────────── candidates ─────────────────────────

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]!);
      }
    }),
  );
  return out;
}

export async function gatherCandidates(wolt: WoltClient, loc: GeoLocation, intent: FetchIntent, log?: (m: string) => void): Promise<Candidate[]> {
  const terms = [...new Set(intent.searchTerms.map((t) => t.trim()).filter(Boolean))].slice(0, MAX_TERMS);
  const results = await pool(terms, SEARCH_CONCURRENCY, async (term) => {
    try {
      return { term, res: await wolt.search(term, loc) };
    } catch (e) {
      log?.(`search "${term}" failed: ${errorMessage(e)}`);
      return { term, res: { venues: [], items: [] } };
    }
  });
  const excluded = intent.excluded.map(norm).filter(Boolean);
  const byId = new Map<string, Candidate>();
  const perVenue = new Map<string, number>();
  // Supermarkets and kiosks match every dish name with packaged goods; skip them unless asked.
  const wantsRetail = [...intent.searchTerms, ...intent.cuisines].some((t) => RETAIL_WORDS.test(t));
  // Interleave results across terms so every term gets representation before the cap.
  const lists = results.map((r) => r.res.items.map((x) => ({ ...x, term: r.term })));
  const maxLen = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < maxLen && byId.size < MAX_CANDIDATES; i++) {
    for (const list of lists) {
      const x = list[i];
      if (!x || byId.size >= MAX_CANDIDATES) continue;
      const key = `${x.venue.id}:${x.item.id}`;
      const existing = byId.get(key);
      if (existing) {
        existing.terms.add(x.term);
        continue;
      }
      if (!x.item.available || !x.venue.online) continue;
      if (!wantsRetail && isRetail(x.venue)) continue;
      const n = perVenue.get(x.venue.id) ?? 0;
      if (n >= MAX_PER_VENUE) continue;
      perVenue.set(x.venue.id, n + 1);
      if (intent.maxPrice && x.item.price.amount > intent.maxPrice.amount) continue;
      const text = norm(`${x.item.name} ${x.item.description ?? ''}`);
      if (excluded.some((ex) => text.includes(ex))) continue;
      byId.set(key, { item: x.item, venue: x.venue, terms: new Set([x.term]) });
    }
  }
  return [...byId.values()];
}

// ───────────────────────── LLM steps ─────────────────────────

const INTENT_SYSTEM = `You are Woltron, a food-delivery helper dog. Convert the user's craving into a search plan for the Wolt food delivery app.
Reply with ONLY a JSON object with these keys:
- "searchTerms": 2-5 short search keywords in English that a restaurant/dish search engine understands (dish names or cuisines, e.g. "ramen", "pad thai", "vegan burger"), most specific first
- "cuisines": cuisine names (may be empty)
- "dietary": any of "vegan","vegetarian","gluten-free","spicy","kosher","dairy-free","halal","healthy" that the user asked for
- "excluded": foods/ingredients the user wants to avoid
- "maxPrice": number or null — max price per item in major currency units (e.g. 60 for "under ₪60")
- "mood": a short phrase (max 6 words) capturing the vibe
- "partySize": number or null`;

interface RawIntent {
  searchTerms?: unknown;
  cuisines?: unknown;
  dietary?: unknown;
  excluded?: unknown;
  maxPrice?: unknown;
  mood?: unknown;
  partySize?: unknown;
}

const strArr = (x: unknown): string[] => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string' && s.trim() !== '').map((s) => s.trim()) : []);

export function normalizeIntent(raw: RawIntent, query: string, currency: string): FetchIntent {
  const searchTerms = strArr(raw.searchTerms).slice(0, MAX_TERMS);
  const price = typeof raw.maxPrice === 'number' ? raw.maxPrice : typeof raw.maxPrice === 'string' ? Number.parseFloat(raw.maxPrice) : NaN;
  return {
    searchTerms: searchTerms.length ? searchTerms : heuristicIntent(query, currency).searchTerms,
    cuisines: strArr(raw.cuisines),
    dietary: strArr(raw.dietary).map((d) => d.toLowerCase()),
    excluded: strArr(raw.excluded),
    maxPrice: Number.isFinite(price) && price > 0 ? { amount: Math.round(price * 100), currency } : undefined,
    mood: typeof raw.mood === 'string' && raw.mood.trim() ? raw.mood.trim() : undefined,
    partySize: typeof raw.partySize === 'number' && raw.partySize > 0 ? Math.round(raw.partySize) : undefined,
  };
}

const RERANK_SYSTEM = `You are Woltron, a food-delivery helper dog with great taste. Pick the best dishes for the user's request from the numbered candidates.
Rules: respect dietary needs, exclusions and budget; prefer real restaurant dishes over packaged/grocery products; prefer a variety of restaurants; prefer good ratings and short delivery times when otherwise equal; never invent ids.
Many dish names are in Hebrew (or another local language) — read them, but always write in English.
Reply with ONLY a JSON object: {"picks":[{"id":"c3","score":0.92,"reason":"..."}]} ordered best first.
"score" is 0-1 fit. "reason" is a punchy English one-liner (max 90 chars) shown on the result card under the original dish name. If the name isn't English, start with what the dish is. E.g. "Spicy pad thai, vegan-friendly · ₪48 · 25 min" or "Rich tonkotsu ramen — cosy and under budget".`;

function candidateLine(id: string, c: Candidate): string {
  const diet = itemDietary(c.item);
  const desc = (c.item.description ?? '').replace(/\s+/g, ' ').slice(0, 110);
  return [
    id,
    c.item.name,
    `@ ${c.venue.name}`,
    fmt(c.item.price),
    diet.length ? diet.join('/') : '',
    c.venue.rating?.score ? `★${c.venue.rating.score}` : '',
    c.venue.deliveryEstimateRange ? `${c.venue.deliveryEstimateRange} min` : c.venue.deliveryEstimateMin ? `${c.venue.deliveryEstimateMin} min` : '',
    desc,
  ]
    .filter(Boolean)
    .join(' | ');
}

// ───────────────────────── pipeline ─────────────────────────

export async function runFetch(query: string, limit: number, deps: FetchDeps): Promise<FetchResponse> {
  const started = Date.now();
  const q = query.trim();
  if (!q) throw badRequest('Tell me what you’re hungry for');
  if (q.length > 500) throw badRequest('That’s a long craving — keep it under 500 characters');
  const n = Math.max(1, Math.min(20, Math.floor(limit || 8)));
  const currency = deps.currency ?? 'ILS';
  const llmOpts = deps.apiKey ? { apiKey: deps.apiKey, model: deps.model, fetchImpl: deps.fetchImpl } : undefined;

  let usedLLM = false;
  let model: string | undefined;
  let intent: FetchIntent;
  if (llmOpts) {
    try {
      const r = await chatJson<RawIntent>({
        ...llmOpts,
        timeoutMs: 20_000,
        maxTokens: 1000,
        messages: [
          { role: 'system', content: INTENT_SYSTEM },
          { role: 'user', content: `Currency: ${currency}.\nRequest: ${q}` },
        ],
      });
      intent = normalizeIntent(r.data, q, currency);
      usedLLM = true;
      model = r.model;
    } catch (e) {
      deps.log?.(`intent extraction failed, using keywords: ${errorMessage(e)}`);
      intent = heuristicIntent(q, currency);
    }
  } else {
    intent = heuristicIntent(q, currency);
  }

  let candidates = await gatherCandidates(deps.wolt, deps.location, intent, deps.log);
  if (candidates.length === 0 && intent.maxPrice) {
    // Nothing under budget? Don't come back empty-pawed — relax the price.
    candidates = await gatherCandidates(deps.wolt, deps.location, { ...intent, maxPrice: undefined }, deps.log);
  }

  const heuristic = (): FetchSuggestion[] =>
    candidates
      .map((c) => ({ c, s: heuristicScore(c, intent) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, n)
      .map(({ c, s }) => ({ item: c.item, venue: c.venue, score: Math.round(s * 100) / 100, reason: heuristicReason(c, intent) }));

  let suggestions: FetchSuggestion[] = [];
  if (llmOpts && candidates.length > 0) {
    try {
      const ids = candidates.map((_, i) => `c${i + 1}`);
      const list = candidates.map((c, i) => candidateLine(ids[i]!, c)).join('\n');
      const r = await chatJson<{ picks?: Array<{ id?: string; score?: number; reason?: string }> }>({
        ...llmOpts,
        timeoutMs: 30_000,
        maxTokens: 2500,
        messages: [
          { role: 'system', content: RERANK_SYSTEM },
          {
            role: 'user',
            content: `Request: ${q}\nInterpreted as: ${JSON.stringify(intent)}\nPick the top ${n}.\n\nCandidates:\n${list}`,
          },
        ],
      });
      const seen = new Set<number>();
      for (const p of r.data.picks ?? []) {
        const idx = typeof p.id === 'string' ? ids.indexOf(p.id.trim()) : -1;
        if (idx < 0 || seen.has(idx)) continue;
        seen.add(idx);
        const c = candidates[idx]!;
        const score = typeof p.score === 'number' && Number.isFinite(p.score) ? Math.max(0, Math.min(1, p.score)) : 0.5;
        suggestions.push({ item: c.item, venue: c.venue, score, reason: (p.reason ?? '').trim().slice(0, 120) || heuristicReason(c, intent) });
        if (suggestions.length >= n) break;
      }
      usedLLM = true;
      model = r.model;
      // Top up with heuristic picks if the model returned fewer than asked.
      if (suggestions.length < n) {
        const have = new Set(suggestions.map((s) => `${s.venue.id}:${s.item.id}`));
        for (const h of heuristic()) {
          if (suggestions.length >= n) break;
          if (!have.has(`${h.venue.id}:${h.item.id}`)) suggestions.push({ ...h, score: Math.min(h.score, 0.4) });
        }
      }
    } catch (e) {
      deps.log?.(`rerank failed, using heuristic ranking: ${errorMessage(e)}`);
      suggestions = heuristic();
    }
  } else {
    suggestions = heuristic();
  }

  return { query: q, intent, suggestions, usedLLM, ...(usedLLM && model ? { model } : {}), tookMs: Date.now() - started };
}
