("use strict");

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
    return j.stats; // { idKey: {views, mega, likes}, ... }
  } catch {
    return {};
  }
}

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
    return j.stats; // { idKey: {avg,count,sum}, ... }
  } catch {
    return {};
  }
}

// -------- UI state --------
const els = {
  q: document.getElementById("q"),
  metric: document.getElementById("metric"),
  top: document.getElementById("top"),
  status: document.getElementById("status"),
  chart: document.getElementById("chart"),
  tbody: document.getElementById("tbody"),
  tbl: document.getElementById("tbl"),
  tableWrap: document.querySelector(".table-wrap"),
  chartWrap: document.querySelector(".chart-wrap"),
};

const state = {
  srcUrl: getListUrl(),
  games: [],

  // uid:<uid> -> stats
  statsByKey: new Map(),   // key -> {views,likes,mega}
  ratingByKey: new Map(),  // key -> {avg,count,sum}

  sortKey: "views",
  sortDir: "desc",

  renderLimit: 50,
  renderStep: 50,
};

// ============================================================================
// ✅ UID ONLY — clé compteur unique
// ============================================================================
function counterKeyOf(g) {
  const uid = String(g?.uid ?? "").trim();
  return uid ? `uid:${uid}` : "";
}

// URL de la page jeu correspondante
function getGameUrlForEntry(g) {
  const u = new URL("/game/", location.origin);

  const uid = String(g?.uid ?? "").trim();
  if (uid) u.searchParams.set("uid", uid);

  const p = new URLSearchParams(location.search);
  const src = (p.get("src") || "").trim();
  if (src) u.searchParams.set("src", src);

  return u.toString();
}

// -------- filtering / sorting --------
function getFiltered() {
  const q = normalize(els.q.value.trim());
  let list = state.games;

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
        ].join("  ")
      );
      return hay.includes(q);
    });
  }

  for (const g of list) {
    const key = counterKeyOf(g);

    const s = state.statsByKey.get(key) || { views: 0, likes: 0, mega: 0 };
    g._views = s.views | 0;
    g._likes = s.likes | 0;
    g._mega = s.mega | 0;

    const r = state.ratingByKey.get(key) || { avg: 0, count: 0, sum: 0 };
    g._rating = Number(r.avg || 0);
    g._votes = Number(r.count || 0);

    g._ckey = key;
  }

  return list;
}

function sortList(list) {
  const key = state.sortKey;
  const dir = state.sortDir === "asc" ? 1 : -1;

  const getv = (g) => {
    if (key === "title") return String(g.cleanTitle || g.title || "");
    if (key === "updatedAt") return String(g.updatedAt || "");
    if (key === "views") return g._views | 0;
    if (key === "likes") return g._likes | 0;
    if (key === "mega") return g._mega | 0;
    if (key === "rating") return Number(g._rating || 0);
    if (key === "votes") return g._votes | 0;
    return "";
  };

  return list.slice().sort((a, b) => {
    const va = getv(a), vb = getv(b);

    // rating = float
    if (key === "rating") {
      if (va !== vb) return (va - vb) * dir;
      // tie-breaker : votes
      const da = a._votes | 0, db = b._votes | 0;
      if (da !== db) return (da - db) * dir;
      return String(a.cleanTitle || a.title || "").localeCompare(String(b.cleanTitle || b.title || ""), "fr");
    }

    if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
    return String(va).localeCompare(String(vb), "fr") * dir;
  });
}

// -------- table render --------
function fmtRating(avg, count) {
  const a = Number(avg || 0);
  const c = Number(count || 0);
  if (c <= 0 || a <= 0) return "—";
  return `${a.toFixed(1)}/4`;
}

function renderTable(list) {
  els.tbody.innerHTML = "";
  const frag = document.createDocumentFragment();

  for (const g of list) {
    const tr = document.createElement("tr");
    tr.addEventListener("click", () => (location.href = getGameUrlForEntry(g)));

    const imgTd = document.createElement("td");
    imgTd.className = "c-cover";
    const img = document.createElement("img");
    img.className = "cover";
    img.loading = "lazy";
    img.alt = "";
    img.src = g.imageUrl || "/favicon.png";
    imgTd.appendChild(img);

    const titleTd = document.createElement("td");
    const tl = document.createElement("div");
    tl.className = "title-line";
    const t = document.createElement("div");
    t.textContent = g.cleanTitle || g.title || "";
    tl.appendChild(t);
    titleTd.appendChild(tl);

    const sub = document.createElement("div");
    sub.className = "small";
    sub.textContent = `${g._ckey || "(no key)"}`;
    titleTd.appendChild(sub);

    const upTd = document.createElement("td");
    upTd.textContent = g.updatedAt || "";

    const vTd = document.createElement("td");
    vTd.className = "num";
    vTd.textContent = (g._views | 0).toLocaleString("fr-FR");

    const lTd = document.createElement("td");
    lTd.className = "num";
    lTd.textContent = (g._likes | 0).toLocaleString("fr-FR");

    const mTd = document.createElement("td");
    mTd.className = "num";
    mTd.textContent = (g._mega | 0).toLocaleString("fr-FR");

    const rTd = document.createElement("td");
    rTd.className = "num";
    rTd.textContent = fmtRating(g._rating, g._votes);

    const cTd = document.createElement("td");
    cTd.className = "num";
    cTd.textContent = (g._votes | 0).toLocaleString("fr-FR");

    tr.appendChild(imgTd);
    tr.appendChild(titleTd);
    tr.appendChild(upTd);
    tr.appendChild(vTd);
    tr.appendChild(lTd);
    tr.appendChild(mTd);
    tr.appendChild(rTd);
    tr.appendChild(cTd);

    frag.appendChild(tr);
  }

  els.tbody.appendChild(frag);
}

// -------- Chart (canvas, sans lib) --------
function drawChart(list) {
  const canvas = els.chart;
  const ctx = canvas.getContext("2d");

  const metric = els.metric.value;
  const topN = Number(els.top.value || 30);
  const take = topN > 0 ? topN : list.length;

  const items = list
    .slice()
    .sort((a, b) => metricValue(b, metric) - metricValue(a, metric))
    .slice(0, take);

  const rowPx = 26;
  const padT = 8;
  const padB = 12;
  const desiredCssH = padT + padB + items.length * rowPx;

  canvas.style.height = desiredCssH + "px";

  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 1200;
  const cssH = desiredCssH;

  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.clearRect(0, 0, cssW, cssH);

  const padL = 260, padR = 18;
  const innerW = Math.max(50, cssW - padL - padR);
  const innerH = Math.max(50, cssH - padT - padB);

  ctx.strokeStyle = "rgba(170,178,200,.18)";
  ctx.lineWidth = 1;

  const maxV = Math.max(1e-9, ...items.map((it) => metricValue(it, metric)));
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

    const label =
      metric === "rating"
        ? val.toFixed(1)
        : Math.round(val).toLocaleString("fr-FR");

    ctx.fillText(label, x, padT + innerH + 18);
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

    const txt =
      metric === "rating"
        ? (v > 0 ? v.toFixed(1) + "/4" : "—")
        : Math.round(v).toLocaleString("fr-FR");

    ctx.fillText(txt, padL + w + 8, y);
  });

  canvas.onclick = (ev) => {
    const rect = canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    if (x < padL || x > cssW - padR || y < padT || y > padT + innerH) return;

    const idx = Math.floor((y - padT) / rowH);
    const item = items[idx];
    if (item) location.href = getGameUrlForEntry(item);
  };
}

function metricValue(g, metric) {
  if (metric === "views") return g._views | 0;
  if (metric === "likes") return g._likes | 0;
  if (metric === "mega") return g._mega | 0;
  if (metric === "rating") return Number(g._rating || 0);
  if (metric === "votes") return g._votes | 0;
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

function resetLimit() {
  state.renderLimit = state.renderStep;
  if (els.tableWrap) els.tableWrap.scrollTop = 0;
}

function rerender() {
  const filtered = getFiltered();
  const sorted = sortList(filtered);

  const visible = sorted.slice(0, state.renderLimit);
  renderTable(visible);
  drawChart(sorted);

  const total = state.games.length;
  els.status.textContent = `${sorted.length}/${total} jeux (affichés: ${Math.min(
    state.renderLimit, sorted.length
  )}/${sorted.length})`;
}

// -------- init --------
async function init() {
  els.status.textContent = "Chargement liste…";
  let raw;
  try {
    raw = await fetchJson(state.srcUrl);
  } catch (e) {
    els.status.textContent = "Erreur: impossible de charger la liste";
    console.error(e);
    return;
  }

  const games = extractGames(raw).map((g) => ({ ...g }));
  state.games = games;

  els.status.textContent = "Chargement stats…";

  const keys = games.map(counterKeyOf).filter(Boolean);

  // 1) counters
  const statsObj = await fetchGameStatsBulk(keys);
  for (const k of keys) {
    const s = statsObj[k] || {};
    state.statsByKey.set(String(k), {
      views: Number(s.views || 0),
      mega: Number(s.mega || 0),
      likes: Number(s.likes || 0),
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

  els.status.textContent = "OK";
  state.sortKey = "views";
  state.sortDir = "desc";

  wireEvents();
  rerender();
}

function wireEvents() {
  let t = null;
  const deb = () => {
    clearTimeout(t);
    t = setTimeout(() => { resetLimit(); rerender(); }, 120);
  };

  els.q.addEventListener("input", deb);
  els.metric.addEventListener("change", rerender);

  els.top.addEventListener("change", () => {
    if (els.chartWrap) els.chartWrap.scrollTop = 0;
    rerender();
  });

  els.tbl.querySelectorAll("thead th[data-sort]").forEach((th) => {
    th.addEventListener("click", () => {
      const k = th.getAttribute("data-sort");
      if (!k) return;

      if (state.sortKey === k) state.sortDir = (state.sortDir === "asc") ? "desc" : "asc";
      else {
        state.sortKey = k;
        state.sortDir = (k === "title" || k === "updatedAt") ? "asc" : "desc";
      }

      // rating: par défaut DESC (meilleures notes)
      if (k === "rating") state.sortDir = "desc";
      if (k === "votes") state.sortDir = "desc";

      resetLimit();
      rerender();
    });
  });

  window.addEventListener("resize", rerender);
}

init();
