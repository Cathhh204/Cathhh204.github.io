# Prompt Log — Ask Qi (HW4: Backend + Frontend)

**Tool used:** Claude Code (Claude Opus 5 and Claude Sonnet 5 — the session switched models
partway through), working directly in this repo and in the companion backend repo,
[ask-qi-backend](https://github.com/Cathhh204/ask-qi-backend), which has its own
[prompt_log.md](https://github.com/Cathhh204/ask-qi-backend/blob/main/prompt_log.md) focused on
backend implementation details. This file covers the frontend, the overall project journey, and a
debugging session that happened live against the real, deployed service.

This is a reconstructed summary of the actual conversation — prompts are paraphrased and grouped by
topic rather than pasted as a raw transcript, and translated from Chinese where noted.

---

## 1. The brief

**Prompt:** the full HW4 assignment page pasted in, followed by (translated from Chinese):

> Complete this assignment.

Claude read through my existing portfolio repo first — `pokedex-arena/` and `crossy-road/` are both
course-project subfolders with their own `README.md` and `prompt_log.md`, linked from a card on the
main page — and matched that layout rather than inventing a new one. It also read the whole portfolio
page to pull my real background (work, research, coursework, sports, awards) as the factual base for
whatever it built, instead of inventing details about me.

Claude checked what was on my machine before proposing anything (no `gh` CLI, no Flask installed,
Python 3.9), then stopped and asked two questions rather than guessing:

1. **What should the backend do?** I picked an AI chatbot version of myself ("Ask Qi") over a game
   leaderboard — closest to the assignment's own Carnegie Chat example, and the clearest
   demonstration of *why* a backend is needed (an API key can't safely live in the browser).
2. **Which LLM provider?** I chose to get a free Google Gemini key rather than use a paid provider.

## 2. Building the frontend

This file (`ask-qi/`) is the piece that runs in the browser. Key decisions along the way:

- **Match the portfolio's own look.** Rather than a new design, Claude copied the main site's CSS
  design tokens and reused its `"theme"` `localStorage` key, so dark mode follows a visitor between
  the portfolio and this page.
- **Explain the architecture on the page itself.** I asked for a short "How this works" panel so a
  visitor (or a grader) can see the frontend/backend split without reading any code.
- **Wake the backend before the visitor needs it.** Claude explained that Render's free tier sleeps
  after ~15 minutes idle and the first request after that takes about 50 seconds. Rather than let the
  first question look broken, `app.js` calls `GET /health` as soon as the page loads and shows a
  status pill ("waking up" / "ready" / "unreachable") so the wait is visible and explained.
- **Suggestion chips come from the backend**, not hardcoded here, via `GET /suggestions` — so the
  starter questions can be edited without redeploying this page. A hardcoded fallback covers the case
  where that call fails.
- **Never treat model output as HTML.** Every chat bubble is filled with `textContent`, not
  `innerHTML`, since a reply is untrusted text from a language model.
- **Every failure is a message in the chat**, not a silent console error: bad input, rate limiting,
  a sleeping/unreachable backend, a timeout, and an offline browser all render as a red bubble with a
  plain-language explanation, matching the assignment's requirement to "handle errors gracefully."
- **A real bug, caught by actually using the browser.** Claude opened the page with `claude-in-chrome`
  and found the greeting message's HTML-source indentation was leaking into the chat bubble, because
  the bubbles use `white-space: pre-wrap`. Fix: the greeting moved out of `index.html` and into
  `app.js`, rendered through the exact same `addMessage()` path as every model reply, so it can never
  drift from how real messages look.
- **Local testing without editing files.** Rather than hardcoding `localhost` and remembering to
  revert it, `app.js` reads an optional `?api=` query parameter, so testing against a local backend is
  just `http://localhost:8000/ask-qi/?api=http://127.0.0.1:5050` — the Render URL stays the default.

## 3. Debugging a real, live API key

This part happened against the actual deployed key, not a hypothetical:

1. I generated a Gemini key at Google AI Studio and shared a screenshot of the key-details dialog so
   Claude could put it in the backend's local `.env` file directly (to avoid retyping it).
2. Claude flagged that a key visible in a screenshot inside the conversation should be treated as
   exposed, and suggested rotating it. I said not to worry about that and to just use it.
3. The key failed with `401 ACCESS_TOKEN_TYPE_UNSUPPORTED` — tested three ways (query parameter,
   `x-goog-api-key` header, `Authorization: Bearer`) to rule out a request-format bug before
   suspecting the credential itself.
4. I copied Google AI Studio's own "cURL quickstart" command for the same key and pasted it in.
   Comparing it character-by-character against what was in `.env` found the actual bug: Claude had
   misread a capital **I** as a lowercase **l** transcribing the key from the screenshot. Corrected,
   the key authenticated immediately.
5. That surfaced a second, real issue: the backend's configured model, `gemini-2.5-flash`, had been
   retired ("This model ... is no longer available to new users"). Claude tested Google's suggested
   replacement and the `gemini-flash-latest` alias live, confirmed both work, and switched the default
   to the alias — plus noticed and fixed a related bug where the code that disables Gemini's hidden
   "thinking" tokens was gated on a `"gemini-2.5"` prefix string, which had silently stopped applying
   the moment the model name moved on. It's now unconditional.

## 4. Shipping it

- Installed and authenticated the GitHub CLI (`gh`), then created `ask-qi-backend` as a new public
  repo and pushed it, and committed + pushed this frontend to the existing portfolio repo.
- Verified the **live, deployed** stack end-to-end rather than trusting local tests to generalize:
  `GET /` and `GET /health` on the real Render URL, a real `/chat` question answered correctly from
  my actual background, a CORS preflight from `https://cathhh204.github.io` succeeding, and — back in
  a real browser against the live page — a full conversation, an off-topic question declined and
  redirected, and the rate-limit counter updating.
- Also drove the live portfolio page itself to confirm the new "Ask Qi" project card renders and
  links correctly.

## 5. The demo video

I asked what the video needed to cover. Claude pointed to the assignment's own grading language
("should contain enough information for us to grade your work if we can't run it ourselves") and
proposed a structure: prove it's the live URL (not localhost), ask a real question and show the
reply, demonstrate error handling (empty input, an off-topic question), and state in one sentence
where the API key lives. I asked for it in English so I could read it directly while recording, and
then asked whether the video needed to show actual source code — Claude pointed out the assignment
explicitly says a screenshare of the frontend and backend interacting is sufficient, since the code
itself is graded separately from the two GitHub repos, so the script was trimmed to drop the
code-editor segment.

## 6. What I did myself

- Chose the project idea, the LLM provider, and the overall scope.
- Created the Google AI Studio API key and decided how much risk to accept around it being visible in
  a screenshot in this conversation.
- Ran `gh auth login` to authenticate GitHub CLI with my own account.
- Created the Render account, the web service, and set `GEMINI_API_KEY` in Render's dashboard myself —
  Claude never had and never needed direct access to my Render account.
- Will record the demo video and submit the course's Google form myself.
