# Ordering & safety

Woltron can spend real money, so it starts in the safest mode and makes going live deliberate.

## Order modes

| Mode | What happens |
|---|---|
| **Dry run** *(default)* | Woltron does everything except order: it checks venues and items and gets Wolt's real price quote, including delivery and service fees. The run ends as **Simulated**. |
| **Live** | Woltron builds the basket in your Wolt account and opens Wolt's checkout so you confirm and pay with one tap (**Handed off**). |
| **Live + experimental purchase** | With `WOLTRON_WOLT_EXPERIMENTAL_PURCHASE=1`, Woltron tries to place the order itself (**Placed**). |

Switching to live requires typing a confirmation in **Settings → Order mode**. The desktop tray can switch back
to dry run instantly, but it never switches to live on its own.

### About fully automatic purchase

Wolt has no public ordering API. The purchase flow is implemented from wolt.com's own client code and has
**not been verified against a real account**. It also:

- needs a **saved address** in Wolt within 300 m of your Woltron location, and a **saved card**
  (Apple Pay and Google Pay can't be used headlessly);
- re-checks the price and **refuses if the total rose by more than 2%**;
- hands the order back to you if the bank asks for **3-D Secure**.

## What every run does

1. **Pick.** A pack picks a preset; see [Presets & Packs](presets-and-packs.md).
2. **Validate.** For each venue: is it open and delivering, are the items available, what do they cost now?
3. **Guards.** Spending limits, automation guards. A failed guard means **Skipped**, and nothing is ordered.
4. **Confirm.** Runs set to *Ask* wait in **Awaiting confirmation** until you confirm, or they **expire**.
5. **Order.** Each venue is processed according to the mode, and everything is written to the run's live log.

## Spending limits

In **Settings → Spending limits**:

- **Max per run**: a run that would cost more is skipped.
- **Max per day**: counts runs that were placed, handed off or delivered today.

Both are checked in dry-run mode too, so you can see whether a schedule would have been blocked.

## Security

- The server listens on **127.0.0.1 only**, unless you enable LAN access.
- With LAN access, other devices need the **pairing token** ([Phone & other devices](devices.md)); requests
  from the computer itself are trusted.
- Wolt tokens and API keys live in `secrets.json` (mode `0600`) and are never sent to the UI.
- Webhook URLs contain a per-automation secret that you can rotate.

## Disclaimer

Woltron uses **unofficial** Wolt endpoints. They can change or break without notice, and automated ordering
may be against Wolt's terms of service. Use it responsibly and at your own risk. Woltron is not affiliated
with Wolt or DoorDash.
