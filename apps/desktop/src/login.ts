import { app } from 'electron';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Passed when launched at login: start minimised to the tray. */
export const HIDDEN_FLAG = '--hidden';

function linuxAutostartFile() {
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(base, 'autostart', 'woltron.desktop');
}

function linuxExec(): string {
  // AppImage: launch the AppImage itself, not the transient mount.
  const exe = process.env.APPIMAGE || process.execPath;
  const args = app.isPackaged ? [] : [path.resolve(app.getAppPath())];
  return [exe, ...args, HIDDEN_FLAG].map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ');
}

export function getLaunchAtLogin(): boolean {
  if (process.platform === 'linux') return existsSync(linuxAutostartFile());
  return app.getLoginItemSettings({ args: [HIDDEN_FLAG] }).openAtLogin;
}

export function setLaunchAtLogin(enabled: boolean): boolean {
  if (process.platform === 'linux') {
    const file = linuxAutostartFile();
    if (enabled) {
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(
        file,
        [
          '[Desktop Entry]',
          'Type=Application',
          'Name=Woltron',
          'Comment=Your very good food-fetching dog',
          `Exec=${linuxExec()}`,
          'Terminal=false',
          'X-GNOME-Autostart-enabled=true',
          '',
        ].join('\n'),
      );
    } else {
      rmSync(file, { force: true });
    }
  } else {
    app.setLoginItemSettings({ openAtLogin: enabled, args: [HIDDEN_FLAG] });
  }
  return getLaunchAtLogin();
}

export function launchedHidden(): boolean {
  if (process.argv.includes(HIDDEN_FLAG)) return true;
  if (process.platform === 'darwin') {
    return app.getLoginItemSettings().wasOpenedAtLogin;
  }
  return false;
}
