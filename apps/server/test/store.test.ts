import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Run } from '@woltron/shared';
import { Store } from '../src/store.js';
import { preset, tmpDir } from './helpers.js';

const run = (i: number): Run => ({
  id: `r${i}`,
  createdAt: '',
  updatedAt: '',
  source: 'manual',
  mode: 'dry-run',
  status: 'simulated',
  target: { kind: 'preset', id: 'p' },
  presetId: 'p',
  presetName: 'p',
  venueOrders: [],
  total: { amount: 0, currency: 'ILS' },
  log: [],
});

describe('Store', () => {
  it('creates defaults on first run', () => {
    const dir = tmpDir();
    const s = new Store(dir);
    expect(s.data.settings.orderMode).toBe('dry-run');
    expect(s.data.settings.appearance.mascotName).toBe('Woltie');
    expect(s.data.settings.location).toMatchObject({ lat: 32.0853, lon: 34.7818 });
    expect(s.isEmpty).toBe(true);
    s.flush();
    expect(fs.existsSync(path.join(dir, 'db.json'))).toBe(true);
  });

  it('persists across instances (debounced write + flush)', async () => {
    const dir = tmpDir();
    const a = new Store(dir, 20);
    a.flush();
    a.mutate((d) => d.presets.push(preset('p1', [])));
    // not yet written
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'db.json'), 'utf8')).presets).toHaveLength(0);
    await new Promise((r) => setTimeout(r, 60));
    expect(new Store(dir).getPreset('p1')).toBeDefined();
    a.mutate((d) => (d.presets[0]!.name = 'Renamed'));
    a.flush();
    expect(new Store(dir).getPreset('p1')!.name).toBe('Renamed');
    // no temp files left behind
    expect(fs.readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('keeps secrets in a 0600 file and preserves the pairing token', () => {
    const dir = tmpDir();
    const a = new Store(dir);
    const token = a.secrets.pairingToken;
    expect(token).toHaveLength(32);
    a.updateSecrets({ openrouterKey: 'sk-test', woltTokens: { refreshToken: 'rt' } });
    const file = path.join(dir, 'secrets.json');
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    const b = new Store(dir);
    expect(b.secrets).toMatchObject({ pairingToken: token, openrouterKey: 'sk-test', woltTokens: { refreshToken: 'rt' } });
    b.updateSecrets({ openrouterKey: undefined });
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).not.toHaveProperty('openrouterKey');
    // secrets never end up in db.json
    b.flush();
    expect(fs.readFileSync(path.join(dir, 'db.json'), 'utf8')).not.toContain('sk-test');
  });

  it('caps runs at 500, newest first', () => {
    const s = new Store(tmpDir());
    for (let i = 0; i < 520; i++) s.upsertRun(run(i));
    expect(s.data.runs).toHaveLength(500);
    expect(s.data.runs[0]!.id).toBe('r519');
    s.upsertRun({ ...run(519), status: 'failed' });
    expect(s.data.runs).toHaveLength(500);
    expect(s.data.runs[0]!.status).toBe('failed');
  });

  it('survives a corrupt db file', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'db.json'), '{ nope');
    const s = new Store(dir);
    expect(s.data.presets).toEqual([]);
    expect(fs.readdirSync(dir).some((f) => f.startsWith('db.json.corrupt-'))).toBe(true);
  });

  it('merges new default settings into old files', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'db.json'), JSON.stringify({ settings: { orderMode: 'live', appearance: { theme: 'dark' } } }));
    const s = new Store(dir);
    expect(s.data.settings.orderMode).toBe('live');
    expect(s.data.settings.appearance).toEqual({ theme: 'dark', reducedMotion: false, mascotName: 'Woltie' });
    expect(s.data.settings.lan.port).toBe(4321);
  });
});
