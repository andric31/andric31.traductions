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

function getIdFromUrl() {
  // Mode final: uniquement ?id=
  try {
    const p = new URLSearchParams(location.search);
    const id = (p.get("id") || "").trim();
    return id || null;
  } catch {
    return null;
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

  if (!categories.length) categories = ["VN"];
  if (!engines.length) engines = ["Ren'Py"];
  if (!status) status = "En cours";

  categories = categories.filter(c => CAT_ALLOWED.includes(c)) || ["VN"];
  engines = engines.filter(e => ENGINE_ALLOWED.includes(e)) || ["Ren'Py"];
  if (!STATUS_ALLOWED.includes(status) && status !== "En cours") status = "En cours";

  return { category: categories[0], engine: engines[0], status };
}

function renderBadgesFromGame(game) {
  const rawTitle = String(game?.title || "");
  const meta = parseTitleMeta(rawTitle);

  const wrap = $("badges");
  if (!wrap) return;
  wrap.innerHTML = "";

  const b1 = document.createElement("span");
  b1.className = `badge cat-${slug(meta.category)}`;
  b1.textContent = meta.category;
  b1.classList.add("badge");

  const b2 = document.createElement("span");
  b2.className = `badge eng-${slug(meta.engine)}`;
  b2.textContent = meta.engine;
  b2.classList.add("badge");

  const b3 = document.createElement("span");
  b3.className = `badge status-${slug(meta.status)}`;
  b3.textContent = meta.status;
  b3.classList.add("badge");

  wrap.appendChild(b1);
  wrap.appendChild(b2);
  wrap.appendChild(b3);
}

// ====== ✅ À jour / Pas à jour (basé sur dates) ======
// Principe simple (sans casser / sans CORS):
// - si updatedAtLocal (ta date de traduction) >= updatedAt (date du thread F95) => À jour ✅
// - sinon => Pas à jour 🔄
// Si on ne peut pas parser => on n'affiche rien.

function parseFrenchDateToTs(s) {
  const raw = String(s || "").trim();
  if (!raw) return NaN;

  // Formats ISO / classiques
  const iso = Date.parse(raw);
  if (!Number.isNaN(iso)) return iso;

  // Formats FR possibles (ex: "16 janv. 2026", "16 janvier 2026", "16 jan 2026")
  const months = {
    "jan": 0, "janv": 0, "janvier": 0,
    "fev": 1, "fevr": 1, "fevrier": 1, "févr": 1, "février": 1,
    "mar": 2, "mars": 2,
    "avr": 3, "avril": 3,
    "mai": 4,
    "jun": 5, "juin": 5,
    "jui": 6, "juil": 6, "juillet": 6,
    "aou": 7, "aoû": 7, "août": 7,
    "sep": 8, "sept": 8, "septembre": 8,
    "oct": 9, "octobre": 9,
    "nov": 10, "novembre": 10,
    "dec": 11, "déc": 11, "decembre": 11, "décembre": 11
  };

  const cleaned = raw
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Ex: "16 janv 2026" (optionnellement avec heure)
  const m = cleaned.match(/^(\d{1,2})\s+([a-zéûôîàç]+)\s+(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/i);
  if (!m) return NaN;

  const day = Number(m[1]);
  const monKey = String(m[2] || "").normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // retire accents
  const year = Number(m[3]);
  const hh = m[4] ? Number(m[4]) : 0;
  const mm = m[5] ? Number(m[5]) : 0;

  const mon = months[monKey];
  if (!Number.isFinite(day) || !Number.isFinite(year) || !Number.isFinite(mon)) return NaN;

  // Date locale
  const d = new Date(year, mon, day, hh, mm, 0, 0);
  return d.getTime();
}

function computeUpToDate(game) {
  // 1) Dates
  const tsThread = parseFrenchDateToTs(game?.updatedAt || "");
  const tsLocal = Date.parse(String(game?.updatedAtLocal || "").trim());

  // si updatedAtLocal est ISO valide, ok
  const localOk = !Number.isNaN(tsLocal);

  if (!Number.isNaN(tsThread) && localOk) {
    return tsLocal >= tsThread; // ✅ à jour si ta trad est au moins aussi récente
  }

  // 2) Fallback éventuel si ton JSON a déjà un champ
  // (ex: game.isUpToDate / game.upToDate / game.needUpdate)
  if (typeof game?.isUpToDate === "boolean") return game.isUpToDate;
  if (typeof game?.upToDate === "boolean") return game.upToDate;
  if (typeof game?.needUpdate === "boolean") return !game.needUpdate;

  return null; // inconnu => on n'affiche rien
}

function renderUpToDateBadge(game) {
  const wrap = $("badges");
  if (!wrap) return;

  const res = computeUpToDate(game);
  if (res === null) return;

  const b = document.createElement("span");
  b.classList.add("badge");
  // on réutilise les classes existantes (pas besoin de CSS)
  b.className = `badge status-${res ? "ajour" : "pasajour"}`;
  b.textContent = res ? "✅ À jour" : "🔄 Pas à jour";

  wrap.appendChild(b);
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

async function initCounters(gameId, megaHref) {
  // 1) Vue : on hit au chargement
  try {
    const j = await counterHit(gameId, "view");
    if (j?.ok) {
      setText("statViews", formatInt(j.views));
      setText("statMegaClicks", formatInt(j.mega));
      showStatsBox();
    }
  } catch {
    // fallback: get
    try {
      const j = await counterGet(gameId);
      if (j?.ok) {
        setText("statViews", formatInt(j.views));
        setText("statMegaClicks", formatInt(j.mega));
        showStatsBox();
      }
    } catch {
      // silencieux (la page doit continuer à marcher)
      setText("statViews", "0");
      setText("statMegaClicks", "0");
      showStatsBox();
    }
  }

  // 2) Clic MEGA : on hit au clic
  if (!megaHref) return;
  const btn = $("btnMega");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    try {
      const j = await counterHit(gameId, "mega");
      if (j?.ok) {
        setText("statMegaClicks", formatInt(j.mega));
        showStatsBox();
      }
    } catch {
      // silencieux
    }
  }, { passive: true });
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
  const box = $("ratingBox");
  const choices = $("ratingChoices");
  const avgEl = $("ratingAvg");
  const countEl = $("ratingCount");
  const msgEl = $("ratingMsg");
  if (!box || !choices || !avgEl || !countEl) return;

  const avg = Number(data?.avg) || 0;
  const count = Number(data?.count) || 0;
  const myVote = getMyVote4(gameId);

  avgEl.textContent = avg > 0 ? avg.toFixed(1) + "/4" : "—";
  countEl.textContent = String(count);

  // zone étoiles
  choices.innerHTML = "";
  choices.style.display = "flex";
  choices.style.justifyContent = "center";
  choices.style.alignItems = "center";
  choices.style.gap = "6px";
  choices.style.flexWrap = "wrap";

  const setVisual = (hoverValue) => {
    const v = hoverValue || getMyVote4(gameId) || 0;
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

  /* 🗑️ Annulation (à gauche) */
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
    cancel.addEventListener("mouseleave", restoreMsg);
    cancel.addEventListener("focus", () => {
      setVisual(0);
      if (msgEl) msgEl.textContent = "Annuler ma note";
    });
    cancel.addEventListener("blur", restoreMsg);

    cancel.addEventListener("click", async () => {
      const prev = getMyVote4(gameId);
      if (!prev) return;
      try {
        const res = await rating4Vote(gameId, 0, prev); // suppression
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

  /* ⭐ Étoiles 1 → 4 */
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
    star.addEventListener("mouseleave", restoreMsg);

    star.addEventListener("focus", () => {
      setVisual(i);
      if (msgEl) msgEl.textContent = `${i}/4 — ${RATING4_LABELS[i]}`;
    });
    star.addEventListener("blur", restoreMsg);

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

  setVisual(0);
  restoreMsg();
}

// ====== Main ======

(async function main() {
  try {
    const id = getIdFromUrl();
    if (!id) {
      showError("Aucun ID dans l’URL. Exemple : /game/?id=215277");
      return;
    }

    const listUrl = getListUrl();
    const raw = await fetchJson(listUrl);
    const list = extractGames(raw);

    const game = Array.isArray(list)
      ? list.find(x => String(x?.id) === String(id))
      : null;

    if (!game) {
      showError(`Jeu introuvable (ID ${id}) dans f95list.json`);
      return;
    }

    const title = (game.cleanTitle || game.title || `Jeu ${id}`).trim();
    document.title = title;

    setText("title", title);

    // Cover (jamais favicon)
    setCover(game.imageUrl || "");

    // Tags
    renderTags(game.tags || []);

    // Badges (cat/engine/status)
    renderBadgesFromGame(game);

    // ✅ Ajout : à jour / pas à jour (sans rien casser)
    renderUpToDateBadge(game);

    // Boutons (ordre: Discord puis F95)
    setHref("btnDiscord", (game.discordlink || "").trim());
    if ($("btnDiscord")) $("btnDiscord").textContent = "💬 Discord";

    setHref("btnF95", (game.url || "").trim());
    if ($("btnF95")) $("btnF95").textContent = "🌐 F95Zone";

    const megaHref = (game.translation || "").trim();
    setHref("btnMega", megaHref);
    if ($("btnMega")) $("btnMega").textContent = "📥 Télécharger la traduction (MEGA)";

    // ✅ Vues + clics MEGA
    await initCounters(id, megaHref);

    // ⭐ Notation traduction (sur 4)
    try {
      const j = await rating4Get(id);
      if (j?.ok) renderRating4UI(id, j);
    } catch {
      // silencieux
    }

  } catch (e) {
    showError(`Erreur: ${e?.message || e}`);
  }
})();
