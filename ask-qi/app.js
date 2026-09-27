/*
  Ask Qi — frontend logic (CMU 15-113, HW4).

  This file talks to my Flask backend on Render and nothing else. There are no API keys here, and
  there never can be: anything in this file is downloadable by every visitor. The only secret in the
  whole project (my Gemini API key) lives in a Render environment variable on the server.

  Backend contract:
    GET  /health       -> { status, model, api_key_configured }
    GET  /suggestions  -> { suggestions: [string, ...] }
    POST /chat         -> body { message, history:[{role:'user'|'assistant', content}] }
                          200 -> { reply, model, requests_remaining }
                          4xx/5xx -> { error, retry_after_seconds? }

  AI usage: written with Claude Code (Claude Opus 5). Prompt log: see the backend repo.
*/

/* ---------------------------------------------------------------------------
   Where the backend lives.
   Change this line if the Render service is renamed. For local testing, don't edit the file —
   just open the page with ?api=... e.g.
     http://localhost:8000/ask-qi/?api=http://127.0.0.1:5050
--------------------------------------------------------------------------- */
const DEFAULT_BACKEND = "https://ask-qi-backend.onrender.com";
const BACKEND_URL = (new URLSearchParams(location.search).get("api") || DEFAULT_BACKEND)
  .trim()
  .replace(/\/+$/, "");

const MAX_CHARS = 500;
const MAX_HISTORY = 8;        // turns sent for context; the backend trims to the same number
const HEALTH_TIMEOUT = 70000; // a sleeping Render free instance needs ~50s to boot
const CHAT_TIMEOUT = 90000;

/* The opening bubble. Rendered from JS (not written into the HTML) so it goes through the same
   addMessage() path as the model's replies — the bubbles use white-space: pre-wrap, which would
   otherwise preserve the indentation of the HTML source. */
const GREETING =
  "Hi! I'm a chatbot version of Catherine (Qi) Chen. Ask me about what I study at CMU, the " +
  "platforms I've built, my research, or the games I made for 15-113. If I don't know something, " +
  "I'll say so.";

/* Fallback chips, used only if GET /suggestions can't be reached. */
const FALLBACK_SUGGESTIONS = [
  "What are you studying at CMU?",
  "Tell me about your research.",
  "What have you built for 15-113 so far?",
];

// ---------- elements ----------
const root = document.documentElement;
const chatLog = document.getElementById("chatLog");
const chatForm = document.getElementById("chatForm");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const charCount = document.getElementById("charCount");
const formError = document.getElementById("formError");
const statusPill = document.getElementById("statusPill");
const statusText = document.getElementById("statusText");
const quotaNote = document.getElementById("quotaNote");
const suggestionsBox = document.getElementById("suggestions");

/** Conversation sent to the backend for context. Only completed exchanges go in here. */
const history = [];
let busy = false;

/* ---------------------------------------------------------------------------
   Rendering. Everything uses textContent, never innerHTML: the reply is text
   from a language model (and could contain anything), so it must never be
   parsed as HTML by this page.
--------------------------------------------------------------------------- */
function addMessage(who, text, kind = "bot") {
  const article = document.createElement("article");
  article.className = `msg msg-${kind}`;

  const label = document.createElement("span");
  label.className = "msg-who";
  label.textContent = who;

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;

  article.append(label, bubble);
  chatLog.append(article);
  chatLog.scrollTop = chatLog.scrollHeight;
  return article;
}

function showTyping() {
  const article = document.createElement("article");
  article.className = "msg msg-bot typing";
  article.innerHTML =
    '<span class="msg-who">Qi</span><div class="bubble">' +
    '<span class="dot"></span><span class="dot"></span><span class="dot"></span></div>';
  chatLog.append(article);
  chatLog.scrollTop = chatLog.scrollHeight;
  return article;
}

function setStatus(state, text) {
  statusPill.className = `status-pill status-${state}`;
  statusText.textContent = text;
}

function setBusy(value) {
  busy = value;
  sendBtn.disabled = value;
  sendBtn.textContent = value ? "Sending…" : "Send";
  suggestionsBox.querySelectorAll("button").forEach((b) => (b.disabled = value));
}

/* ---------------------------------------------------------------------------
   One place for every request, so every caller gets the same shape back and a
   backend that returns an HTML error page (or nothing) can't crash the parser.
--------------------------------------------------------------------------- */
async function requestBackend(path, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(BACKEND_URL + path, { ...options, signal: controller.signal });
    const raw = await response.text();
    let data = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = null; // not JSON — handled by the caller
    }
    return { ok: response.ok, status: response.status, data, raw };
  } finally {
    clearTimeout(timer);
  }
}

/** Turns a thrown fetch error into something a human can act on. */
function describeFailure(err) {
  if (err.name === "AbortError") {
    return "That took too long and timed out. The backend may still be waking up — try again.";
  }
  if (!navigator.onLine) {
    return "You appear to be offline. Check your connection and try again.";
  }
  // fetch() rejects with a TypeError for DNS failures, refused connections and CORS blocks.
  return `Couldn't reach the backend at ${BACKEND_URL}. It may be asleep, down, or not allowing requests from this page.`;
}

/* ---------------------------------------------------------------------------
   On load: wake the backend.
   Render's free tier stops the instance after ~15 minutes of inactivity, so the
   first request of the day pays a cold start. Doing that here — while the
   visitor is still reading the intro — means their first question feels fast,
   and the status pill explains the wait instead of the page looking broken.
--------------------------------------------------------------------------- */
async function wakeBackend() {
  setStatus("checking", "Waking up the backend… (free tier, up to ~50s)");
  try {
    const { ok, status, data } = await requestBackend("/health", {}, HEALTH_TIMEOUT);
    if (!ok || !data) {
      setStatus("down", `Backend responded with an error (HTTP ${status})`);
      return;
    }
    if (data.api_key_configured === false) {
      setStatus("down", "Backend is up but has no API key configured");
      return;
    }
    setStatus("ready", `Backend ready · ${data.model || "model"}`);
  } catch (err) {
    setStatus("down", "Backend unreachable");
    addMessage("System", describeFailure(err), "error");
  }
}

async function loadSuggestions() {
  let items = FALLBACK_SUGGESTIONS;
  try {
    const { ok, data } = await requestBackend("/suggestions", {}, 15000);
    if (ok && data && Array.isArray(data.suggestions) && data.suggestions.length) {
      items = data.suggestions;
    }
  } catch {
    // Chips are a convenience, not a feature — a failure here is silent on purpose.
  }
  suggestionsBox.replaceChildren();
  items.slice(0, 5).forEach((question) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = question;
    chip.addEventListener("click", () => {
      if (busy) return;
      messageInput.value = question;
      updateCharCount();
      chatForm.requestSubmit();
    });
    suggestionsBox.append(chip);
  });
}

/* ---------------------------------------------------------------------------
   Sending a question.
--------------------------------------------------------------------------- */
async function sendMessage(message) {
  addMessage("You", message, "user");
  const typing = showTyping();
  setBusy(true);
  formError.textContent = "";

  try {
    const { ok, status, data, raw } = await requestBackend(
      "/chat",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Only the last few turns: enough for follow-ups like "what about the second one?"
        // without shipping the whole conversation on every keystroke-sized question.
        body: JSON.stringify({ message, history: history.slice(-MAX_HISTORY) }),
      },
      CHAT_TIMEOUT
    );

    typing.remove();

    if (!ok) {
      // The backend sends { error } as JSON for every failure it knows about.
      let text =
        data && data.error
          ? data.error
          : `The backend returned an unexpected response (HTTP ${status}). ${raw.slice(0, 120)}`;
      if (status === 429 && data && data.retry_after_seconds) {
        text += ` (Try again in about ${Math.ceil(data.retry_after_seconds / 60)} minute(s).)`;
      }
      addMessage("System", text, "error");
      setStatus(status >= 500 ? "down" : "ready", status >= 500 ? "Backend error" : "Backend ready");
      return;
    }

    if (!data || typeof data.reply !== "string") {
      addMessage("System", "The backend replied without an answer. Please try again.", "error");
      return;
    }

    addMessage("Qi", data.reply, "bot");
    setStatus("ready", `Backend ready · ${data.model || "model"}`);

    // Commit the exchange to context only now that both halves exist.
    history.push({ role: "user", content: message });
    history.push({ role: "assistant", content: data.reply });

    if (typeof data.requests_remaining === "number") {
      quotaNote.textContent = `${data.requests_remaining} message(s) left this hour`;
    }
  } catch (err) {
    typing.remove();
    addMessage("System", describeFailure(err), "error");
    setStatus("down", "Backend unreachable");
  } finally {
    setBusy(false);
    messageInput.focus();
  }
}

/* ---------------------------------------------------------------------------
   Form wiring. The same rules are enforced on the backend — these exist so the
   visitor gets instant feedback, not as the real guard.
--------------------------------------------------------------------------- */
chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (busy) return;

  const message = messageInput.value.trim();
  if (!message) {
    formError.textContent = "Type a question first.";
    return;
  }
  if (message.length > MAX_CHARS) {
    formError.textContent = `That's ${message.length} characters — please keep it under ${MAX_CHARS}.`;
    return;
  }

  messageInput.value = "";
  updateCharCount();
  autoGrow();
  sendMessage(message);
});

// Enter sends, Shift+Enter makes a new line.
messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    chatForm.requestSubmit();
  }
});

function updateCharCount() {
  const length = messageInput.value.length;
  charCount.textContent = `${length}/${MAX_CHARS}`;
  charCount.classList.toggle("near-limit", length > MAX_CHARS - 50);
  if (formError.textContent && length) formError.textContent = "";
}

function autoGrow() {
  messageInput.style.height = "auto";
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 140)}px`;
}

messageInput.addEventListener("input", () => {
  updateCharCount();
  autoGrow();
});

/* ---------------------------------------------------------------------------
   Theme toggle — shares the "theme" localStorage key with the main portfolio,
   so dark mode follows you between pages.
--------------------------------------------------------------------------- */
const themeToggle = document.getElementById("themeToggle");
const savedTheme = localStorage.getItem("theme");
if (savedTheme) {
  root.setAttribute("data-theme", savedTheme);
} else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
  root.setAttribute("data-theme", "dark");
}
themeToggle.addEventListener("click", () => {
  const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
  root.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
});

// ---------- start ----------
addMessage("Qi", GREETING, "bot");
updateCharCount();
wakeBackend();
loadSuggestions();
