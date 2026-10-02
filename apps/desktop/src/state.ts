import { app } from 'electron';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export interface WindowBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized?: boolean;
}

export interface DesktopState {
  window?: WindowBounds;
  trayHintShown?: boolean;
}

/** Tiny JSON store for desktop-only state (window bounds etc.) in userData/desktop-state.json. */
class StateStore {
  private data: DesktopState | undefined;

  private get file() {
    return path.join(app.getPath('userData'), 'desktop-state.json');
  }

  get(): DesktopState {
    if (!this.data) {
      try {
        this.data = JSON.parse(readFileSync(this.file, 'utf8')) as DesktopState;
      } catch {
        this.data = {};
      }
    }
    return this.data;
  }

  set(patch: Partial<DesktopState>) {
    this.data = { ...this.get(), ...patch };
    try {
      mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      writeFileSync(tmp, JSON.stringify(this.data, null, 2));
      renameSync(tmp, this.file);
    } catch (err) {
      console.warn('[woltron] failed to persist desktop state', err);
    }
  }
}

export const state = new StateStore();
