# Architecture

```
               ┌──────────── apps/desktop (Electron) ────────────┐
               │ tray · notifications · global shortcut · links  │
               │ starts the server in-process, opens a window    │
               └──────────────────────┬──────────────────────────┘
 phone (LAN + token) ──────────────┐  │  ┌──── browser (localhost)
                                   ▼  ▼  ▼
          apps/server  (Node · Hono)  REST /api/* + SSE /api/events + serves apps/web
            ├─ store        JSON file DB, atomic writes, secrets.json (0600)
            ├─ engine       run pipeline: pick → validate → guards → confirm → order
            ├─ packs        shuffle / weighted / round-robin / fresh
            ├─ scheduler    cron + one-off (croner) · venue-online poller · webhooks
            ├─ fetch        OpenRouter: intent → Wolt search → rerank
            └─ auth         loopback trusted · LAN bearer token · webhook secrets
                       │
          packages/wolt     unofficial Wolt client (live + mock fixtures)
          packages/shared   domain types · REST contract · WoltClient interface
```

## Packages

| Path | What it is |
|---|---|
| [`packages/shared`](../packages/shared/src) | The single source of truth: domain types, the REST route table, and the `WoltClient` interface. |
| [`packages/wolt`](../packages/wolt) | Unofficial Wolt API client: catalog, search, geocoding, auth, checkout pricing, baskets and purchase. Includes a mock client built from captured fixtures. [Endpoint notes](../packages/wolt/README.md). |
| [`apps/server`](../apps/server/src) | Hono server: REST, SSE, storage, run engine, scheduler, webhooks, LLM Fetch. Bundled to one dependency-free ESM file that Electron imports directly. |
| [`apps/web`](../apps/web) | React 19, Vite, Tailwind v4, Radix, Motion, TanStack Query; responsive PWA. [Design system](../apps/web/DESIGN.md). |
| [`apps/desktop`](../apps/desktop) | Electron shell: in-process server, tray, notifications, deep links. [Details](../apps/desktop/README.md). |
| [`assets`](../assets) | Mascot and icon sources; `assets/scripts/build_assets.py` regenerates every image. |

## Design decisions

- **One server, many clients.** Desktop, browser and phone all use the same server and UI. The desktop app is a
  thin shell, so there is a single code path to test.
- **Contract first.** All workstreams build against `packages/shared`; the web client is typed from the route table.
- **No native dependencies.** Storage is a JSON file with atomic writes (data volumes are small), so Electron
  packaging needs no native rebuilds.
- **Safe by default.** Dry run unless explicitly switched; guards and limits run in every mode; handoff instead
  of headless purchase unless opted in.
- **Live by events.** Every run step is broadcast over SSE, so every open window and the tray update instantly.

The original product and technical spec is in [`SPEC.md`](../SPEC.md).
