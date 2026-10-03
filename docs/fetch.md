# Fetch (AI food search)

Type what you feel like eating in plain words, for example *"something spicy & vegan under ₪60"*,
*"cozy ramen for two"* or *"hangover breakfast, fast"*, and Woltron fetches matching dishes from restaurants
that deliver to you **right now**.

## How it works

1. **Understand.** An LLM turns your request into search terms, cuisines, dietary needs, exclusions and a budget.
   These appear as chips under the search box ("I heard: vegan · spicy · under ₪60").
2. **Search.** Woltron searches Wolt near your delivery location for each term and collects up to ~60
   candidate dishes. It drops unavailable dishes, closed restaurants, and anything over budget.
3. **Rank.** The LLM picks the best matches and writes a one-line reason for each. Many Tel Aviv menus are in
   Hebrew, and the reasons come back in English.

Each result shows the dish photo, price, restaurant, rating, delivery time and an **Open now** badge.
From a result you can pick options, **Add to preset**, or **Order now**.

A search takes about 5–15 seconds.

## Setup

Fetch uses [OpenRouter](https://openrouter.ai), so any model OpenRouter offers can be used.

- Set `OPENROUTER_API_KEY` in the environment, **or** paste a key in **Settings → Fetch brain**. A pasted key is stored
  in `secrets.json`.
- Default model: `anthropic/claude-sonnet-4.5`. Change it in Settings. If the configured model is rejected,
  Woltron retries with `anthropic/claude-haiku-4.5`.

Without a key, Fetch still works with plain keyword search and simple ranking, but without the reasons.
