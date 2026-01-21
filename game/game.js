"use strict";

const DEFAULT_URL = "https://raw.githubusercontent.com/andric31/f95list/main/f95list.json";

// ====== Helpers URL / JSON ======

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

function getParamsFromUrl() {
  try {
    const p = new URLSearchParams(location.search);
    const id = (p.get("id") || "").trim();
    const uid = (p.get("uid") || "").trim();
    return { id: id || "", uid: uid || "" };
  } catch {
    return { id: "", uid: "" };
  }
}


function extractGames(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return [];
  const candidates = ["games", "list", "items", "data", "rows", "results"];
  for (const k of candidates) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  for (const k of Object.keys(raw)) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}


function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// =========================
// ✅ Routing (id central) + Collections + Séries
// =========================

function buildGameUrl(g) {
  const coll = (g.collection || "").toString().trim();
  const id = (g.id || "").toString().trim();
  const uid = (g.uid ?? "").toString().trim();

  if (coll) return `/game/?id=${encodeURIComponent(coll)}&uid=${encodeURIComponent(uid)}`;
  if (id) return `/game/?id=${encodeURIComponent(id)}`;
  return `/game/?uid=${encodeURIComponent(uid)}`;
}

function getDisplayTitle(g) {
  // Règle: si c'est un enfant de collection (id vide + collection non vide),
  // on affiche UNIQUEMENT le titre du gameData (le title principal est celui de la collection).
  const id = (g?.id || "").toString().trim();
  const col = (g?.collection || "").toString().trim();
  if (!id && col) {
    return (g?.gameData?.title || "").toString().trim();
  }
  return (g?.cleanTitle || g?.title || "").toString().trim();
}

function getCollectionChildTitle(g) {
  // Strict: pas de fallback vers g.title (sinon doublons "Collection ...")
  return (g?.gameData?.title || "").toString().trim();
}

function getEntryRefs(g) {
  const refs = [];
  const id = (g?.id || "").toString().trim();
  if (id) refs.push(`id:${id}`);
  if (g?.uid !== undefined && g?.uid !== null) refs.push(`uid:${String(g.uid)}`);
  return refs;
}

function buildSeriesIndex(games) {
  const map = new Map(); // ref => [serieObj]
  for (const owner of games || []) {
    const s = owner?.serie;
    if (!s?.name || !Array.isArray(s.refs)) continue;

    const serieObj = {
      name: String(s.name),
      refs: s.refs.map(x => String(x)),
      ownerUid: owner?.uid,
      ownerId: owner?.id || ""
    };

    // refs déclarées
    for (const ref of serieObj.refs) {
      if (!map.has(ref)) map.set(ref, []);
      map.get(ref).push(serieObj);
    }

    // rendre visible sur la page du owner (id central)
    for (const selfRef of getEntryRefs(owner)) {
      if (!map.has(selfRef)) map.set(selfRef, []);
      map.get(selfRef).push(serieObj);
    }
  }
  return map;
}

function getCurrentPageRefs({ kind, idParam, uidParam, entry }) {
  if (kind === "collectionChild") {
    return [`id:${String(idParam)}`, `uid:${String(uidParam)}`];
  }
  return getEntryRefs(entry);
}

function getSeriesForCurrentPage(pageRefs, seriesIndex) {
  const found = [];
  for (const r of pageRefs || []) {
    const arr = seriesIndex.get(r);
    if (arr) found.push(...arr);
  }
  const uniq = new Map();
  for (const s of found) {
    uniq.set(`${s.name}|${s.ownerUid}`, s);
  }
  return [...uniq.values()];
}

function resolveSerieRefsToEntries(serie, games) {
  const out = [];
  for (const ref of (serie?.refs || [])) {
    const [type, value] = String(ref).split(":");
    if (type === "id") {
      const g = (games || []).find(x => String(x?.id) === String(value) && !x?.collection);
      if (g) out.push(g);
    } else if (type === "uid") {
      const g = (games || []).find(x => String(x?.uid) === String(value));
      if (g) out.push(g);
    }
  }
  return out;
}

function resolveGamePage(params, games) {
  const id = (params?.id || "").toString().trim();
  const uid = (params?.uid || "").toString().trim();

  // 1) Sous-jeu de collection
  if (id && uid) {
    const child = (games || []).find(g =>
      String(g?.uid) === String(uid) && String(g?.collection) === String(id)
    );
    if (!child) return { kind: "notfound" };

    const parent = (games || []).find(g => String(g?.id) === String(id) && !g?.collection) || null;
    const siblings = (games || [])
      .filter(g => String(g?.collection) === String(id))
      .sort((a,b) => Number(a?.uid) - Number(b?.uid));

    return { kind: "collectionChild", idParam: id, uidParam: uid, entry: child, parent, siblings };
  }

  // 2) id seul
  if (id) {
    const parentOrGame = (games || []).find(g => String(g?.id) === String(id) && !g?.collection) || null;
    if (!parentOrGame) return { kind: "notfound" };

    const children = (games || [])
      .filter(g => String(g?.collection) === String(id))
      .sort((a,b) => Number(a?.uid) - Number(b?.uid));

    if (children.length) return { kind: "collectionParent", idParam: id, entry: parentOrGame, children };
    return { kind: "normal", idParam: id, entry: parentOrGame };
  }

  // 3) uid seul
  if (uid) {
    const g = (games || []).find(x => String(x?.uid) === String(uid)) || null;
    if (!g) return { kind: "notfound" };
    return { kind: "uidOnly", uidParam: uid, entry: g };
  }

  return { kind: "notfound" };
}

function ensureRelatedContainer() {
  const tags = document.getElementById("tags");
  if (!tags) return null;

  let out = document.getElementById("relatedOut");
  if (!out) {
    out = document.createElement("div");
    out.id = "relatedOut";
    out.style.marginTop = "12px";
    out.style.display = "grid";
    out.style.gap = "10px";
    tags.parentNode.insertBefore(out, tags.nextSibling);
  }
  return out;
}

function renderCollectionBlock(parent, children) {
  if (!parent || !children || !children.length) return "";

  const items = children.map(g => {
    const t = escapeHtml(getDisplayTitle(g, "collectionChild"));
    const href = `/game/?id=${encodeURIComponent(parent.id)}&uid=${encodeURIComponent(g.uid)}`;
    return `<li><a href="${href}">${t}</a></li>`;
  }).join("");

  return `
    <div class="game-block collection-block">
      <h3>📦 Collection</h3>
      <ul class="collection-list">
        ${items}
      </ul>
    </div>
  `;
}

function renderCollectionBlockForChild(parent) {
  // Encadré minimal : titre + lien vers la page principale de la collection
  const parentId = parent?.id ? String(parent.id) : "";
  const href = parentId ? `/game/?id=${encodeURIComponent(parentId)}` : "";
  const label = parent ? (parent.cleanTitle || parent.title || parentId) : "Voir la collection";

  return `
    <div class="game-block collection-child-block" style="border:1px solid rgba(255,255,255,.25);padding:12px;border-radius:8px;margin:12px 0;background:rgba(0,0,0,.15)">
      <h3>📦 Fait partie de la collection</h3>
      ${href ? `<a class="collection-parent-link" href="${href}">${escapeHtml(label)}</a>` : ``}
    </div>
  `;
}




function renderCollectionBlockForParent(parent, children) {
  if (!children || !children.length) return "";

  const items = children.map(g => {
    const t = escapeHtml(getDisplayTitle(g, "collectionChild"));
    const href = `/game/?id=${encodeURIComponent(parent.id)}&uid=${encodeURIComponent(g.uid)}`;
    return `<li><a href="${href}">${t}</a></li>`;
  }).join("");

  return `
    <div class="game-block collection-block">
      <h3>📦 Collection</h3>
      <ul class="collection-list">
        ${items}
      </ul>
    </div>
  `;
}

function renderSeriesBlocks(seriesList, games, currentCanonicalKey) {
  if (!Array.isArray(seriesList) || !seriesList.length) return "";

  const blocks = seriesList.map(serie => {
    const items = resolveSerieRefsToEntries(serie, games);

    const li = items.map(g => {
      const t = getCollectionChildTitle(g) || getDisplayTitle(g);
      const href = buildGameUrl(g);

      // clé canonique pour surligner : id si existe, sinon uid, sinon collection+uid
      let key = "";
      const id = (g.id || "").toString().trim();
      const coll = (g.collection || "").toString().trim();
      if (coll) key = `c:${coll}|u:${g.uid}`;
      else if (id) key = `id:${id}`;
      else key = `uid:${g.uid}`;

      const isCurrent = key === currentCanonicalKey;

      return `<li style="margin:4px 0;">
        <a href="${href}" class="btn-link" style="${isCurrent ? "font-weight:700;text-decoration:underline;" : ""}">
          ${escapeHtml(t || "Sans titre")}
        </a>
      </li>`;
    }).join("");

    return `
      <div class="game-block" style="border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:10px 12px;">
        <h3 style="margin:0 0 6px 0;">📚 Série : ${escapeHtml(serie.name)}</h3>
        <ul style="margin:0;padding-left:18px;">${li}</ul>
      </div>
    `;
  }).join("");

  return blocks;
}

async function fetchJson(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status} sur ${url}`);
  return await r.json();
}

// ====== UI helpers ======

function $(id) {
  return document.getElementById(id);
}

function showError(msg) {
  const err = $("errBox");
  const card = $("card");
  const stats = $("statsOut");
  if (card) card.style.display = "none";
  if (stats) stats.style.display = "none";
  if (err) {
    err.style.display = "block";
    err.textContent = msg;
  }
}

function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text ?? "";
}

function setHref(id, href) {
  const el = $(id);
  if (!el) return;
  if (!href) {
    el.style.display = "none";
    el.removeAttribute("href");
  } else {
    el.style.display = "";
    el.href = href;
  }
}

/**
 * IMPORTANT:
 * - Si pas d'image => on laisse la cover en "placeholder" (PAS de favicon)
 * - Si image cassée => on repasse en placeholder (PAS de favicon)
 */
function setCover(url) {
  const img = $("cover");
  if (!img) return;

  const u = (url || "").trim();
  img.referrerPolicy = "no-referrer";

  if (!u) {
    img.removeAttribute("src"); // pas d'image
    img.classList.add("is-placeholder");
    return;
  }

  img.classList.remove("is-placeholder");
  img.src = u;

  img.onerror = () => {
    img.onerror = null;
    img.removeAttribute("src"); // pas de fallback favicon
    img.classList.add("is-placeholder");
  };
}

function renderTags(tags) {
  const box = $("tags");
  if (!box) return;
  box.innerHTML = "";
  (tags || []).forEach(t => {
    if (!t) return;
    const s = document.createElement("span");
    s.className = "tagPill";
    s.textContent = String(t);
    box.appendChild(s);
  });
}

// ====== Badges (style F95 comme build_pages.py) ======

const CAT_ALLOWED = ["VN", "Collection"];
const ENGINE_ALLOWED = ["Ren'Py", "RPGM", "Unity", "Others", "Wolf RPGM"];
const STATUS_ALLOWED = ["Completed", "Abandoned", "Onhold"];

const ENGINE_RAW = {
  "renpy": "Ren'Py",
  "ren'py": "Ren'Py",
  "rpgm": "RPGM",
  "rpgmaker": "RPGM",
  "rpgmakermv": "RPGM",
  "rpgmakermz": "RPGM",
  "unity": "Unity",
  "others": "Others",
  "other": "Others",
  "wolf": "Wolf RPGM",
  "wolfrpg": "Wolf RPGM",
};

function slug(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function parseTitleMeta(raw) {
  const t = String(raw || "").trim();
  let categories = [];
  let engines = [];
  let status = null;

  const head = t.split(/[\u2014\u2013\-:]/)[0];
  const tokens = head.split(/[\s/|,]+/).filter(Boolean);

  for (const tok of tokens) {
    const k = tok.toLowerCase();

    if (k === "vn") categories.push("VN");
    if (k === "collection") categories.push("Collection");

    const pretty = k ? (k[0].toUpperCase() + k.slice(1)) : "";
    if (STATUS_ALLOWED.includes(pretty)) status = pretty;

    if (ENGINE_RAW[k]) engines.push(ENGINE_RAW[k]);
  }

  // ✅ ne plus inventer VN / Ren'Py
  if (!categories.length) categories = [];
  if (!engines.length) engines = [];
  if (!status) status = "En cours";

  categories = categories.filter(c => CAT_ALLOWED.includes(c));
  engines = engines.filter(e => ENGINE_ALLOWED.includes(e));
  if (!STATUS_ALLOWED.includes(status) && status !== "En cours") status = "En cours";

  return {
    category: categories[0] || null,
    engine: engines[0] || null,
    status,
  };
}

function renderBadgesFromGame(game, isCollectionChild = false) {
  let meta;

  if (isCollectionChild) {
    // ⛔ AUCUNE invention
  const eng = String(game?.engine || "").trim() || null;
  
  const rawStatus = String(game?.status || "").trim();
  const norm = rawStatus.toLowerCase();
  
  let status = "En cours";
  if (norm === "completed") status = "Completed";
  else if (norm === "abandoned") status = "Abandoned";
  else if (norm === "onhold" || norm === "on hold") status = "Onhold";
  
  meta = {
    category: null,   // pas de VN auto pour enfant de collection
    engine: eng,
    status,
  };

  } else {
    // logique EXISTANTE
    meta = parseTitleMeta(String(game?.title || ""));
  }

  const wrap = $("badges");
  if (!wrap) return;
  wrap.innerHTML = "";

  if (meta.category) {
    const b1 = document.createElement("span");
    b1.className = `badge cat-${slug(meta.category)}`;
    b1.textContent = meta.category;
    b1.classList.add("badge");
    wrap.appendChild(b1);
  }

  if (meta.engine) {
    const b2 = document.createElement("span");
    b2.className = `badge eng-${slug(meta.engine)}`;
    b2.textContent = meta.engine;
    b2.classList.add("badge");
    wrap.appendChild(b2);
  }

  if (meta.status) {
    const b3 = document.createElement("span");
    b3.className = `badge status-${slug(meta.status)}`;
    b3.textContent = meta.status;
    b3.classList.add("badge");
    wrap.appendChild(b3);
  }
}

/**
 * ✅ Traduction status : on affiche UNIQUEMENT le badge (dans #badges)
 */
async function renderTranslationStatus(game) {
  if (!game?.url || !game?.title) return;

  try {
    const r = await fetch(
      `/api/f95status?url=${encodeURIComponent(game.url)}&storedTitle=${encodeURIComponent(game.title)}`,
      { cache: "no-store" }
    );
    if (!r.ok) return;

    const j = await r.json();
    if (!j?.ok || !j?.currentTitle) return;

    const badge = document.createElement("span");
    badge.classList.add("badge");

    if (j.isUpToDate) {
      badge.textContent = "✅ Traduction à jour";
      badge.classList.add("status-updated");
    } else {
      badge.textContent = "🔄 Traduction non à jour";
      badge.classList.add("status-outdated");
    }

    const wrap = $("badges");
    if (wrap) wrap.appendChild(badge);

  } catch {
    // silencieux
  }
}

// ============================================================================
// ✅ MENU ☰ (page game) — RÉUTILISE LE MENU RACINE (viewer.menu.js + modules)
// Ici on garde UNIQUEMENT: ouverture/fermeture + positionnement.
// Plus de ABOUT_TEXT / modale locale dans game.js.
// ============================================================================

function positionPopover(pop, anchorBtn) {
  const r = anchorBtn.getBoundingClientRect();
  const margin = 8;

  let left = Math.round(r.left);
  let top = Math.round(r.bottom + margin);

  const widthGuess = pop.getBoundingClientRect().width || 260;
  const maxLeft = window.innerWidth - widthGuess - 10;

  if (left > maxLeft) left = Math.max(10, maxLeft);
  if (left < 10) left = 10;

  pop.style.left = left + "px";
  pop.style.top = top + "px";
}

function initHamburgerMenu() {
  const btn = $("hamburgerBtn");
  if (!btn) return;

  // Init menu racine (crée le popover + items)
  try { window.ViewerMenu?.init?.(); } catch {}

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    const pop = document.getElementById("topMenuPopover");
    if (!pop) return;

    const isOpen = !pop.classList.contains("hidden");
    if (isOpen) {
      try { window.ViewerMenu?.closeMenu?.(); } catch { pop.classList.add("hidden"); }
      btn.setAttribute("aria-expanded", "false");
      return;
    }

    pop.classList.remove("hidden");
    btn.setAttribute("aria-expanded", "true");
    positionPopover(pop, btn);
  });

  // clic dehors => fermer menu
  document.addEventListener("click", (e) => {
    const pop = document.getElementById("topMenuPopover");
    if (!pop) return;

    const target = e.target;
    if (!pop.contains(target) && !btn.contains(target)) {
      try { window.ViewerMenu?.closeMenu?.(); } catch { pop.classList.add("hidden"); }
      btn.setAttribute("aria-expanded", "false");
    }
  });

  // resize => repositionne si ouvert
  window.addEventListener("resize", () => {
    const pop = document.getElementById("topMenuPopover");
    if (pop && !pop.classList.contains("hidden")) positionPopover(pop, btn);
  });

  // ESC => ferme menu + modales (about/extension)
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    try { window.ViewerMenu?.closeMenu?.(); } catch {}
    try { window.ViewerMenu?.closeAbout?.(); } catch {}
    try { window.ViewerMenu?.closeExtension?.(); } catch {}
    try { window.ViewerMenuExtension?.close?.(); } catch {}
  });
}

// ====== Counters (Cloudflare Pages Function /api/counter + D1) ======

function formatInt(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0";
  try { return x.toLocaleString("fr-FR"); } catch { return String(Math.floor(x)); }
}

function showStatsBox() {
  const stats = $("statsOut");
  if (stats) stats.style.display = "";
}

async function counterGet(id) {
  const r = await fetch(`/api/counter?op=get&id=${encodeURIComponent(id)}`, { cache: "no-store" });
  if (!r.ok) throw new Error("counter get HTTP " + r.status);
  return await r.json();
}

async function counterHit(id, kind) {
  const r = await fetch(`/api/counter?op=hit&kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`, { cache: "no-store" });
  if (!r.ok) throw new Error("counter hit HTTP " + r.status);
  return await r.json();
}

// ✅ UNLIKE (ne casse pas si ton API ne supporte pas)
async function counterUnhit(id, kind) {
  const r = await fetch(`/api/counter?op=unhit&kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`, { cache: "no-store" });
  if (!r.ok) throw new Error("counter unhit HTTP " + r.status);
  return await r.json();
}

// ✅ Like local (anti-spam simple par navigateur)
function getMyLike(gameId) {
  try { return localStorage.getItem(`like_${gameId}`) === "1"; }
  catch { return false; }
}
function setMyLike(gameId, v) {
  try { localStorage.setItem(`like_${gameId}`, v ? "1" : "0"); } catch {}
}
function updateLikeBtn(gameId) {
  const b = $("btnLike");
  if (!b) return;

  const liked = getMyLike(gameId);

  // ❤️ logique simple et claire
  b.textContent = liked ? "❤️" : "🤍";
  b.setAttribute("aria-label", liked ? "Je n’aime plus" : "J’aime");
}

// ✅ helper : safe update likes text
function setLikesFromJson(j) {
  if (!$("statLikes")) return;
  const val = Number(j?.likes);
  setText("statLikes", Number.isFinite(val) ? formatInt(val) : "0");
}

async function initCounters(gameId, megaHref) {
  // 1) Vue : on hit au chargement
  try {
    const j = await counterHit(gameId, "view");
    if (j?.ok) {
      setText("statViews", formatInt(j.views));
      setText("statMegaClicks", formatInt(j.mega));
      setLikesFromJson(j);
      showStatsBox();
    }
  } catch {
    // fallback: get
    try {
      const j = await counterGet(gameId);
      if (j?.ok) {
        setText("statViews", formatInt(j.views));
        setText("statMegaClicks", formatInt(j.mega));
        setLikesFromJson(j);
        showStatsBox();
      }
    } catch {
      setText("statViews", "0");
      setText("statMegaClicks", "0");
      if ($("statLikes")) setText("statLikes", "0");
      showStatsBox();
    }
  }

  // 2) Clic MEGA : on hit au clic
  if (megaHref) {
    const btn = $("btnMega");
    if (btn) {
      btn.addEventListener("click", async () => {
        try {
          const j = await counterHit(gameId, "mega");
          if (j?.ok) {
            setText("statMegaClicks", formatInt(j.mega));
            showStatsBox();
          }
        } catch {}
      }, { passive: true });
    }
  }

  // 3) ❤️ Like toggle (si le HTML contient #btnLike et #statLikes)
  const btnLike = $("btnLike");
  if (btnLike && $("statLikes")) {
    updateLikeBtn(gameId);

    btnLike.addEventListener("click", async () => {
      const liked = getMyLike(gameId);

      // On ne change le localStorage QUE si le serveur répond ok
      try {
        let j;

        if (!liked) {
          // like
          j = await counterHit(gameId, "like");
          if (j?.ok) {
            setMyLike(gameId, true);
            setLikesFromJson(j);
            updateLikeBtn(gameId);
            showStatsBox();
          }
          return;
        }

        // unlike (si ton API supporte op=unhit)
        j = await counterUnhit(gameId, "like");
        if (j?.ok) {
          setMyLike(gameId, false);
          setLikesFromJson(j);
          updateLikeBtn(gameId);
          showStatsBox();
        }
      } catch {
        // Si ton API n'a pas unhit, on évite de casser:
        // - le like (hit) marche si supporté
        // - l'unlike peut échouer silencieusement
      }
    });
  }
}

// ====== Rating 4 ======

const RATING4_LABELS = {
  1: "Traduction à refaire",
  2: "Traduction avec des défauts",
  3: "Traduction correcte",
  4: "Bonne traduction",
};

async function rating4Get(id) {
  const r = await fetch(`/api/rating4?op=get&id=${encodeURIComponent(id)}`, { cache: "no-store" });
  if (!r.ok) throw new Error("rating4 get HTTP " + r.status);
  return await r.json();
}

async function rating4Vote(id, v, prev) {
  const qs = new URLSearchParams({
    op: "vote",
    id: String(id),
    v: String(v),
    prev: String(prev || 0),
  });
  const r = await fetch(`/api/rating4?${qs.toString()}`, { cache: "no-store" });
  if (!r.ok) throw new Error("rating4 vote HTTP " + r.status);
  return await r.json();
}

function getMyVote4(gameId) {
  try {
    const v = Number(localStorage.getItem(`rating4_${gameId}`) || "0");
    return Number.isFinite(v) ? v : 0;
  } catch { return 0; }
}

function setMyVote4(gameId, v) {
  try { localStorage.setItem(`rating4_${gameId}`, String(v)); } catch {}
}

function renderRating4UI(gameId, data) {
  const choices = $("ratingChoices");
  const avgEl = $("ratingAvg");
  const countEl = $("ratingCount");
  const msgEl = $("ratingMsg");
  if (!choices || !avgEl || !countEl) return;

  const avg = Number(data?.avg) || 0;
  const count = Number(data?.count) || 0;
  const myVote = getMyVote4(gameId);

  avgEl.textContent = avg > 0 ? avg.toFixed(1) + "/4" : "—";
  countEl.textContent = String(count);

  choices.innerHTML = "";

  const setVisual = (hoverValue) => {
    const v =
      (hoverValue === 0 || typeof hoverValue === "number")
        ? hoverValue
        : (getMyVote4(gameId) || 0);

    [...choices.querySelectorAll(".ratingStar")].forEach((btn, idx) => {
      btn.textContent = (idx + 1) <= v ? "★" : "☆";
    });
  };

  const restoreMsg = () => {
    const v = getMyVote4(gameId);
    if (!msgEl) return;
    msgEl.textContent = v
      ? `Ta note : ${v}/4 — ${RATING4_LABELS[v]} (tu peux changer ta note)`
      : "Clique sur les étoiles pour noter la traduction.";
  };

  if (myVote) {
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "ratingCancel";
    cancel.textContent = "🗑️";
    cancel.setAttribute("aria-label", "Annuler ma note");

    cancel.addEventListener("mouseenter", () => {
      setVisual(0);
      if (msgEl) msgEl.textContent = "Annuler ma note";
    });
    cancel.addEventListener("mouseleave", () => {
      setVisual(null);
      restoreMsg();
    });

    cancel.addEventListener("click", async () => {
      const prev = getMyVote4(gameId);
      if (!prev) return;
      try {
        const res = await rating4Vote(gameId, 0, prev);
        if (res?.ok) {
          try { localStorage.removeItem(`rating4_${gameId}`); } catch {}
          renderRating4UI(gameId, res);
          if (msgEl) msgEl.textContent = "Note supprimée ✅";
        }
      } catch {
        if (msgEl) msgEl.textContent = "Erreur lors de l’annulation.";
      }
    });

    choices.appendChild(cancel);
  }

  for (let i = 1; i <= 4; i++) {
    const star = document.createElement("button");
    star.type = "button";
    star.className = "ratingStar";
    star.textContent = "☆";
    star.setAttribute("aria-label", `${i}/4 — ${RATING4_LABELS[i]}`);

    star.addEventListener("mouseenter", () => {
      setVisual(i);
      if (msgEl) msgEl.textContent = `${i}/4 — ${RATING4_LABELS[i]}`;
    });
    star.addEventListener("mouseleave", () => {
      setVisual(null);
      restoreMsg();
    });

    star.addEventListener("click", async () => {
      const prev = getMyVote4(gameId);
      if (prev === i) {
        if (msgEl) msgEl.textContent = "C’est déjà ta note actuelle ✅";
        return;
      }
      try {
        const res = await rating4Vote(gameId, i, prev);
        if (res?.ok) {
          setMyVote4(gameId, i);
          renderRating4UI(gameId, res);
          if (msgEl) msgEl.textContent = prev ? "Note modifiée ✅" : "Merci pour ton vote ⭐";
        }
      } catch {
        if (msgEl) msgEl.textContent = "Erreur lors du vote.";
      }
    });

    choices.appendChild(star);
  }

  setVisual(null);
  restoreMsg();
}

// ====== Main ======

(async function main() {
  try {
    // ✅ menu ☰ (page game) — via menu racine
    initHamburgerMenu();

    const { id: idParam, uid: uidParam } = getParamsFromUrl();

    if (!idParam && !uidParam) {
      showError("Aucun paramètre dans l’URL. Exemples : /game/?id=215277  ou  /game/?id=17373&uid=898  ou  /game/?uid=898");
      return;
    }

    const listUrl = getListUrl();
    const raw = await fetchJson(listUrl);
    const list = extractGames(raw);

    const page = resolveGamePage({ id: idParam, uid: uidParam }, list);

    if (page.kind === "notfound") {
      showError(`Jeu introuvable (id=${idParam || "-"} uid=${uidParam || "-"}) dans f95list.json`);
      return;
    }

    // entry = objet principal (discord/mega/notes/description)
    const entry = page.entry;

    // display = données "jeu" (gameData si présent)
    const display = entry?.gameData ? entry.gameData : entry;

    const isCollectionChild =
      page.kind === "collectionChild" &&
      entry &&
      entry.gameData;

    const title = (getDisplayTitle(entry) || getDisplayTitle(display) || `Jeu ${idParam || uidParam}`).trim();
    document.title = title;

    setText("title", title);

    setCover(display.imageUrl || entry.imageUrl || "");
    renderTags(display.tags || entry.tags || []);

    renderBadgesFromGame(display, isCollectionChild);
    renderTranslationStatus(entry);

    setHref("btnDiscord", (entry.discordlink || "").trim());
    if ($("btnDiscord")) $("btnDiscord").textContent = "💬 Discord";

    setHref("btnF95", (entry.url || "").trim());
    if ($("btnF95")) $("btnF95").textContent = "🌐 F95Zone";

    const megaHref = (entry.translation || "").trim();
    setHref("btnMega", megaHref);
    if ($("btnMega")) $("btnMega").textContent = "📥 Télécharger la traduction (MEGA)";

    // --- Related blocks (Collection / Série)
    const relatedOut = ensureRelatedContainer();
    if (relatedOut) {
      const parts = [];

      if (page.kind === "collectionParent") {
        parts.push(renderCollectionBlockForParent(entry, page.children));
      } else if (page.kind === "collectionChild") {
        parts.push(renderCollectionBlockForChild(page.parent, page.siblings, page.uidParam, page.idParam));
      }

      const seriesIndex = buildSeriesIndex(list);
      const pageRefs = getCurrentPageRefs({ kind: page.kind, idParam: idParam, uidParam: uidParam, entry });
      const seriesList = getSeriesForCurrentPage(pageRefs, seriesIndex);

      // clé canonique pour surligner dans la série
      let canonicalKey = "";
      if (page.kind === "collectionChild") canonicalKey = `c:${page.idParam}|u:${page.uidParam}`;
      else if (entry?.id) canonicalKey = `id:${String(entry.id).trim()}`;
      else canonicalKey = `uid:${String(entry.uid).trim()}`;

      parts.push(renderSeriesBlocks(seriesList, list, canonicalKey));

      relatedOut.innerHTML = parts.filter(Boolean).join("");
    }

    // ✅ identifiant analytics (unique) : id central si possible, sinon uid ; enfant de collection => composite
    let analyticsKey = "";
    if (page.kind === "collectionChild") analyticsKey = `c:${page.idParam}|u:${page.uidParam}`;
    else if (entry?.id && String(entry.id).trim()) analyticsKey = String(entry.id).trim();
    else analyticsKey = String(entry.uid).trim();

await initCounters(analyticsKey, megaHref);

    // ⛔ Bloquer le clic droit sur le bouton Télécharger (MEGA)
    const btnMega = document.getElementById("btnMega");
    if (btnMega) {
      btnMega.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        return false;
      });
    }

    try {
      const j = await rating4Get(analyticsKey);
      if (j?.ok) renderRating4UI(analyticsKey, j);
    } catch {}

  } catch (e) {
    showError(`Erreur: ${e?.message || e}`);
  }
})();
