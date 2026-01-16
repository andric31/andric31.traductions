"use strict";

const DEFAULT_URL = "https://raw.githubusercontent.com/andric31/f95list/main/f95list.json";

// =====================================================
// URL de la liste : ?src=...  ou localStorage(f95listUrl)  ou DEFAULT_URL
// =====================================================
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

// =====================================================
// Support f95list.json : Array direct OU objet { games:[...] } etc.
// =====================================================
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

// =====================================================
// ID dans l'URL : /game/215277  ou  /game/215277/  (et support ?id= en bonus)
// =====================================================
function getIdFromUrl() {
  // Bonus: ?id= (utile pour debug)
  try {
    const p = new URLSearchParams(location.search);
    const qid = (p.get("id") || "").trim();
    if (qid) return qid;
  } catch {}

  const path = (location.pathname || "").replace(/\/+$/, "");
  const parts = path.split("/").filter(Boolean);
  const idx = parts.indexOf("game");
  if (idx === -1) return null;
  return parts[idx + 1] || null;
}

// =====================================================
// DOM helpers
// =====================================================
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = (text ?? "—");
}

function setHref(id, href) {
  const el = document.getElementById(id);
  if (!el) return;
  const h = String(href || "").trim();

  if (!h) {
    el.style.display = "none";
    el.removeAttribute("href");
  } else {
    el.style.display = "";
    el.href = h;
  }
}

function showError(msg) {
  const wrap = document.getElementById("wrap");
  const err = document.getElementById("errBox");
  if (wrap) wrap.classList.add("hidden");
  if (err) {
    err.classList.remove("hidden");
    err.textContent = msg;
  }
}

async function fetchJson(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status} sur ${url}`);
  return await r.json();
}

function renderTags(tags) {
  const box = document.getElementById("tags");
  if (!box) return;
  box.innerHTML = "";
  (tags || []).forEach((t) => {
    const s = document.createElement("span");
    s.className = "tag";
    s.textContent = t;
    box.appendChild(s);
  });
}

function setCover(url) {
  const img = document.getElementById("cover");
  if (!img) return;
  img.referrerPolicy = "no-referrer";
  img.src = url ? url : "/favicon.png";
  img.onerror = () => {
    img.onerror = null;
    img.src = "/favicon.png";
  };
}

(async function main() {
  try {
    const id = getIdFromUrl();
    if (!id) {
      showError("Aucun ID dans l’URL. Exemple : /game/66273");
      return;
    }

    document.title = `Jeu ${id}`;

    const listUrl = getListUrl();
    const raw = await fetchJson(listUrl);
    const list = extractGames(raw);

    const game = Array.isArray(list)
      ? list.find((x) => String(x?.id) === String(id))
      : null;

    if (!game) {
      showError(`Jeu introuvable (ID ${id}) dans f95list.json`);
      return;
    }

    const title = game.cleanTitle || game.title || `Jeu ${id}`;
    setText("title", title);
    setText("meta", (game.updatedAt ? `Mis à jour : ${game.updatedAt}` : ""));

    setCover(game.imageUrl);

    setText("gid", game.id);
    setText("gver", game.version || "—");
    setText("gos", game.os || "—");
    setText("gcens", game.censored || "—");
    setText("gupd", game.updatedAt || "—");
    setText("grel", game.releaseDate || "—");

    setHref("btnMega", game.translation || "");
    setHref("btnDiscord", game.discordlink || "");
    setHref("btnF95", game.url || game.threadUrl || "");

    renderTags(game.tags || []);
  } catch (e) {
    showError(`Erreur: ${e?.message || e}`);
  }
})();
