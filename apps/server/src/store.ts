import fs from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import type { Automation, BasketQuote, Pack, Preset, Run, Settings, WoltTokens } from '@woltron/shared';
import { DEFAULT_LOCATION, DEFAULT_MODEL, DEFAULT_PORT, RUNS_CAP } from './config.js';

/** Settings as persisted: the derived/read-only parts (`llm.hasApiKey`, `wolt`) are not stored. */
export type StoredSettings = Omit<Settings, 'llm' | 'wolt'> & { llm: { model: string } };

export interface DbData {
  version: 1;
  presets: Preset[];
  packs: Pack[];
  automations: Automation[];
  runs: Run[]; // newest first, capped
  settings: StoredSettings;
  meta: {
    seededAt?: string;
    /** venue-online trigger state, per automation id */
    venueOnline: Record<string, { lastOnline?: boolean; lastFiredDay?: string; checkedAt?: string }>;
    /**
     * Whole BasketQuote objects (incl. client extras like lines/venueId) for runs waiting for
     * confirmation, keyed by run id → venue slug, so placeOrder works after a restart.
     */
    quotes?: Record<string, { at: string; byVenue: Record<string, BasketQuote> }>;
  };
}

export interface Secrets {
  woltTokens?: WoltTokens;
  openrouterKey?: string;
  pairingToken: string;
}

export function defaultSettings(): StoredSettings {
  return {
    location: { ...DEFAULT_LOCATION },
    savedLocations: [],
    orderMode: 'dry-run',
    limits: {},
    llm: { model: DEFAULT_MODEL },
    lan: { enabled: false, port: DEFAULT_PORT },
    appearance: { theme: 'system', reducedMotion: false, mascotName: 'Woltie' },
    notifications: { desktop: true, sound: true },
    language: 'en',
  };
}

function emptyDb(): DbData {
  return { version: 1, presets: [], packs: [], automations: [], runs: [], settings: defaultSettings(), meta: { venueOnline: {} } };
}

/** Merge persisted settings over defaults so new fields appear after upgrades. */
function normalizeSettings(s: Partial<StoredSettings> | undefined): StoredSettings {
  const d = defaultSettings();
  if (!s) return d;
  return {
    ...d,
    ...s,
    location: s.location ?? d.location,
    savedLocations: s.savedLocations ?? [],
    limits: { ...d.limits, ...s.limits },
    llm: { ...d.llm, ...s.llm },
    lan: { ...d.lan, ...s.lan },
    appearance: { ...d.appearance, ...s.appearance },
    notifications: { ...d.notifications, ...s.notifications },
  };
}

/** Write file atomically: temp file in the same dir, fsync, rename. */
export function writeFileAtomic(file: string, contents: string, mode?: number): void {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  const fd = fs.openSync(tmp, 'w', mode ?? 0o644);
  try {
    fs.writeSync(fd, contents);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  if (mode !== undefined) fs.chmodSync(tmp, mode);
  fs.renameSync(tmp, file);
}

function readJson<T>(file: string): T | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    // Corrupt file: keep a copy for forensics and start fresh rather than crash.
    try {
      fs.copyFileSync(file, `${file}.corrupt-${Date.now()}`);
    } catch {
      /* ignore */
    }
    console.warn(`[woltron] could not parse ${file}; starting with an empty one`);
    return undefined;
  }
}

/**
 * JSON-file store. All mutations go through `mutate()` (or `save()` after an in-place change),
 * which schedules a debounced atomic write. Secrets live in a separate 0600 file.
 */
export class Store {
  readonly dbFile: string;
  readonly secretsFile: string;
  data: DbData;
  secrets: Secrets;
  private timer: NodeJS.Timeout | undefined;
  private dirty = false;

  constructor(
    readonly dataDir: string,
    private readonly debounceMs = 200,
  ) {
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    this.dbFile = path.join(dataDir, 'db.json');
    this.secretsFile = path.join(dataDir, 'secrets.json');
    const raw = readJson<Partial<DbData>>(this.dbFile);
    const base = emptyDb();
    this.data = {
      ...base,
      ...raw,
      version: 1,
      presets: raw?.presets ?? [],
      packs: raw?.packs ?? [],
      automations: raw?.automations ?? [],
      runs: raw?.runs ?? [],
      settings: normalizeSettings(raw?.settings),
      meta: { ...base.meta, ...raw?.meta, venueOnline: raw?.meta?.venueOnline ?? {} },
    };
    const sec = readJson<Partial<Secrets>>(this.secretsFile);
    this.secrets = { ...sec, pairingToken: sec?.pairingToken || nanoid(32) };
    if (!sec?.pairingToken) this.saveSecrets();
    if (!raw) this.save();
  }

  get isEmpty(): boolean {
    const d = this.data;
    return !d.meta.seededAt && d.presets.length === 0 && d.packs.length === 0 && d.automations.length === 0;
  }

  /** Schedule a debounced write of db.json. */
  save(): void {
    this.dirty = true;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.flush();
    }, this.debounceMs);
    this.timer.unref?.();
  }

  mutate<T>(fn: (d: DbData) => T): T {
    const r = fn(this.data);
    this.save();
    return r;
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (!this.dirty) return;
    this.dirty = false;
    writeFileAtomic(this.dbFile, JSON.stringify(this.data, null, 2));
  }

  saveSecrets(): void {
    writeFileAtomic(this.secretsFile, JSON.stringify(this.secrets, null, 2), 0o600);
  }

  updateSecrets(patch: Partial<Secrets>): void {
    this.secrets = { ...this.secrets, ...patch };
    for (const k of Object.keys(this.secrets) as Array<keyof Secrets>) if (this.secrets[k] === undefined) delete this.secrets[k];
    this.saveSecrets();
  }

  // ── convenience accessors ──
  getPreset = (id: string) => this.data.presets.find((p) => p.id === id);
  getPack = (id: string) => this.data.packs.find((p) => p.id === id);
  getAutomation = (id: string) => this.data.automations.find((a) => a.id === id);
  getRun = (id: string) => this.data.runs.find((r) => r.id === id);

  /** Insert or replace a run (newest first) and cap the list. */
  upsertRun(run: Run): void {
    const i = this.data.runs.findIndex((r) => r.id === run.id);
    if (i >= 0) this.data.runs[i] = run;
    else {
      this.data.runs.unshift(run);
      if (this.data.runs.length > RUNS_CAP) this.data.runs.length = RUNS_CAP;
    }
    this.save();
  }
}
