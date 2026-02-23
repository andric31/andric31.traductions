"use strict";

const DEFAULT_URL = "https://raw.githubusercontent.com/andric31/f95list/main/f95list.json";

// -------- URL helpers (comme viewer) --------
function getListUrl() {
  try {
    const p = new URLSearchParams(location.search);
    const src = (p.get("src") || "").trim();
    if (src) return src;
  } catch {}
  try {
    return (localStorage.getItem("f95listUrl") || "").trim() || DEFAULT_URL;
  } catch {
    return DEFAULT_URL;
  }
}

function extractGames(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return [];
  if (Array.isArray(raw.games)) return raw.games;
  if (Array.isArray(raw.items)) return raw.items;
  return [];
}

function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}


function escapeHtml(s){
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function fetchJson(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return await r.json();
}

// -------- small helpers --------
const fmtInt = (n)=> Number(n||0).toLocaleString("fr-FR");

function getRankBadge(i){
  if(i===0) return '<span class="rank-badge rank-1">🏆</span>';
  if(i===1) return '<span class="rank-badge rank-2">🥈</span>';
  if(i===2) return '<span class="rank-badge rank-3">🥉</span>';
  return "";
}

function formatDeltaPct(pct, isNew=false){
  if(isNew) return '<span class="delta-new">🟢 Nouveau</span>';
  const p = Number(pct||0);
  if(p>0) return `<span class="delta-up">🔺 +${p}%</span>`;
  if(p<0) return `<span class="delta-down">🔻 ${p}%</span>`;
  return `<span>${p}%</span>`;
}

async function copyText(txt){
  try{
    await navigator.clipboard.writeText(txt);
    return true;
  }catch{
    // fallback
    const ta=document.createElement("textarea");
    ta.value=txt;
    ta.style.position="fixed";
    ta.style.left="-9999px";
    document.body.appendChild(ta);
    ta.select();
    try{ document.execCommand("copy"); }catch{}
    document.body.removeChild(ta);
    return true;
  }
}

function metricLabel(metric){
  const m=String(metric||"views");
  if(m==="mega") return "téléchargements";
  if(m==="likes") return "likes";
  return "vues";
}

function discordTopText(title, rows, metric){
  const lab = metricLabel(metric);
  let out = `🔥 **${title}**\n\n`;
  const top3 = rows.slice(0,3);
  const medals = ["🥇","🥈","🥉"];
  top3.forEach((r,i)=>{
    out += `${medals[i]} ${r.title || r.id} — ${fmtInt(r.total)} ${lab}\n`;
  });
  return out.trim();
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
    return j.stats;
  } catch {
    return {};
  }
}

// ✅ ratings bulk (doit exister côté backend)
async function fetchRatingsBulk(ids) {
  try {
    const r = await fetch("/api/ratings4s", {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!r.ok) return {};
    const j = await r.json();
    if (!j?.ok || !j.stats) return {};
    return j.stats;
  } catch {
    return {};
  }
}

// ===== Weekly API (counter_daily) — Hot / Progression =====
async function fetchWeekly(metric, weeks = 4, top = 20) {
  const m = String(metric || "views").toLowerCase();
  const w = Math.max(1, Math.min(8, Number(weeks || 4)));
  const t = Math.max(1, Math.min(50, Number(top || 20)));
  const key = `${m}|${w}|${t}`;
  if (state.weeklyCache.has(key)) return state.weeklyCache.get(key);

  const url = `/api/counters_weekly?metric=${encodeURIComponent(m)}&weeks=${w}&top=${t}`;
  const data = await fetchJson(url);
  if (!data?.ok) throw new Error(data?.error || "Weekly API: erreur");
  const out = { weeks: Array.isArray(data.weeks) ? data.weeks : [] };
  state.weeklyCache.set(key, out);
  return out;
}

// -------- UI state --------
const els = {
  // Tabs
  tabBtns: [...document.querySelectorAll(".tab-btn")],
  tabOverview: document.getElementById("tab_overview"),
  tabTrending: document.getElementById("tab_trending"),
  tabTimeline: document.getElementById("tab_timeline"),
  tabHot: document.getElementById("tab_hot"),
  tabProgression: document.getElementById("tab_progression"),
  tabRatings: document.getElementById("tab_ratings"),
  btnExportCsv: document.getElementById("btnExportCsv"),

  // Overview controls
  q: document.getElementById("q"),
  range: document.getElementById("range"),
  metric: document.getElementById("metric"),
  top: document.getElementById("top"),

  statusChart: document.getElementById("statusChart"),
  statusTable: document.getElementById("statusTable"),
  btnChartExpand: document.getElementById("btnChartExpand"),

  chart: document.getElementById("chart"),
  tbody: document.getElementById("tbody"),
  tbl: document.getElementById("tbl"),
  tableWrap: document.querySelector("#tab_overview .table-wrap"),
  chartWrap: document.querySelector("#tab_overview .chart-wrap"),

  // KPIs overview
  siteViews: document.getElementById("siteViews"),
  siteViews24h: document.getElementById("siteViews24h"),
  siteViews7d: document.getElementById("siteViews7d"),

  gamesViews: document.getElementById("gamesViews"),
  gamesViews24h: document.getElementById("gamesViews24h"),
  gamesViews7d: document.getElementById("gamesViews7d"),

  gamesMega: document.getElementById("gamesMega"),
  gamesMega24h: document.getElementById("gamesMega24h"),
  gamesMega7d: document.getElementById("gamesMega7d"),

  gamesLikes: document.getElementById("gamesLikes"),
  gamesLikes24h: document.getElementById("gamesLikes24h"),
  gamesLikes7d: document.getElementById("gamesLikes7d"),

  // Trending controls
  trendWindow: document.getElementById("trendWindow"),
  trendMetric: document.getElementById("trendMetric"),
  trendEngine: document.getElementById("trendEngine"),
  trendStatus: document.getElementById("trendStatus"),
  trendTag: document.getElementById("trendTag"),
  trendTotal: document.getElementById("trendTotal"),
  trendCount: document.getElementById("trendCount"),
  trendChart: document.getElementById("trendChart"),
  trendStatusLine: document.getElementById("trendStatusLine"),
  trendTbody: document.getElementById("trendTbody"),
  trendTableStatus: document.getElementById("trendTableStatus"),

  // Hot (weekly)
  hotMetric: document.getElementById("hotMetric"),
  hotTop: document.getElementById("hotTop"),
  hotWeeks: document.getElementById("hotWeeks"),
  hotMode: document.getElementById("hotMode"),
  hotExportDiscord: document.getElementById("hotExportDiscord"),
  hotStatus: document.getElementById("hotStatus"),
  hotTbody: document.getElementById("hotTbody"),

  // Progression (weekly)
  progMetric: document.getElementById("progMetric"),
  progTop: document.getElementById("progTop"),
  progMinBase: document.getElementById("progMinBase"),
  progExportDiscord: document.getElementById("progExportDiscord"),
  progStatus: document.getElementById("progStatus"),
  progTbody: document.getElementById("progTbody"),

  // Timeline
  tlViews24h: document.getElementById("tlViews24h"),
  tlMega24h: document.getElementById("tlMega24h"),
  tlLikes24h: document.getElementById("tlLikes24h"),
  tlViews7d: document.getElementById("tlViews7d"),
  tlMega7d: document.getElementById("tlMega7d"),
  tlLikes7d: document.getElementById("tlLikes7d"),
  tlTbody: document.getElementById("tlTbody"),
  tlMoversStatus: document.getElementById("tlMoversStatus"),

  // Ratings
  bayesM: document.getElementById("bayesM"),
  ratingsTop: document.getElementById("ratingsTop"),
  bayesC: document.getElementById("bayesC"),
  ratedCount: document.getElementById("ratedCount"),
  ratingsChart: document.getElementById("ratingsChart"),
  ratingsStatusLine: document.getElementById("ratingsStatusLine"),
  ratingsTbody: document.getElementById("ratingsTbody"),
  ratingsTableStatus: document.getElementById("ratingsTableStatus"),
};

const state = {
  srcUrl: getListUrl(),
  games: [],

  // key -> {views,mega,likes, views24h,mega24h,likes24h, views7d,mega7d,likes7d}
  statsByKey: new Map(),
  ratingByKey: new Map(), // key -> {avg,count,sum}

  sortKey: "views",
  sortDir: "desc",

  renderLimit: 50,
  renderStep: 50,

  chartExpanded: false,

  // Tabs
  currentTab: "overview",

  // Weekly API cache (Hot / Progression)
  weeklyCache: new Map(), // key: `${metric}|${weeks}|${top}` -> { weeks: [...] }

  // caches for CSV export
  lastExport: {
    tab: "overview",
    rows: [],
    columns: [],
    filename: "stats.csv",
  },
};

// compteur principal du site (home)
const MAIN_SITE_ID = "__viewer_main__";

// ============================================================================
// ✅ UID ONLY — clé unique
// ============================================================================
function counterKeyOf(g) {
  const uid = String(g?.uid ?? "").trim();
  return uid ? `uid:${uid}` : "";
}

// URL de la page jeu correspondante (uid only)
function getGameUrlForEntry(g) {
  const u = new URL("/game/", location.origin);

  const uid = String(g?.uid ?? "").trim();
  if (uid) u.searchParams.set("uid", uid);

  const p = new URLSearchParams(location.search);
  const src = (p.get("src") || "").trim();
  if (src) u.searchParams.set("src", src);

  return u.toString();
}

// Counter id -> game
// - "uid:123" (recommandé)
// - "123" (fallback) ou F95 id (fallback)
function getGameByCounterId(counterId) {
  const s = String(counterId || "").trim();
  if (!s) return null;
  if (s.startsWith("__")) return null;
  if (s.startsWith("uid:")) {
    const u = s.slice(4);
    return state.games.find(g => String(g?.uid ?? "") === u) || null;
  }
  // fallback: ancien format
  return state.games.find(g => String(g?.uid ?? "") === s || String(g?.id ?? "") === s) || null;
}

function setText(el, v) {
  if (!el) return;

  const raw = (v ?? "");
  const s = String(raw);

  // number-like? (pour KPIs)
  const isNum =
    (typeof raw === "number" && Number.isFinite(raw)) ||
    (typeof raw === "string" && /^-?\d+(?:[\.,]\d+)?$/.test(raw.trim()));

  const out = isNum ? Number(String(raw).replace(",", ".")).toLocaleString("fr-FR") : s;

  // support input/textarea
  if ("value" in el) el.value = out;
  else el.textContent = out;
}

// ============================================================================
// ✅ Totaux jeux (somme de tous les uid:xxx)
// ============================================================================
function computeTotalsAllGames() {
  let views = 0, mega = 0, likes = 0;
  let views24h = 0, mega24h = 0, likes24h = 0;
  let views7d = 0, mega7d = 0, likes7d = 0;

  for (const [k, s] of state.statsByKey.entries()) {
    if (!k || k === MAIN_SITE_ID) continue;
    if (!String(k).startsWith("uid:")) continue;

    views += (s.views | 0);
    mega  += (s.mega | 0);
    likes += (s.likes | 0);

    views24h += (s.views24h | 0);
    mega24h  += (s.mega24h | 0);
    likes24h += (s.likes24h | 0);

    views7d += (s.views7d | 0);
    mega7d  += (s.mega7d | 0);
    likes7d += (s.likes7d | 0);
  }

  return { views, mega, likes, views24h, mega24h, likes24h, views7d, mega7d, likes7d };
}

// ============================================================================
// KPI overview + timeline
// ============================================================================
function renderGlobalKpis() {
  const site = state.statsByKey.get(MAIN_SITE_ID);
  const all = computeTotalsAllGames();

  // page principale
  setText(els.siteViews, site?.views ?? 0);
  setText(els.siteViews24h, site?.views24h ?? 0);
  setText(els.siteViews7d, site?.views7d ?? 0);

  // pages jeu (totaux)
  setText(els.gamesViews, all.views);
  setText(els.gamesViews24h, all.views24h);
  setText(els.gamesViews7d, all.views7d);

  setText(els.gamesMega, all.mega);
  setText(els.gamesMega24h, all.mega24h);
  setText(els.gamesMega7d, all.mega7d);

  setText(els.gamesLikes, all.likes);
  setText(els.gamesLikes24h, Math.max(0, all.likes24h));
  setText(els.gamesLikes7d, Math.max(0, all.likes7d));

  // Timeline tab
  setText(els.tlViews24h, all.views24h);
  setText(els.tlMega24h, all.mega24h);
  setText(els.tlLikes24h, Math.max(0, all.likes24h));
  setText(els.tlViews7d, all.views7d);
  setText(els.tlMega7d, all.mega7d);
  setText(els.tlLikes7d, Math.max(0, all.likes7d));
}

// -------- filtering / sorting (OVERVIEW) --------
function applyRangeToGame(g, range) {
  const key = counterKeyOf(g);

  const s = state.statsByKey.get(key) || {
    views: 0, mega: 0, likes: 0,
    views24h: 0, mega24h: 0, likes24h: 0,
    views7d: 0, mega7d: 0, likes7d: 0,
  };

  if (range === "24h") {
    g._views = s.views24h | 0;
    g._mega  = s.mega24h | 0;
    g._likes = Math.max(0, (s.likes24h | 0));
  } else if (range === "7d" || range === "7j") {
    g._views = s.views7d | 0;
    g._mega  = s.mega7d | 0;
    g._likes = Math.max(0, (s.likes7d | 0));
  } else {
    g._views = s.views | 0;
    g._mega  = s.mega  | 0;
    g._likes = Math.max(0, (s.likes | 0));
  }

  const r = state.ratingByKey.get(key) || { avg: 0, count: 0, sum: 0 };
  g._ratingAvg = Number(r.avg || 0);
  g._ratingCount = Number(r.count || 0);
  g._ckey = key;
}

function getFilteredOverview() {
  const q = normalize(els.q?.value?.trim() || "");
  let list = state.games;

  const range = String(els.range?.value || "total").toLowerCase();

  if (q) {
    list = list.filter((g) => {
      const hay = normalize(
        [
          g.id,
          g.uid,
          g.title,
          g.cleanTitle,
          (g.tags || []).join(" "),
          g.collection || "",
          g.updatedAt || "",
        ].join("  ")
      );
      return hay.includes(q);
    });
  }

  for (const g of list) applyRangeToGame(g, range);
  return list;
}

function sortListOverview(list) {
  const key = state.sortKey;
  const dir = state.sortDir === "asc" ? 1 : -1;

  const getv = (g) => {
    if (key === "title") return String(g.cleanTitle || g.title || "");
    if (key === "views") return g._views | 0;
    if (key === "likes") return g._likes | 0;
    if (key === "mega") return g._mega | 0;
    if (key === "ratingAvg") return Number(g._ratingAvg || 0);
    if (key === "ratingCount") return g._ratingCount | 0;
    return "";
  };

  return list.slice().sort((a, b) => {
    const va = getv(a), vb = getv(b);

    if (key === "ratingAvg") {
      if (va !== vb) return (va - vb) * dir;
      const ca = a._ratingCount | 0, cb = b._ratingCount | 0;
      if (ca !== cb) return (ca - cb) * dir;
      return String(a.cleanTitle || a.title || "").localeCompare(String(b.cleanTitle || b.title || ""), "fr");
    }

    if (key === "ratingCount") {
      if (va !== vb) return (va - vb) * dir;
      const ra = Number(a._ratingAvg || 0), rb = Number(b._ratingAvg || 0);
      if (ra !== rb) return (ra - rb) * dir;
      return String(a.cleanTitle || a.title || "").localeCompare(String(b.cleanTitle || b.title || ""), "fr");
    }

    if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
    return String(va).localeCompare(String(vb), "fr") * dir;
  });
}

// -------- Table render (reused) --------
function fmtRating(avg, count) {
  const a = Number(avg || 0);
  const c = Number(count || 0);
  if (c <= 0 || a <= 0) return "—";
  return `${a.toFixed(1)}/4`;
}

function makeCoverImg(g) {
  const img = document.createElement("img");
  img.className = "cover";
  img.loading = "lazy";
  img.decoding = "async";
  img.alt = "";
  img.referrerPolicy = "no-referrer";
  img.src = (g.imageUrl || "").trim() || "/favicon.png";
  img.onerror = () => {
    img.onerror = null;
    img.src = "/favicon.png";
    img.classList.add("is-fallback");
  };
  return img;
}

function makeFallbackCover() {
  const img = document.createElement("img");
  img.className = "cover";
  img.loading = "lazy";
  img.referrerPolicy = "no-referrer";
  img.src = "/favicon.png";
  img.alt = "";
  return img;
}

function renderTableOverview(list) {
  if (!els.tbody) return;

  els.tbody.innerHTML = "";
  const frag = document.createDocumentFragment();

  for (const g of list) {
    const tr = document.createElement("tr");
    tr.addEventListener("click", () => (location.href = getGameUrlForEntry(g)));

    const imgTd = document.createElement("td");
    imgTd.className = "c-cover";
    imgTd.appendChild(makeCoverImg(g));

    const titleTd = document.createElement("td");
    const tl = document.createElement("div");
    tl.className = "title-line";
    const t = document.createElement("div");
    t.textContent = g.cleanTitle || g.title || "";
    tl.appendChild(t);
    titleTd.appendChild(tl);

    const sub = document.createElement("div");
    sub.className = "small";
    const uid = String(g.uid ?? "").trim();
    const id  = String(g.id  ?? "").trim();
    if (uid && id) sub.textContent = `uid:${uid} | id:${id}`;
    else if (uid) sub.textContent = `uid:${uid}`;
    else if (id) sub.textContent = `id:${id}`;
    else sub.textContent = "(no id)";
    titleTd.appendChild(sub);

    const vTd = document.createElement("td"); vTd.className = "num"; vTd.textContent = (g._views | 0).toLocaleString("fr-FR");
    const mTd = document.createElement("td"); mTd.className = "num"; mTd.textContent = (g._mega  | 0).toLocaleString("fr-FR");
    const lTd = document.createElement("td"); lTd.className = "num"; lTd.textContent = (g._likes | 0).toLocaleString("fr-FR");

    const rcTd = document.createElement("td"); rcTd.className = "num"; rcTd.textContent = (g._ratingCount | 0).toLocaleString("fr-FR");
    const raTd = document.createElement("td"); raTd.className = "num"; raTd.textContent = fmtRating(g._ratingAvg, g._ratingCount);

    tr.appendChild(imgTd);
    tr.appendChild(titleTd);
    tr.appendChild(vTd);
    tr.appendChild(mTd);
    tr.appendChild(lTd);
    tr.appendChild(rcTd);
    tr.appendChild(raTd);

    frag.appendChild(tr);
  }

  els.tbody.appendChild(frag);

  // CSV cache
  state.lastExport = {
    tab: "overview",
    filename: "overview.csv",
    columns: ["uid", "id", "title", "views", "mega", "likes", "ratingAvg", "ratingCount"],
    rows: list.map(g => ({
      uid: String(g.uid ?? ""),
      id: String(g.id ?? ""),
      title: String(g.cleanTitle || g.title || ""),
      views: g._views | 0,
      mega: g._mega | 0,
      likes: g._likes | 0,
      ratingAvg: Number(g._ratingAvg || 0),
      ratingCount: g._ratingCount | 0,
    })),
  };
}

// -------- Chart (canvas, sans lib) --------
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

function drawBarChart({ canvas, items, valueOf, labelOf, bottomLabelOf, onClick }) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const rowPx = 26;
  const padT = 8;
  const padB = 32;
  const desiredCssH = padT + padB + items.length * rowPx;
  canvas.style.height = desiredCssH + "px";

  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 1200;
  const cssH = desiredCssH;

  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.clearRect(0, 0, cssW, cssH);

  const padL = 260, padR = 80;
  const innerW = Math.max(50, cssW - padL - padR);
  const innerH = Math.max(50, cssH - padT - padB);

  ctx.strokeStyle = "rgba(170,178,200,.18)";
  ctx.lineWidth = 1;

  const maxV = Math.max(1e-9, ...items.map((it) => Number(valueOf(it) || 0)));
  const gridN = 5;

  for (let i = 0; i <= gridN; i++) {
    const x = padL + (innerW * i) / gridN;
    ctx.beginPath();
    ctx.moveTo(x, padT);
    ctx.lineTo(x, padT + innerH);
    ctx.stroke();

    const val = (maxV * i) / gridN;
    ctx.fillStyle = "rgba(170,178,200,.7)";
    ctx.font = "12px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(bottomLabelOf ? bottomLabelOf(val, maxV) : Math.round(val).toLocaleString("fr-FR"), x, padT + innerH + 18);
  }

  const rowH = innerH / Math.max(1, items.length);
  const barH = Math.max(10, Math.min(18, rowH * 0.62));
  const y0 = padT + rowH / 2;

  ctx.font = "12px system-ui";
  ctx.textBaseline = "middle";

  items.forEach((it, idx) => {
    const y = y0 + idx * rowH;
    const v = Number(valueOf(it) || 0);
    const w = Math.max(0, innerW * (v / maxV));

    ctx.fillStyle = "rgba(232,234,240,.92)";
    ctx.textAlign = "right";
    const label = String(labelOf(it) || "").slice(0, 42);
    ctx.fillText(label, padL - 10, y);

    ctx.fillStyle = "rgba(90,162,255,.55)";
    roundRect(ctx, padL, y - barH / 2, w, barH, 8);
    ctx.fill();

    ctx.fillStyle = "rgba(232,234,240,.86)";
    ctx.textAlign = "left";
    const txt = (v >= 0 ? Math.round(v).toLocaleString("fr-FR") : "0");
    const tx = Math.min(padL + w + 8, cssW - padR + 4);
    ctx.fillText(txt, tx, y);
  });

  canvas.onclick = (ev) => {
    if (!onClick) return;
    const rect = canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    if (x < padL || x > cssW - padR || y < padT || y > padT + innerH) return;

    const idx = Math.floor((y - padT) / rowH);
    const item = items[idx];
    if (item) onClick(item);
  };
}

function getChartTakeCount(sortedLen, topValue) {
  const topN = Number(topValue);
  if (!Number.isFinite(topN)) return Math.min(20, sortedLen);
  if (topN <= 0) return sortedLen;
  return Math.min(topN, sortedLen);
}

function metricValueOverview(g, metric) {
  if (metric === "views") return g._views | 0;
  if (metric === "likes") return g._likes | 0;
  if (metric === "mega") return g._mega | 0;
  if (metric === "ratingCount") return g._ratingCount | 0;
  if (metric === "ratingAvg") return Number(g._ratingAvg || 0);
  return 0;
}

function drawOverviewChart(sorted) {
  if (!els.chart) return;

  const metric = els.metric?.value || "views";
  const take = getChartTakeCount(sorted.length, els.top?.value || 20);

  const items = sorted
    .slice()
    .sort((a, b) => metricValueOverview(b, metric) - metricValueOverview(a, metric))
    .slice(0, take);

  drawBarChart({
    canvas: els.chart,
    items,
    valueOf: (g) => metricValueOverview(g, metric),
    labelOf: (g) => (g.cleanTitle || g.title || ""),
    bottomLabelOf: (val) => {
      if (metric === "ratingAvg") return val.toFixed(1);
      return Math.round(val).toLocaleString("fr-FR");
    },
    onClick: (g) => (location.href = getGameUrlForEntry(g)),
  });

  if (els.statusChart) {
    const labelTop = (Number(els.top?.value || 20) <= 0) ? "Tout" : `Top ${take}`;
    const range = String(els.range?.value || "total");
    els.statusChart.textContent = `${labelTop} — ${take}/${sorted.length} jeux — période: ${range}`;
  }
}

// -------- chart expand (overview only) --------
function applyChartExpandUI() {
  if (!els.chartWrap) return;

  if (state.chartExpanded) {
    els.chartWrap.style.maxHeight = "none";
    els.chartWrap.style.overflow = "visible";
    if (els.btnChartExpand) els.btnChartExpand.textContent = "➖";
  } else {
    els.chartWrap.style.maxHeight = "";
    els.chartWrap.style.overflow = "";
    if (els.btnChartExpand) els.btnChartExpand.textContent = "➕";
  }
}

function toggleChartExpand() {
  state.chartExpanded = !state.chartExpanded;
  applyChartExpandUI();
  rerenderOverview({ chart: true });
}

// -------- Overview rendering --------
function resetLimit() {
  state.renderLimit = state.renderStep;
  if (els.tableWrap) els.tableWrap.scrollTop = 0;
}

function rerenderOverview(opts = { chart: true }) {
  const filtered = getFilteredOverview();
  const sorted = sortListOverview(filtered);

  const visible = sorted.slice(0, state.renderLimit);
  renderTableOverview(visible);

  if (opts.chart) drawOverviewChart(sorted);

  if (els.statusTable) {
    const total = state.games.length;
    const range = String(els.range?.value || "total");
    els.statusTable.textContent = `${visible.length}/${sorted.length} affichés (filtrés) — total liste: ${total} — période: ${range}`;
  }
}

// ============================================================================
// ✅ Trending
// ============================================================================
function inferEngine(g) {
  const raw = String(g?.engine || g?.gameData?.engine || "").trim();
  if (raw) return raw;

  const tags = (g?.tags || g?.gameData?.tags || []).map(x => String(x).toLowerCase());
  const title = String(g?.title || g?.cleanTitle || "").toLowerCase();

  const has = (s) => tags.includes(s) || title.includes(s);

  if (has("renpy") || has("ren'py")) return "Ren'Py";
  if (has("unity")) return "Unity";
  if (has("rpgm") || has("rpgmaker") || has("rpg maker")) return "RPGM";
  if (has("unreal") || has("ue4") || has("ue5")) return "Unreal Engine";
  if (has("html") || has("webgl")) return "HTML";
  if (has("wolf") || has("wolf rpg")) return "Wolf RPG";
  if (has("java")) return "Java";
  if (has("flash")) return "Flash";
  if (has("qsp")) return "QSP";
  return "";
}

function inferStatus(g) {
  const raw = String(g?.status || g?.gameData?.status || "").trim();
  if (raw) return raw;

  const title = String(g?.title || "").toLowerCase();
  if (title.includes("completed")) return "Completed";
  if (title.includes("abandoned")) return "Abandoned";
  if (title.includes("onhold") || title.includes("on hold")) return "Onhold";
  return "";
}

function ensureTrendOptions() {
  if (!els.trendEngine || !els.trendStatus) return;

  const engines = new Set();
  const statuses = new Set();

  for (const g of state.games) {
    const e = inferEngine(g);
    const s = inferStatus(g);
    if (e) engines.add(e);
    if (s) statuses.add(s);
  }

  const fill = (sel, values, firstLabel) => {
    const cur = String(sel.value || "");
    sel.innerHTML = "";
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = firstLabel;
    sel.appendChild(opt0);

    [...values].sort((a,b)=>String(a).localeCompare(String(b),"fr")).forEach(v => {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = v;
      sel.appendChild(o);
    });

    // restore
    sel.value = cur;
  };

  fill(els.trendEngine, engines, "🎮 Tous moteurs");
  fill(els.trendStatus, statuses, "📌 Tous statuts");
}

function trendValueOf(g, metric, window) {
  const key = counterKeyOf(g);
  const s = state.statsByKey.get(key) || {};
  if (window === "24h") {
    if (metric === "views") return Number(s.views24h || 0);
    if (metric === "mega") return Number(s.mega24h || 0);
    if (metric === "likes") return Math.max(0, Number(s.likes24h || 0));
  } else { // 7d
    if (metric === "views") return Number(s.views7d || 0);
    if (metric === "mega") return Number(s.mega7d || 0);
    if (metric === "likes") return Math.max(0, Number(s.likes7d || 0));
  }
  return 0;
}

function totalValueOf(g, metric) {
  const key = counterKeyOf(g);
  const s = state.statsByKey.get(key) || {};
  if (metric === "views") return Number(s.views || 0);
  if (metric === "mega") return Number(s.mega || 0);
  if (metric === "likes") return Math.max(0, Number(s.likes || 0));
  return 0;
}

function renderTrending() {
  if (!els.tabTrending) return;

  const window = String(els.trendWindow?.value || "24h");
  const metric = String(els.trendMetric?.value || "views");
  const eng = String(els.trendEngine?.value || "").trim();
  const st = String(els.trendStatus?.value || "").trim();
  const tagQ = normalize(els.trendTag?.value?.trim() || "");

  let list = state.games.slice();

  if (eng) list = list.filter(g => inferEngine(g) === eng);
  if (st) list = list.filter(g => inferStatus(g) === st);
  if (tagQ) {
    list = list.filter(g => {
      const tags = (g.tags || g.gameData?.tags || []).join(" ");
      return normalize(tags).includes(tagQ);
    });
  }

  // Build rows
  const rows = list
    .map(g => {
      const score = trendValueOf(g, metric, window);
      const total = totalValueOf(g, metric);
      return { g, score, total };
    })
    .filter(x => x.score > 0)
    .sort((a,b)=> (b.score - a.score) || (b.total - a.total));

  const take = getChartTakeCount(rows.length, 50);
  const topRows = rows.slice(0, take);

  // KPI + status
  const sum = rows.reduce((acc, x) => acc + (x.score || 0), 0);
  setText(els.trendTotal, sum);
  setText(els.trendCount, rows.length);

  if (els.trendStatusLine) {
    els.trendStatusLine.textContent =
      `${window} · ${metric} · filtres: ${eng || "tous moteurs"} / ${st || "tous statuts"} / ${tagQ ? "tag:" + (els.trendTag.value || "").trim() : "tags:—"} · ${rows.length} jeux`;
  }

  // Chart
  drawBarChart({
    canvas: els.trendChart,
    items: topRows,
    valueOf: (x) => x.score,
    labelOf: (x) => (x.g.cleanTitle || x.g.title || ""),
    bottomLabelOf: (val) => Math.round(val).toLocaleString("fr-FR"),
    onClick: (x) => (location.href = getGameUrlForEntry(x.g)),
  });

  // Table
  if (els.trendTbody) {
    els.trendTbody.innerHTML = "";
    const frag = document.createDocumentFragment();

    const fmt = (n)=>Number(n||0).toLocaleString("fr-FR");

    const maxShow = getChartTakeCount(rows.length, 200);
    const viewRows = rows.slice(0, maxShow);

    for (const x of viewRows) {
      const tr = document.createElement("tr");
      tr.addEventListener("click", () => (location.href = getGameUrlForEntry(x.g)));

      const tdImg = document.createElement("td"); tdImg.className="c-cover"; tdImg.appendChild(makeCoverImg(x.g));
      const tdT = document.createElement("td");
      tdT.textContent = x.g.cleanTitle || x.g.title || "";

      const tdScore = document.createElement("td"); tdScore.className="num"; tdScore.textContent = fmt(x.score);
      const tdWin = document.createElement("td"); tdWin.className="num"; tdWin.textContent = fmt(x.score);
      const tdTot = document.createElement("td"); tdTot.className="num"; tdTot.textContent = fmt(x.total);

      tr.appendChild(tdImg); tr.appendChild(tdT); tr.appendChild(tdScore); tr.appendChild(tdWin); tr.appendChild(tdTot);
      frag.appendChild(tr);
    }
    els.trendTbody.appendChild(frag);

    if (els.trendTableStatus) els.trendTableStatus.textContent = `Top ${Math.min(maxShow, rows.length)} / ${rows.length} (score > 0)`;

    // CSV cache
    state.lastExport = {
      tab: "trending",
      filename: `trending_${window}_${metric}.csv`,
      columns: ["uid", "id", "title", "engine", "status", "score", "total"],
      rows: viewRows.map(x => ({
        uid: String(x.g.uid ?? ""),
        id: String(x.g.id ?? ""),
        title: String(x.g.cleanTitle || x.g.title || ""),
        engine: inferEngine(x.g),
        status: inferStatus(x.g),
        score: Number(x.score || 0),
        total: Number(x.total || 0),
      })),
    };
  }
}

// ============================================================================
// ✅ Timeline tab
// ============================================================================
function renderTimeline() {
  // Top movers (24h)
  const rows = state.games
    .map(g => ({
      g,
      v24: trendValueOf(g, "views", "24h"),
      m24: trendValueOf(g, "mega", "24h"),
      l24: trendValueOf(g, "likes", "24h"),
    }))
    .filter(x => (x.v24 + x.m24 + x.l24) > 0)
    .sort((a,b)=> (b.v24 - a.v24) || (b.m24 - a.m24) || (b.l24 - a.l24));

  const take = Math.min(50, rows.length);
  const viewRows = rows.slice(0, take);

  if (els.tlTbody) {
    els.tlTbody.innerHTML = "";
    const frag = document.createDocumentFragment();
    const fmt = (n)=>Number(n||0).toLocaleString("fr-FR");

    for (const x of viewRows) {
      const tr = document.createElement("tr");
      tr.addEventListener("click", () => (location.href = getGameUrlForEntry(x.g)));

      const tdImg = document.createElement("td"); tdImg.className="c-cover"; tdImg.appendChild(makeCoverImg(x.g));
      const tdT = document.createElement("td"); tdT.textContent = x.g.cleanTitle || x.g.title || "";
      const tdV = document.createElement("td"); tdV.className="num"; tdV.textContent = fmt(x.v24);
      const tdM = document.createElement("td"); tdM.className="num"; tdM.textContent = fmt(x.m24);
      const tdL = document.createElement("td"); tdL.className="num"; tdL.textContent = fmt(x.l24);

      tr.appendChild(tdImg); tr.appendChild(tdT); tr.appendChild(tdV); tr.appendChild(tdM); tr.appendChild(tdL);
      frag.appendChild(tr);
    }
    els.tlTbody.appendChild(frag);
  }
  if (els.tlMoversStatus) els.tlMoversStatus.textContent = `Top ${take} / ${rows.length} (activité > 0)`;

  state.lastExport = {
    tab: "timeline",
    filename: "timeline_movers_24h.csv",
    columns: ["uid", "id", "title", "views24h", "mega24h", "likes24h"],
    rows: viewRows.map(x => ({
      uid: String(x.g.uid ?? ""),
      id: String(x.g.id ?? ""),
      title: String(x.g.cleanTitle || x.g.title || ""),
      views24h: Number(x.v24 || 0),
      mega24h: Number(x.m24 || 0),
      likes24h: Number(x.l24 || 0),
    })),
  };
}

// ============================================================================
// ✅ Hot (weekly, counter_daily)
// ============================================================================
async function renderHot() {
  if (!els.tabHot) return;
  if (!els.hotTbody) return;

  const metric = String(els.hotMetric?.value || "views");
  const top = Number(els.hotTop?.value || 20);
  const weeks = Number(els.hotWeeks?.value || 4);
  const mode = String(els.hotMode?.value || "weekly"); // weekly | global

  setText(els.hotStatus, "Chargement...");
  els.hotTbody.innerHTML = "";

  try {
    const data = await fetchWeekly(metric, weeks, top);
    const weeksArr = data.weeks || [];

    if (!weeksArr.length) {
      setText(els.hotStatus, "Aucune donnée (daily rollup). Fais quelques hits et réessaie.");
      state.lastExport = { tab:"hot", rows:[], columns:[], filename:`hot_${weeks}w_${metric}.csv` };
      return;
    }

    const fmt = fmtInt;

    // ---- Mode GLOBAL : cumul sur N semaines ----
    if (mode === "global") {
      const map = new Map(); // id -> total
      for (const w of weeksArr) {
        const rows = Array.isArray(w.rows) ? w.rows : [];
        for (const r of rows) {
          const gid = String(r.id);
          map.set(gid, (map.get(gid) || 0) + Number(r.total || 0));
        }
      }

      const merged = [...map.entries()]
        .map(([id, total]) => ({ id, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, top);

      if (!merged.length) {
        setText(els.hotStatus, "Aucune donnée (cumul).");
        state.lastExport = { tab:"hot", rows:[], columns:[], filename:`hot_${weeks}w_${metric}.csv` };
        return;
      }

      const frag = document.createDocumentFragment();
      const outRows = [];

      merged.forEach((x, i) => {
        const g = getGameByCounterId(x.id);
        const tr = document.createElement("tr");
        if (g) tr.addEventListener("click", () => (location.href = getGameUrlForEntry(g)));

        const title = g ? (g.cleanTitle || g.title || x.id) : x.id;

        const tdImg = document.createElement("td"); tdImg.className = "c-cover";
        tdImg.appendChild(g ? makeCoverImg(g) : makeFallbackCover());

        const tdT = document.createElement("td");
        tdT.innerHTML = `${getRankBadge(i)}${escapeHtml(title)}`;

        const tdW = document.createElement("td"); tdW.className = "num";
        tdW.textContent = `Cumul ${weeks} sem.`;

        const tdTot = document.createElement("td"); tdTot.className = "num";
        tdTot.textContent = fmt(x.total);

        tr.appendChild(tdImg); tr.appendChild(tdT); tr.appendChild(tdW); tr.appendChild(tdTot);
        frag.appendChild(tr);

        outRows.push({ id: x.id, title, week: `Cumul ${weeks} sem.`, total: Number(x.total || 0) });
      });

      els.hotTbody.appendChild(frag);
      setText(els.hotStatus, `OK · Global · ${merged.length} jeux · ${metric}`);

      // CSV cache
      state.lastExport = {
        tab: "hot",
        filename: `hot_global_${weeks}w_${metric}.csv`,
        columns: ["id", "title", "week", "total"],
        rows: outRows,
      };

      // Discord cache (top 3)
      state.hotLastForDiscord = { metric, title: `TOP ${weeks} semaines (${metricLabel(metric)})`, rows: outRows };

      return;
    }

    // ---- Mode WEEKLY : liste par semaine (comme avant) ----
    const flat = [];
    for (let wi = 0; wi < weeksArr.length; wi++) {
      const w = weeksArr[wi];
      const label = `${w.weekStart} → ${w.weekEnd}`;
      const rows = Array.isArray(w.rows) ? w.rows : [];
      for (const r of rows) {
        flat.push({ id: String(r.id), total: Number(r.total || 0), week: label, weekStart: w.weekStart });
      }
    }

    if (!flat.length) {
      setText(els.hotStatus, "Aucune donnée (daily rollup).");
      state.lastExport = { tab:"hot", rows:[], columns:[], filename:`hot_${weeks}w_${metric}.csv` };
      return;
    }

    flat.sort((a,b)=> (b.weekStart.localeCompare(a.weekStart)) || (b.total - a.total));

    const frag = document.createDocumentFragment();
    const outRows = [];
    let currentWeek = "";
    let rankInWeek = 0;

    for (const x of flat) {
      if (x.week !== currentWeek) { currentWeek = x.week; rankInWeek = 0; }

      const g = getGameByCounterId(x.id);
      const tr = document.createElement("tr");
      if (g) tr.addEventListener("click", () => (location.href = getGameUrlForEntry(g)));

      const title = g ? (g.cleanTitle || g.title || x.id) : x.id;

      const tdImg = document.createElement("td"); tdImg.className = "c-cover";
      tdImg.appendChild(g ? makeCoverImg(g) : makeFallbackCover());

      const tdT = document.createElement("td");
      tdT.innerHTML = `${getRankBadge(rankInWeek)}${escapeHtml(title)}`;

      const tdW = document.createElement("td"); tdW.className="num"; tdW.textContent = x.week;
      const tdTot = document.createElement("td"); tdTot.className="num"; tdTot.textContent = fmt(x.total);

      tr.appendChild(tdImg); tr.appendChild(tdT); tr.appendChild(tdW); tr.appendChild(tdTot);
      frag.appendChild(tr);

      outRows.push({ id: x.id, title, week: x.week, total: Number(x.total || 0) });
      rankInWeek++;
    }

    els.hotTbody.appendChild(frag);
    setText(els.hotStatus, `OK · Weekly · ${flat.length} lignes · ${metric}`);

    state.lastExport = {
      tab: "hot",
      filename: `hot_${weeks}w_${metric}.csv`,
      columns: ["id", "title", "week", "total"],
      rows: outRows,
    };

    // pour Discord : on prend la semaine la plus récente
    const firstWeek = weeksArr[0];
    if (firstWeek && Array.isArray(firstWeek.rows)) {
      const topRows = firstWeek.rows
        .map(r => {
          const gid = String(r.id);
          const g = getGameByCounterId(gid);
          return { id: gid, title: g ? (g.cleanTitle || g.title || gid) : gid, total: Number(r.total||0) };
        })
        .sort((a,b)=>b.total-a.total);
      state.hotLastForDiscord = { metric, title: `TOP SEMAINE (${metricLabel(metric)})`, rows: topRows };
    }

  } catch (e) {
    setText(els.hotStatus, `Erreur: ${String(e?.message || e)}`);
  }
}

 // ============================================================================
 // ✅ Progression (weekly, compare semaine N vs N-1)
// ============================================================================
async function renderProgression() {
  if (!els.tabProgression) return;
  if (!els.progTbody) return;

  const metric = String(els.progMetric?.value || "views");
  const top = Math.max(1, Math.min(50, Number(els.progTop?.value || 20)));
  const minBase = Math.max(0, Number(els.progMinBase?.value || 1));

  setText(els.progStatus, "Chargement...");
  els.progTbody.innerHTML = "";

  try {
    const data = await fetchWeekly(metric, 2, 250); // assez large pour comparer
    const weeksArr = data.weeks || [];

    const w0 = weeksArr[0] || null; // semaine courante
    const w1 = weeksArr[1] || null; // semaine précédente

    if (!w0 || !w1) {
      setText(els.progStatus, "Pas assez d'historique (il faut au moins 2 semaines).");
      state.lastExport = { tab:"progression", rows:[], columns:[], filename:`progression_${metric}.csv` };
      return;
    }

    const map0 = new Map();
    const map1 = new Map();
    for (const r of (w0.rows || [])) map0.set(String(r.id), Number(r.total || 0));
    for (const r of (w1.rows || [])) map1.set(String(r.id), Number(r.total || 0));

    const ids = new Set([...map0.keys(), ...map1.keys()]);
    let rows = [];

    for (const id of ids) {
      const a = map0.get(id) || 0; // current
      const b = map1.get(id) || 0; // prev

      const isNew = (b < minBase) && (a >= minBase);
      if (!isNew && b < minBase) continue;

      const delta = a - b;
      const pct = (b > 0) ? (delta / b) * 100 : (isNew ? 999999 : 0);

      rows.push({ id, a, b, delta, pct, isNew });
    }

    rows.sort((x,y)=> (y.pct - x.pct) || (y.delta - x.delta) || (y.a - x.a));
    rows = rows.slice(0, top);

    if (!rows.length) {
      setText(els.progStatus, "Aucune donnée pour cette base min / métrique.");
      state.lastExport = { tab:"progression", rows:[], columns:[], filename:`progression_${metric}.csv` };
      return;
    }

    const frag = document.createDocumentFragment();
    const outRows = [];

    for (const x of rows) {
      const g = getGameByCounterId(x.id);
      const tr = document.createElement("tr");
      if (g) tr.addEventListener("click", () => (location.href = getGameUrlForEntry(g)));

      const title = g ? (g.cleanTitle || g.title || x.id) : x.id;

      const tdImg = document.createElement("td"); tdImg.className = "c-cover";
      tdImg.appendChild(g ? makeCoverImg(g) : makeFallbackCover());

      const tdT = document.createElement("td");
      tdT.innerHTML = `${getRankBadge(outRows.length)}${escapeHtml(title)}`;

      const tdPct = document.createElement("td"); tdPct.className="num";
      tdPct.innerHTML = formatDeltaPct(x.isNew ? 0 : Math.round(x.pct), x.isNew);

      const tdD = document.createElement("td"); tdD.className="num";
      tdD.textContent = (x.delta>=0?"+":"") + fmtInt(x.delta);

      const tdA = document.createElement("td"); tdA.className="num"; tdA.textContent = fmtInt(x.a);
      const tdB = document.createElement("td"); tdB.className="num"; tdB.textContent = fmtInt(x.b);

      tr.appendChild(tdImg); tr.appendChild(tdT); tr.appendChild(tdPct); tr.appendChild(tdD); tr.appendChild(tdA); tr.appendChild(tdB);
      frag.appendChild(tr);

      outRows.push({
        id: x.id,
        title,
        pct: x.isNew ? null : Math.round(x.pct),
        delta: Number(x.delta||0),
        week: Number(x.a||0),
        prevWeek: Number(x.b||0),
        isNew: !!x.isNew
      });
    }

    els.progTbody.appendChild(frag);
    setText(els.progStatus, `OK · ${w0.weekStart}→${w0.weekEnd} vs ${w1.weekStart}→${w1.weekEnd} · ${metric}`);

    state.lastExport = {
      tab: "progression",
      filename: `progression_${metric}.csv`,
      columns: ["id", "title", "pct", "delta", "week", "prevWeek", "isNew"],
      rows: outRows,
    };

    state.progLastForDiscord = { metric, title: `PROGRESSION SEMAINE (${metricLabel(metric)})`, rows: outRows };

  } catch (e) {
    setText(els.progStatus, `Erreur: ${String(e?.message || e)}`);
  }
}

 // ============================================================================
 // ✅ Ratings tab (Bayesian)
// ============================================================================
function computeGlobalRatingAverageC() {
  // moyenne pondérée par votes
  let sum = 0;
  let cnt = 0;
  for (const [k, r] of state.ratingByKey.entries()) {
    const c = Number(r?.count || 0);
    const a = Number(r?.avg || 0);
    if (c > 0 && a > 0) {
      sum += a * c;
      cnt += c;
    }
  }
  return cnt > 0 ? (sum / cnt) : 0;
}

function bayesScore(R, v, C, m) {
  // IMDB-style: (v/(v+m))*R + (m/(v+m))*C
  const vv = Number(v || 0);
  const mm = Math.max(0, Number(m || 0));
  if (vv <= 0) return 0;
  return (vv / (vv + mm)) * Number(R || 0) + (mm / (vv + mm)) * Number(C || 0);
}

function renderRatings() {
  const C = computeGlobalRatingAverageC();
  const m = Number(els.bayesM?.value || 10);
  const topN = Number(els.ratingsTop?.value || 20);

  if (els.bayesC) els.bayesC.textContent = C > 0 ? C.toFixed(2) + "/4" : "—";

  const rows = state.games
    .map(g => {
      const key = counterKeyOf(g);
      const r = state.ratingByKey.get(key) || { avg: 0, count: 0 };
      const R = Number(r.avg || 0);
      const v = Number(r.count || 0);
      return { g, R, v, bayes: bayesScore(R, v, C, m) };
    })
    .filter(x => x.v > 0 && x.R > 0)
    .sort((a,b)=> (b.bayes - a.bayes) || (b.v - a.v));

  if (els.ratedCount) els.ratedCount.textContent = String(rows.length);

  const take = getChartTakeCount(rows.length, topN);
  const topRows = rows.slice(0, take);

  // Chart
  drawBarChart({
    canvas: els.ratingsChart,
    items: topRows,
    valueOf: (x) => x.bayes,
    labelOf: (x) => (x.g.cleanTitle || x.g.title || ""),
    bottomLabelOf: (val) => Number(val).toFixed(1),
    onClick: (x) => (location.href = getGameUrlForEntry(x.g)),
  });

  if (els.ratingsStatusLine) els.ratingsStatusLine.textContent = `m=${m} · C=${C ? C.toFixed(2) : "—"} · ${take}/${rows.length}`;

  // Table
  if (els.ratingsTbody) {
    els.ratingsTbody.innerHTML = "";
    const frag = document.createDocumentFragment();

    for (const x of topRows) {
      const tr = document.createElement("tr");
      tr.addEventListener("click", () => (location.href = getGameUrlForEntry(x.g)));

      const tdImg = document.createElement("td"); tdImg.className="c-cover"; tdImg.appendChild(makeCoverImg(x.g));
      const tdT = document.createElement("td"); tdT.textContent = x.g.cleanTitle || x.g.title || "";

      const tdB = document.createElement("td"); tdB.className="num"; tdB.textContent = x.bayes ? x.bayes.toFixed(2) : "0";
      const tdR = document.createElement("td"); tdR.className="num"; tdR.textContent = x.R ? x.R.toFixed(1) + "/4" : "—";
      const tdV = document.createElement("td"); tdV.className="num"; tdV.textContent = (x.v|0).toLocaleString("fr-FR");

      tr.appendChild(tdImg); tr.appendChild(tdT); tr.appendChild(tdB); tr.appendChild(tdR); tr.appendChild(tdV);
      frag.appendChild(tr);
    }

    els.ratingsTbody.appendChild(frag);
    if (els.ratingsTableStatus) els.ratingsTableStatus.textContent = `Top ${take} / ${rows.length} (notés)`;

    state.lastExport = {
      tab: "ratings",
      filename: `ratings_bayes_m${m}.csv`,
      columns: ["uid", "id", "title", "bayes", "avg", "votes"],
      rows: topRows.map(x => ({
        uid: String(x.g.uid ?? ""),
        id: String(x.g.id ?? ""),
        title: String(x.g.cleanTitle || x.g.title || ""),
        bayes: Number(x.bayes || 0),
        avg: Number(x.R || 0),
        votes: Number(x.v || 0),
      })),
    };
  }
}

// ============================================================================
// ✅ Tabs + CSV export
// ============================================================================
function setActiveTab(tab) {
  state.currentTab = tab;

  // buttons
  els.tabBtns.forEach(b => b.classList.toggle("is-active", b.dataset.tab === tab));

  // sections
  const show = (el, ok) => { if (el) el.style.display = ok ? "" : "none"; };
  show(els.tabOverview, tab === "overview");
  show(els.tabTrending, tab === "trending");
  show(els.tabTimeline, tab === "timeline");
  show(els.tabHot, tab === "hot");
  show(els.tabProgression, tab === "progression");
  show(els.tabRatings, tab === "ratings");

  // render on demand
  if (tab === "overview") rerenderOverview({ chart: true });
  else if (tab === "trending") renderTrending();
  else if (tab === "timeline") renderTimeline();
  else if (tab === "hot") renderHot();
  else if (tab === "progression") renderProgression();
  else if (tab === "ratings") renderRatings();
}

function csvEscape(v) {
  const s = String(v ?? "");
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv({ rows, columns, filename }) {
  if (!rows || !columns || !rows.length) return;

  const head = columns.join(";");
  const lines = rows.map(r => columns.map(c => csvEscape(r[c])).join(";"));
  const csv = [head, ...lines].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "export.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ============================================================================
// ✅ Events
// ============================================================================
function wireEvents() {
  // tabs
  els.tabBtns.forEach(btn => {
    btn.addEventListener("click", () => setActiveTab(btn.dataset.tab || "overview"));
  });

  // CSV export
  if (els.btnExportCsv) {
    els.btnExportCsv.addEventListener("click", () => downloadCsv(state.lastExport));
  }

  // Overview controls
  let t = null;
  const deb = () => {
    clearTimeout(t);
    t = setTimeout(() => {
      resetLimit();
      rerenderOverview({ chart: true });
    }, 120);
  };

  if (els.q) els.q.addEventListener("input", deb);

  if (els.metric) els.metric.addEventListener("change", () => rerenderOverview({ chart: true }));
  if (els.range) els.range.addEventListener("change", () => { resetLimit(); rerenderOverview({ chart: true }); });
  if (els.top) els.top.addEventListener("change", () => rerenderOverview({ chart: true }));
  if (els.btnChartExpand) els.btnChartExpand.addEventListener("click", toggleChartExpand);

  // Tri overview
  if (els.tbl) {
    els.tbl.querySelectorAll("thead th[data-sort]").forEach((th) => {
      th.addEventListener("click", () => {
        const k = th.getAttribute("data-sort");
        if (!k) return;

        if (state.sortKey === k) state.sortDir = (state.sortDir === "asc") ? "desc" : "asc";
        else {
          state.sortKey = k;
          state.sortDir = (k === "title") ? "asc" : "desc";
        }

        if (k === "ratingAvg") state.sortDir = "desc";
        if (k === "ratingCount") state.sortDir = "desc";

        resetLimit();
        rerenderOverview({ chart: true });
      });
    });
  }

  // trending controls
  const trendRerender = () => {
    if (state.currentTab !== "trending") return;
    renderTrending();
  };
  if (els.trendWindow) els.trendWindow.addEventListener("change", trendRerender);
  if (els.trendMetric) els.trendMetric.addEventListener("change", trendRerender);
  if (els.trendEngine) els.trendEngine.addEventListener("change", trendRerender);
  if (els.trendStatus) els.trendStatus.addEventListener("change", trendRerender);
  if (els.trendTag) els.trendTag.addEventListener("input", () => setTimeout(trendRerender, 80));

  // hot controls
  const hotRerender = () => {
    if (state.currentTab !== "hot") return;
    // cache dépend du couple (metric,weeks,top)
    renderHot();
  };
  if (els.hotMetric) els.hotMetric.addEventListener("change", hotRerender);
  if (els.hotTop) els.hotTop.addEventListener("change", hotRerender);
  if (els.hotWeeks) els.hotWeeks.addEventListener("change", hotRerender);

  if (els.hotMode) els.hotMode.addEventListener("change", hotRerender);
  if (els.hotExportDiscord) els.hotExportDiscord.addEventListener("click", async () => {
    const pack = state.hotLastForDiscord;
    if (!pack || !pack.rows || !pack.rows.length) return alert("Rien à exporter (Hot).");
    const txt = discordTopText(pack.title, pack.rows, pack.metric);
    await copyText(txt);
    alert("Copié pour Discord ✅");
  });

  // progression controls
  const progRerender = () => {
    if (state.currentTab !== "progression") return;
    renderProgression();
  };
  if (els.progMetric) els.progMetric.addEventListener("change", progRerender);
  if (els.progTop) els.progTop.addEventListener("change", progRerender);
  if (els.progMinBase) els.progMinBase.addEventListener("change", progRerender);
  if (els.progExportDiscord) els.progExportDiscord.addEventListener("click", async () => {
    const pack = state.progLastForDiscord;
    if (!pack || !pack.rows || !pack.rows.length) return alert("Rien à exporter (Progression).");
    // pour progression, on exporte le top 10 lignes (même si plus)
    const lab = metricLabel(pack.metric);
    let out = `📈 **${pack.title}**\n\n`;
    const lines = pack.rows.slice(0, 10);
    lines.forEach((r,i)=>{
      const badge = (i===0?"🏆":i===1?"🥈":i===2?"🥉":"•");
      const deltaTxt = r.isNew ? "🟢 Nouveau" : ((r.pct||0)>=0?`🔺 +${r.pct}%`:`🔻 ${r.pct}%`);
      out += `${badge} ${r.title||r.id} — ${deltaTxt} (${fmtInt(r.week)} ${lab})\n`;
    });
    await copyText(out.trim());
    alert("Copié pour Discord ✅");
  });

  // ratings controls
  const ratingsRerender = () => {
    if (state.currentTab !== "ratings") return;
    renderRatings();
  };
  if (els.bayesM) els.bayesM.addEventListener("change", ratingsRerender);
  if (els.ratingsTop) els.ratingsTop.addEventListener("change", ratingsRerender);

  // Resize (charts)
  window.addEventListener("resize", () => {
    if (state.currentTab === "overview") rerenderOverview({ chart: true });
    else if (state.currentTab === "trending") renderTrending();
    else if (state.currentTab === "ratings") renderRatings();
  });

  // Infinite scroll (overview table)
  const tryLoadMore = () => {
    if (state.currentTab !== "overview") return;

    const sorted = sortListOverview(getFilteredOverview());
    if (state.renderLimit >= sorted.length) return;

    const threshold = 260;
    const wrap = els.tableWrap;
    const tableIsScrollable = wrap && wrap.scrollHeight > wrap.clientHeight + 5;

    if (tableIsScrollable) {
      const nearBottomTable = (wrap.scrollTop + wrap.clientHeight) >= (wrap.scrollHeight - threshold);
      if (!nearBottomTable) return;
    } else {
      const doc = document.documentElement;
      const scrollTop = window.scrollY || doc.scrollTop || 0;
      const winH = window.innerHeight || doc.clientHeight || 0;
      const fullH = Math.max(doc.scrollHeight, document.body.scrollHeight);
      const nearBottomPage = (scrollTop + winH) >= (fullH - threshold);
      if (!nearBottomPage) return;
    }

    state.renderLimit = Math.min(state.renderLimit + state.renderStep, sorted.length);
    rerenderOverview({ chart: false });
  };

  let raf = 0;
  window.addEventListener("scroll", () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tryLoadMore);
  }, { passive: true });

  if (els.tableWrap) {
    els.tableWrap.addEventListener("scroll", () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tryLoadMore);
    }, { passive: true });
  }
}

// -------- init --------
async function init() {
  if (els.statusChart) els.statusChart.textContent = "Chargement liste…";
  if (els.statusTable) els.statusTable.textContent = "Chargement…";

  let raw;
  try {
    raw = await fetchJson(state.srcUrl);
  } catch (e) {
    if (els.statusChart) els.statusChart.textContent = "Erreur: impossible de charger la liste";
    if (els.statusTable) els.statusTable.textContent = "Erreur: impossible de charger la liste";
    console.error(e);
    return;
  }

  state.games = extractGames(raw).map((g) => ({ ...g }));

  if (els.statusChart) els.statusChart.textContent = "Chargement stats…";
  if (els.statusTable) els.statusTable.textContent = "Chargement stats…";

  const keys = state.games.map(counterKeyOf).filter(Boolean);
  const keysPlus = keys.includes(MAIN_SITE_ID) ? keys : keys.concat([MAIN_SITE_ID]);

  // 1) counters
  const statsObj = await fetchGameStatsBulk(keysPlus);
  for (const k of keysPlus) {
    const s = statsObj[k] || {};
    state.statsByKey.set(String(k), {
      views: Number(s.views || 0),
      mega: Number(s.mega || 0),
      likes: Number(s.likes || 0),

      views24h: Number(s.views24h || 0),
      mega24h: Number(s.mega24h || 0),
      likes24h: Number(s.likes24h || 0),

      views7d: Number(s.views7d || 0),
      mega7d: Number(s.mega7d || 0),
      likes7d: Number(s.likes7d || 0),
    });
  }

  // 2) ratings4
  const ratObj = await fetchRatingsBulk(keys);
  for (const k of keys) {
    const r = ratObj[k] || {};
    state.ratingByKey.set(String(k), {
      avg: Number(r.avg || 0),
      count: Number(r.count || 0),
      sum: Number(r.sum || 0),
    });
  }

  state.sortKey = "views";
  state.sortDir = "desc";

  applyChartExpandUI();
  ensureTrendOptions();
  wireEvents();
  renderGlobalKpis();

  // default tab
  setActiveTab("overview");
}

init();
