import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Automation, Run, ServerEvent } from '@woltron/shared';
import { WoltError } from '@woltron/shared';
import { RunEngine } from '../src/engine.js';
import { EventHub } from '../src/events.js';
import { Store } from '../src/store.js';
import { fakeWolt, ils, item, preset, presetItem, tmpDir, venue, type FakeWolt } from './helpers.js';

let store: Store;
let wolt: FakeWolt;
let events: EventHub;
let seen: ServerEvent[];
let engine: RunEngine;

beforeEach(() => {
  store = new Store(tmpDir(), 0);
  wolt = fakeWolt();
  events = new EventHub();
  seen = [];
  events.subscribe((e) => seen.push(e));
  engine = new RunEngine({ store, events, wolt: () => wolt, rng: () => 0 });

  wolt.venues.set('taizu', venue('taizu'));
  wolt.venues.set('pizza', venue('pizza'));
  wolt.menus.set('taizu', [
    item('taizu', 'ramen', 5000, {
      options: [{ id: 'size', name: 'Size', min: 1, max: 1, values: [{ id: 'small', name: 'Small', price: ils(0) }, { id: 'large', name: 'Large', price: ils(1200) }] }],
    }),
    item('taizu', 'gyoza', 3000),
  ]);
  wolt.menus.set('pizza', [item('pizza', 'margherita', 6000)]);

  store.data.presets.push(
    preset('p1', [
      presetItem('taizu', 'ramen', 6200, { options: [{ groupId: 'size', valueIds: ['large'] }], quantity: 2 }),
      presetItem('taizu', 'gyoza', 3000),
      presetItem('pizza', 'margherita', 6000),
    ]),
  );
});

afterEach(() => engine.stop());

const runEvents = () => seen.filter((e): e is Extract<ServerEvent, { type: 'run.updated' }> => e.type === 'run.updated');
const messages = (r: Run) => r.log.map((l) => l.message).join('\n');

describe('dry-run', () => {
  it('validates every venue, uses current prices incl. options, and simulates', async () => {
    const run = await engine.start({ target: { kind: 'preset', id: 'p1' }, mode: 'dry-run' });
    expect(run.status).toBe('simulated');
    expect(run.venueOrders).toHaveLength(2);
    const taizu = run.venueOrders.find((v) => v.venueSlug === 'taizu')!;
    expect(taizu.status).toBe('simulated');
    expect(taizu.lines.find((l) => l.itemId === 'ramen')!.unitPrice.amount).toBe(6200);
    expect(taizu.subtotal.amount).toBe(6200 * 2 + 3000);
    expect(taizu.total.amount).toBe(6200 * 2 + 3000 + 1000); // quote incl. fees
    expect(run.total.amount).toBe(15400 + 1000 + 6000 + 1000);
    expect(messages(run)).toMatch(/Sniffed out 3 items at Taizu — all available ✓/);
    expect(messages(run)).toMatch(/Dry run complete/);
    expect(wolt.calls.some((c) => c.startsWith('place:'))).toBe(false);
    expect(runEvents().length).toBeGreaterThan(3);
    expect(store.getPreset('p1')!.runCount).toBe(1);
    expect(store.getRun(run.id)).toBeDefined();
  });

  it('falls back to a local fee estimate if quoting fails', async () => {
    wolt.quoteError = new WoltError('unauthorized', 'login');
    const run = await engine.start({ target: { kind: 'preset', id: 'p1' }, mode: 'dry-run' });
    expect(run.status).toBe('simulated');
    expect(run.total.amount).toBe(15400 + 900 + 6000 + 900);
  });

  it('flags price changes and drops unavailable items', async () => {
    wolt.menus.get('taizu')![0]!.price = ils(5500); // ramen +5
    wolt.menus.get('taizu')![1]!.available = false; // gyoza sold out
    const run = await engine.start({ target: { kind: 'preset', id: 'p1' }, mode: 'dry-run' });
    expect(run.status).toBe('simulated');
    const taizu = run.venueOrders.find((v) => v.venueSlug === 'taizu')!;
    expect(taizu.subtotal.amount).toBe(6700 * 2);
    expect(messages(run)).toMatch(/“gyoza” is unavailable/);
    expect(messages(run)).toMatch(/Price check at Taizu: “ramen” ₪62 → ₪67/);
  });

  it('skips a closed venue but still runs the others', async () => {
    wolt.venues.get('pizza')!.online = false;
    const run = await engine.start({ target: { kind: 'preset', id: 'p1' }, mode: 'dry-run' });
    expect(run.status).toBe('simulated');
    expect(run.venueOrders.find((v) => v.venueSlug === 'pizza')!.status).toBe('skipped');
    expect(messages(run)).toMatch(/Pizza is closed right now/);
  });

  it('fails when nothing is orderable', async () => {
    wolt.venues.get('pizza')!.online = false;
    wolt.venues.get('taizu')!.online = false;
    const run = await engine.start({ target: { kind: 'preset', id: 'p1' }, mode: 'dry-run' });
    expect(run.status).toBe('failed');
    expect(seen.some((e) => e.type === 'notification' && e.level === 'error')).toBe(true);
  });
});

describe('guards', () => {
  const auto = (over: Partial<Automation> = {}): Automation => {
    const a: Automation = {
      id: 'a1',
      name: 'Lunch',
      enabled: true,
      target: { kind: 'preset', id: 'p1' },
      trigger: { type: 'schedule', cron: '30 12 * * 1-5', timezone: 'UTC' },
      confirm: 'auto',
      confirmWindowMin: 10,
      guards: { onlyIfAllVenuesOpen: false },
      createdAt: '',
      updatedAt: '',
      fireCount: 0,
      ...over,
    };
    store.data.automations.push(a);
    return a;
  };

  it('automation maxTotal skips the run', async () => {
    auto({ guards: { onlyIfAllVenuesOpen: false, maxTotal: ils(10000) } });
    const run = await engine.start({ target: { kind: 'preset', id: 'p1' }, automationId: 'a1', source: 'schedule' });
    expect(run.status).toBe('skipped');
    expect(messages(run)).toMatch(/over this automation’s ₪100 limit/);
    expect(wolt.calls.some((c) => c.startsWith('quote:'))).toBe(false);
  });

  it('settings maxPerRun skips the run', async () => {
    store.data.settings.limits.maxPerRun = ils(20000);
    const run = await engine.start({ target: { kind: 'preset', id: 'p1' } });
    expect(run.status).toBe('skipped');
    expect(messages(run)).toMatch(/per-run limit of ₪200/);
  });

  it('maxPerDay only counts placed/handed-off runs from today', async () => {
    store.data.settings.limits.maxPerDay = ils(30000);
    const today = new Date().toISOString();
    const old = (status: Run['status'], amount: number, createdAt = today): Run => ({
      id: `r-${status}-${amount}`,
      createdAt,
      updatedAt: createdAt,
      source: 'manual',
      mode: 'live',
      status,
      target: { kind: 'preset', id: 'p1' },
      presetId: 'p1',
      presetName: 'x',
      venueOrders: [],
      total: ils(amount),
      log: [],
    });
    store.data.runs.push(old('simulated', 90000), old('failed', 90000), old('placed', 90000, '2000-01-01T12:00:00Z'));
    const ok = await engine.start({ target: { kind: 'preset', id: 'p1' } });
    expect(ok.status).toBe('simulated'); // 22,400 < 30,000; other runs don't count

    store.data.runs.push(old('placed', 10000));
    const blocked = await engine.start({ target: { kind: 'preset', id: 'p1' } });
    expect(blocked.status).toBe('skipped');
    expect(messages(blocked)).toMatch(/Already spent ₪100 today/);
  });

  it('onlyIfAllVenuesOpen skips when any venue is closed', async () => {
    auto({ guards: { onlyIfAllVenuesOpen: true } });
    wolt.venues.get('pizza')!.online = false;
    const run = await engine.start({ target: { kind: 'preset', id: 'p1' }, automationId: 'a1' });
    expect(run.status).toBe('skipped');
  });

  it('skip dates', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(new Date());
    auto({ guards: { onlyIfAllVenuesOpen: false, skipDates: [today] } });
    const run = await engine.start({ target: { kind: 'preset', id: 'p1' }, automationId: 'a1' });
    expect(run.status).toBe('skipped');
    expect(wolt.calls).toHaveLength(0);
  });
});

describe('confirmation', () => {
  it('ask → awaiting-confirmation → confirm → simulated', async () => {
    const run = await engine.start({ target: { kind: 'preset', id: 'p1' }, confirm: 'ask' });
    expect(run.status).toBe('awaiting-confirmation');
    expect(run.confirmBy).toBeDefined();
    expect(seen.some((e) => e.type === 'notification' && e.level === 'warn')).toBe(true);
    const done = await engine.confirm(run.id);
    expect(done.status).toBe('simulated');
    expect(done.confirmBy).toBeUndefined();
  });

  it('cancel while waiting', async () => {
    const run = await engine.start({ target: { kind: 'preset', id: 'p1' }, confirm: 'ask' });
    expect(engine.cancel(run.id).status).toBe('cancelled');
    await expect(engine.confirm(run.id)).rejects.toThrow(/cancelled/);
  });

  it('expires after the confirmation window', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      const run = await engine.start({ target: { kind: 'preset', id: 'p1' }, confirm: 'ask' });
      vi.advanceTimersByTime(16 * 60_000);
      expect(store.getRun(run.id)!.status).toBe('expired');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('live / handoff', () => {
  it('places orders per venue', async () => {
    const run = await engine.start({ target: { kind: 'preset', id: 'p1' }, mode: 'live' });
    expect(run.status).toBe('placed');
    expect(run.venueOrders.map((v) => v.woltOrderId).sort()).toEqual(['o-pizza', 'o-taizu']);
    expect(seen.some((e) => e.type === 'notification' && e.level === 'success')).toBe(true);
  });

  it('falls back to handoff on unsupported', async () => {
    wolt.placeError = new WoltError('unsupported', 'no payments');
    const run = await engine.start({ target: { kind: 'preset', id: 'p1' }, mode: 'live' });
    expect(run.status).toBe('handed-off');
    expect(run.venueOrders.every((v) => v.status === 'handed-off' && v.checkoutUrl?.startsWith('https://wolt.com/checkout/'))).toBe(true);
    expect(run.log.some((l) => l.level === 'warn' && /handoff/.test(l.message))).toBe(true);
  });

  it('fails a venue on other errors', async () => {
    wolt.placeError = new WoltError('network', 'boom');
    const run = await engine.start({ target: { kind: 'preset', id: 'p1' }, mode: 'live' });
    expect(run.status).toBe('failed');
  });

  it('handoff mode quotes and returns checkout URLs', async () => {
    const run = await engine.start({ target: { kind: 'preset', id: 'p1' }, mode: 'handoff' });
    expect(run.status).toBe('handed-off');
    expect(wolt.calls.some((c) => c.startsWith('place:'))).toBe(false);
  });
});

describe('packs', () => {
  it('records the pick in pack history and counters', async () => {
    store.data.presets.push(preset('p2', [presetItem('pizza', 'margherita', 6000)]));
    store.data.packs.push({
      id: 'pk',
      name: 'Rotation',
      emoji: '🔁',
      color: 'amber',
      members: [{ presetId: 'p1', weight: 1 }, { presetId: 'p2', weight: 1 }],
      strategy: 'round-robin',
      avoidRepeats: 0,
      cursor: 1,
      history: [],
      favorite: false,
      createdAt: '',
      updatedAt: '',
      runCount: 0,
    });
    const run = await engine.start({ target: { kind: 'pack', id: 'pk' } });
    expect(run.presetId).toBe('p2');
    expect(run.packName).toBe('Rotation');
    const pack = store.getPack('pk')!;
    expect(pack.cursor).toBe(2);
    expect(pack.history[0]).toMatchObject({ presetId: 'p2', runId: run.id });
    expect(pack.runCount).toBe(1);
    expect(messages(run)).toMatch(/Rotation picked “Preset p2” \(next in the rotation\)/);
  });
});
