# Prompt Log — Pokédex Arena

**Tool used:** Claude Code (Claude Sonnet 5), working directly in this repo.

This was primarily a single detailed request, so this log gives the prompt as sent (translated from
Chinese where noted) and a summary of what Claude Code did in response, rather than a long back-and-forth.

---

## 1. The brief

**Prompt (translated from Chinese):**

> Complete HW3 for CMU 15-113 inside the Cathhh204.github.io repo. Handle the whole assignment for me.
> For this one, use PokeAPI (Pokémon data) — it needs no API key, so there's no risk of leaking a key and
> getting a zero. The app is called Pokédex Arena, with three modes: look up a Pokémon, have two Pokémon
> battle (comparing type matchups and drawing a bar chart), and a guess-the-Pokémon minigame (with hints
> and scoring). Keep the interface in English so the TA can grade it easily.

**What Claude did:**

1. Read the assignment PDF/page content (requirements: working API integration with real interactivity,
   README explaining the API call mechanics, a prompt log, no leaked secrets, add it to the portfolio).
2. Explored the existing repo (`crossy-road/` as the closest precedent — a course-project subfolder linked
   from the main portfolio page) to match its file layout and conventions rather than inventing new ones.
3. Decided on a plain HTML/CSS/JS static page (no build step, no framework) instead of a Python script,
   specifically because PokeAPI needs no key — that means it's safe to call straight from browser
   JavaScript (unlike a keyed API, which the assignment explicitly warns against calling from the
   front end) and lets the finished app run live on GitHub Pages rather than only as a video demo.
4. Verified PokeAPI's actual endpoint shapes with `curl` before writing any code against them
   (`/pokemon/{id}`, `/pokemon-species/{id}`, `/type/{name}`), instead of guessing field names.
5. Loaded the `dataviz` skill before building the battle stat-comparison chart, and ran
   `validate_palette.js` against the two bar colors (light and dark mode) before using them, rather than
   picking chart colors by eye.
6. Implemented all three modes in `app.js`/`index.html`/`style.css`, including a type-effectiveness engine
   that calls PokeAPI's `/type` damage-relations data live (rather than hardcoding a type chart) to decide
   battle outcomes, and a hand-rolled SVG grouped bar chart (no charting library) for the stat comparison.
7. Wrote error handling for the cases the assignment calls out explicitly: empty input, a misspelled/
   nonexistent Pokémon (404), and a dropped network connection — each shows a plain-language message
   instead of a crash or console error.
8. Ran the app end-to-end in a headless Playwright browser (all three modes, dark mode toggle, error paths,
   a full correct-guess round) and checked screenshots and the console for errors before calling it done,
   rather than only checking that the code looked right.
9. Wrote `README.md` (API call mechanics, setup, known limitations) and this prompt log, and added a
   project card for Pokédex Arena to the main portfolio's Projects section.

## Notes on a few implementation calls made without being asked directly

- The battle "winner" is fully deterministic (stat total × best-type multiplier, no randomness) so the
  outcome is explainable and reproducible for grading, rather than adding RNG for battle "feel."
- The guess game's free first hint (generation + type count) is shown automatically on each round so the
  game never starts as a pure blind guess; every hint after that costs points.
- Reused the main portfolio's `"theme"` localStorage key for the dark-mode toggle so the preference is
  shared across the whole site rather than resetting per subpage.
