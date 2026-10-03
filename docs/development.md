# Development

```bash
npm install
npm run dev:mock     # server (tsx watch, :4321) + web (Vite, :5173) with fixture data
npm run dev          # same, against the live Wolt catalog
npm test             # vitest: Wolt client mappers/auth, server engine/packs/store
npm run typecheck    # all workspaces
npm run build        # web → apps/web/dist, server → apps/server/dist
```

The web app can also run without the server: `VITE_MOCK=1` (or `?mock=1`) enables an in-browser mock API.

## Workspace scripts

| Workspace | Useful scripts |
|---|---|
| `@woltron/server` | `dev`, `build`, `start`, `test` |
| `@woltron/wolt` | `test`; `npx tsx scripts/smoke.ts` (live catalog smoke test); `scripts/capture-fixtures.ts` (refresh mock data) |
| `@woltron/web` | `dev`, `build`; `node scripts/screenshots.mjs <baseUrl>` and `node scripts/flows.mjs <baseUrl>` (Playwright screenshots + UI flow checks) |
| `@woltron/desktop` | `dev`, `dev:stub`, `dist`, `dist:dir` |

## Regenerating artwork

The mascot, icons, tray icons, logo and banner are all generated from code:

```bash
pip install cairosvg pillow fonttools
python3 assets/scripts/build_assets.py
```

`assets/scripts/robodog.py` draws the robot dog (each mood's SVG includes its own CSS animation), and
`build_assets.py` composes the icons, logo and banner.

## Screenshots

```bash
npm run build
WOLTRON_WOLT_MOCK=1 WOLTRON_DATA_DIR=$(mktemp -d) WOLTRON_PORT=4390 node apps/server/dist/cli.js &
cd apps/web && node scripts/screenshots.mjs http://127.0.0.1:4390 && node scripts/flows.mjs http://127.0.0.1:4390
```

## Project board

Status and backlog live in [`TODO.md`](../TODO.md).
