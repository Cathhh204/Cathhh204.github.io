# Prompt Log

This is a reconstruction of my Claude Code session for CMU 15-113 HW4 (Ask Qi: Backend + Frontend),
including both what I asked and a summary of what Claude did/said in response, in chronological
order. It was assembled at my request from the assistant's own record of the conversation rather
than exported directly from the chat UI, so wording in the "Response" entries is
paraphrased/summarized rather than a verbatim transcript; the "Prompt" entries reflect what I
actually typed (translated to English where I wrote in Chinese). The backend code mentioned in
several entries below lives in a separate repo,
[ask-qi-backend](https://github.com/Cathhh204/ask-qi-backend), which has its own earlier
`prompt_log.md` in a topic-grouped format rather than this chronological one.

---

**1. Prompt:** (pasted the full HW4 assignment page) Complete this assignment.

**Response:** Explored the existing portfolio repo to see how earlier assignments were structured —
`pokedex-arena/` and `crossy-road/` are course-project subfolders, each with its own README and
prompt log, linked from a card on the main portfolio page — and read through the whole site for real
biographical content to use later. Checked what was available locally first (no `gh` CLI, no Flask
installed, Python 3.9) rather than assuming, then asked two clarifying questions instead of guessing:
what the backend should actually do, and which LLM API key to build it around.

**2. Prompt:** (answered the two questions) Build an AI chatbot version of me, "Ask Qi," using a free
Google Gemini API key.

**Response:** Read the portfolio's About/Projects/Coursework/Achievements content to build a factual
persona knowledge base (`persona.py`), grounding every answer in my real background, with explicit
rules to decline off-topic requests and to stay in character if someone tries to extract the system
prompt. Built the Flask backend (`app.py`) with four endpoints (`/`, `/health`, `/suggestions`,
`/chat`), server-side input validation, per-IP rate limiting, and a JSON error for every failure
mode. Set up a Python virtual environment and ran the server locally, hit a real "Address already in
use" error caused by macOS's AirPlay Receiver occupying port 5000, and used a different port
instead. Wrote and ran a smoke-test script against every endpoint, which caught a real ordering bug:
the "is the API key configured" check ran before request validation, so any malformed request
returned "service not configured" (503) instead of a real validation error (400) — reordered the
checks and re-verified every case. Deliberately restarted the server with an invalid key to confirm
a bad key fails cleanly without leaking anything, and curled a CORS preflight from both an allowed
and a disallowed origin to confirm the allow-list actually blocks the latter.

Continuing in the same session: built the frontend (`ask-qi/index.html`, `style.css`, `app.js`),
matching the main portfolio's existing design tokens and dark-mode key, with a status pill that wakes
Render's free-tier instance on page load, suggestion chips pulled live from the backend, and every
failure state rendered as a message in the chat log. Opened the page in an actual browser and found a
real bug this way — the greeting's HTML source indentation was leaking into the chat bubble because
of `white-space: pre-wrap` — and fixed it by moving the greeting into JavaScript so it renders
through the same path as every other message. Wrote both repos' READMEs and prompt logs, added a
project card to the main portfolio page, and initialized git for the new backend repo. Asked me to
generate a free Gemini key and confirm a Render service name, and asked me to run `gh auth login`
myself, since authenticating GitHub's CLI is an interactive step Claude can't do on my behalf.

**3. Prompt:** (pasted a screenshot of the Google AI Studio "API key details" dialog, with the newly
generated key visible in plain text)

**Response:** Flagged that the key was now visible inside the conversation itself, which could be
logged or persisted, and recommended treating it as exposed — rotate it in AI Studio and set the
replacement only through a terminal command rather than pasting or screenshotting it again.
Separately, installed the GitHub CLI via Homebrew, since it wasn't present, and explained that
authenticating it has to be something I do myself interactively.

**4. Prompt:** Don't worry about whether this key is leaked — just use it directly. Please finish
the rest for me.

**Response:** Wrote the key from the screenshot straight into the backend's local `.env` file via a
terminal command, without repeating the value in the chat reply, restarted the backend, and sent it a
real question — which failed with a `401 ACCESS_TOKEN_TYPE_UNSUPPORTED` error from Google. Tested
three different ways of sending the credential (a query parameter, an `x-goog-api-key` header, and an
`Authorization: Bearer` token) directly against Google's API, to check whether the problem was the
request format or the credential itself; all three failed identically, pointing at the key rather
than the code. Rather than keep guessing at formats, asked me to copy Google AI Studio's own "cURL
quickstart" command for that same key, to get the actual, current request shape straight from Google
instead of assuming.

**5. Prompt:** (pasted the cURL quickstart command copied from the AI Studio dialog)

**Response:** Diffed it character-by-character against the key saved in `.env` and found the actual
bug: a capital "I" had been misread as a lowercase "l" when transcribing the key from the earlier
screenshot. Corrected it, restarted the backend, and authentication succeeded — but that surfaced a
second, real issue: the configured model, `gemini-2.5-flash`, had been retired by Google ("no longer
available to new users"). Tested Google's suggested replacement and the `gemini-flash-latest` alias
directly, confirmed both worked, and switched the default to the alias so it's less likely to go
stale the same way again. Also noticed and fixed a related bug while there: the code that disables
Gemini's hidden "thinking" tokens only checked for a `"gemini-2.5"` model-name prefix, which had
silently stopped matching the moment the model changed — made it unconditional instead.

Verified a real end-to-end chat exchange, then specifically tested that the persona behaves as
designed: an on-topic question answered accurately from my real background, an off-topic homework
request declined and redirected, a prompt-injection attempt ("ignore all previous instructions...")
that stayed in character, and a question asked in Chinese answered in Chinese. Confirmed `gh` was
already authenticated, opened the frontend in a real browser against the now-working backend and sent
a message through the full local stack, then created the public `ask-qi-backend` GitHub repo and
pushed it, and committed and pushed the frontend into the existing portfolio repo. Polled GitHub
Pages until the new page was actually live, then re-verified everything a second time against the
real production URLs rather than local ones: the deployed Render service's endpoints, a CORS
preflight from the live GitHub Pages origin, and a full conversation in the browser on the live page
— including confirming the new project card on the main portfolio page links and renders correctly.

**6. Prompt:** What should the demo video include?

**Response:** Pointed to the assignment's own grading language — the video should contain "enough
information for us to grade your work if we can't run it ourselves" — and proposed a structure
specific to this project: prove the page is the live deployed URL rather than localhost, ask a real
question and show the reply, demonstrate error handling (an empty message, an off-topic question),
briefly explain where the API key lives, and optionally show the Render dashboard's environment
variable name (never its value).

**7. Prompt:** Turn that into an English version I can use directly while recording.

**Response:** Rewrote the outline as a speakable script with rough timestamps and bracketed stage
directions for what to click or show at each point, sized to run about two minutes.

**8. Prompt:** Does the video have to show actual code?

**Response:** Pointed out the assignment explicitly allows "a screenshare of the frontend interacting
with the backend," since the code itself is graded separately from the two GitHub repos, and trimmed
the script to drop the code-editor segment, replacing it with a single spoken sentence about where
the API key lives.

**9. Prompt:** Add a PROMPT_LOG.md file inside `ask-qi`, recording our conversation. Write it in
English — it's fine to reconstruct or paraphrase it.

**Response:** Wrote an initial version of this file grouped by topic rather than chronologically (the
frontend build, the live API-key debugging session, deployment, the video script, and what I did
myself), and linked it from `ask-qi/README.md`.

**10. Prompt:** The prompt log should be written like this instead (pasted an example prompt log from
a different assignment: a numbered, strictly chronological list of Prompt/Response pairs, one per
actual exchange, with a header explaining it's a reconstructed summary rather than a verbatim
export).

**Response:** Rewrote this file from scratch in that exact numbered, chronological format — the
version you're reading now.
