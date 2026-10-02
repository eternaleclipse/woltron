/**
 * Ordering engine: target → preset → per-venue validation → guards → confirmation → execute.
 * Every step appends a friendly log line (shown in the UI timeline) and broadcasts `run.updated`.
 */
import { nanoid } from 'nanoid';
import type {
  Automation,
  BasketLineInput,
  BasketQuote,
  GeoLocation,
  ID,
  Menu,
  Money,
  OrderMode,
  Preset,
  PresetItem,
  Run,
  RunLine,
  RunLogEntry,
  RunRequest,
  RunSource,
  RunStatus,
  Venue,
  VenueOrder,
  WoltClient,
} from '@woltron/shared';
import { DEFAULT_LOCATION } from './config.js';
import { errorMessage, isWoltError, notFound, HttpError } from './errors.js';
import type { EventHub } from './events.js';
import { clockTime, dayKey, fmt, humanList, plural } from './format.js';
import { pickPreset, recordPick, type Rng } from './packs.js';
import type { Store } from './store.js';

export interface EngineDeps {
  store: Store;
  events: EventHub;
  wolt: () => WoltClient;
  now?: () => Date;
  rng?: Rng;
  log?: (msg: string) => void;
}

export interface StartRunOptions extends RunRequest {
  automationId?: ID;
}

const TERMINAL: RunStatus[] = ['placed', 'handed-off', 'simulated', 'delivered', 'skipped', 'failed', 'cancelled', 'expired'];
/** Statuses that count as real money spent for the daily cap. */
const SPENT: RunStatus[] = ['placed', 'handed-off', 'delivered'];
const DEFAULT_CONFIRM_WINDOW_MIN = 15;

export const isTerminal = (s: RunStatus) => TERMINAL.includes(s);

const venueFallbackUrl = (slug: string) => `https://wolt.com/en/search?q=${encodeURIComponent(slug)}`;

interface VenueContext {
  vo: VenueOrder;
  venue?: Venue;
  menu?: Menu;
  items: PresetItem[];
}

export class RunEngine {
  private timers = new Map<ID, NodeJS.Timeout>();
  /** Validated venue data kept between `awaiting-confirmation` and `confirm` (in-memory only). */
  private pending = new Map<ID, VenueContext[]>();
  private readonly now: () => Date;

  constructor(private readonly deps: EngineDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  private get store() {
    return this.deps.store;
  }
  private get wolt() {
    return this.deps.wolt();
  }
  private location(): GeoLocation {
    return this.store.data.settings.location ?? DEFAULT_LOCATION;
  }
  private iso() {
    return this.now().toISOString();
  }

  // ───────────────────────── persistence helpers ─────────────────────────

  private log(run: Run, level: RunLogEntry['level'], message: string) {
    run.log.push({ at: this.iso(), level, message });
  }

  private commit(run: Run) {
    run.updatedAt = this.iso();
    this.store.upsertRun(run);
    this.deps.events.publish({ type: 'run.updated', run: structuredClone(run) });
  }

  private notify(run: Run, level: 'info' | 'success' | 'warn' | 'error', title: string, body?: string) {
    this.deps.events.publish({ type: 'notification', level, title, body, runId: run.id });
  }

  // ───────────────────────── public API ─────────────────────────

  /** Check that the target exists (for 404s before creating a run). */
  assertTarget(target: RunRequest['target']) {
    if (target.kind === 'preset' && !this.store.getPreset(target.id)) throw notFound('Preset');
    if (target.kind === 'pack' && !this.store.getPack(target.id)) throw notFound('Pack');
  }

  /**
   * Start a run. Resolves once the run reaches a terminal state or `awaiting-confirmation`.
   */
  async start(req: StartRunOptions): Promise<Run> {
    const automation = req.automationId ? this.store.getAutomation(req.automationId) : undefined;
    const mode: OrderMode = req.mode ?? this.store.data.settings.orderMode;
    const source: RunSource = req.source ?? 'manual';
    const now = this.iso();
    const run: Run = {
      id: nanoid(12),
      createdAt: now,
      updatedAt: now,
      source,
      mode,
      status: 'pending',
      target: req.target,
      presetId: '',
      presetName: 'Unknown preset',
      automationId: automation?.id,
      venueOrders: [],
      total: { amount: 0, currency: 'ILS' },
      log: [],
    };

    // 1. Resolve target → preset
    let preset: Preset | undefined;
    try {
      preset = this.resolveTarget(run);
    } catch (e) {
      this.log(run, 'error', `😕 ${errorMessage(e)}`);
      run.status = 'failed';
      this.commit(run);
      this.notify(run, 'error', 'Run failed', errorMessage(e));
      return run;
    }

    const items = preset.items;
    const venueCount = new Set(items.map((i) => i.venueId)).size;
    const modeLabel = mode === 'dry-run' ? 'dry-run mode, nothing will actually be ordered' : mode === 'live' ? 'LIVE mode' : 'handoff mode';
    this.log(
      run,
      'info',
      `🐾 On it! Fetching “${preset.name}” — ${plural(items.reduce((s, i) => s + i.quantity, 0), 'item')} from ${plural(venueCount, 'place')} (${modeLabel})`,
    );
    if (automation) this.log(run, 'info', `⏰ Triggered by automation “${automation.name}” (${source})`);
    this.commit(run);

    // Skip-dates guard before doing any network work
    if (automation?.guards.skipDates?.length) {
      const tz = automation.trigger.type === 'schedule' ? automation.trigger.timezone : undefined;
      const today = dayKey(this.now(), tz);
      if (automation.guards.skipDates.includes(today)) {
        return this.finishSkipped(run, `📅 Today (${today}) is on the skip list — taking a day off`);
      }
    }

    if (items.length === 0) return this.finishFailed(run, '🫙 This preset is empty — add some items first');

    // 2. Validate each venue
    const contexts = await this.validate(run, items);
    const ready = contexts.filter((c) => c.vo.status === 'ready');
    run.total = this.sumTotal(ready.map((c) => c.vo.total), ready[0]?.vo.total.currency ?? run.total.currency);
    this.commit(run);

    const closed = contexts.filter((c) => c.venue && !c.venue.online);
    if (automation?.guards.onlyIfAllVenuesOpen && closed.length > 0) {
      return this.finishSkipped(run, `🚪 ${humanList(closed.map((c) => c.vo.venueName))} ${closed.length === 1 ? 'is' : 'are'} closed and this automation only runs when everything is open`);
    }
    if (ready.length === 0) return this.finishFailed(run, '😢 Nothing could be fetched — every place was closed or out of stock');

    // 3. Guards
    const guard = this.checkGuards(run, automation);
    if (guard) return this.finishSkipped(run, guard);
    this.log(run, 'info', `🧾 Food + delivery comes to ${fmt(run.total)}${ready.length > 1 ? ` across ${plural(ready.length, 'order')}` : ''} — within your limits ✓`);

    // 4. Confirmation policy
    const confirm = req.confirm ?? (automation ? automation.confirm : 'auto');
    if (confirm === 'ask') {
      const windowMin = automation?.confirmWindowMin || DEFAULT_CONFIRM_WINDOW_MIN;
      const by = new Date(this.now().getTime() + windowMin * 60_000);
      run.confirmBy = by.toISOString();
      run.status = 'awaiting-confirmation';
      this.log(run, 'warn', `🙋 Waiting for your OK until ${clockTime(by)} — tap Confirm to send me off (${fmt(run.total)})`);
      this.pending.set(run.id, contexts);
      this.armExpiry(run);
      this.commit(run);
      this.notify(run, 'warn', `${preset.name} is ready — confirm?`, `${fmt(run.total)} · reply within ${windowMin} min`);
      return run;
    }

    // 5. Execute
    return this.execute(run, contexts, preset);
  }

  async confirm(id: ID): Promise<Run> {
    const run = this.store.getRun(id);
    if (!run) throw notFound('Run');
    if (run.status !== 'awaiting-confirmation') throw new HttpError(409, 'invalid_state', `Run is ${run.status}, not awaiting confirmation`);
    this.clearTimer(id);
    const preset = this.store.getPreset(run.presetId);
    let contexts = this.pending.get(id);
    this.pending.delete(id);
    this.log(run, 'success', '👍 Confirmed — here we go!');
    if (!contexts || !preset) {
      // Server restarted while waiting: re-validate from the preset.
      if (!preset) return this.finishFailed(run, '😕 The preset was deleted while waiting for confirmation');
      run.venueOrders = [];
      contexts = await this.validate(run, preset.items);
      const ready = contexts.filter((c) => c.vo.status === 'ready');
      run.total = this.sumTotal(ready.map((c) => c.vo.total), ready[0]?.vo.total.currency ?? run.total.currency);
      if (ready.length === 0) return this.finishFailed(run, '😢 Nothing could be fetched — every place was closed or out of stock');
    }
    this.commit(run);
    return this.execute(run, contexts, preset);
  }

  cancel(id: ID): Run {
    const run = this.store.getRun(id);
    if (!run) throw notFound('Run');
    if (isTerminal(run.status) || run.status === 'placing')
      throw new HttpError(409, 'invalid_state', `Run is ${run.status} and can't be cancelled`);
    this.clearTimer(id);
    this.pending.delete(id);
    run.status = 'cancelled';
    for (const vo of run.venueOrders) if (!['failed', 'skipped'].includes(vo.status)) vo.status = 'skipped';
    this.log(run, 'info', '🛑 Cancelled — I’ll stay on the couch');
    this.commit(run);
    return run;
  }

  /** On startup: re-arm confirmation timers, fail runs interrupted mid-flight. */
  resume(): void {
    for (const run of this.store.data.runs) {
      if (run.status === 'awaiting-confirmation') {
        if (run.confirmBy && new Date(run.confirmBy) <= this.now()) this.expire(run.id);
        else this.armExpiry(run);
      } else if (run.status === 'pending' || run.status === 'placing') {
        run.status = 'failed';
        this.log(run, 'error', '💤 Interrupted by a restart — please check Wolt before re-running');
        this.commit(run);
      }
    }
  }

  stop(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }

  // ───────────────────────── steps ─────────────────────────

  private resolveTarget(run: Run): Preset {
    const t = run.target;
    if (t.kind === 'preset') {
      const preset = this.store.getPreset(t.id);
      if (!preset) throw new Error('That preset no longer exists');
      this.bindPreset(run, preset);
      return preset;
    }
    const pack = this.store.getPack(t.id);
    if (!pack) throw new Error('That pack no longer exists');
    run.packId = pack.id;
    run.packName = pack.name;
    const pick = pickPreset(pack, { rng: this.deps.rng, exists: (id) => !!this.store.getPreset(id) });
    const preset = this.store.getPreset(pick.presetId)!;
    const at = this.iso();
    Object.assign(pack, recordPick(pack, pick, at, run.id), { lastRunAt: at, runCount: pack.runCount + 1 });
    this.store.save();
    this.deps.events.publish({ type: 'pack.changed', id: pack.id });
    const how =
      pack.strategy === 'round-robin'
        ? 'next in the rotation'
        : pack.strategy === 'weighted'
          ? 'weighted pick'
          : pack.strategy === 'fresh'
            ? pick.excluded
              ? `fresh pick, skipping the last ${plural(pick.excluded, 'choice')}`
              : 'fresh pick'
            : 'shuffled';
    this.log(run, 'info', `🎲 ${pack.emoji} ${pack.name} picked “${preset.name}” (${how})`);
    this.bindPreset(run, preset);
    return preset;
  }

  private bindPreset(run: Run, preset: Preset) {
    run.presetId = preset.id;
    run.presetName = preset.name;
    preset.runCount += 1;
    preset.lastRunAt = this.iso();
    this.store.save();
    this.deps.events.publish({ type: 'preset.changed', id: preset.id });
  }

  private groupByVenue(items: PresetItem[]): Map<string, PresetItem[]> {
    const groups = new Map<string, PresetItem[]>();
    for (const it of items) {
      const g = groups.get(it.venueId) ?? [];
      g.push(it);
      groups.set(it.venueId, g);
    }
    return groups;
  }

  private async validate(run: Run, items: PresetItem[]): Promise<VenueContext[]> {
    const loc = this.location();
    const groups = [...this.groupByVenue(items).values()];
    const contexts: VenueContext[] = groups.map((g) => {
      const first = g[0]!;
      const currency = first.unitPrice.currency;
      const vo: VenueOrder = {
        venueId: first.venueId,
        venueSlug: first.venueSlug,
        venueName: first.venueName,
        lines: [],
        subtotal: { amount: 0, currency },
        total: { amount: 0, currency },
        status: 'validating',
      };
      return { vo, items: g };
    });
    run.venueOrders = contexts.map((c) => c.vo);
    this.commit(run);

    await Promise.all(contexts.map((c) => this.validateVenue(run, c, loc)));
    this.commit(run);
    return contexts;
  }

  private async validateVenue(run: Run, ctx: VenueContext, loc: GeoLocation) {
    const { vo } = ctx;
    const wolt = this.wolt;
    let venue: Venue;
    let menu: Menu;
    try {
      [venue, menu] = await Promise.all([wolt.getVenue(vo.venueSlug, loc), wolt.getMenu(vo.venueSlug, loc)]);
      ctx.venue = venue;
      ctx.menu = menu;
      vo.venueName = venue.name || vo.venueName;
      vo.venueImage = venue.image ?? venue.logo;
      vo.etaMinutes = venue.deliveryEstimateMin;
      if (!venue.online || !venue.delivers) {
        vo.status = 'skipped';
        vo.error = venue.online ? 'Not delivering to your location' : 'Closed right now';
        this.log(run, 'warn', `😴 ${venue.name} is ${venue.online ? 'not delivering to your location' : 'closed right now'} — skipping it`);
        return;
      }
    } catch (e) {
      vo.status = 'failed';
      vo.error = errorMessage(e);
      this.log(run, 'error', `🌧️ Couldn’t reach ${vo.venueName}: ${errorMessage(e)}`);
      return;
    }

    const currency = venue.currency || vo.subtotal.currency;
    const missing: string[] = [];
    const priceChanges: string[] = [];
    for (const pi of ctx.items) {
      const mi = menu.items.find((m) => m.id === pi.itemId);
      if (!mi) {
        missing.push(pi.name);
        vo.lines.push({ itemId: pi.itemId, name: pi.name, quantity: pi.quantity, unitPrice: pi.unitPrice, available: false, optionSummary: pi.optionSummary, image: pi.image });
        continue;
      }
      let unit = mi.price.amount;
      for (const choice of pi.options) {
        const group = mi.options.find((g) => g.id === choice.groupId);
        for (const vid of choice.valueIds) {
          const v = group?.values.find((x) => x.id === vid);
          if (v) unit += v.price.amount;
          else this.log(run, 'warn', `🤔 An option on “${mi.name}” isn’t offered anymore — ordering without it`);
        }
      }
      const line: RunLine = {
        itemId: mi.id,
        name: mi.name,
        quantity: pi.quantity,
        unitPrice: { amount: unit, currency },
        available: mi.available,
        optionSummary: pi.optionSummary,
        image: mi.image ?? pi.image,
      };
      vo.lines.push(line);
      if (!mi.available) missing.push(mi.name);
      else if (unit !== pi.unitPrice.amount) priceChanges.push(`“${mi.name}” ${fmt(pi.unitPrice)} → ${fmt(line.unitPrice)}`);
    }

    const available = vo.lines.filter((l) => l.available);
    const count = available.reduce((s, l) => s + l.quantity, 0);
    vo.subtotal = { amount: available.reduce((s, l) => s + l.unitPrice.amount * l.quantity, 0), currency };
    vo.deliveryFee = venue.deliveryPrice;
    vo.total = { amount: vo.subtotal.amount + (vo.deliveryFee?.amount ?? 0), currency };

    if (available.length === 0) {
      vo.status = 'failed';
      vo.error = 'Everything is sold out';
      this.log(run, 'error', `😢 Everything we wanted at ${vo.venueName} is sold out`);
      return;
    }
    vo.status = 'ready';
    if (missing.length === 0) {
      this.log(run, 'success', `👃 Sniffed out ${plural(count, 'item')} at ${vo.venueName} — all available ✓`);
    } else {
      this.log(run, 'warn', `👃 Sniffed out ${plural(count, 'item')} at ${vo.venueName}, but ${humanList(missing.map((m) => `“${m}”`))} ${missing.length === 1 ? 'is' : 'are'} unavailable — leaving ${missing.length === 1 ? 'it' : 'them'} out`);
    }
    if (priceChanges.length) this.log(run, 'warn', `💸 Price check at ${vo.venueName}: ${priceChanges.join(', ')}`);
  }

  private sumTotal(ms: Money[], currency: string): Money {
    return { amount: ms.reduce((s, m) => s + m.amount, 0), currency };
  }

  /** Returns a skip reason, or undefined if all guards pass. */
  private checkGuards(run: Run, automation?: Automation): string | undefined {
    const total = run.total;
    const auto = automation?.guards.maxTotal;
    if (auto && total.amount > auto.amount)
      return `🛑 ${fmt(total)} is over this automation’s ${fmt(auto)} limit — not fetching`;
    const { maxPerRun, maxPerDay } = this.store.data.settings.limits;
    if (maxPerRun && total.amount > maxPerRun.amount)
      return `🛑 ${fmt(total)} is over your per-run limit of ${fmt(maxPerRun)} — not fetching`;
    if (maxPerDay) {
      const today = dayKey(this.now());
      const spent = this.store.data.runs
        .filter((r) => r.id !== run.id && SPENT.includes(r.status) && dayKey(new Date(r.createdAt)) === today)
        .reduce((s, r) => s + r.total.amount, 0);
      if (spent + total.amount > maxPerDay.amount)
        return `🛑 Already spent ${fmt({ amount: spent, currency: total.currency })} today — another ${fmt(total)} would pass your daily limit of ${fmt(maxPerDay)}`;
    }
    return undefined;
  }

  private async execute(run: Run, contexts: VenueContext[], preset: Preset): Promise<Run> {
    const ready = contexts.filter((c) => c.vo.status === 'ready');
    run.status = 'placing';
    run.confirmBy = undefined;
    this.commit(run);
    const loc = this.location();

    for (const [i, ctx] of ready.entries()) {
      const { vo } = ctx;
      vo.status = 'placing';
      const lines: BasketLineInput[] = ctx.items
        .filter((pi) => vo.lines.some((l) => l.itemId === pi.itemId && l.available))
        .map((pi) => ({ itemId: pi.itemId, quantity: pi.quantity, options: pi.options }));
      let quote: BasketQuote | undefined;
      try {
        quote = await this.wolt.quoteBasket(vo.venueSlug, lines, loc);
        this.applyQuote(vo, quote);
        for (const w of quote.warnings) this.log(run, 'warn', `⚠️ ${vo.venueName}: ${w}`);
      } catch (e) {
        if (run.mode === 'live' && !(isWoltError(e) && ['unsupported', 'unauthorized'].includes(e.code))) {
          vo.status = 'failed';
          vo.error = errorMessage(e);
          this.log(run, 'error', `💥 Couldn’t build the basket at ${vo.venueName}: ${errorMessage(e)}`);
          continue;
        }
        if (run.mode === 'dry-run') this.log(run, 'info', `🧮 Estimated fees for ${vo.venueName} locally (Wolt quote unavailable: ${errorMessage(e)})`);
      }

      if (run.mode === 'dry-run') {
        vo.status = 'simulated';
        this.log(run, 'info', `🧪 ${vo.venueName}: would order ${this.describeLines(vo)} — ${fmt(vo.total)}${vo.etaMinutes ? `, ~${vo.etaMinutes} min` : ''}`);
        continue;
      }

      if (run.mode === 'handoff' || !quote) {
        this.handoff(run, ctx, quote, run.mode === 'live' ? 'Wolt wouldn’t let me build the basket for you' : undefined);
        continue;
      }

      try {
        const placed = await this.wolt.placeOrder(quote, {
          loc,
          deliveryNote: preset.deliveryNote,
          tip: i === 0 ? preset.tip : undefined,
        });
        vo.status = 'placed';
        vo.woltOrderId = placed.orderId;
        vo.checkoutUrl = placed.trackingUrl ?? vo.checkoutUrl;
        vo.etaMinutes = placed.etaMinutes ?? vo.etaMinutes;
        this.log(run, 'success', `🎉 Order placed at ${vo.venueName}! ${fmt(vo.total)}${vo.etaMinutes ? ` · ETA ~${vo.etaMinutes} min` : ''}`);
      } catch (e) {
        if (isWoltError(e) && (e.code === 'unsupported' || e.code === 'unauthorized')) {
          this.handoff(run, ctx, quote, e.code === 'unauthorized' ? 'Wolt account not connected' : 'Wolt doesn’t let me pay for you here');
        } else {
          vo.status = 'failed';
          vo.error = errorMessage(e);
          this.log(run, 'error', `💥 Ordering from ${vo.venueName} failed: ${errorMessage(e)}`);
        }
      }
    }

    const done = run.venueOrders.filter((v) => ready.some((c) => c.vo === v));
    run.total = this.sumTotal(done.filter((v) => v.status !== 'failed').map((v) => v.total), run.total.currency);
    const statuses = done.map((v) => v.status);
    if (run.mode === 'dry-run') {
      run.status = 'simulated';
      this.log(run, 'success', `✅ Dry run complete — nothing was ordered. It would have cost ${fmt(run.total)}`);
      this.commit(run);
      if (run.source !== 'manual') this.notify(run, 'success', `Dry run: ${run.presetName}`, `Would have cost ${fmt(run.total)}`);
      return run;
    }
    if (statuses.every((s) => s === 'failed')) {
      return this.finishFailed(run, '😢 No orders could be placed');
    }
    const failed = statuses.filter((s) => s === 'failed').length;
    if (statuses.includes('handed-off')) {
      run.status = 'handed-off';
      this.log(run, 'info', `🤝 Basket${done.length > 1 ? 's are' : ' is'} ready — finish checkout on Wolt${failed ? ` (${plural(failed, 'venue')} failed)` : ''}`);
      this.commit(run);
      this.notify(run, 'info', `${run.presetName}: finish on Wolt`, 'Your basket is ready — tap to open Wolt checkout');
      return run;
    }
    run.status = 'placed';
    if (failed) this.log(run, 'warn', `⚠️ ${plural(failed, 'venue')} failed — the rest is on its way`);
    this.log(run, 'success', `🦴 Good dog! ${fmt(run.total)} of food is on its way`);
    this.commit(run);
    this.notify(run, 'success', `Ordered: ${run.presetName}`, `${fmt(run.total)} — on its way!`);
    return run;
  }

  private applyQuote(vo: VenueOrder, q: BasketQuote) {
    vo.subtotal = q.subtotal;
    vo.deliveryFee = q.deliveryFee ?? vo.deliveryFee;
    vo.serviceFee = q.serviceFee;
    vo.total = q.total;
    vo.etaMinutes = q.etaMinutes ?? vo.etaMinutes;
    vo.checkoutUrl = q.checkoutUrl ?? vo.checkoutUrl;
  }

  private handoff(run: Run, ctx: VenueContext, quote: BasketQuote | undefined, why?: string) {
    const { vo } = ctx;
    vo.status = 'handed-off';
    vo.checkoutUrl = quote?.checkoutUrl ?? ctx.venue?.url ?? venueFallbackUrl(vo.venueSlug);
    if (why) this.log(run, 'warn', `🤝 ${why} — switching to handoff: your ${vo.venueName} basket is ready, just tap Pay on Wolt`);
    else this.log(run, 'info', `🤝 ${vo.venueName} basket is ready (${fmt(vo.total)}) — finish checkout on Wolt`);
  }

  private describeLines(vo: VenueOrder) {
    return humanList(vo.lines.filter((l) => l.available).map((l) => `${l.quantity > 1 ? `${l.quantity}× ` : ''}${l.name}`));
  }

  private finishSkipped(run: Run, message: string): Run {
    run.status = 'skipped';
    for (const vo of run.venueOrders) if (vo.status === 'ready' || vo.status === 'validating') vo.status = 'skipped';
    this.log(run, 'warn', message);
    this.commit(run);
    if (run.automationId) this.notify(run, 'warn', `Skipped: ${run.presetName}`, message.replace(/^\S+\s/, ''));
    return run;
  }

  private finishFailed(run: Run, message: string): Run {
    run.status = 'failed';
    this.log(run, 'error', message);
    this.commit(run);
    this.notify(run, 'error', `Run failed: ${run.presetName}`, message.replace(/^\S+\s/, ''));
    return run;
  }

  private armExpiry(run: Run) {
    this.clearTimer(run.id);
    if (!run.confirmBy) return;
    const ms = Math.max(0, new Date(run.confirmBy).getTime() - this.now().getTime());
    const t = setTimeout(() => this.expire(run.id), Math.min(ms, 2 ** 31 - 1));
    t.unref?.();
    this.timers.set(run.id, t);
  }

  private clearTimer(id: ID) {
    const t = this.timers.get(id);
    if (t) clearTimeout(t);
    this.timers.delete(id);
  }

  expire(id: ID) {
    this.clearTimer(id);
    this.pending.delete(id);
    const run = this.store.getRun(id);
    if (!run || run.status !== 'awaiting-confirmation') return;
    run.status = 'expired';
    for (const vo of run.venueOrders) if (vo.status === 'ready') vo.status = 'skipped';
    this.log(run, 'warn', '⌛ No answer in time — I let this one go');
    this.commit(run);
    this.notify(run, 'warn', `Expired: ${run.presetName}`, 'The confirmation window passed');
  }
}
