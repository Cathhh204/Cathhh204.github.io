# Ask Qi — Frontend

The frontend half of **Ask Qi**, a chatbot version of me on my portfolio.
Built for **CMU 15-113, HW4: Backend + Frontend**.

- **Live page:** https://cathhh204.github.io/ask-qi/
- **Backend repo (with the full README and prompt log):** https://github.com/Cathhh204/ask-qi-backend
- **Live backend:** https://ask-qi-backend.onrender.com

## What's here

A static page — plain HTML, CSS, and JavaScript, no framework and no build step — that talks to my
Flask backend on Render over `fetch()`:

| File | What it does |
|---|---|
| `index.html` | Chat layout, plus a "How this works" panel explaining the frontend/backend split |
| `style.css` | Design tokens copied from the main portfolio, so this page matches the site and shares its dark-mode setting |
| `app.js` | All the logic: calls the backend, renders messages, handles every failure |

## What it calls

`BACKEND_URL` at the top of `app.js` is the only configuration in this repo. **There are no secrets
here and there can't be** — everything in this folder is downloadable by any visitor. The Gemini API
key exists only as an environment variable on Render.

- `GET /health` on page load — wakes the free-tier Render instance (a cold start is ~50s) so the
  first question feels fast, and drives the status pill at the top of the page.
- `GET /suggestions` on page load — the starter-question chips. If it fails, three hardcoded
  questions are used instead.
- `POST /chat` for every question — sends `{ message, history }` (the last 8 turns), renders the
  `reply` from the JSON response.

Every failure is shown to the visitor as a red message in the conversation: backend asleep or
unreachable, request timed out, browser offline, input rejected, rate limit hit, or model error.
Replies are inserted with `textContent`, never `innerHTML`, so model output is never parsed as HTML.

## Running it locally

Serve the repo over HTTP and point the page at a local backend with the `?api=` query parameter —
no file edits needed:

```bash
python3 -m http.server 8000
# then open http://localhost:8000/ask-qi/?api=http://127.0.0.1:5050
```

Use `http://localhost:8000`, not a `file://` path: a page opened straight from disk sends
`Origin: null`, which the backend's CORS allow-list rejects.

## AI tools used

Built with Claude Code (Claude Opus 5 and Claude Sonnet 5). This page's own prompt log — the
frontend build, a live API-key debugging session, deployment, and the demo-video script — is in
[PROMPT_LOG.md](PROMPT_LOG.md). The backend's implementation-focused log is in the
[backend repo](https://github.com/Cathhh204/ask-qi-backend/blob/main/prompt_log.md).
