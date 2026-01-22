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

function parseCatEngine(title) {
  const t = String(title || "").trim();
  // Ex: "VN Ren'Py After Thunder ..."  => cat=VN, engine=Ren'Py
  // Ex: "Collection Ren'Py Something ..." => cat=Collection, engine=Ren'Py
  const m = t.match(/^(\S+)\s+(\S+)\s+/);
  if (m) return { cat: m[1], engine: m[2] };
  return { cat: "", engine: "" };
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
    return j.stats; // { id: {views, mega, likes}, ... }
  } catch {
    return {};
  }
}

// -------- UI state --------
const els = {
  q: document.getElementById("q"),
  metric: document.getElementById("metric"),
  cat: document.getElementById("cat"),
  eng: document.getElementById("eng"),
  top: document.getElementById("top"),
  status: document.getElementById("status"),
  chart: document.getElementById("chart"),
  tbody: document.getElementById("tbody"),
  tbl: document.getElementById("tbl"),
  tableWrap: document.querySelector(".table-wrap"), // 👈 pour le scroll "afficher plus"
};

const state = {
  srcUrl: getListUrl(),
  games: [],
  statsById: new Map(), // id -> {views,likes,mega}
  sortKey: "views",
  sortDir: "desc",

  // ✅ affichage limité (on charge tout mais on ne rend qu'une partie)
  renderLimit: 50, // nb lignes visibles
  renderStep: 50,  // nb lignes ajoutées à chaque "bottom"
};

function getGameUrl(id) {
  const u = new URL("/game/", location.origin);
  u.searchParams.set("id", String(id));
  // conserve src si présent
  const p = new URLSearchParams(location.search);
  const src = (p.get("src") || "").trim();
  if (src) u.searchParams.set("src", src);
  return u.toString();
}

function uniqSorted(arr) {
  return [...new Set(arr.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "fr")
  );
}

function buildFilters() {
  const cats = uniqSorted(state.games.map((g) => g._cat || ""));
  const engines = uniqSorted(state.games.map((g) => g._engine || ""));
  for (const c of cats) {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    els.cat.appendChild(opt);
  }
  for (const e of engines) {
    const opt = document.createElement("option");
    opt.value = e;
    opt.textContent = e;
    els.eng.appendChild(opt);
  }
}

function getFiltered() {
  const q = normalize(els.q.value.trim());
  const cat = els.cat.value;
  const eng = els.eng.value;

  let list = state.games;

  if (cat) list = list.filter((g) => g._cat === cat);
  if (eng) list = list.filter((g) => g._engine === eng);

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

  // attach numbers
  for (const g of list) {
    const s = state.statsById.get(String(g.id)) || {
      views: 0,
      likes: 0,
      mega: 0,
    };
    g._views = s.views | 0;
    g._likes = s.likes | 0;
    g._mega = s.mega | 0;
  }
  return list;
}

function sortList(list) {
  const key = state.sortKey;
  const dir = state.sortDir === "asc" ? 1 : -1;

  const getv = (g) => {
    if (key === "title") return String(g.cleanTitle || g.title || "");
    if (key === "cat") return String(g._cat || "");
    if (key === "engine") return String(g._engine || "");
    if (key === "updatedAt") return String(g.updatedAt || "");
    if (key === "views") return g._views | 0;
    if (key === "likes") return g._likes | 0;
    if (key === "mega") return g._mega | 0;
    return "";
  };

  return list
    .slice()
    .sort((a, b) => {
      const va = getv(a),
        vb = getv(b);
      if (typeof va === "number" && typeof vb === "number")
        return (va - vb) * dir;
      return String(va).localeCompare(String(vb), "fr") * dir;
    });
}

function renderTable(list) {
  els.tbody.innerHTML = "";
  const frag = document.createDocumentFragment();

  for (const g of list) {
    const tr = document.createElement("tr");
    tr.addEventListener("click", () => (location.href = getGameUrl(g.id)));

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
    const idTxt = String(g.id || "");
    const colTxt = g.collection ? ` • collection: ${g.collection}` : "";
    sub.textContent = `id: ${idTxt}${colTxt}`;
    titleTd.appendChild(sub);

    const catTd = document.createElement("td");
    catTd.innerHTML = `<span class="badge-mini">${escapeHtml(
      g._cat || ""
    )}</span>`;

    const engTd = document.createElement("td");
    engTd.innerHTML = `<span class="badge-mini">${escapeHtml(
      g._engine || ""
    )}</span>`;

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

    tr.appendChild(imgTd);
    tr.appendChild(titleTd);
    tr.appendChild(catTd);
    tr.appendChild(engTd);
    tr.appendChild(upTd);
    tr.appendChild(vTd);
    tr.appendChild(lTd);
    tr.appendChild(mTd);

    frag.appendChild(tr);
  }

  els.tbody.appendChild(frag);
}

function escapeHtml(s) {
  return String(s || "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c])
  );
}

// -------- Chart (canvas, sans lib) --------
function drawChart(list) {
  const canvas = els.chart;
  const ctx = canvas.getContext("2d");
  // adapt to DPR
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 1200;
  const cssH = canvas.clientHeight || 560;
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor((cssH || 560) * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.clearRect(0, 0, cssW, cssH);

  const metric = els.metric.value;
  const topN = Number(els.top.value || 30);
  const take = topN > 0 ? topN : list.length;

  const items = list
    .slice()
    .sort((a, b) => metricValue(b, metric) - metricValue(a, metric))
    .slice(0, take);

  const padL = 260,
    padR = 18,
    padT = 16,
    padB = 28;
  const W = cssW,
    H = cssH;
  const innerW = Math.max(50, W - padL - padR);
  const innerH = Math.max(50, H - padT - padB);

  // background grid
  ctx.globalAlpha = 1;
  ctx.fillStyle = "rgba(0,0,0,0)";
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

  // bars
  const rowH = innerH / Math.max(1, items.length);
  const barH = Math.max(8, Math.min(18, rowH * 0.62));
  const y0 = padT + rowH / 2;

  ctx.font = "12px system-ui";
  ctx.textBaseline = "middle";

  items.forEach((it, idx) => {
    const y = y0 + idx * rowH;
    const v = metricValue(it, metric);
    const w = Math.max(0, innerW * (v / maxV));

    // label
    ctx.fillStyle = "rgba(232,234,240,.92)";
    ctx.textAlign = "right";
    const label = (it.cleanTitle || it.title || "").slice(0, 42);
    ctx.fillText(label, padL - 10, y);

    // bar
    ctx.fillStyle = "rgba(90,162,255,.55)";
    roundRect(ctx, padL, y - barH / 2, w, barH, 8);
    ctx.fill();

    // value
    ctx.fillStyle = "rgba(232,234,240,.86)";
    ctx.textAlign = "left";
    ctx.fillText(v.toLocaleString("fr-FR"), padL + w + 8, y);
  });

  // click mapping (open game)
  canvas.onclick = (ev) => {
    const rect = canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    if (x < padL || x > W - padR || y < padT || y > padT + innerH) return;

    const idx = Math.floor((y - padT) / rowH);
    const item = items[idx];
    if (item?.id) location.href = getGameUrl(item.id);
  };
}

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

// ✅ reset du "renderLimit" quand on change filtres/tri
function resetLimit() {
  state.renderLimit = state.renderStep;
  if (els.tableWrap) els.tableWrap.scrollTop = 0;
}

// -------- render --------
function rerender() {
  const filtered = getFiltered();
  const sorted = sortList(filtered);

  // ✅ affiche seulement une partie du tableau (évite de créer toutes les images)
  const visible = sorted.slice(0, state.renderLimit);
  renderTable(visible);

  // chart: on garde la liste complète (top selector gère déjà)
  drawChart(sorted);

  const total = state.games.length;
  els.status.textContent = `${sorted.length}/${total} jeux (affichés: ${Math.min(
    state.renderLimit,
    sorted.length
  )}/${sorted.length} • source: ${shortUrl(state.srcUrl)})`;
}

function shortUrl(u) {
  try {
    const url = new URL(u);
    return url.hostname + url.pathname;
  } catch {
    return String(u || "");
  }
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
  // enrich
  for (const g of games) {
    const { cat, engine } = parseCatEngine(g.title);
    g._cat = cat || "";
    g._engine = engine || "";
  }
  state.games = games;

  buildFilters();

  els.status.textContent = "Chargement stats…";

  const ids = games.map((g) => String(g.id || "")).filter(Boolean);
  const statsObj = await fetchGameStatsBulk(ids);

  for (const id of ids) {
    const s = statsObj[id] || {};
    state.statsById.set(String(id), {
      views: Number(s.views || 0),
      mega: Number(s.mega || 0),
      likes: Number(s.likes || 0),
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

  // debounce : resetLimit + rerender
  const deb = () => {
    clearTimeout(t);
    t = setTimeout(() => {
      resetLimit();
      rerender();
    }, 120);
  };

  els.q.addEventListener("input", deb);

  els.metric.addEventListener("change", () => {
    // metric n'affecte que le chart -> pas besoin de resetLimit
    rerender();
  });

  els.cat.addEventListener("change", deb);
  els.eng.addEventListener("change", deb);

  els.top.addEventListener("change", () => {
    // top n'affecte que le chart
    rerender();
  });

  // table sorting + resetLimit
  els.tbl.querySelectorAll("thead th[data-sort]").forEach((th) => {
    th.addEventListener("click", () => {
      const k = th.getAttribute("data-sort");
      if (!k) return;

      if (state.sortKey === k) {
        state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      } else {
        state.sortKey = k;
        state.sortDir =
          k === "title" || k === "cat" || k === "engine" || k === "updatedAt"
            ? "asc"
            : "desc";
      }

      resetLimit();
      rerender();
    });
  });

  // ✅ scroll = "afficher plus" (sans bouton)
  if (els.tableWrap) {
    let lock = false;
    els.tableWrap.addEventListener("scroll", () => {
      if (lock) return;

      const nearBottom =
        els.tableWrap.scrollTop + els.tableWrap.clientHeight >=
        els.tableWrap.scrollHeight - 80;

      if (!nearBottom) return;

      // on augmente seulement si on a encore des lignes à afficher
      const filtered = getFiltered();
      const sorted = sortList(filtered);

      if (state.renderLimit >= sorted.length) return;

      lock = true;
      state.renderLimit += state.renderStep;
      rerender();

      // mini lock anti spam
      setTimeout(() => (lock = false), 80);
    });
  }

  window.addEventListener("resize", () => {
    // redraw only chart for performance
    const filtered = getFiltered();
    const sorted = sortList(filtered);
    drawChart(sorted);
  });
}

init();

