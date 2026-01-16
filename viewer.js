// viewer.js — Vignettes + filtres + tri dates + affichage progressif
(() => {
  const DEFAULT_URL = "https://raw.githubusercontent.com/andric31/f95list/main/f95list.json";
  const GAME_BASE = "/game/"; // Stratégie A: /game/ID

  const $ = sel => document.querySelector(sel);

  const state = {
    all: [],
    filtered: [],
    q: "",
    sort: "updatedAtLocal-desc",
    filterCat: "all",
    filterEngine: "all",
    filterStatus: "all",
    filterTags: [],
    cols: "auto",
    pageSize: 50,
    visibleCount: 0
  };

  async function getListUrl() {
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

  async function getViewerCols() {
    try {
      return (localStorage.getItem("viewerCols") || "auto").trim() || "auto";
    } catch {
      return "auto";
    }
  }

  async function setViewerCols(v) {
    try { localStorage.setItem("viewerCols", String(v)); } catch {}
  }

  async function loadList() {
    const url = await getListUrl();
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }

  const CAT_ALLOWED    = ["VN", "Collection"];
  const ENGINE_ALLOWED = ["Ren'Py", "RPGM", "Unity", "Others", "Wolf RPG"];
  const STATUS_ALLOWED = ["Completed", "Abandoned", "Onhold"];
  const ENGINE_RAW = {
    "renpy": "Ren'Py",
    "ren'py": "Ren'Py",
    "rpgm": "RPGM",
    "rpg": "RPGM",
    "rpgmaker": "RPGM",
    "rpgmakerxp": "RPGM",
    "rpgmakermv": "RPGM",
    "rpgmakermz": "RPGM",
    "rpg maker": "RPGM",
    "unity": "Unity",
    "others": "Others",
    "other": "Others",
    "html": "Others",
    "wolf": null,
    "wolfrpg": "Wolf RPG",
    "wolf rpg": "Wolf RPG",
    "flash": null
  };

  const SEP_RE = /[\u2014\u2013\-:]/;
  const ucFirst = s => s ? s[0].toUpperCase() + s.slice(1) : s;

  function slug(s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  function parseFrenchDate(str) {
    if (!str) return null;
    const s = String(str).trim().toLowerCase();
    const months = {
      "janvier":0,
      "fevrier":1, "février":1,
      "mars":2,
      "avril":3,
      "mai":4,
      "juin":5,
      "juillet":6,
      "aout":7, "août":7,
      "septembre":8,
      "octobre":9,
      "novembre":10,
      "decembre":11, "décembre":11
    };
    const m = s.match(/^(\d{1,2})\s+([a-zêéèûôîïùç]+)\s+(\d{4})$/i);
    if (!m) return null;

    const day = parseInt(m[1], 10);
    let key = m[2].toLowerCase();
    if (!(key in months)) key = key.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const month = months[key];
    const year = parseInt(m[3], 10);
    if (month === undefined || !year || !day) return null;

    const d = new Date(Date.UTC(year, month, day));
    const ts = d.getTime();
    return Number.isNaN(ts) ? null : ts;
  }

  function cleanTitle(raw) {
    let t = String(raw || "").trim();
    let categories = [];
    let engines = [];
    let status = null;
    let othersExplicit = false;

    if (/^collection\b/i.test(t)) {
      categories.push("Collection");
      t = t.replace(/^collection[ :\-]*/i, "").trim();
    }

    const head = t.split(SEP_RE)[0];
    const tokens = head.split(/[\s/|,]+/).filter(Boolean);
    let cut = 0;

    for (let i = 0; i < tokens.length; i++) {
      const wRaw = tokens[i];
      const w = wRaw.toLowerCase();
      const norm = w.replace(/[^\w']/g, "");

      if (norm === "vn") {
        if (!categories.includes("VN")) categories.push("VN");
        cut = i + 1;
        continue;
      }

      if (norm === "wolf" && tokens[i + 1] && tokens[i + 1].toLowerCase().replace(/[^\w']/g, "") === "rpg") {
        if (!engines.includes("Wolf RPG")) engines.push("Wolf RPG");
        cut = i + 2;
        i++;
        continue;
      }

      if (norm === "wolf") break;

      if (norm === "flash") { cut = i + 1; continue; }

      if (norm === "others" || norm === "other") {
        if (!engines.includes("Others")) engines.push("Others");
        othersExplicit = true;
        cut = i + 1;
        continue;
      }

      if (ENGINE_RAW[norm] !== undefined) {
        const eng = ENGINE_RAW[norm];
        if (eng && !engines.includes(eng)) engines.push(eng);
        cut = i + 1;
        continue;
      }

      const pretty = ucFirst(norm);
      if (STATUS_ALLOWED.includes(pretty)) {
        status = pretty;
        cut = i + 1;
        continue;
      }

      if (w === "&" || w === "and" || w === "/") { cut = i + 1; continue; }

      break;
    }

    if (cut > 0) {
      const headSlice = tokens.slice(0, cut).join(" ");
      t = t.slice(headSlice.length).trim();
      t = t.replace(/^[\u2014\u2013\-:|]+/, "").trim();
    }

    if (!status) status = "En cours";

    const allowedCat = new Set(CAT_ALLOWED);
    const allowedEng = new Set(ENGINE_ALLOWED);
    categories = categories.filter(c => allowedCat.has(c));
    engines    = engines.filter(e => allowedEng.has(e));

    if (!othersExplicit && engines.includes("Others") && engines.some(e => e !== "Others")) {
      engines = engines.filter(e => e !== "Others");
    }

    return { title: t, categories, engines, status };
  }

  function normalize(game) {
    const c = cleanTitle(game.title);
    const categories = Array.isArray(c.categories) ? c.categories : (game.category ? [game.category] : []);
    const engines    = Array.isArray(c.engines)    ? c.engines    : (game.engine ? [game.engine] : []);

    const updatedAtTs   = parseFrenchDate(game.updatedAt);
    const releaseDateTs = parseFrenchDate(game.releaseDate);

    const updatedAtLocalRaw = game.updatedAtLocal || "";
    const createdAtLocalRaw = game.createdAtLocal || "";
    const updatedAtLocalParsed = updatedAtLocalRaw ? Date.parse(updatedAtLocalRaw) : NaN;
    const createdAtLocalParsed = createdAtLocalRaw ? Date.parse(createdAtLocalRaw) : NaN;

    const updatedAtLocalTs = !Number.isNaN(updatedAtLocalParsed) ? updatedAtLocalParsed : 0;
    const createdAtLocalTs = !Number.isNaN(createdAtLocalParsed) ? createdAtLocalParsed : 0;

    return {
      id: String(game.id || ""),
      rawTitle: String(game.title || ""),
      title: c.title,
      categories,
      category: categories[0] || null,
      engines,
      engine: engines[0] || null,
      status: (STATUS_ALLOWED.includes(c.status) || c.status === "En cours") ? c.status : "En cours",
      discord: String(game.discordlink || ""),
      translation: String(game.translation || ""),
      image: String(game.imageUrl || ""),
      url: String(game.url || game.threadUrl || ""),
      tags: Array.isArray(game.tags) ? game.tags.slice() : [],

      updatedAt: game.updatedAt || "",
      updatedAtTs,
      releaseDate: game.releaseDate || "",
      releaseDateTs,

      updatedAtLocal: updatedAtLocalRaw,
      updatedAtLocalTs,
      createdAtLocal: createdAtLocalRaw,
      createdAtLocalTs
    };
  }

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, m => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[m]));
  }

  function badgesLineHtml(g) {
    const out = [];
    const cats = Array.isArray(g.categories) ? g.categories : (g.category ? [g.category] : []);
    const engs = Array.isArray(g.engines)    ? g.engines    : (g.engine ? [g.engine] : []);

    for (const cat of cats) {
      if (CAT_ALLOWED.includes(cat)) out.push(`<span class="badge cat cat-${slug(cat)}">${escapeHtml(cat)}</span>`);
    }
    for (const e of engs) {
      if (ENGINE_ALLOWED.includes(e)) out.push(`<span class="badge eng eng-${slug(e)}">${escapeHtml(e)}</span>`);
    }
    if (g.status) out.push(`<span class="badge status status-${slug(g.status)}">${escapeHtml(g.status)}</span>`);
    return out.join(" ");
  }

  function buildDynamicFilters() {
    const tagSel = $("#filterTag");
    const tags = new Set();

    for (const g of state.all) {
      if (Array.isArray(g.tags)) g.tags.forEach(t => { if (t) tags.add(t); });
    }

    if (tagSel) {
      tagSel.innerHTML = `<option value="all">Tags : Tous</option>`;
      Array.from(tags).sort((a,b) => a.localeCompare(b)).forEach(t => {
        const o = document.createElement("option");
        o.value = t;
        o.textContent = t;
        tagSel.appendChild(o);
      });
    }
  }

  function applyFilters() {
    const q  = state.q.toLowerCase();
    const fc = state.filterCat;
    const fe = state.filterEngine;
    const fs = state.filterStatus;
    const ft = state.filterTags;

    state.filtered = state.all.filter(g => {
      const mq = !q || g.title.toLowerCase().includes(q) || g.id.includes(q);

      const mc = (fc === "all") ||
        (Array.isArray(g.categories) ? g.categories.includes(fc) : g.category === fc);

      const me = (fe === "all") ||
        (Array.isArray(g.engines) ? g.engines.includes(fe) : g.engine === fe);

      const ms = (fs === "all") || (g.status === fs);

      let mt = true;
      if (ft && ft.length) {
        const tags = Array.isArray(g.tags) ? g.tags : [];
        mt = ft.every(t => tags.includes(t));
      }

      return mq && mc && me && ms && mt;
    });

    sortNow();
    state.visibleCount = 0;
    renderGrid();
  }

  function sortNow() {
    const [k, dir] = state.sort.split("-");
    const mul = dir === "asc" ? 1 : -1;

    if (k === "title") {
      state.filtered.sort((a, b) => a.title.localeCompare(b.title) * mul);
    } else if (["releaseDate", "updatedAt", "updatedAtLocal"].includes(k)) {
      const key = k + "Ts";
      state.filtered.sort((a, b) => ((a[key] || 0) - (b[key] || 0)) * mul);
    }
  }

  function updateStats() {
    const el = $("#countTotal");
    if (el) el.textContent = String(state.filtered.length);
  }

  function applyGridCols() {
    const gridEl = $("#grid");
    if (!gridEl) return;

    delete gridEl.dataset.cols;
    delete gridEl.dataset.density;

    if (state.cols === "auto") {
      gridEl.style.gridTemplateColumns = "";
      return;
    }

    const n = Math.max(1, Math.min(10, parseInt(state.cols, 10) || 1));
    gridEl.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
    gridEl.dataset.cols = String(n);
    if (n >= 7) gridEl.dataset.density = "compact";
  }

  function renderGrid() {
    const grid  = $("#grid");
    const empty = $("#gridEmpty");
    grid.innerHTML = "";

    if (!state.filtered.length) {
      empty.classList.remove("hidden");
      updateStats();
      return;
    }
    empty.classList.add("hidden");

    applyGridCols();

    const total = state.filtered.length;

    if (!state.visibleCount || state.visibleCount < 0) {
      state.visibleCount = (state.pageSize === "all") ? total : Math.min(total, state.pageSize);
    }

    const limit = (state.pageSize === "all") ? total : Math.min(total, state.visibleCount);

    const frag = document.createDocumentFragment();

    for (let i = 0; i < limit; i++) {
      const g = state.filtered[i];
      const card = document.createElement("article");
      card.className = "card";

      const imgSrc = (g.image || "").trim() || "/favicon.png";
      const pageHref = GAME_BASE + encodeURIComponent(g.id);

      card.innerHTML = `
        <img src="${imgSrc}" class="thumb" alt=""
             referrerpolicy="no-referrer"
             onerror="this.onerror=null;this.src='/favicon.png';this.classList.add('is-fallback');">
        <div class="body">

          <h3 class="name clamp-2">${escapeHtml(g.title)}</h3>
          <div class="badges-line one-line">${badgesLineHtml(g)}</div>

          <div class="actions">
            <a class="btn btn-page" href="${pageHref}" target="_blank" rel="noopener">
              📄 Ouvrir la page
            </a>
          </div>
        </div>
      `;

      frag.appendChild(card);
    }

    grid.appendChild(frag);

    if (limit < total && state.pageSize !== "all") {
      const rest = total - limit;
      const step = typeof state.pageSize === "number" ? state.pageSize : 50;
      const more = Math.min(step, rest);

      const wrap = document.createElement("div");
      wrap.className = "load-more-wrap";

      const btn = document.createElement("button");
      btn.className = "load-more-btn";
      btn.textContent = `Afficher +${more} (${rest} restants)`;
      btn.addEventListener("click", () => {
        state.visibleCount = Math.min(total, limit + step);
        renderGrid();
      });

      wrap.appendChild(btn);
      grid.appendChild(wrap);
    }

    updateStats();
  }

  $("#search")?.addEventListener("input", e => { state.q = e.target.value || ""; applyFilters(); });
  $("#sort")?.addEventListener("change", e => { state.sort = e.target.value || "title-asc"; sortNow(); state.visibleCount = 0; renderGrid(); });
  $("#filterCat")?.addEventListener("change", e => { state.filterCat = e.target.value || "all"; applyFilters(); });
  $("#filterEngine")?.addEventListener("change", e => { state.filterEngine = e.target.value || "all"; applyFilters(); });
  $("#filterStatus")?.addEventListener("change", e => { state.filterStatus = e.target.value || "all"; applyFilters(); });

  const tagSel = $("#filterTag");
  if (tagSel) tagSel.addEventListener("change", e => {
    const v = e.target.value;
    state.filterTags = (v === "all" || !v) ? [] : [v];
    applyFilters();
  });

  const pageSizeSel = $("#pageSize");
  if (pageSizeSel) pageSizeSel.addEventListener("change", e => {
    const v = e.target.value;
    if (v === "all") state.pageSize = "all";
    else {
      const n = parseInt(v, 10);
      state.pageSize = (!isNaN(n) && n > 0) ? n : 50;
    }
    state.visibleCount = 0;
    renderGrid();
  });

  $("#cols")?.addEventListener("change", async e => {
    state.cols = e.target.value || "auto";
    applyGridCols();
    await setViewerCols(state.cols);
  });

  $("#refresh")?.addEventListener("click", init);

  async function init() {
    $("#grid").innerHTML = "";
    $("#gridEmpty")?.classList.add("hidden");

    try {
      state.cols = await getViewerCols();
      const colsSel = $("#cols");
      if (colsSel) colsSel.value = state.cols;

      const raw = await loadList();
      state.all = Array.isArray(raw) ? raw.map(normalize) : [];
      buildDynamicFilters();
      applyFilters();
    } catch (e) {
      console.error("[viewer] load error:", e);
      $("#grid").innerHTML = "";
      const ge = $("#gridEmpty");
      if (ge) {
        ge.textContent = "Erreur de chargement";
        ge.classList.remove("hidden");
      }
    }
  }

  init();
})();
