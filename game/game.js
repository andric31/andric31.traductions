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

// ====== Menu ☰ + À propos (page game) ======

const ABOUT_TEXT = `
Pour tout renseignement, aide ou autre, rejoignez mon serveur Discord :
https://discord.gg/Jr8Ykf8yMd

Contact Discord :
https://discord.com/users/@andric31

Vous pouvez aussi me contacter sur F95zone :
Profil https://f95zone.to/members/andric31.247797/
`.trim();

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, m => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[m]));
}

function linkify(text) {
  const esc = escapeHtml(text);
  return esc.replace(
    /(https?:\/\/[^\s<]+)/g,
    (m) => `<a href="${m}" target="_blank" rel="noopener">${m}</a>`
  );
}

function ensureMenuDom() {
  let pop = $("topMenuPopover");
  if (!pop) {
    pop = document.createElement("div");
    pop.id = "topMenuPopover";
    pop.className = "menu-popover hidden";
    pop.innerHTML = `
      <button type="button" class="menu-item" id="menuAbout">ℹ️ À propos</button>
    `;
    document.body.appendChild(pop);
  }

  let overlay = $("aboutOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "aboutOverlay";
    overlay.className = "modal-overlay hidden";
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="aboutTitle">
        <div class="modal-head">
          <div class="modal-title" id="aboutTitle">À propos</div>
          <button type="button" class="modal-close" id="aboutClose" aria-label="Fermer">✕</button>
        </div>
        <div class="modal-body" id="aboutBody"></div>
        <div class="modal-foot">
          <button type="button" class="modal-btn" id="aboutOk">OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  return { pop, overlay };
}

function positionPopover(pop, anchorBtn) {
  const r = anchorBtn.getBoundingClientRect();
  const margin = 8;

  let left = Math.round(r.left);
  let top = Math.round(r.bottom + margin);

  const maxLeft = window.innerWidth - 260 - 10;
  if (left > maxLeft) left = Math.max(10, maxLeft);
  if (left < 10) left = 10;

  pop.style.left = left + "px";
  pop.style.top = top + "px";
}

function closePopover() {
  const pop = $("topMenuPopover");
  if (pop) pop.classList.add("hidden");
  const b = $("hamburgerBtn");
  if (b) b.setAttribute("aria-expanded", "false");
}

function openAbout() {
  const overlay = $("aboutOverlay");
  const body = $("aboutBody");
  if (body) body.innerHTML = `<div class="aboutText">${linkify(ABOUT_TEXT).replace(/\n/g, "<br>")}</div>`;
  if (overlay) overlay.classList.remove("hidden");
}

function closeAbout() {
  const overlay = $("aboutOverlay");
  if (overlay) overlay.classList.add("hidden");
}

function initHamburgerMenu() {
  const btn = $("hamburgerBtn");
  if (!btn) return;

  const { pop } = ensureMenuDom();

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    const isOpen = !pop.classList.contains("hidden");
    if (isOpen) {
      closePopover();
      return;
    }

    pop.classList.remove("hidden");
    btn.setAttribute("aria-expanded", "true");
    positionPopover(pop, btn);
  });

  document.addEventListener("click", (e) => {
    const p = $("topMenuPopover");
    const b = $("hamburgerBtn");
    if (!p || !b) return;

    const target = e.target;
    const clickedInside = p.contains(target) || b.contains(target);
    if (!clickedInside) closePopover();
  });

  window.addEventListener("resize", () => {
    const p = $("topMenuPopover");
    const b = $("hamburgerBtn");
    if (p && b && !p.classList.contains("hidden")) positionPopover(p, b);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closePopover();
      closeAbout();
    }
  });

  // menu item
  document.getElementById("menuAbout")?.addEventListener("click", () => {
    closePopover();
    openAbout();
  });

  // modal close
  const overlay = $("aboutOverlay");
  if (overlay) {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeAbout();
    });
  }
  document.getElementById("aboutClose")?.addEventListener("click", closeAbout);
  document.getElementById("aboutOk")?.addEventListener("click", closeAbout);
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
  b.textContent = liked ? "💔 Je n’aime plus" : "❤️ J’aime";
  b.classList.toggle("is-liked", liked);
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
    // ✅ menu ☰ (page game)
    initHamburgerMenu();

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

    setCover(game.imageUrl || "");
    renderTags(game.tags || []);

    renderBadgesFromGame(game);
    renderTranslationStatus(game);

    setHref("btnDiscord", (game.discordlink || "").trim());
    if ($("btnDiscord")) $("btnDiscord").textContent = "💬 Discord";

    setHref("btnF95", (game.url || "").trim());
    if ($("btnF95")) $("btnF95").textContent = "🌐 F95Zone";

    const megaHref = (game.translation || "").trim();
    setHref("btnMega", megaHref);
    if ($("btnMega")) $("btnMega").textContent = "📥 Télécharger la traduction (MEGA)";

    await initCounters(id, megaHref);

    try {
      const j = await rating4Get(id);
      if (j?.ok) renderRating4UI(id, j);
    } catch {}

  } catch (e) {
    showError(`Erreur: ${e?.message || e}`);
  }
})();


