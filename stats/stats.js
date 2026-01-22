"use strict";

/* =========================================================
   Stats — Graph + Tuiles (Dashboard)
   - Charge f95list.json (src param ou localStorage)
   - Charge stats bulk via /api/counters
   - Recherche + rendu progressif (tuiles)
   - Chart canvas sans lib, click sur bar -> fiche jeu
   - Infinite scroll des tuiles via IntersectionObserver (sentinel)
   ========================================================= */

const DEFAULT_URL = "https://raw.githubusercontent.com/andric31/f95list/main/f95list.json";

/* -----------------------------
   DOM (bind après DOM ready)
----------------------------- */
const els = {
  q: null,
  metric: null,
  top: null,
  status: null,
  chart: null,
  chartWrap: null,
  tiles: null,
};

/* -----------------------------
   State
   ⚠️ srcUrl rempli dans init() (après DOM ready)
----------------------------- */
const state = {
  srcUrl: "",
  games: [],
  statsById: new Map(), // id -> {views, likes, mega}

  renderLimit: 48,
  renderStep: 36,
};

/* -----------------------------
   Cache (évite recalculs filtre + attachStats)
----------------------------- */
const cache = {
  q: "",
  list: [],
};

/* -----------------------------
   Chart scheduler (évite redraws inutiles)
----------------------------- */
let chartRaf = 0;
function scheduleChart(list) {
  cancelAnimationFrame(chartRaf);
  chartRaf = requestAnimationFrame(() => drawChart(list));
}

/* =========================================================
   Helpers URL / JSON
========================================================= */
function getListUrl() {
  // ✅ blindé: aucun crash si file://, sandbox, permissions, etc.
  let src = "";

  try {
    const p = new URLSearchParams(window.location.search);
    src = (p.get("src") || "").trim();
  } catch {}

  if (src) return src;

  try {
    const v = localStorage.getItem("f95listUrl");
    if (v && String(v).trim()) return String(v).trim();
  } catch {}

  return DEFAULT_URL;
}

function extractGames(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return [];
  if (Array.isArray(raw.games)) return raw.games;
  if (Array.isArray(raw.items)) return raw.items;
  return [];
}

async function fetchJson(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return await r.json();
}

async function fetchGameStatsBulk(ids) {
  try {
    const r = await fetch("/api/counters", {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids }),
    });

    if (!r.ok) return {};
    const j = await r.json();
    if (!j?.ok || !j.stats) return {};
    return j.stats; // { id: {views, mega, likes}, ... }
  } catch {
    return {};
  }
}

/* =========================================================
   Navigation
========================================================= */
function getGameUrl(id) {
  const u = new URL("/game/", location.origin);
  u.searchParams.set("id", String(id));

  try {
    const p = new URLSearchParams(location.search);
    const src = (p.get("src") || "").trim();
    if (src) u.searchParams.set("src", src);
  } catch {}

  return u.toString();
}

function shortUrl(u) {
  try {
    const url = new URL(u);
    return url.hostname + url.pathname;
  } catch {
    return String(u || "");
  }
}

/* =========================================================
   Normalisation / Recherche
========================================================= */
function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/* =========================================================
   Data pipeline : filter -> attach stats -> cache
========================================================= */
function attachStats(list) {
  for (const g of list) {
    const s = state.statsById.get(String(g.id)) || { views: 0, likes: 0, mega: 0 };
    g._views = s.views | 0;
    g._likes = s.likes | 0;
    g._mega = s.mega | 0;
  }
  return list;
}

function getFilteredGames() {
  const q = els.q ? els.q.value.trim() : "";
  if (cache.q === q) return cache.list;

  const nq = normalize(q);
  let list = state.games;

  if (nq) {
    list = list.filter((g) => {
      const hay = normalize(
        [
          g.id,
          g.uid,
          g.title,
          g.cleanTitle,
          (g.tags || []).join(" "),
          g.collection || "",
        ].join("  ")
      );
      return hay.includes(nq);
    });
  }

  list = attachStats(list);

  cache.q = q;
  cache.list = list;
  return list;
}

function invalidateCache() {
  cache.q = "__invalidate__";
}

/* =========================================================
   Tiles render
========================================================= */
function fmt(n) {
  return (Number(n) || 0).toLocaleString("fr-FR");
}

function renderTiles(list) {
  if (!els.tiles) return;

  els.tiles.innerHTML = "";
  const frag = document.createDocumentFragment();

  for (const g of list) {
    const tile = document.createElement("div");
    tile.className = "tile";
    tile.dataset.id = String(g.id || "");

    const img = document.createElement("img");
    img.className = "tile-cover";
    img.loading = "lazy";
    img.alt = "";
    img.src = g.imageUrl || "/favicon.png";

    const body = document.createElement("div");
    body.className = "tile-body";

    const title = document.createElement("div");
    title.className = "tile-title";
    title.textContent = g.cleanTitle || g.title || "";

    const sub = document.createElement("div");
    sub.className = "tile-sub";
    sub.textContent =
      `id: ${String(g.id || "")}` + (g.collection ? ` • collection: ${g.collection}` : "");

    const stats = document.createElement("div");
    stats.className = "tile-stats";
    stats.innerHTML =
      `👁️ ${fmt(g._views)} &nbsp;&nbsp; ❤️ ${fmt(g._likes)} &nbsp;&nbsp; 📥 ${fmt(g._mega)}`;

    body.append(title, sub, stats);
    tile.append(img, body);
    frag.appendChild(tile);
  }

  els.tiles.appendChild(frag);
}

/* =========================================================
   Chart (canvas sans lib)
========================================================= */
function metricValue(g, metric) {
  if (metric === "views") return g._views | 0;
  if (metric === "likes") return g._likes | 0;
  if (metric === "mega") return g._mega | 0;
  return 0;
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawChart(list) {
  if (!els.chart) return;

  const canvas = els.chart;
  const ctx = canvas.getContext("2d");

  const metric = els.metric ? els.metric.value : "views";
  const topN = Number((els.top && els.top.value) || 30);
  const take = topN > 0 ? topN : list.length;

  const items = list
    .slice()
    .sort((a, b) => metricValue(b, metric) - metricValue(a, metric))
    .slice(0, take);

  // hauteur
  const rowPx = 26;
  const padT = 8;
  const padB = 12;
  const cssH = padT + padB + items.length * rowPx;

  canvas.style.height = cssH + "px";

  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 1200;

  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.clearRect(0, 0, cssW, cssH);

  const padL = 260;
  const padR = 18;
  const innerW = Math.max(50, cssW - padL - padR);
  const innerH = Math.max(50, cssH - padT - padB);

  ctx.strokeStyle = "rgba(170,178,200,.18)";
  ctx.lineWidth = 1;

  const maxV = Math.max(1, ...items.map((it) => metricValue(it, metric)));
  const gridN = 5;

  for (let i = 0; i <= gridN; i++) {
    const x = padL + (innerW * i) / gridN;
    ctx.beginPath();
    ctx.moveTo(x, padT);
    ctx.lineTo(x, padT + innerH);
    ctx.stroke();

    const val = Math.round((maxV * i) / gridN);
    ctx.fillStyle = "rgba(170,178,200,.7)";
    ctx.font = "12px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(val.toLocaleString("fr-FR"), x, padT + innerH + 18);
  }

  const rowH = innerH / Math.max(1, items.length);
  const barH = Math.max(10, Math.min(18, rowH * 0.62));
  const y0 = padT + rowH / 2;

  ctx.font = "12px system-ui";
  ctx.textBaseline = "middle";

  items.forEach((it, idx) => {
    const y = y0 + idx * rowH;
    const v = metricValue(it, metric);
    const w = Math.max(0, innerW * (v / maxV));

    ctx.fillStyle = "rgba(232,234,240,.92)";
    ctx.textAlign = "right";
    const label = (it.cleanTitle || it.title || "").slice(0, 42);
    ctx.fillText(label, padL - 10, y);

    ctx.fillStyle = "rgba(90,162,255,.55)";
    roundRect(ctx, padL, y - barH / 2, w, barH, 8);
    ctx.fill();

    ctx.fillStyle = "rgba(232,234,240,.86)";
    ctx.textAlign = "left";
    ctx.fillText(v.toLocaleString("fr-FR"), padL + w + 8, y);
  });

  canvas.onclick = (ev) => {
    const rect = canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;

    if (x < padL || x > cssW - padR || y < padT || y > padT + innerH) return;

    const idx = Math.floor((y - padT) / rowH);
    const item = items[idx];
    if (item?.id) location.href = getGameUrl(item.id);
  };
}

/* =========================================================
   Render orchestration
========================================================= */
function resetLimit() {
  state.renderLimit = 48;
  invalidateCache();
}

function rerender() {
  const filtered = getFilteredGames();
  const visible = filtered.slice(0, state.renderLimit);

  renderTiles(visible);
  scheduleChart(filtered);

  if (els.status) {
    const total = state.games.length;
    els.status.textContent =
      `${filtered.length}/${total} jeux (affichés: ${Math.min(state.renderLimit, filtered.length)}/${filtered.length} • source: ${shortUrl(state.srcUrl)})`;
  }
}

/* =========================================================
   Infinite scroll (tuiles)
========================================================= */
function setupInfiniteScroll() {
  if (!els.tiles) return;

  const sentinel = document.createElement("div");
  sentinel.id = "stats-sentinel";
  sentinel.style.cssText = "height:1px;width:1px;opacity:0;pointer-events:none;";
  els.tiles.appendChild(sentinel);

  let lock = false;

  const loadMore = () => {
    if (lock) return;

    const filtered = getFilteredGames();
    if (state.renderLimit >= filtered.length) return;

    lock = true;
    state.renderLimit += state.renderStep;
    rerender();
    setTimeout(() => (lock = false), 80);
  };

  const obs = new IntersectionObserver(
    (entries) => {
      for (const e of entries) if (e.isIntersecting) loadMore();
    },
    {
      root: null,
      rootMargin: "500px",
      threshold: 0.01,
    }
  );

  obs.observe(sentinel);
}

/* =========================================================
   Events
========================================================= */
function wireEvents() {
  // recherche (debounce)
  let t = null;
  const debounced = () => {
    clearTimeout(t);
    t = setTimeout(() => {
      resetLimit();
      rerender();
    }, 120);
  };
  if (els.q) els.q.addEventListener("input", debounced);

  // chart only
  if (els.metric) els.metric.addEventListener("change", () => scheduleChart(getFilteredGames()));
  if (els.top)
    els.top.addEventListener("change", () => {
      if (els.chartWrap) els.chartWrap.scrollTop = 0;
      scheduleChart(getFilteredGames());
    });

  // click tuile -> fiche
  if (els.tiles) {
    els.tiles.addEventListener("click", (e) => {
      const tile = e.target.closest(".tile[data-id]");
      if (!tile) return;
      const id = tile.dataset.id;
      if (id) location.href = getGameUrl(id);
    });
  }

  // resize chart
  window.addEventListener("resize", () => scheduleChart(getFilteredGames()));
}

/* =========================================================
   Init
========================================================= */
async function init() {
  // ✅ important : on récupère la source ici (après DOM ready)
  state.srcUrl = getListUrl();

  if (els.status) els.status.textContent = "Chargement liste…";

  let raw;
  try {
    raw = await fetchJson(state.srcUrl);
  } catch (e) {
    if (els.status) els.status.textContent = "Erreur: impossible de charger la liste";
    console.error(e);
    return;
  }

  state.games = extractGames(raw);

  if (els.status) els.status.textContent = "Chargement stats…";

  const ids = state.games.map((g) => String(g.id || "")).filter(Boolean);
  const statsObj = await fetchGameStatsBulk(ids);

  for (const id of ids) {
    const s = statsObj[id] || {};
    state.statsById.set(String(id), {
      views: Number(s.views || 0),
      likes: Number(s.likes || 0),
      mega: Number(s.mega || 0),
    });
  }

  if (els.status) els.status.textContent = "OK";

  wireEvents();
  setupInfiniteScroll();
  rerender();
}

/* =========================================================
   Boot (DOM ready)
========================================================= */
document.addEventListener("DOMContentLoaded", () => {
  // bind DOM proprement (plus jamais de null)
  els.q = document.getElementById("q");
  els.metric = document.getElementById("metric");
  els.top = document.getElementById("top");
  els.status = document.getElementById("status");
  els.chart = document.getElementById("chart");
  els.chartWrap = document.querySelector(".chart-wrap");
  els.tiles = document.getElementById("tiles");

  if (!els.chart || !els.tiles) {
    console.error("Stats: éléments DOM manquants", {
      chart: !!els.chart,
      tiles: !!els.tiles,
    });
    return;
  }

  init();
});
