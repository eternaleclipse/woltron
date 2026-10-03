# Desktop app

The desktop app (Electron) runs the Woltron server inside itself and keeps working from the system tray
when the window is closed, so schedules and triggers keep firing.

## Install

```bash
npm install && npm run build
npm -w @woltron/desktop run dist     # → apps/desktop/release/: AppImage + .deb (Linux), .dmg (macOS), installer (Windows)
```

**Linux without root:** `scripts/install-linux.sh` installs to `~/.local/opt/Woltron` with a launcher, icon and
`woltron://` link handling. It runs with `--no-sandbox` because Ubuntu's AppArmor blocks Chromium's sandbox
helper unless it is installed as root. For a fully sandboxed install use the `.deb`:
`sudo apt install ./apps/desktop/release/woltron_*.deb`.

Data lives in the app's profile folder (`~/.config/Woltron` on Linux).

## Tray menu

- **Open Woltron**
- **Run preset ▸** / **Run pack ▸**: one-click runs (favourites first)
- **Recent runs ▸**
- **Dry-run mode**: untick it to open the live-mode confirmation in Settings
- **Launch at login**
- **Quit**

## Notifications

Runs that need confirmation, are placed, or fail show a native notification. Click it to open the run.
On macOS and Windows, confirmation requests have a **Confirm** button.

## Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl/⌘ Shift W` | Show or hide Woltron (works system-wide) |
| `Ctrl/⌘ K` | Command palette: go anywhere, run any preset or pack |
| `/` | Fetch |
| `g` then `h` `f` `e` `p` `k` `a` `r` `s` | Go to Kennel, Fetch, Explore, Presets, Packs, Automations, Runs, Settings |

## Deep links

| Link | Action |
|---|---|
| `woltron://run/preset/<id>` | Run a preset and open the run |
| `woltron://run/pack/<id>` | Run a pack and open the run |
| `woltron://open/<path>` | Open a page, e.g. `woltron://open/automations` |

Developer details (environment variables, the `window.woltronDesktop` bridge) are in
[`apps/desktop/README.md`](../apps/desktop/README.md).
