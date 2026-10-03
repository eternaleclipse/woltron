# Configuration

Most settings live in the app (**Settings**). Environment variables control how the server starts.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `OPENROUTER_API_KEY` | — | Key for [Fetch](fetch.md). A key pasted in Settings takes precedence. |
| `WOLTRON_PORT` | `4321` | Server port. The desktop app picks the next free port if it is taken. |
| `WOLTRON_DATA_DIR` | `~/.woltron` (desktop: app profile folder) | Where data and secrets are stored. |
| `WOLTRON_WOLT_MOCK` | off | `1` = use bundled fixture data instead of the live Wolt API. |
| `WOLTRON_SEED` | on | `0` = don't create demo presets, packs and automations on first run. |
| `WOLTRON_WEB_DIR` | `apps/web/dist` | Where the built web UI is served from. |
| `WOLTRON_WOLT_EXPERIMENTAL_PURCHASE` | off | `1` = try fully automatic purchase ([details](ordering-and-safety.md)). |

Desktop-only variables are listed in [`apps/desktop/README.md`](../apps/desktop/README.md).

## Data folder

| File | Contents |
|---|---|
| `db.json` | Settings, presets, packs, automations and the last 500 runs. Written atomically. |
| `secrets.json` | Wolt session, stored OpenRouter key, pairing token. Mode `0600`. |

Back up `db.json` to keep your presets. Delete both files to start fresh.

## In-app settings

- **Wolt account**: [connect](connecting-wolt.md) or disconnect
- **Delivery address**: address search or your current location, plus saved locations
- **Order mode** and **Spending limits**: [Ordering & safety](ordering-and-safety.md)
- **Fetch brain**: model and optional key for Fetch
- **Phone & devices**: LAN access and pairing QR ([Phone & other devices](devices.md))
- **Look & feel**: light, dark or system theme, reduced motion, the mascot's name
- **Notifications**, and **Launch at login** (desktop)
