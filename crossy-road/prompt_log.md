# Prompt Log — Scotty Crossing

**Tools used:** Kiro (Default mode, Autopilot off) as the main coding tool, with
Claude used alongside it to plan the approach and draft prompts.

All prompts below are verbatim, in the order I sent them.

---

## 1. Plan first, no code

I'm building a Crossy Road clone inside the crossy-road/ folder of this repo.
IMPORTANT: only create or modify files inside crossy-road/. Never touch
index.html, css/, js/, README.md, PROMPT_LOG.md or anything else at the repo root.

Constraints: it must run on GitHub Pages as a static page — plain HTML/CSS/JS,
no build step, no npm, no ES modules, no server. Canvas 2D only, no Three.js.
Fake the chunky 2.5D isometric look by drawing each block as a top face plus
two shaded side faces.

Don't write code yet. Give me a short plan (under 40 lines): file structure,
the main game loop, how lanes are generated and recycled as the player advances,
how collision detection works, and how the isometric projection math works.

---

## 2. Implement the MVP

Looks good, implement it now. Only create files inside crossy-road/ — never
touch index.html, css/, js/ or anything at the repo root.

Scope for this step only (don't add extra features yet):
- Player hops one tile at a time with arrow keys and WASD, one hop per keypress
- Endless lanes ahead of the player: grass (safe) and road (cars)
- Cars move horizontally at varying speeds and directions; collision ends the run
- Score = furthest forward row reached, shown in the top left
- Camera follows the player so they stay around the lower third of the screen
- Game over overlay showing the score, press R to restart

Use requestAnimationFrame with delta time. All file paths must be relative
(game.js, not /game.js). No external libraries, no ES modules — plain <script> tags.

---

## 3. Lane colors and a camera change (this one backfired)

Two rendering problems:

1. Water lanes are being drawn with the grass color, so logs appear to float on
   grass and the player can't tell which lanes are safe. Give each lane type a
   clearly distinct ground color: grass = green, road = dark gray with yellow
   dashes, water = blue with a slightly darker blue tint, rail = gray gravel.
   Water tiles should also be flat (no raised block height) so they read as water.

2. The camera angle is wrong. Right now lanes run diagonally and the map tilts
   away toward the bottom-right. In Crossy Road lanes run horizontally across the
   screen and the player moves toward the top. Change the projection so rows are
   horizontal bands and the camera looks down at a shallow angle, keeping the
   chunky blocky look.

Also make the player character visually distinct from everything else.

---

## 4. Reverting the camera change

That made it much worse — the whole world is now squashed into a thin sloped
band near the horizon and the player is off at the edge. Revert the camera /
projection change completely and go back to the previous working projection.

Keep only the lane color fix (grass green, road dark gray with yellow dashes,
water blue, rail gravel) and the flat water tiles. Don't change the camera.

---

## 5. Water lanes still not readable

Water lanes still render mostly as green grass — only a thin blue sliver shows
under the logs. The entire water lane row must be filled with blue water tiles
across the full width, so the player can clearly see which rows are water before
jumping. Don't change the camera or anything else.

---

## 6. CMU reskin

Reskin the game with a CMU theme. Visual changes only — do not change any game
logic, collision rules, camera, or projection.

1. Replace the player block with a CMU Scotty dog: a blocky black Scottish
   terrier built from simple boxes (body, head, four short legs, upright ears,
   a short tail), drawn in the same chunky isometric style as everything else.
   Add a small CMU-red collar or scarf so it reads clearly against the dark road
   and green grass.

2. Replace the dark navy background with a blue sky: a vertical gradient from a
   deeper blue at the top to a lighter blue near the horizon, with a few chunky
   blocky white clouds drawn in the sky area. The clouds should sit behind the
   world and not interfere with gameplay or collision.

Everything else — lane types, obstacle behavior, scoring, camera angle — stays
exactly the same.

---

## 7. Collision bug

Collision bug: the player dies from a car that is on a different lane. Concrete
case — the Scotty is standing on a grass row, a car passes on the road row
directly ahead of it (one row forward), and the player dies even though it never
entered that row.

Investigate the collision code and fix it. Two likely causes to check:
1. Collision is using the interpolated hop-animation position instead of the
   player's settled integer grid row, so mid-hop the player is treated as already
   being in the next lane.
2. The collision loop isn't filtering obstacles by lane — it compares the player
   against cars on every lane instead of only the lane the player currently
   occupies.

The player must only be killed by obstacles in the exact grid row it currently
occupies. Don't change the camera or the art.

---

## Notes on what happened after prompt 7

Kiro's fix to the collision code didn't help, because the collision logic was
already correct — it compared integer grid rows and filtered by lane. I read
through game.js myself and found the real cause was in rendering, not logic:
the Scotty sprite was drawn floating above the ground and was drawing its back
face instead of the two faces the ground tiles use, so it appeared roughly half
a row off from where it actually was. I fixed the sprite's base height and face
order by hand, and when it still didn't line up cleanly I replaced the dog with
a simple block drawn through the same drawBlock() function the terrain uses,
which guarantees alignment.