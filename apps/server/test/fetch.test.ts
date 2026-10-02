import { describe, expect, it } from 'vitest';
import { heuristicIntent, runFetch } from '../src/fetch.js';
import { chatJson, extractJson } from '../src/llm.js';
import { fakeWolt, ils, item, venue } from './helpers.js';

const loc = { lat: 32.08, lon: 34.78 };

function wolt() {
  const w = fakeWolt();
  w.venues.set('taizu', venue('taizu', { rating: { score: 9.2 } }));
  w.venues.set('green', venue('green', { rating: { score: 8 } }));
  w.menus.set('taizu', [
    item('taizu', 'spicy ramen', 5800, { description: 'chili broth' }),
    item('taizu', 'mild ramen', 5200),
    item('taizu', 'wagyu ramen', 12000),
    item('taizu', 'sold-out ramen', 4000, { available: false }),
  ]);
  w.menus.set('green', [item('green', 'vegan spicy bowl', 4800, { dietary: ['vegan'] })]);
  return w;
}

describe('extractJson', () => {
  it('handles plain, fenced and chatty replies', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(extractJson('Sure! Here you go: {"a":{"b":"}"}} hope that helps')).toEqual({ a: { b: '}' } });
    expect(() => extractJson('no json here')).toThrow();
  });
});

describe('chatJson', () => {
  it('retries with a bigger budget when a reasoning model truncates the JSON', async () => {
    const budgets: number[] = [];
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      const b = JSON.parse(String(init.body));
      budgets.push(b.max_tokens);
      const truncated = budgets.length === 1;
      const content = truncated ? '{"searchTerms": ["ra' : '{"searchTerms":["ramen"]}';
      return new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: truncated ? 'length' : 'stop' }] }));
    }) as unknown as typeof fetch;
    const r = await chatJson<{ searchTerms: string[] }>({ apiKey: 'k', model: 'm', messages: [], maxTokens: 100, fetchImpl });
    expect(r.data.searchTerms).toEqual(['ramen']);
    expect(budgets).toEqual([100, 300]);
  });
});

describe('heuristicIntent', () => {
  it('extracts budget, dietary, exclusions and terms', () => {
    const i = heuristicIntent('something spicy and vegan ramen under ₪60 without mushrooms');
    expect(i.maxPrice).toEqual(ils(6000));
    expect(i.dietary).toEqual(expect.arrayContaining(['vegan', 'spicy']));
    expect(i.excluded).toEqual(['mushrooms']);
    expect(i.searchTerms).toContain('ramen');
    expect(i.searchTerms).not.toContain('something');
  });
});

describe('runFetch without a key', () => {
  it('uses keyword search + heuristic ranking, filters unavailable/over-budget', async () => {
    const res = await runFetch('spicy ramen under 60', 5, { wolt: wolt(), location: loc, model: 'x' });
    expect(res.usedLLM).toBe(false);
    expect(res.model).toBeUndefined();
    const names = res.suggestions.map((s) => s.item.name);
    expect(names[0]).toBe('spicy ramen');
    expect(names).not.toContain('sold-out ramen');
    expect(names).not.toContain('wagyu ramen');
    expect(res.suggestions[0]!.reason).toMatch(/₪58/);
  });

  it('rejects empty queries', async () => {
    await expect(runFetch('  ', 5, { wolt: wolt(), location: loc, model: 'x' })).rejects.toThrow(/hungry/);
  });
});

describe('runFetch with an LLM', () => {
  it('maps reranked ids back to suggestions', async () => {
    const calls: Array<{ body: { model: string; response_format?: unknown }; headers: Record<string, string> }> = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      calls.push({ body, headers: init.headers as Record<string, string> });
      const content =
        calls.length === 1
          ? '```json\n{"searchTerms":["ramen","bowl"],"cuisines":["japanese"],"dietary":["spicy"],"excluded":[],"maxPrice":70,"mood":"cosy"}\n```'
          : JSON.stringify({ picks: [{ id: 'c2', score: 0.9, reason: 'Spicy & vegan, ₪48' }, { id: 'c99', score: 1 }, { id: 'c1', score: 0.7, reason: 'Chili broth' }] });
      return new Response(JSON.stringify({ model: 'test/model', choices: [{ message: { content } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const res = await runFetch('spicy noodle soup', 2, { wolt: wolt(), location: loc, apiKey: 'k', model: 'test/model', fetchImpl });
    expect(res.usedLLM).toBe(true);
    expect(res.model).toBe('test/model');
    expect(res.intent.maxPrice).toEqual(ils(7000));
    expect(res.suggestions).toHaveLength(2);
    expect(res.suggestions[0]!.reason).toBe('Spicy & vegan, ₪48');
    expect(calls[0]!.body.response_format).toEqual({ type: 'json_object' });
    expect(calls[0]!.headers['X-Title']).toBe('Woltron');
  });

  it('falls back to keywords when the LLM errors', async () => {
    const fetchImpl = (async () => new Response('{"error":{"message":"bad key"}}', { status: 401 })) as unknown as typeof fetch;
    const res = await runFetch('spicy ramen', 3, { wolt: wolt(), location: loc, apiKey: 'k', model: 'm', fetchImpl });
    expect(res.usedLLM).toBe(false);
    expect(res.suggestions.length).toBeGreaterThan(0);
  });
});
