# REST API

Everything the UI does goes through a small JSON API on the Woltron server, so you can script it too.
The typed contract (request and response shapes for every route) is in
[`packages/shared/src/api.ts`](../packages/shared/src/api.ts), and the domain types are in
[`domain.ts`](../packages/shared/src/domain.ts).

- Base URL: `http://127.0.0.1:4321`. All routes are under `/api` and use JSON.
- Money is always `{ "amount": <minor units>, "currency": "ILS" }`.
- Errors are non-2xx responses with `{ "error": "<code>", "message": "<human readable>" }`.

## Auth

| Caller | Needs |
|---|---|
| The same computer (`127.0.0.1` / `::1`) | Nothing |
| Other devices (LAN access on) | `Authorization: Bearer <pairing token>` or `?token=<pairing token>` |
| Webhooks `/api/hooks/:id/:secret` | Only the secret in the URL |
| `/api/health` | Nothing |

## Routes

| Area | Routes |
|---|---|
| Health | `GET /api/health` |
| Settings | `GET /api/settings` · `PATCH /api/settings` |
| Wolt account | `GET /api/wolt/auth` · `POST /api/wolt/auth/token {refreshToken}` · `POST /api/wolt/auth/verify {linkOrCode}` · `DELETE /api/wolt/auth` |
| Pairing | `GET /api/pairing` · `POST /api/pairing/rotate` |
| Catalog | `GET /api/wolt/geocode?q=` · `GET /api/wolt/venues?lat&lon&tag` · `GET /api/wolt/venues/:slug` · `GET /api/wolt/venues/:slug/menu` · `GET /api/wolt/search?q=` |
| Presets | `GET/POST /api/presets` · `GET/PUT/DELETE /api/presets/:id` · `POST /api/presets/:id/duplicate` |
| Packs | `GET/POST /api/packs` · `GET/PUT/DELETE /api/packs/:id` · `GET /api/packs/:id/preview` |
| Automations | `GET/POST /api/automations` · `GET/PUT/DELETE /api/automations/:id` · `POST /api/automations/:id/fire` · `POST /api/automations/:id/rotate-secret` · `POST /api/automations/describe-cron {cron, timezone}` |
| Webhooks | `POST` or `GET /api/hooks/:id/:secret` |
| Runs | `GET /api/runs?limit=` · `POST /api/runs` · `GET /api/runs/:id` · `POST /api/runs/:id/confirm` · `POST /api/runs/:id/cancel` |
| Fetch | `POST /api/fetch {query, limit?}` |
| Live events | `GET /api/events` (Server-Sent Events) |

## Examples

```bash
# Run a preset (uses the current order mode; dry run by default)
curl -X POST localhost:4321/api/runs -H 'content-type: application/json' \
  -d '{"target":{"kind":"preset","id":"<presetId>"}}'

# Force a dry run of a pack, asking for confirmation first
curl -X POST localhost:4321/api/runs -H 'content-type: application/json' \
  -d '{"target":{"kind":"pack","id":"<packId>"},"mode":"dry-run","confirm":"ask"}'

# AI search
curl -X POST localhost:4321/api/fetch -H 'content-type: application/json' -d '{"query":"cozy ramen for two"}'

# Follow everything live
curl -N localhost:4321/api/events
```

## Events

`/api/events` streams JSON `ServerEvent`s: `hello`, `run.updated`, `preset.changed`, `pack.changed`,
`automation.changed`, `automation.fired`, `settings.updated` and `notification`. A named `ping` event
arrives every 25 seconds to keep the connection open.

## Run statuses

`pending` → (`awaiting-confirmation`) → `placing` → one of `simulated` (dry run), `handed-off`, `placed`,
`delivered`, or `skipped` (guard), `failed`, `cancelled`, `expired`.
