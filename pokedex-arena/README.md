# Pokédex Arena

**Live demo:** https://cathhh204.github.io/pokedex-arena/ (once GitHub Pages has rebuilt after pushing)

A three-mode Pokémon web app built entirely on [PokeAPI](https://pokeapi.co/), a free, public REST API that
requires **no API key**. Built for CMU 15-113, HW3 ("Explore an API").

## What it does

- **Pokédex Lookup** — search any Pokémon by name or National Dex number and see its official artwork,
  types, height/weight, abilities, and a base-stat bar chart.
- **Battle Arena** — enter two Pokémon and the app fetches both, works out which of each side's types would
  be most effective against the other (using real type damage-relation data, not a hardcoded chart), and
  renders a grouped bar chart comparing their six base stats side by side. A battle score
  (stat total × best type-effectiveness multiplier) decides the winner.
- **Guess the Pokémon** — a random Pokémon's artwork is shown as a black silhouette. One hint is free;
  each additional hint (type, highest stat, first letter/length) costs points. Guess correctly for up to
  50 points a round, or give up to reveal the answer. Score, round, and streak are tracked across rounds.

## How the API is called

All requests are plain `fetch()` calls in `app.js` (`API_BASE = "https://pokeapi.co/api/v2"`) — no
wrapper library, since PokeAPI is a simple keyless REST API and a raw GET is all it needs. Three endpoints
are used:

- `GET /pokemon/{name-or-id}` — the core resource. Returns a JSON object with `id`, `name`, `height`
  (decimetres), `weight` (hectograms), `types` (an array of `{slot, type: {name}}`), `stats` (an array of
  `{base_stat, stat: {name}}` for hp/attack/defense/special-attack/special-defense/speed), `abilities`, and
  `sprites.other["official-artwork"].front_default` (the image URL used everywhere in the UI).
- `GET /pokemon-species/{name-or-id}` — used for the "Generation" hint/label; returns `generation.name`
  (e.g. `"generation-i"`).
- `GET /type/{type-name}` — used only in Battle mode. Returns `damage_relations` with
  `double_damage_to` / `half_damage_to` / `no_damage_to` arrays of types, which is how the effectiveness
  multiplier (0x / 0.5x / 1x / 2x / 4x) is computed for both directions of a matchup. Results are cached in
  memory (`typeDataCache`) per session so the same type is never re-fetched twice.

A 404 response means the name/ID doesn't exist and is shown to the user as "No Pokémon found…"; any other
non-OK status or a network failure (e.g. no wifi) is caught and shown as a plain-language message instead
of letting the app crash. Empty search input is rejected client-side before any request is made.

## Running it

No install, no build step, no API key. It's a static page:

```bash
# from the pokedex-arena/ folder
python3 -m http.server 8000
```

Then open `http://localhost:8000`. (Opening `index.html` directly also works, since every request goes to
`https://pokeapi.co`, not a local backend.) It's also live on GitHub Pages at the URL above once pushed,
since PokeAPI needs no secret key and is safe to call straight from browser JavaScript.

## AI Tools Used

Built with Claude Code (Claude Sonnet 5) as the primary coding tool. See `prompt_log.md` for the key
prompts that shaped the implementation.

## Known limitations

- The type-effectiveness engine approximates each Pokémon's best "same-type attack" rather than simulating
  actual moves/movesets (PokeAPI move data exists but is out of scope here) — this is explained in-app under
  the matchup analysis.
- The Guess mode's random Pokémon range (1–1025) can occasionally include Pokémon with unusual official
  artwork framing (e.g. a close-up/partial silhouette); this is a PokeAPI sprite quirk, not a bug in the
  guessing logic.
- No persistence — refreshing the page resets the Guess mode's score.
