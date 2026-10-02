/**
 * Automation triggers: croner jobs for `schedule`/`once`, a poller for `venue-online`,
 * and `fire()` used by webhooks and the manual "fire now" route.
 */
import { Cron } from 'croner';
import type { Automation, ID, Run, RunSource, WoltClient } from '@woltron/shared';
import { DEFAULT_LOCATION } from './config.js';
import type { RunEngine } from './engine.js';
import { errorMessage } from './errors.js';
import type { EventHub } from './events.js';
import { dayKey } from './format.js';
import type { Store } from './store.js';

export const VENUE_POLL_MS = 2 * 60_000;

export interface SchedulerDeps {
  store: Store;
  events: EventHub;
  engine: RunEngine;
  wolt: () => WoltClient;
  now?: () => Date;
  pollMs?: number;
}

export class Scheduler {
  private jobs = new Map<ID, Cron>();
  private poller: NodeJS.Timeout | undefined;
  private polling = false;
  private readonly now: () => Date;

  constructor(private readonly deps: SchedulerDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  start(): void {
    for (const a of this.deps.store.data.automations) this.sync(a.id, false);
    this.deps.store.save();
    const ms = this.deps.pollMs ?? VENUE_POLL_MS;
    this.poller = setInterval(() => void this.pollVenues(), ms);
    this.poller.unref?.();
    // First poll shortly after boot to learn initial states.
    setTimeout(() => void this.pollVenues(), 3_000).unref?.();
  }

  stop(): void {
    for (const j of this.jobs.values()) j.stop();
    this.jobs.clear();
    if (this.poller) clearInterval(this.poller);
    this.poller = undefined;
  }

  /** (Re)schedule one automation after create/update/delete. Updates `nextFireAt`. */
  sync(id: ID, emit = true): void {
    this.jobs.get(id)?.stop();
    this.jobs.delete(id);
    const a = this.deps.store.getAutomation(id);
    if (!a) return;
    const before = a.nextFireAt;
    a.nextFireAt = undefined;
    if (a.enabled) {
      try {
        if (a.trigger.type === 'schedule') {
          const job = new Cron(a.trigger.cron, { timezone: a.trigger.timezone, catch: true, mode: '5-or-6-parts' }, () => this.onTick(id, 'schedule'));
          this.jobs.set(id, job);
          a.nextFireAt = job.nextRun()?.toISOString();
        } else if (a.trigger.type === 'once') {
          const at = new Date(a.trigger.at);
          if (at.getTime() > this.now().getTime()) {
            const job = new Cron(at, { catch: true }, () => this.onTick(id, 'once'));
            this.jobs.set(id, job);
            a.nextFireAt = at.toISOString();
          }
        }
      } catch (e) {
        console.warn(`[woltron] could not schedule automation ${a.name}: ${errorMessage(e)}`);
      }
    }
    if (before !== a.nextFireAt) {
      this.deps.store.save();
      if (emit) this.deps.events.publish({ type: 'automation.changed', id });
    }
  }

  unschedule(id: ID): void {
    this.jobs.get(id)?.stop();
    this.jobs.delete(id);
  }

  private async onTick(id: ID, source: RunSource) {
    const a = this.deps.store.getAutomation(id);
    if (!a || !a.enabled) return;
    try {
      await this.fire(a, source);
    } catch (e) {
      console.warn(`[woltron] automation ${a.name} failed: ${errorMessage(e)}`);
    }
    if (source === 'once') {
      a.enabled = false;
      a.updatedAt = this.now().toISOString();
      this.deps.store.save();
    }
    this.sync(id);
  }

  /** Fire an automation now. Returns the resulting run. */
  async fire(a: Automation, source?: RunSource): Promise<Run> {
    const src: RunSource = source ?? (a.trigger.type === 'schedule' ? 'schedule' : a.trigger.type);
    a.lastFiredAt = this.now().toISOString();
    a.fireCount += 1;
    this.deps.store.save();
    const runPromise = this.deps.engine.start({ target: a.target, source: src, confirm: a.confirm, automationId: a.id });
    const run = await runPromise;
    this.deps.events.publish({ type: 'automation.fired', automationId: a.id, runId: run.id });
    this.deps.events.publish({ type: 'automation.changed', id: a.id });
    return run;
  }

  /** Poll venue-online automations; fire on a closed → open transition, at most once per day. */
  async pollVenues(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const { store } = this.deps;
      const autos = store.data.automations.filter((a) => a.enabled && a.trigger.type === 'venue-online');
      const loc = store.data.settings.location ?? DEFAULT_LOCATION;
      for (const a of autos) {
        if (a.trigger.type !== 'venue-online') continue;
        const state = (store.data.meta.venueOnline[a.id] ??= {});
        let online: boolean;
        try {
          online = (await this.deps.wolt().getVenue(a.trigger.venueSlug, loc)).online;
        } catch (e) {
          console.warn(`[woltron] venue-online poll for ${a.trigger.venueSlug} failed: ${errorMessage(e)}`);
          continue;
        }
        const today = dayKey(this.now());
        const wasClosed = state.lastOnline === false;
        state.lastOnline = online;
        state.checkedAt = this.now().toISOString();
        store.save();
        if (wasClosed && online && state.lastFiredDay !== today) {
          state.lastFiredDay = today;
          await this.fire(a, 'venue-online').catch((e) => console.warn(`[woltron] ${errorMessage(e)}`));
        }
      }
    } finally {
      this.polling = false;
    }
  }
}
