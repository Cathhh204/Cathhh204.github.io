# Scotty Crossing

This is a Crossy Road clone built with Canvas 2D, with a chunky isometric/2.5D look. I replaced the default chicken with CMU's Scotty mascot in a black outfit (represented as a black block with red scarf), and changed the dark night background to a blue sky with blocky clouds.

## How to Play

- **Move:** Arrow keys or WASD — each keypress hops one tile forward, back, left, or right
- **Goal:** Get as far forward as you can without dying
- **Score:** Your score is the furthest row you've reached, shown in the top left
- **Death:** Getting hit by a car on a road lane, or landing in water instead of on a log
- **Restart:** Press R after the game over screen

## AI Tools Used

Built with Kiro (Default mode, Autopilot off) as the main coding tool, with Claude used
alongside it to plan the approach and draft prompts.

Strategy: I asked for a written plan first before any code, then implemented it in small
steps — core loop and cars first, then water and logs, then difficulty and polish, and
the visual reskin last. Each step was tested in the browser before moving on. When one
change (a camera/projection rewrite) made things worse, I reverted it instead of trying
to patch over it.

## Known Issues

- The Scotty sprite is fairly rough and can be hard to read against the dark road tiles
- Water lanes aren't as visually distinct from grass as they should be
- No sound effects
- The player is a simple black block. An earlier Scotty dog sprite had isometric alignment problems, so I reverted to a block that uses the same drawing function as the terrain.