# Presets & Packs

## Presets: your saved baskets

A **preset** is an exact order you want again: specific dishes, options (size, extras) and quantities,
plus an emoji, a colour, a delivery note and an optional tip.

- **Multiple restaurants.** A preset can mix venues ("Office Feast": pizza + sushi). Running it places
  **one Wolt order per venue**, and the run shows each venue separately.
- **Create one** from **Explore** (open a venue, pick a dish, choose options → *Add to preset*), from
  **Fetch** results, or with **Presets → New preset**.
- **Prices are re-checked on every run.** Woltron reloads the menu, checks each item is still available,
  and uses current prices including the options you chose. Unavailable items are reported in the run log.
- **Favourites** show up on the home screen and at the top of the desktop tray menu.

## Packs: let the dog pick

A **pack** bundles several presets, like **"Random Asian"** = sushi + ramen + poke. Each time a pack runs,
Woltron picks **one** preset and orders it.

| Strategy | How it picks |
|---|---|
| **Shuffle** | Uniformly at random. |
| **Weighted** | At random, in proportion to each preset's weight (1–5 🦴 bones). |
| **Round-robin** | In order, one after another. The cursor is remembered. |
| **Fresh** | At random, but never one of the last *N* picks (*Skip the last N*). If that would exclude everything, it skips fewer recent picks until something is left. |

The pack editor shows the **odds** for each preset, the recent picks, and a **Spin** button that previews the
next pick without ordering anything. Every run records which preset was picked.

## Running them

- ▶ on any card, or **Run it** in the editor
- `Ctrl/⌘ K` → type the name
- The desktop **tray** → *Run preset ▸* / *Run pack ▸*
- Deep links: `woltron://run/preset/<id>`, `woltron://run/pack/<id>`
- On a schedule or trigger: see [Automations](automations.md)

Manual runs use your current order mode (dry-run by default). See [Ordering & safety](ordering-and-safety.md).
