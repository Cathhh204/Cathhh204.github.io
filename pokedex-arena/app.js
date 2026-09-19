"use strict";

/* =========================================================================
   Pokédex Arena — app.js
   All data comes from PokeAPI (https://pokeapi.co/api/v2), a free, keyless
   REST API. See README.md for a description of the endpoints used and the
   shape of the JSON each one returns.
   ========================================================================= */

const API_BASE = "https://pokeapi.co/api/v2";
const MAX_DEX_ID = 1025; // national dex range PokeAPI covers as of this build

const STAT_LABELS = {
  hp: "HP",
  attack: "Attack",
  defense: "Defense",
  "special-attack": "Sp. Atk",
  "special-defense": "Sp. Def",
  speed: "Speed",
};
const STAT_KEYS = Object.keys(STAT_LABELS);
const STAT_MAX = 255; // official base-stat scale used by the games' own Pokédex

const TYPE_COLORS = {
  normal: "#A8A878", fire: "#F08030", water: "#6890F0", electric: "#F8D030",
  grass: "#78C850", ice: "#98D8D8", fighting: "#C03028", poison: "#A040A0",
  ground: "#E0C068", flying: "#A890F0", psychic: "#F85888", bug: "#A8B820",
  rock: "#B8A038", ghost: "#705898", dragon: "#7038F8", dark: "#705848",
  steel: "#B8B8D0", fairy: "#EE99AC",
};

const typeDataCache = new Map(); // type name -> /type/{name} response

/* ---------------------------------------------------------------------
   Low-level API helpers
   --------------------------------------------------------------------- */

async function apiGet(path) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`);
  } catch {
    throw new Error("Couldn't reach PokeAPI — check your internet connection and try again.");
  }
  if (res.status === 404) {
    throw new Error("No Pokémon found with that name or number. Check the spelling and try again.");
  }
  if (!res.ok) {
    throw new Error(`PokeAPI returned an error (status ${res.status}). Please try again.`);
  }
  return res.json();
}

function normalizeQuery(raw) {
  return raw.trim().toLowerCase().replace(/\s+/g, "-");
}

async function fetchPokemon(rawQuery) {
  const query = normalizeQuery(rawQuery);
  if (!query) throw new Error("Please enter a Pokémon name or number.");
  return apiGet(`/pokemon/${query}`);
}

async function fetchSpecies(idOrName) {
  return apiGet(`/pokemon-species/${idOrName}`);
}

async function fetchTypeData(typeName) {
  if (typeDataCache.has(typeName)) return typeDataCache.get(typeName);
  const data = await apiGet(`/type/${typeName}`);
  typeDataCache.set(typeName, data);
  return data;
}

/* ---------------------------------------------------------------------
   Shared formatting helpers
   --------------------------------------------------------------------- */

function formatName(rawName) {
  return rawName
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getSprite(pokemonData) {
  return (
    pokemonData.sprites?.other?.["official-artwork"]?.front_default ||
    pokemonData.sprites?.front_default ||
    ""
  );
}

function getTypeNames(pokemonData) {
  return pokemonData.types
    .slice()
    .sort((a, b) => a.slot - b.slot)
    .map((t) => t.type.name);
}

function getStatsMap(pokemonData) {
  const map = {};
  pokemonData.stats.forEach((s) => {
    map[s.stat.name] = s.base_stat;
  });
  return map;
}

function statTotal(statsMap) {
  return STAT_KEYS.reduce((sum, k) => sum + (statsMap[k] || 0), 0);
}

function highestStatName(statsMap) {
  let best = null;
  let bestVal = -1;
  for (const k of STAT_KEYS) {
    if ((statsMap[k] || 0) > bestVal) {
      bestVal = statsMap[k];
      best = k;
    }
  }
  return best;
}

function pickTextColor(hex) {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#1c1c1e" : "#ffffff";
}

function renderTypeBadges(container, typeNames) {
  container.innerHTML = "";
  typeNames.forEach((t) => {
    const span = document.createElement("span");
    span.className = "type-badge";
    span.textContent = t;
    const bg = TYPE_COLORS[t] || "#777777";
    span.style.background = bg;
    span.style.color = pickTextColor(bg);
    container.appendChild(span);
  });
}

function setStatus(el, message, kind) {
  el.textContent = message;
  el.className = "status-msg" + (kind ? ` ${kind}` : "");
}

/* ---------------------------------------------------------------------
   Type-effectiveness engine (shared by Battle mode)

   Approximates "which of this Pokémon's types would do the most damage"
   by treating each of its types as a same-type attacking move and checking
   PokeAPI's /type damage_relations against every one of the opponent's
   types. This mirrors the games' own damage multiplier chart (0x / 0.5x /
   1x / 2x / 4x) without needing move-level data.
   --------------------------------------------------------------------- */

async function bestEffectivenessMultiplier(attackerTypes, defenderTypes) {
  let best = -1;
  let bestType = attackerTypes[0];

  for (const atkType of attackerTypes) {
    const { damage_relations: rel } = await fetchTypeData(atkType);
    const doubleTo = new Set(rel.double_damage_to.map((t) => t.name));
    const halfTo = new Set(rel.half_damage_to.map((t) => t.name));
    const noTo = new Set(rel.no_damage_to.map((t) => t.name));

    let multiplier = 1;
    for (const defType of defenderTypes) {
      if (noTo.has(defType)) multiplier *= 0;
      else if (doubleTo.has(defType)) multiplier *= 2;
      else if (halfTo.has(defType)) multiplier *= 0.5;
    }

    if (multiplier > best) {
      best = multiplier;
      bestType = atkType;
    }
  }

  return { multiplier: best, throughType: bestType };
}

function effectivenessLabel(multiplier) {
  if (multiplier === 0) return "No effect";
  if (multiplier >= 4) return "Devastating (4x)";
  if (multiplier === 2) return "Super effective (2x)";
  if (multiplier === 1) return "Normal damage (1x)";
  if (multiplier === 0.5) return "Not very effective (0.5x)";
  if (multiplier === 0.25) return "Barely effective (0.25x)";
  return `${multiplier}x`;
}

/* =========================================================================
   MODE: Pokédex Lookup
   ========================================================================= */

const lookupForm = document.getElementById("lookupForm");
const lookupInput = document.getElementById("lookupInput");
const lookupRandomBtn = document.getElementById("lookupRandomBtn");
const lookupStatus = document.getElementById("lookupStatus");
const lookupResult = document.getElementById("lookupResult");

function renderStatBars(container, statsMap) {
  container.innerHTML = "";
  STAT_KEYS.forEach((key) => {
    const value = statsMap[key] || 0;
    const pct = Math.min(100, (value / STAT_MAX) * 100);
    const li = document.createElement("li");
    li.className = "stat-row";
    li.innerHTML = `
      <span class="stat-name">${STAT_LABELS[key]}</span>
      <div class="stat-track"><div class="stat-fill" style="width:${pct}%"></div></div>
      <span class="stat-value">${value}</span>
    `;
    container.appendChild(li);
  });
}

function displayLookup(data, species) {
  const types = getTypeNames(data);
  const statsMap = getStatsMap(data);

  document.getElementById("lookupSprite").src = getSprite(data);
  document.getElementById("lookupSprite").alt = formatName(data.name);
  document.getElementById("lookupName").textContent = `${formatName(data.name)} #${String(data.id).padStart(3, "0")}`;

  const genLabel = species ? formatGeneration(species) : "Unknown generation";
  document.getElementById("lookupIdGen").textContent = genLabel;

  renderTypeBadges(document.getElementById("lookupTypes"), types);

  document.getElementById("lookupHeight").textContent = `${(data.height / 10).toFixed(1)} m`;
  document.getElementById("lookupWeight").textContent = `${(data.weight / 10).toFixed(1)} kg`;
  document.getElementById("lookupAbilities").textContent = data.abilities
    .map((a) => formatName(a.ability.name) + (a.is_hidden ? " (hidden)" : ""))
    .join(", ");

  renderStatBars(document.getElementById("lookupStats"), statsMap);

  lookupResult.hidden = false;
}

async function runLookup(query) {
  setStatus(lookupStatus, "Loading…", "info");
  lookupResult.hidden = true;
  try {
    const data = await fetchPokemon(query);
    const species = await fetchSpecies(data.id).catch(() => null);
    displayLookup(data, species);
    setStatus(lookupStatus, "", "info");
  } catch (err) {
    setStatus(lookupStatus, err.message, "error");
  }
}

lookupForm.addEventListener("submit", (e) => {
  e.preventDefault();
  runLookup(lookupInput.value);
});

lookupRandomBtn.addEventListener("click", () => {
  const randomId = Math.floor(Math.random() * MAX_DEX_ID) + 1;
  lookupInput.value = "";
  runLookup(String(randomId));
});

/* =========================================================================
   MODE: Battle Arena
   ========================================================================= */

const battleForm = document.getElementById("battleForm");
const battleInputA = document.getElementById("battleInputA");
const battleInputB = document.getElementById("battleInputB");
const battleStatus = document.getElementById("battleStatus");
const battleResultEl = document.getElementById("battleResult");

function formatGeneration(species) {
  const roman = species.generation?.name?.split("-")[1]?.toUpperCase();
  return roman ? `Generation ${roman}` : "Unknown generation";
}

function renderBattleSide(el, data, types) {
  el.innerHTML = `
    <img src="${getSprite(data)}" alt="${formatName(data.name)}" class="poke-sprite" />
    <h3>${formatName(data.name)}</h3>
    <div class="type-badges"></div>
  `;
  renderTypeBadges(el.querySelector(".type-badges"), types);
}

function renderMatchupAnalysis(container, nameA, nameB, aVsB, bVsA) {
  container.innerHTML = `
    <div class="matchup-row"><strong>${nameA}</strong> attacking <strong>${nameB}</strong> with its best type
      (${formatName(aVsB.throughType)}): <span class="effect-tag">${effectivenessLabel(aVsB.multiplier)}</span></div>
    <div class="matchup-row"><strong>${nameB}</strong> attacking <strong>${nameA}</strong> with its best type
      (${formatName(bVsA.throughType)}): <span class="effect-tag">${effectivenessLabel(bVsA.multiplier)}</span></div>
    <p class="matchup-note">Each side's best offensive type is checked against the opponent's full typing using
      PokeAPI's <code>/type</code> damage relations (0x / 0.5x / 1x / 2x / 4x), the same multipliers the games use.</p>
  `;
}

function renderBattleChart(container, nameA, nameB, statsA, statsB) {
  const width = 560;
  const barH = 16;
  const barGap = 2;
  const groupGap = 14;
  const leftPad = 92;
  const rightPad = 46;
  const topPad = 34;
  const rowH = barH * 2 + barGap + groupGap;
  const height = topPad + STAT_KEYS.length * rowH;

  const maxVal = Math.max(20, ...STAT_KEYS.map((k) => Math.max(statsA[k] || 0, statsB[k] || 0)));
  const niceMax = Math.ceil(maxVal / 20) * 20;
  const chartW = width - leftPad - rightPad;
  const scaleX = (v) => (v / niceMax) * chartW;

  let gridlines = "";
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const v = Math.round((niceMax / steps) * i);
    const x = leftPad + scaleX(v);
    gridlines += `<line x1="${x}" y1="${topPad - 10}" x2="${x}" y2="${height - 12}" class="chart-grid" />`;
    gridlines += `<text x="${x}" y="${topPad - 16}" class="chart-axis-label" text-anchor="middle">${v}</text>`;
  }

  let bars = "";
  STAT_KEYS.forEach((key, i) => {
    const y0 = topPad + i * rowH;
    const label = STAT_LABELS[key];
    const valA = statsA[key] || 0;
    const valB = statsB[key] || 0;
    const wA = Math.max(0, scaleX(valA));
    const wB = Math.max(0, scaleX(valB));
    const yA = y0;
    const yB = y0 + barH + barGap;

    bars += `<text x="${leftPad - 10}" y="${yA + barH - 3}" text-anchor="end" class="chart-cat-label">${label}</text>`;
    bars += `<rect x="${leftPad}" y="${yA}" width="${wA}" height="${barH}" rx="3" class="bar-series-1"><title>${nameA} — ${label}: ${valA}</title></rect>`;
    bars += `<text x="${leftPad + wA + 5}" y="${yA + barH - 3}" class="chart-value-label">${valA}</text>`;
    bars += `<rect x="${leftPad}" y="${yB}" width="${wB}" height="${barH}" rx="3" class="bar-series-2"><title>${nameB} — ${label}: ${valB}</title></rect>`;
    bars += `<text x="${leftPad + wB + 5}" y="${yB + barH - 3}" class="chart-value-label">${valB}</text>`;
  });

  container.innerHTML = `
    <div class="chart-legend">
      <span class="legend-item"><span class="legend-swatch swatch-1"></span>${nameA}</span>
      <span class="legend-item"><span class="legend-swatch swatch-2"></span>${nameB}</span>
    </div>
    <svg viewBox="0 0 ${width} ${height}" class="battle-chart-svg" role="img"
         aria-label="Base stat comparison between ${nameA} and ${nameB}">
      ${gridlines}
      ${bars}
    </svg>
  `;
}

function renderWinnerBanner(el, nameA, nameB, scoreA, scoreB) {
  let text;
  if (scoreA === scoreB) {
    text = `It's a draw! Both sides score ${scoreA} (base stat total × best type-effectiveness multiplier).`;
  } else {
    const winner = scoreA > scoreB ? nameA : nameB;
    text = `${winner} wins! ${nameA}: ${scoreA} vs. ${nameB}: ${scoreB} (base stat total × best type-effectiveness multiplier).`;
  }
  el.textContent = text;
}

async function runBattle(queryA, queryB) {
  setStatus(battleStatus, "Loading…", "info");
  battleResultEl.hidden = true;
  try {
    const [dataA, dataB] = await Promise.all([fetchPokemon(queryA), fetchPokemon(queryB)]);
    const statsA = getStatsMap(dataA);
    const statsB = getStatsMap(dataB);
    const totalA = statTotal(statsA);
    const totalB = statTotal(statsB);
    const typesA = getTypeNames(dataA);
    const typesB = getTypeNames(dataB);
    const nameA = formatName(dataA.name);
    const nameB = formatName(dataB.name);

    const [aVsB, bVsA] = await Promise.all([
      bestEffectivenessMultiplier(typesA, typesB),
      bestEffectivenessMultiplier(typesB, typesA),
    ]);

    const scoreA = Math.round(totalA * aVsB.multiplier);
    const scoreB = Math.round(totalB * bVsA.multiplier);

    renderBattleSide(document.getElementById("battleSideA"), dataA, typesA);
    renderBattleSide(document.getElementById("battleSideB"), dataB, typesB);
    renderMatchupAnalysis(document.getElementById("matchupAnalysis"), nameA, nameB, aVsB, bVsA);
    renderBattleChart(document.getElementById("battleChart"), nameA, nameB, statsA, statsB);
    renderWinnerBanner(document.getElementById("winnerBanner"), nameA, nameB, scoreA, scoreB);

    battleResultEl.hidden = false;
    setStatus(battleStatus, "", "info");
  } catch (err) {
    setStatus(battleStatus, err.message, "error");
  }
}

battleForm.addEventListener("submit", (e) => {
  e.preventDefault();
  runBattle(battleInputA.value, battleInputB.value);
});

/* =========================================================================
   MODE: Guess the Pokémon
   ========================================================================= */

const guessScoreEl = document.getElementById("guessScore");
const guessRoundEl = document.getElementById("guessRound");
const guessStreakEl = document.getElementById("guessStreak");
const guessNewGameBtn = document.getElementById("guessNewGameBtn");
const guessSpriteEl = document.getElementById("guessSprite");
const guessHintsEl = document.getElementById("guessHints");
const guessHintBtn = document.getElementById("guessHintBtn");
const guessForm = document.getElementById("guessForm");
const guessInput = document.getElementById("guessInput");
const guessGiveUpBtn = document.getElementById("guessGiveUpBtn");
const guessNextBtn = document.getElementById("guessNextBtn");
const guessStatus = document.getElementById("guessStatus");

const HINT_PAID_COST = [10, 10, 10]; // cost of each hint beyond the free first one

const HINT_BUILDERS = [
  (data, species) => `${species ? formatGeneration(species) : "Unknown generation"}, ${data.types.length} type${data.types.length > 1 ? "s" : ""}.`,
  (data) => `Type${data.types.length > 1 ? "s" : ""}: ${getTypeNames(data).map(formatName).join(" / ")}.`,
  (data) => `Highest base stat: ${STAT_LABELS[highestStatName(getStatsMap(data))]}.`,
  (data) => `Name starts with "${data.name.charAt(0).toUpperCase()}" and has ${data.name.replace(/-/g, "").length} letters.`,
];

const guessState = {
  score: 0,
  round: 0,
  streak: 0,
  target: null,
  species: null,
  hintsRevealed: 0,
  solved: false,
};

function renderGuessHints() {
  guessHintsEl.innerHTML = "";
  for (let i = 0; i < guessState.hintsRevealed; i++) {
    const li = document.createElement("li");
    li.textContent = HINT_BUILDERS[i](guessState.target, guessState.species);
    guessHintsEl.appendChild(li);
  }
  const paidUsed = guessState.hintsRevealed - 1;
  const noMoreHints = paidUsed >= HINT_PAID_COST.length;
  guessHintBtn.disabled = noMoreHints || guessState.solved;
  guessHintBtn.textContent = noMoreHints ? "No more hints" : `Reveal a hint (-${HINT_PAID_COST[paidUsed]} pts)`;
}

guessHintBtn.addEventListener("click", () => {
  const paidUsed = guessState.hintsRevealed - 1;
  if (paidUsed >= HINT_PAID_COST.length || guessState.solved) return;
  guessState.hintsRevealed += 1;
  renderGuessHints();
});

function endRoundUI() {
  guessInput.disabled = true;
  guessHintBtn.disabled = true;
  guessGiveUpBtn.hidden = true;
  guessNextBtn.hidden = false;
}

function handleCorrectGuess() {
  guessState.solved = true;
  const paidHintsUsed = guessState.hintsRevealed - 1;
  const roundScore = Math.max(50 - paidHintsUsed * 10, 10);
  guessState.score += roundScore;
  guessState.streak += 1;
  guessScoreEl.textContent = guessState.score;
  guessStreakEl.textContent = guessState.streak;
  guessSpriteEl.classList.remove("silhouette");
  guessSpriteEl.alt = formatName(guessState.target.name);
  setStatus(guessStatus, `Correct! It's ${formatName(guessState.target.name)}. +${roundScore} points.`, "success");
  endRoundUI();
}

function handleGiveUp() {
  if (!guessState.target || guessState.solved) return;
  guessState.solved = true;
  guessState.streak = 0;
  guessStreakEl.textContent = 0;
  guessSpriteEl.classList.remove("silhouette");
  guessSpriteEl.alt = formatName(guessState.target.name);
  setStatus(guessStatus, `It was ${formatName(guessState.target.name)}. No points this round.`, "info");
  endRoundUI();
}

guessForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!guessState.target || guessState.solved) return;
  const raw = guessInput.value.trim();
  if (!raw) {
    setStatus(guessStatus, "Type a guess first.", "error");
    return;
  }
  const strip = (s) => s.toLowerCase().replace(/[\s.'-]+/g, "");
  if (strip(raw) === strip(guessState.target.name)) {
    handleCorrectGuess();
  } else {
    setStatus(guessStatus, "Not quite — try again or reveal a hint.", "error");
  }
});

guessGiveUpBtn.addEventListener("click", handleGiveUp);
guessNextBtn.addEventListener("click", loadNewGuessRound);

guessNewGameBtn.addEventListener("click", () => {
  guessState.score = 0;
  guessState.round = 0;
  guessState.streak = 0;
  guessScoreEl.textContent = 0;
  guessStreakEl.textContent = 0;
  loadNewGuessRound();
});

async function loadNewGuessRound() {
  guessInput.value = "";
  guessInput.disabled = false;
  guessHintBtn.disabled = false;
  guessNextBtn.hidden = true;
  guessGiveUpBtn.hidden = false;
  guessSpriteEl.classList.add("silhouette");
  setStatus(guessStatus, "Loading a new Pokémon…", "info");

  let data = null;
  let species = null;
  for (let attempt = 0; attempt < 5 && !data; attempt++) {
    const id = Math.floor(Math.random() * MAX_DEX_ID) + 1;
    try {
      // eslint-disable-next-line no-await-in-loop
      data = await fetchPokemon(String(id));
      // eslint-disable-next-line no-await-in-loop
      species = await fetchSpecies(String(id)).catch(() => null);
    } catch {
      data = null;
    }
  }

  if (!data) {
    setStatus(guessStatus, "Couldn't load a Pokémon right now. Check your connection and try again.", "error");
    return;
  }

  guessState.target = data;
  guessState.species = species;
  guessState.hintsRevealed = 1; // first hint is free and shown immediately
  guessState.solved = false;
  guessState.round += 1;
  guessRoundEl.textContent = guessState.round;

  guessSpriteEl.src = getSprite(data);
  guessSpriteEl.alt = "Mystery Pokémon";
  renderGuessHints();
  setStatus(guessStatus, "", "info");
}

/* =========================================================================
   Tabs
   ========================================================================= */

const tabButtons = document.querySelectorAll(".tab-btn");
const panels = {
  lookup: document.getElementById("mode-lookup"),
  battle: document.getElementById("mode-battle"),
  guess: document.getElementById("mode-guess"),
};
let guessStarted = false;

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabButtons.forEach((b) => {
      b.classList.toggle("active", b === btn);
      b.setAttribute("aria-selected", String(b === btn));
    });
    Object.entries(panels).forEach(([key, el]) => {
      el.hidden = key !== btn.dataset.mode;
    });
    if (btn.dataset.mode === "guess" && !guessStarted) {
      guessStarted = true;
      loadNewGuessRound();
    }
  });
});

/* =========================================================================
   Theme toggle (shared "theme" localStorage key with the main portfolio site)
   ========================================================================= */

const root = document.documentElement;
const themeToggle = document.getElementById("themeToggle");
const savedTheme = localStorage.getItem("theme");
if (savedTheme) {
  root.setAttribute("data-theme", savedTheme);
} else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
  root.setAttribute("data-theme", "dark");
}
themeToggle.addEventListener("click", () => {
  const current = root.getAttribute("data-theme") === "dark" ? "dark" : "light";
  const next = current === "dark" ? "light" : "dark";
  root.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
});
