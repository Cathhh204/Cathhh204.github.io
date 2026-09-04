# Reflection

**What did you learn about HTML/CSS/JS by building this?**
- I got a lot more comfortable with how CSS Grid and Flexbox actually behave, especially the parts that aren't obvious — for example, grid/flex items have an implicit "automatic minimum size" that can force a layout wider than its container even when everything else looks constrained. I also learned how CSS custom properties (`--accent`, `--bg`, etc.) make it possible to support light/dark mode cleanly without duplicating every rule, and how `IntersectionObserver` can drive scroll animations without a library.

**Where did you use AI (Claude) as a learning tool, and what did you have it explain vs. write yourself?**
- I used Claude to generate the first working version of the site structure and CSS from scratch, then iterated on it in very specific, small steps (spacing, colors, section order, wording) rather than asking for one big rewrite. I had it write the actual code, but I made every design decision — what sections to include, what content went where, what the animations should feel like, and when something "looked ugly" and needed to change. I also had it explain *why* a couple of bugs happened (like a CSS overflow bug and a GitHub Pages caching issue) instead of just fixing them silently, which helped me understand the codebase I now own.

**What was the hardest part — layout, responsiveness, JavaScript, deployment?**
- Two things stood out. First, getting the responsive layout right — a bug where the mobile nav menu got cut off once I added a sixth link, which only showed up because the max-height was hardcoded for five items. Second, deployment: after pushing, the live site briefly looked "wrong" on my end, but it turned out GitHub Pages just hadn't finished rebuilding yet — a good reminder that "pushed" and "live" aren't the same instant.

**What would you change or add if you had another week?**
- I'd add real screenshots/demos for the "Coming Soon" style projects as they get built this semester, write real alt text and polish accessibility further, and maybe add a light analytics or contact-form backend instead of a mailto link.

**How do you feel about using this site as a living portfolio throughout the semester?**
- I like that it's not a one-time assignment — it's already reflecting real coursework and real projects, and the structure (Projects grouped into Work Experience / Research / Projects, plus Achievements and Interests) makes it easy to slot in new work as I do it rather than redesigning from scratch each time.
