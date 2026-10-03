# Automations

An **automation** runs a preset or a pack when something happens. Each automation has a **trigger**, a
**target**, a **confirmation policy** and optional **guards**.

## Triggers

| Trigger | Fires | Set up |
|---|---|---|
| **Schedule** | Repeatedly, on a cron schedule in your timezone | Pick days and a time, e.g. *Weekdays at 12:30*, or enter raw cron. The editor shows the next five fire times. |
| **Once** | At one date and time | Disables itself after firing. |
| **Webhook** | When a secret URL is called | Copy the URL from the editor (see below). |
| **Venue opens** | When a restaurant goes from closed to open | Polled every 2 minutes; fires at most once a day. Good for "breakfast as soon as the bakery opens". |

Every automation also has **Run now** (*Fire*), which runs it as if it had triggered.

## Ask first or auto

- **Auto** places the run immediately.
- **Ask** puts the run in **Awaiting confirmation** and sends a notification (a desktop notification with a
  *Confirm* button on macOS/Windows, a toast in the web app). Confirm within the window (default 10 minutes)
  or it **expires** and nothing is ordered. The total shown already includes Wolt's fees.

## Guards

Guards skip a run (status **Skipped**, with the reason in the log) instead of ordering:

- **Max total**: skip if the run would cost more than this
- **Only if all venues are open**
- **Skip dates**: holidays, days off
- Global **spending limits** per run and per day apply too ([Ordering & safety](ordering-and-safety.md)).

## Webhooks

Each webhook automation has a URL with a secret:

```bash
curl -X POST http://<host>:4321/api/hooks/<automationId>/<secret>
# → {"runId":"…"}
```

`GET` works too, for tools that can only open URLs. The secret is the only credential, so treat the URL
like a password; **Rotate secret** invalidates the old one. To call it from another device, enable LAN
access ([Phone & other devices](devices.md)).

Ideas: an iOS Shortcut ("Hey Siri, feed me"), a Home Assistant automation, a Stream Deck button, or a
cron job on another machine.
