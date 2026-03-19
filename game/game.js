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

function setHtml(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html ?? "";
}

function show(id, cond) {
  const el = document.getElementById(id);
  if (el) el.style.display = cond ? "" : "none";
}

const galleryState = {
  urls: [],
  index: 0,
  timer: null,
  hover: false,
  loadedForUrl: "",
};

function galleryUrlKey(raw) {
  const u = String(raw || "").trim();
  if (!u) return "";
  try {
    const x = new URL(u, location.origin);
    const host = (x.hostname || "").toLowerCase();
    const path = (x.pathname || "").replace(/\/+$/, "");
    return `${host}${path}`;
  } catch {
    return u.replace(/[?#].*$/, "").replace(/\/+$/, "");
  }
}

function dedupKeepOrder(list) {
  const out = [];
  const seen = new Set();
  for (const raw of list || []) {
    const u = String(raw || "").trim();
    const k = galleryUrlKey(u);
    if (!u || !k || seen.has(k)) continue;
    seen.add(k);
    out.push(u);
  }
  return out;
}

function getF95GalleryApiUrl(f95Url) {
  const u = String(f95Url || "").trim();
  if (!u) return "";
  return `/api/f95gallery?url=${encodeURIComponent(u)}`;
}

function stopGalleryAuto() {
  try { if (galleryState.timer) clearInterval(galleryState.timer); } catch {}
  galleryState.timer = null;
}

function startGalleryAuto() {
  stopGalleryAuto();
  if (!galleryState.hover) return;
  if (!Array.isArray(galleryState.urls) || galleryState.urls.length < 2) return;
  galleryState.timer = setInterval(() => {
    galleryGoTo(galleryState.index + 1);
  }, 3000);
}

function updateGalleryControls() {
  const many = Array.isArray(galleryState.urls) && galleryState.urls.length > 1;
  const countText = many ? `${galleryState.index + 1} / ${galleryState.urls.length}` : "";
  const ids = ["coverPrevBtn", "coverNextBtn", "coverLightboxPrev", "coverLightboxNext"];
  ids.forEach((id) => show(id, many));
  const count = $("coverCount");
  const lcount = $("coverLightboxCount");
  if (count) { count.textContent = countText; count.style.display = many ? "" : "none"; }
  if (lcount) { lcount.textContent = countText; lcount.style.display = many ? "" : "none"; }
}

function setLightboxBackground(url) {
  const lb = $("coverLightbox");
  if (!lb) return;
  const u = String(url || "").trim();
  lb.style.setProperty("--lb-bg", u ? `url("${u.replace(/"/g, '\"')}")` : "none");
}

function galleryGoTo(index) {
  if (!Array.isArray(galleryState.urls) || !galleryState.urls.length) return;
  const len = galleryState.urls.length;
  galleryState.index = ((index % len) + len) % len;
  const u = galleryState.urls[galleryState.index] || "";
  const img = $("cover");
  const lb = $("coverLightboxImg");
  if (img) {
    img.classList.remove("is-placeholder");
    img.src = u;
    img.onerror = () => { img.onerror = null; };
  }
  if (lb) lb.src = u;
  setLightboxBackground(u);
  updateGalleryControls();
}

function setupGalleryEvents() {
  const stage = $("coverStage");
  const lightbox = $("coverLightbox");
  if (!stage || stage.dataset.galleryBound === "1") return;
  stage.dataset.galleryBound = "1";

  $("coverPrevBtn")?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); galleryGoTo(galleryState.index - 1); startGalleryAuto(); });
  $("coverNextBtn")?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); galleryGoTo(galleryState.index + 1); startGalleryAuto(); });
  $("coverLightboxPrev")?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); galleryGoTo(galleryState.index - 1); });
  $("coverLightboxNext")?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); galleryGoTo(galleryState.index + 1); });
  $("coverExpandBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    const lb = $("coverLightbox");
    if (!lb) return;
    const current = galleryState.urls[galleryState.index] || "";
    setLightboxBackground(current);
    lb.classList.remove("hidden");
    lb.setAttribute("aria-hidden", "false");
    const img = $("coverLightboxImg");
    if (img) img.src = current;
  });
  const closeLb = () => {
    const lb = $("coverLightbox");
    if (!lb) return;
    lb.classList.add("hidden");
    lb.setAttribute("aria-hidden", "true");
  };
  $("coverLightboxClose")?.addEventListener("click", closeLb);
  $("coverLightboxBackdrop")?.addEventListener("click", closeLb);
  lightbox?.addEventListener("click", (e) => { if (e.target === lightbox) closeLb(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeLb();
    if (e.key === "ArrowLeft") galleryGoTo(galleryState.index - 1);
    if (e.key === "ArrowRight") galleryGoTo(galleryState.index + 1);
  });
  stage.addEventListener("mouseenter", () => { galleryState.hover = true; startGalleryAuto(); });
  stage.addEventListener("mouseleave", () => { galleryState.hover = false; stopGalleryAuto(); });
}

async function loadF95Gallery(f95Url, fallbackUrl) {
  setupGalleryEvents();
  const fallback = String(fallbackUrl || "").trim();
  const baseUrl = String(f95Url || "").trim();
  const fallbackKey = galleryUrlKey(fallback);

  if (!baseUrl) {
    galleryState.urls = fallback ? [fallback] : [];
    galleryState.index = 0;
    galleryGoTo(0);
    updateGalleryControls();
    return;
  }
  if (galleryState.loadedForUrl === baseUrl) return;
  galleryState.loadedForUrl = baseUrl;

  let merged = fallback ? [fallback] : [];
  try {
    const resp = await fetch(getF95GalleryApiUrl(baseUrl));
    const data = await resp.json();
    if (data && data.ok) {
      const remote = [];
      if (data.cover) remote.push(data.cover);
      if (Array.isArray(data.gallery)) remote.push(...data.gallery);
      if (remote.length) {
        const filteredRemote = remote.filter((u) => galleryUrlKey(u) !== fallbackKey);
        merged = fallback ? [fallback, ...filteredRemote] : filteredRemote;
      }
    }
  } catch {}

  galleryState.urls = dedupKeepOrder(merged);
  galleryState.index = 0;
  if (galleryState.urls.length) galleryGoTo(0);
  else updateGalleryControls();
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
  const id = (g?.id || "").toString().trim();
  const col = (g?.collection || "").toString().trim();
  if (!id && col) {
    return (g?.gameData?.title || "").toString().trim();
  }
  return (g?.cleanTitle || g?.title || "").toString().trim();
}

function getCollectionChildTitle(g) {
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
  const map = new Map();
  for (const owner of games || []) {
    const s = owner?.serie;
    if (!s?.name || !Array.isArray(s.refs)) continue;

    const serieObj = {
      name: String(s.name),
      refs: s.refs.map((x) => String(x)),
      ownerUid: owner?.uid,
      ownerId: owner?.id || "",
    };

    for (const ref of serieObj.refs) {
      if (!map.has(ref)) map.set(ref, []);
      map.get(ref).push(serieObj);
    }

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
  for (const ref of serie?.refs || []) {
    const [type, value] = String(ref).split(":");
    if (type === "id") {
      const g = (games || []).find((x) => String(x?.id) === String(value) && !x?.collection);
      if (g) out.push(g);
    } else if (type === "uid") {
      const g = (games || []).find((x) => String(x?.uid) === String(value));
      if (g) out.push(g);
    }
  }
  return out;
}

function resolveGamePage(params, games) {
  const id = (params?.id || "").toString().trim();
  const uid = (params?.uid || "").toString().trim();

  if (id && uid) {
    const child = (games || []).find(
      (g) => String(g?.uid) === String(uid) && String(g?.collection) === String(id)
    );
    if (!child) return { kind: "notfound" };

    const parent = (games || []).find((g) => String(g?.id) === String(id) && !g?.collection) || null;
    const siblings = (games || [])
      .filter((g) => String(g?.collection) === String(id))
      .sort((a, b) => Number(a?.uid) - Number(b?.uid));

    return { kind: "collectionChild", idParam: id, uidParam: uid, entry: child, parent, siblings };
  }

  if (id) {
    const parentOrGame =
      (games || []).find((g) => String(g?.id) === String(id) && !g?.collection) || null;
    if (!parentOrGame) return { kind: "notfound" };

    const children = (games || [])
      .filter((g) => String(g?.collection) === String(id))
      .sort((a, b) => Number(a?.uid) - Number(b?.uid));

    if (children.length) return { kind: "collectionParent", idParam: id, entry: parentOrGame, children };
    return { kind: "normal", idParam: id, entry: parentOrGame };
  }

  if (uid) {
    const g = (games || []).find((x) => String(x?.uid) === String(uid)) || null;
    if (!g) return { kind: "notfound" };
    return { kind: "uidOnly", uidParam: uid, entry: g };
  }

  return { kind: "notfound" };
}

// ====== Related container ======

function ensureRelatedContainer() {
  const main = document.getElementById("mainInfoBox");
  const tags = document.getElementById("tags");
  const descInner = document.getElementById("descInnerBox");
  if (!main || !tags) return null;

  let out = document.getElementById("relatedOut");
  if (!out) {
    out = document.createElement("div");
    out.id = "relatedOut";
    out.style.marginTop = "12px";
    out.style.display = "grid";
    out.style.gap = "10px";

    if (descInner && descInner.parentNode === main) {
      main.insertBefore(out, descInner);
    } else {
      main.appendChild(out);
    }
  }
  return out;
}

function renderCollectionBlockForChild(parent) {
  const parentId = parent?.id ? String(parent.id) : "";
  const href = parentId ? `/game/?id=${encodeURIComponent(parentId)}` : "";
  const label = parent ? (parent.cleanTitle || parent.title || parentId) : "Voir la collection";

  return `
    <div class="game-block collection-child-block">
      <h3>📦 Fait partie de la collection</h3>
      ${href ? `<a class="collection-parent-link" href="${href}">${escapeHtml(label)}</a>` : ``}
    </div>
  `;
}

function renderCollectionBlockForParent(parent, children) {
  if (!children || !children.length) return "";

  const items = children
    .map((g) => {
      const t = escapeHtml(getDisplayTitle(g, "collectionChild"));
      const href = `/game/?id=${encodeURIComponent(parent.id)}&uid=${encodeURIComponent(g.uid)}`;
      return `<li><a href="${href}">${t}</a></li>`;
    })
    .join("");

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

  return seriesList
    .map((serie) => {
      const items = resolveSerieRefsToEntries(serie, games);

      const li = items
        .map((g) => {
          const t = getCollectionChildTitle(g) || getDisplayTitle(g);
          const href = buildGameUrl(g);

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
        })
        .join("");

      return `
        <div class="game-block serie-block">
          <h3>📚 Série : ${escapeHtml(serie.name)}</h3>
          <ul style="margin:0;padding-left:18px;">${li}</ul>
        </div>
      `;
    })
    .join("");
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

function setCover(url) {
  const img = $("cover");
  if (!img) return;

  const u = (url || "").trim();
  img.referrerPolicy = "no-referrer";

  if (!u) {
    galleryState.urls = [];
    img.removeAttribute("src");
    img.classList.add("is-placeholder");
    updateGalleryControls();
    return;
  }

  galleryState.urls = [u];
  galleryState.index = 0;
  img.classList.remove("is-placeholder");
  img.src = u;
  const lb = $("coverLightboxImg");
  if (lb) lb.src = u;
  updateGalleryControls();

  img.onerror = () => {
    img.onerror = null;
    img.removeAttribute("src");
    img.classList.add("is-placeholder");
  };
}

function renderTags(tags) {
  const box = $("tags");
  if (!box) return;
  box.innerHTML = "";
  (tags || []).forEach((t) => {
    if (!t) return;
    const s = document.createElement("span");
    s.className = "tagPill";
    s.textContent = String(t);
    box.appendChild(s);
  });
}

// ====== Badges ======

const CAT_ALLOWED = ["VN", "Collection"];
const ENGINE_ALLOWED = ["Ren'Py", "RPGM", "Unity", "Unreal Engine", "HTML", "Java", "Flash", "QSP", "WebGL", "RAGS", "Tads", "ADRIFT", "Others", "Wolf RPG"];
const STATUS_ALLOWED = ["Completed", "Abandoned", "Onhold"];

const ENGINE_RAW = {
  renpy: "Ren'Py",
  "ren'py": "Ren'Py",
  rpgm: "RPGM",
  rpgmaker: "RPGM",
  rpgmakermv: "RPGM",
  rpgmakermz: "RPGM",
  unity: "Unity",
  unreal: "Unreal Engine",
  "unrealengine": "Unreal Engine",
  "unreal engine": "Unreal Engine",
  ue4: "Unreal Engine",
  ue5: "Unreal Engine",
  html: "HTML",
  html5: "HTML",
  web: "HTML",
  java: "Java",
  flash: "Flash",
  qsp: "QSP",
  webgl: "WebGL",
  rags: "RAGS",
  tads: "Tads",
  adrift: "ADRIFT",
  others: "Others",
  other: "Others",
  wolf: "Wolf RPG",
  wolfrpg: "Wolf RPG",
};

function slug(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const SEP_RE = /[\u2014\u2013\-:]/;
const ucFirst = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

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

    if (
      norm === "wolf" &&
      tokens[i + 1] &&
      tokens[i + 1].toLowerCase().replace(/[^\w']/g, "") === "rpg"
    ) {
      if (!engines.includes("Wolf RPG")) engines.push("Wolf RPG");
      cut = i + 2;
      i++;
      continue;
    }

    if (norm === "wolf") break;

    if (norm === "flash") {
      if (!engines.includes("Flash")) engines.push("Flash");
      cut = i + 1;
      continue;
    }

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

    if (w === "&" || w === "and" || w === "/") {
      cut = i + 1;
      continue;
    }

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
  categories = categories.filter((c) => allowedCat.has(c));
  engines = engines.filter((e) => allowedEng.has(e));

  if (!othersExplicit && engines.includes("Others") && engines.some((e) => e !== "Others")) {
    engines = engines.filter((e) => e !== "Others");
  }

  return { title: t, categories, engines, status };
}

function makeBadge(type, value) {
  const b = document.createElement("span");
  b.className = `badge ${type}-${slug(value)}`;
  b.textContent = value;
  return b;
}

function renderBadgesFromGame(display, entry, isCollectionChild) {
  const wrap = $("badges");
  if (!wrap) return;
  wrap.innerHTML = "";

  const childTitle = String(display?.title || "");
  const parentTitle = String(entry?.title || "");

  if (isCollectionChild) {
    wrap.appendChild(makeBadge("cat", "Collection"));
  }

  let c = cleanTitle(isCollectionChild ? childTitle : parentTitle);

  if (!isCollectionChild && c.categories.includes("Collection")) {
    wrap.appendChild(makeBadge("cat", "Collection"));
  }

  if (!isCollectionChild && c.categories.includes("VN")) {
    wrap.appendChild(makeBadge("cat", "VN"));
  }

  if (isCollectionChild) {
    if (display?.engine) {
      const eng = ENGINE_RAW[slug(display.engine)] || display.engine;
      c.engines = [eng];
    } else if (!c.engines || c.engines.length === 0) {
      const cp = cleanTitle(parentTitle);
      c.engines = cp.engines || [];
    }

    if (display?.status) {
      c.status = display.status;
    } else if (!c.status) {
      const cp = cleanTitle(parentTitle);
      if (cp.status) c.status = cp.status;
    }
  }

  for (const eng of c.engines || []) {
    wrap.appendChild(makeBadge("eng", eng));
  }
  if (c.status) wrap.appendChild(makeBadge("status", c.status));
}

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
  } catch {}
}

// ============================================================================
// ✅ MENU ☰ (page game)
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

  try {
    window.ViewerMenu?.init?.();
  } catch {}

  // ✅ Ajout item : retour page principale (viewer)
  try {
    if (!window.__homeMenuAdded && window.ViewerMenu?.addItem) {
      window.__homeMenuAdded = true;
      window.ViewerMenu.addItem("📚 Retour à la liste des traductions", () => { window.location.href = "../"; }, { prepend: true });
    }
  } catch {}

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    const pop = document.getElementById("topMenuPopover");
    if (!pop) return;

    const isOpen = !pop.classList.contains("hidden");
    if (isOpen) {
      try {
        window.ViewerMenu?.closeMenu?.();
      } catch {
        pop.classList.add("hidden");
      }
      btn.setAttribute("aria-expanded", "false");
      return;
    }

    pop.classList.remove("hidden");
    btn.setAttribute("aria-expanded", "true");
    positionPopover(pop, btn);
  });

  document.addEventListener("click", (e) => {
    const pop = document.getElementById("topMenuPopover");
    if (!pop) return;

    const target = e.target;
    if (!pop.contains(target) && !btn.contains(target)) {
      try {
        window.ViewerMenu?.closeMenu?.();
      } catch {
        pop.classList.add("hidden");
      }
      btn.setAttribute("aria-expanded", "false");
    }
  });

  window.addEventListener("resize", () => {
    const pop = document.getElementById("topMenuPopover");
    if (pop && !pop.classList.contains("hidden")) positionPopover(pop, btn);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    try { window.ViewerMenu?.closeMenu?.(); } catch {}
    try { window.ViewerMenu?.closeAbout?.(); } catch {}
    try { window.ViewerMenu?.closeExtension?.(); } catch {}
    try { window.ViewerMenuExtension?.close?.(); } catch {}
  });
}

// ====== Counters ======

function formatInt(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0";
  try {
    return x.toLocaleString("fr-FR");
  } catch {
    return String(Math.floor(x));
  }
}

function showStatsBox() {
  const stats = $("statsOut");
  if (stats) stats.style.display = "";
}

function formatRelativeTranslationTime(ts) {
  const t = Number(ts || 0);
  if (!Number.isFinite(t) || t <= 0) return "—";

  let delta = Date.now() - t;
  if (!Number.isFinite(delta) || delta < 0) delta = 0;

  const MIN = 60 * 1000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;
  const WEEK = 7 * DAY;
  const MONTH = 30 * DAY;
  const YEAR = 365 * DAY;

  if (delta < MIN) return "à l’instant";

  if (delta < HOUR) {
    const n = Math.max(1, Math.floor(delta / MIN));
    return `${n} minute${n > 1 ? "s" : ""}`;
  }

  if (delta < DAY) {
    const n = Math.max(1, Math.floor(delta / HOUR));
    return `${n} heure${n > 1 ? "s" : ""}`;
  }

  if (delta < WEEK) {
    const n = Math.max(1, Math.floor(delta / DAY));
    return `${n} jour${n > 1 ? "s" : ""}`;
  }

  if (delta < 5 * WEEK) {
    const n = Math.max(1, Math.floor(delta / WEEK));
    return `${n} semaine${n > 1 ? "s" : ""}`;
  }

  if (delta < YEAR) {
    const n = Math.max(1, Math.floor(delta / MONTH));
    return `${n} mois`;
  }

  const n = Math.max(1, Math.floor(delta / YEAR));
  return `${n} an${n > 1 ? "s" : ""}`;
}

function formatAbsoluteDateTime(ts, fallback = "Date inconnue") {
  const t = Number(ts || 0);
  if (!Number.isFinite(t) || t <= 0) return fallback;
  try {
    return new Date(t).toLocaleString("fr-FR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return new Date(t).toISOString();
  }
}

function formatAbsoluteDateOnly(ts, fallback = "Date inconnue") {
  const t = Number(ts || 0);
  if (!Number.isFinite(t) || t <= 0) return fallback;
  try {
    return new Date(t).toLocaleDateString("fr-FR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return new Date(t).toISOString().slice(0, 10);
  }
}

function setStatMeta(entry) {
  const updatedAtLocalRaw = entry?.updatedAtLocal || "";
  const createdAtLocalRaw = entry?.createdAtLocal || "";
  const updatedAtRaw = entry?.updatedAt || "";

  const updatedAtLocalTs = updatedAtLocalRaw ? Date.parse(updatedAtLocalRaw) : NaN;
  const createdAtLocalTs = createdAtLocalRaw ? Date.parse(createdAtLocalRaw) : NaN;
  const lastTranslationTs = !Number.isNaN(updatedAtLocalTs) ? updatedAtLocalTs : (!Number.isNaN(createdAtLocalTs) ? createdAtLocalTs : 0);

  setText("statTranslationTime", formatRelativeTranslationTime(lastTranslationTs));

  const translationWrap = $("statTranslationWrap");
  if (translationWrap) {
    translationWrap.title = formatAbsoluteDateTime(lastTranslationTs, updatedAtRaw || "Date de traduction inconnue");
  }

  setText("statAddedDate", formatAbsoluteDateOnly(!Number.isNaN(createdAtLocalTs) ? createdAtLocalTs : 0, "—"));
  const addedWrap = $("statAddedWrap");
  if (addedWrap) {
    addedWrap.title = formatAbsoluteDateTime(!Number.isNaN(createdAtLocalTs) ? createdAtLocalTs : 0, "Date d’ajout inconnue");
  }
}

function setStatRating(avg, count) {
  const a = Number(avg || 0);
  const c = Number(count || 0);
  const text = c > 0 && a > 0 ? `${a.toFixed(1)}/4` : "—";
  setText("statRating", text);
  const wrap = $("statRatingWrap");
  if (wrap) wrap.title = c > 0 && a > 0 ? `${a.toFixed(1)}/4 · ${c} vote${c > 1 ? "s" : ""}` : "Aucune note pour le moment";
}

async function counterGet(id) {
  const r = await fetch(`/api/counter?op=get&id=${encodeURIComponent(id)}`, { cache: "no-store" });
  if (!r.ok) throw new Error("counter get HTTP " + r.status);
  return await r.json();
}

// ✅ plus fiable (quand on quitte la page vite) : keepalive
async function counterHit(id, kind) {
  const url = `/api/counter?op=hit&kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`;
  const r = await fetch(url, { cache: "no-store", keepalive: true });
  if (!r.ok) throw new Error("counter hit HTTP " + r.status);
  return await r.json();
}

// ✅ plus fiable (quand on quitte la page vite) : keepalive
async function counterUnhit(id, kind) {
  const url = `/api/counter?op=unhit&kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`;
  const r = await fetch(url, { cache: "no-store", keepalive: true });
  if (!r.ok) throw new Error("counter unhit HTTP " + r.status);
  return await r.json();
}

function getMyLike(gameId) {
  try {
    return localStorage.getItem(`like_${gameId}`) === "1";
  } catch {
    return false;
  }
}
function setMyLike(gameId, v) {
  try {
    localStorage.setItem(`like_${gameId}`, v ? "1" : "0");
  } catch {}
}
function getLikeIconSvg(liked) {
  const path = `<path d="M8 21H5.5A1.5 1.5 0 0 1 4 19.5v-7A1.5 1.5 0 0 1 5.5 11H8m0 10V11m0 10h8.2c.8 0 1.4-.5 1.6-1.3l1.1-5.2c.2-.9-.5-1.8-1.5-1.8H13V7.8c0-1-.8-1.8-1.8-1.8h-.1L8 11"/>`;
  return liked
    ? `<svg class="likeIconSvg likeIconSvg--liked" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${path}</svg>`
    : `<svg class="likeIconSvg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${path}</svg>`;
}

function updateLikeBtn(gameId) {
  const b = $("btnLike");
  if (!b) return;

  const liked = getMyLike(gameId);
  b.innerHTML = getLikeIconSvg(liked);
  b.setAttribute("aria-label", liked ? "Je n’aime plus" : "J’aime");
}

function setLikesFromJson(j) {
  if (!$("statLikes")) return;
  const val = Number(j?.likes);
  setText("statLikes", Number.isFinite(val) ? formatInt(val) : "0");
}

function cooldownKey(kind, gameId) {
  return `cooldown_${kind}_${gameId}`;
}

function inCooldown(kind, gameId, ms) {
  try {
    const k = cooldownKey(kind, gameId);
    const last = Number(localStorage.getItem(k) || "0");
    const now = Date.now();
    if (now - last < ms) return true;
    localStorage.setItem(k, String(now));
    return false;
  } catch {
    return false;
  }
}

// ✅ bind download sur un <a> (ou bouton) quelconque
function bindDownloadClick(el, gameId, MEGA_COOLDOWN_MS) {
  if (!el) return;
  if (el.dataset.boundMega === "1") return;
  el.dataset.boundMega = "1";

  el.addEventListener(
    "click",
    async () => {
      if (inCooldown("megaClick", gameId, MEGA_COOLDOWN_MS)) return;
      try {
        const j = await counterHit(gameId, "mega");
        if (j?.ok) {
          setText("statMegaClicks", formatInt(j.mega));
          showStatsBox();
        }
      } catch {}
    },
    { passive: true }
  );
}

async function initCounters(gameId, megaHref, archiveHref) {
  const VIEW_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes
  const MEGA_COOLDOWN_MS = 5 * 60 * 1000;  // 5 minutes

  // 1) Vue (anti-refresh abusif)
  const skipViewHit = inCooldown("view", gameId, VIEW_COOLDOWN_MS);

  try {
    const j = skipViewHit ? await counterGet(gameId) : await counterHit(gameId, "view");
    if (j?.ok) {
      setText("statViews", formatInt(j.views));
      setText("statMegaClicks", formatInt(j.mega));
      setLikesFromJson(j);
      showStatsBox();
    }
  } catch {
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

  // 2) 📥 Téléchargements
  // - MEGA (btnMega)
  // - Archives (archiveLink)
  // - ✅ ET tous les liens extra (extraLinkBtn)
  const btnMega = $("btnMega");
  const archiveLink = $("archiveLink");

  if (megaHref && btnMega) bindDownloadClick(btnMega, gameId, MEGA_COOLDOWN_MS);
  if (archiveHref && archiveLink) bindDownloadClick(archiveLink, gameId, MEGA_COOLDOWN_MS);

  // ✅ extra links (translationsExtra)
  document.querySelectorAll("a.extraLinkBtn").forEach((a) => {
    bindDownloadClick(a, gameId, MEGA_COOLDOWN_MS);
  });

  // 3) ❤️ Like toggle
  const btnLike = $("btnLike");
  if (btnLike && $("statLikes")) {
    updateLikeBtn(gameId);

    if (btnLike.dataset.boundLike === "1") return;
    btnLike.dataset.boundLike = "1";

    btnLike.addEventListener("click", async () => {
      if (inCooldown("likeClick", gameId, 1500)) return;

      const liked = getMyLike(gameId);

      try {
        let j;
        if (!liked) {
          j = await counterHit(gameId, "like");
          if (j?.ok) {
            setMyLike(gameId, true);
            setLikesFromJson(j);
            updateLikeBtn(gameId);
            showStatsBox();
          }
          return;
        }

        j = await counterUnhit(gameId, "like");
        if (j?.ok) {
          setMyLike(gameId, false);
          setLikesFromJson(j);
          updateLikeBtn(gameId);
          showStatsBox();
        }
      } catch {}
    });
  }
}

// ============================================================================
// ✅ COMPTEUR UID ONLY
// ============================================================================
function buildCounterKeyFromEntry(entry) {
  const uid = String(entry?.uid ?? "").trim();
  return uid ? `uid:${uid}` : "";
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
  } catch {
    return 0;
  }
}

function setMyVote4(gameId, v) {
  try {
    localStorage.setItem(`rating4_${gameId}`, String(v));
  } catch {}
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
  setStatRating(avg, count);

  choices.innerHTML = "";

  const setVisual = (hoverValue) => {
    const v =
      hoverValue === 0 || typeof hoverValue === "number" ? hoverValue : getMyVote4(gameId) || 0;

    [...choices.querySelectorAll(".ratingStar")].forEach((btn, idx) => {
      btn.textContent = idx + 1 <= v ? "★" : "☆";
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
          try {
            localStorage.removeItem(`rating4_${gameId}`);
          } catch {}
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

// =========================
// ✅ Blocs nouveaux champs
// =========================

function ensureBlockAfter(anchorEl, id) {
  if (!anchorEl || !anchorEl.parentNode) return null;

  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement("div");
    el.id = id;
    anchorEl.parentNode.insertBefore(el, anchorEl.nextSibling);
  }
  return el;
}

function renderVideoBlock({ id, videoUrl }) {
  const u = (videoUrl || "").trim();
  if (!u) {
    show(id, false);
    return;
  }
  setHtml(
    id,
    `
    <div class="game-block">
      <iframe
        src="${escapeHtml(u)}"
        referrerpolicy="strict-origin-when-cross-origin"
        style="width:100%; aspect-ratio:16/9; border-radius:12px; border:1px solid var(--border);"
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen>
      </iframe>
    </div>
  `
  );
  show(id, true);
}

// ====== Main ======

(async function main() {
  try {
    initHamburgerMenu();

    const { id: idParam, uid: uidParam } = getParamsFromUrl();

    if (!idParam && !uidParam) {
      showError(
        "Aucun paramètre dans l’URL. Exemples : /game/?id=215277  ou  /game/?id=17373&uid=898  ou  /game/?uid=898"
      );
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

    const entry = page.entry;
    const display = entry?.gameData ? entry.gameData : entry;

    const counterKey = buildCounterKeyFromEntry(entry);

    const isCollectionChild = page.kind === "collectionChild" && entry && entry.gameData;

    const title = (getDisplayTitle(entry) || getDisplayTitle(display) || `Jeu ${idParam || uidParam}`).trim();
    document.title = title;

    setText("title", title);
    setCover(display.imageUrl || entry.imageUrl || "");
    loadF95Gallery(display.url || entry.url || "", display.imageUrl || entry.imageUrl || "");
    renderTags(display.tags || entry.tags || []);

    renderBadgesFromGame(display, entry, isCollectionChild);
    renderTranslationStatus(entry);

    const relatedOut = ensureRelatedContainer();
    if (relatedOut) {
      const parts = [];

      if (page.kind === "collectionParent") {
        parts.push(renderCollectionBlockForParent(entry, page.children));
      } else if (page.kind === "collectionChild") {
        parts.push(renderCollectionBlockForChild(page.parent));
      }

      const seriesIndex = buildSeriesIndex(list);
      const pageRefs = getCurrentPageRefs({ kind: page.kind, idParam: idParam, uidParam: uidParam, entry });
      const seriesList = getSeriesForCurrentPage(pageRefs, seriesIndex);

      let canonicalKey = "";
      if (page.kind === "collectionChild") canonicalKey = `c:${page.idParam}|u:${page.uidParam}`;
      else if (entry?.id) canonicalKey = `id:${String(entry.id).trim()}`;
      else canonicalKey = `uid:${String(entry.uid).trim()}`;

      parts.push(renderSeriesBlocks(seriesList, list, canonicalKey));

      relatedOut.innerHTML = parts.filter(Boolean).join("");
    }

    const mainInfoBox = document.getElementById("mainInfoBox");
    const descInnerBox = document.getElementById("descInnerBox");
    const descTextEl = document.getElementById("descriptionText");

    const description = (entry.description || "").trim();

    if (mainInfoBox) {
      const hasTags =
        Array.isArray(display.tags || entry.tags) &&
        (display.tags || entry.tags).length > 0;

      const hasDesc = !!description;

      if (descTextEl) {
        descTextEl.innerHTML = hasDesc ? escapeHtml(description).replace(/\n/g, "<br>") : "";
      }

      if (descInnerBox) {
        descInnerBox.style.display = hasDesc ? "" : "none";
      }

      mainInfoBox.style.display = (hasTags || hasDesc) ? "" : "none";
    }

    const videoAnchor =
      (relatedOut && relatedOut.innerHTML.trim())
        ? relatedOut
        : mainInfoBox;

    const videoHost = ensureBlockAfter(videoAnchor, "videoHost");
    renderVideoBlock({
      id: "videoHost",
      videoUrl: (entry.videoUrl || "").trim(),
    });

    setHref("btnDiscord", (entry.discordlink || "").trim());
    if ($("btnDiscord")) {
      $("btnDiscord").textContent = "💬 Discord";
      $("btnDiscord").classList.add("btn-discord");
    }

    setHref("btnF95", (entry.url || "").trim());
    if ($("btnF95")) {
      $("btnF95").innerHTML = '<span class="f95-logo"><span class="f95-white">F95</span><span class="f95-red">Zone</span></span>';
      $("btnF95").classList.add("btn-f95");
    }

    const megaHref = (entry.translation || "").trim();
    const archiveHref = (entry.translationsArchive || "").trim();
    const translationType = String(entry.translationType || "").trim().toLowerCase();

    function getTranslationTypeMeta(typeValue) {
      const t = String(typeValue || "").trim().toLowerCase();
      if (t === "auto rapide") {
        return { title: "⚡ Traduction auto", note: "Version pour essayer vite fait !" };
      }
      if (t === "auto avec correction") {
        return { title: "🤖 Traduction automatique avec correction", note: "Version pré-corrigée en automatique." };
      }
      if (t === "auto avec relecture") {
        return { title: "👀 Traduction automatique avec relecture", note: "Version pré-relue manuellement." };
      }
      if (t === "manuel - humaine") {
        return { title: "✍️ Traduction manuelle", note: "Version humaine." };
      }
      if (t === "vo française") {
        return { title: "🇫🇷 Version française", note: "Français inclus de base." };
      }
      if (t === "a tester") {
        return { title: "🧪 Version à tester", note: "À vérifier" };
      }
      return null;
    }

    const mainTranslationTypeMeta = getTranslationTypeMeta(translationType);
    const isMainQuickAuto = !!mainTranslationTypeMeta;

    setHref("btnMega", megaHref);
    if ($("btnMega")) $("btnMega").textContent = "📥 Télécharger la traduction · MEGA";

    function getHostClass(url){
      const u = (url || "").toLowerCase();
      if (u.includes("mega.nz")) return "btnMega";
      if (u.includes("f95zone")) return "btn-f95";
      if (u.includes("drive.google")) return "btn-host-drive";
      if (u.includes("gofile")) return "btn-host-gofile";
      return "btn-host-default";
    }

    function getHostLabel(url, fallbackName = "Lien") {
      const hostCls = getHostClass(url);
      if (hostCls === "btnMega") return "MEGA";
      if (hostCls === "btn-host-gofile") return "Gofile";
      if (hostCls === "btn-host-drive") return "Google Drive";
      if (hostCls === "btn-f95") return "F95Zone";
      return String(fallbackName || "Lien").trim() || "Lien";
    }

    function createQuickAutoTile(link, fallbackName, extraClassName = "extraLinkBtn") {
      const hostCls = getHostClass(link);
      const tile = document.createElement("div");
      tile.className = `${extraClassName} quickAutoTile`;

      const tileMeta = getTranslationTypeMeta(fallbackName) || getTranslationTypeMeta("auto rapide") || {
        title: "⚡ Traduction auto",
        note: "Version pour essayer vite fait !"
      };

      const title = document.createElement("div");
      title.className = "quickAutoTitleRow";
      title.textContent = tileMeta.title;

      const a = document.createElement("a");
      a.className = `btnLike ${hostCls} extraLinkBtn`;
      a.target = "_blank";
      a.rel = "noopener";
      a.href = link;
      a.style.width = "auto";
      a.style.margin = "0 auto";
      a.style.justifyContent = "center";
      a.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        return false;
      });

      const quickHostLabel = getHostLabel(link, fallbackName);
      if (hostCls === "btn-f95") {
        a.innerHTML = `📥 Télécharger la traduction · <span class="f95-logo"><span class="f95-white">F95</span><span class="f95-red">Zone</span></span>`;
      } else {
        a.textContent = `📥 Télécharger la traduction · ${quickHostLabel}`;
      }

      const note = document.createElement("div");
      note.className = "quickAutoSub";
      note.textContent = tileMeta.note;

      tile.appendChild(title);
      tile.appendChild(a);
      tile.appendChild(note);
      return tile;
    }

    const extraRaw = entry.translationsExtra;
    const extraList = Array.isArray(extraRaw) ? extraRaw : (extraRaw ? [extraRaw] : []);
    const extraValid = extraList
      .map(x => {
        if (!x) return null;
        if (typeof x === "string") {
          const u = x.trim();
          return u ? { name: "Lien", link: u } : null;
        }
        if (typeof x !== "object") return null;
        const name = String(x.name || "Lien").trim();
        const link = String(x.link || x.url || "").trim();
        return link ? { name, link } : null;
      })
      .filter(Boolean);

    const hasQuickAutoExtra = extraValid.some(x => String(x.name || "").trim().toLowerCase() === "traduction auto rapide");

    const megaRow = document.querySelector(".btnMainRow");
    const megaBtn = document.getElementById("btnMega");

    if (hasQuickAutoExtra && megaBtn) {
      megaBtn.removeAttribute("href");
      megaBtn.style.display = "none";
    }

    const megaHrefNow = (megaBtn && megaBtn.getAttribute("href")) ? megaBtn.getAttribute("href").trim() : "";
    const hasMega  = !!megaHrefNow;
    const hasExtra = extraValid.length > 0;

    if (megaRow) {
      [...megaRow.querySelectorAll(".extraLinkBtn")].forEach(el => el.remove());
      const oldWrap = megaRow.querySelector(".extraLinksCol");
      if (oldWrap) oldWrap.remove();
      const oldMainQuickAutoTile = megaRow.querySelector(".mainQuickAutoTile");
      if (oldMainQuickAutoTile) oldMainQuickAutoTile.remove();

      if (!hasMega && !hasExtra) {
        megaRow.style.display = "none";
      } else {
        megaRow.style.display = "flex";

        const needsColumnLayout = hasExtra || (hasMega && isMainQuickAuto);

        if (!needsColumnLayout) {
          megaRow.style.flexDirection = "row";
          megaRow.style.flexWrap = "wrap";
          megaRow.style.gap = "0";
          megaRow.style.alignItems = "center";
          megaRow.style.justifyContent = "center";

          if (megaBtn) {
            megaBtn.style.width = "auto";
            megaBtn.style.margin = "0 auto";
          }
        } else {
          megaRow.style.flexDirection = "column";
          megaRow.style.flexWrap = "nowrap";
          megaRow.style.gap = "10px";
          megaRow.style.alignItems = "center";
          megaRow.style.justifyContent = "flex-start";

          if (megaBtn) {
            megaBtn.style.width = "auto";
            megaBtn.style.margin = "0 auto";
          }

          if (hasMega && isMainQuickAuto && megaBtn && megaBtn.style.display !== "none") {
            const mainTile = document.createElement("div");
            mainTile.className = "mainQuickAutoTile quickAutoTile";

            const title = document.createElement("div");
            title.className = "quickAutoTitleRow";
            title.textContent = mainTranslationTypeMeta.title;

            const note = document.createElement("div");
            note.className = "quickAutoSub";
            note.textContent = mainTranslationTypeMeta.note;

            mainTile.appendChild(title);
            mainTile.appendChild(megaBtn);
            mainTile.appendChild(note);
            megaRow.appendChild(mainTile);
          }

          if (hasExtra) {
            const wrap = document.createElement("div");
            wrap.className = "extraLinksCol";
            wrap.style.display = "flex";
            wrap.style.flexDirection = "column";
            wrap.style.gap = "10px";
            wrap.style.alignItems = "center";
            wrap.style.width = "auto";

            megaRow.appendChild(wrap);

            extraValid.forEach((x) => {
              const name = String(x.name || "Lien").trim();
              const link = String(x.link || "").trim();
              const hostCls = getHostClass(link);
              const isQuickAuto = name.toLowerCase() === "traduction auto rapide";

              if (isQuickAuto) {
                wrap.appendChild(createQuickAutoTile(link, name));
                return;
              }

              const a = document.createElement("a");
              a.className = `btnLike ${hostCls} extraLinkBtn`;
              a.target = "_blank";
              a.rel = "noopener";
              a.href = link;

              a.style.width = "auto";
              a.style.margin = "0 auto";
              a.style.justifyContent = "center";

              if (name.toLowerCase() === "patch") {
                a.textContent = "📥 Télécharger · Patch";
              } else {
                if (hostCls === "btn-f95" && /f95\s*zone/i.test(name)) {
                  a.innerHTML = `📥 Télécharger la traduction · <span class="f95-logo"><span class="f95-white">F95</span><span class="f95-red">Zone</span></span>`;
                } else {
                  a.textContent = `📥 Télécharger la traduction · ${name}`;
                }
              }

              wrap.appendChild(a);
            });
          }
        }
      }
    }


    const notes = (entry.notes || "").trim();
    if (notes) {
      setHtml("notesText", escapeHtml(notes).replace(/\n/g, "<br>"));
      show("notesBox", true);
    } else {
      show("notesBox", false);
    }

    setHref("archiveLink", archiveHref);
    if ($("archiveLink")) $("archiveLink").textContent = "📦 Archives de la traduction";

    const ab = $("archiveBox");
    if (ab) ab.style.display = archiveHref ? "flex" : "none";

    const archiveLink = document.getElementById("archiveLink");
    if (archiveLink) {
      archiveLink.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        return false;
      });
    }

    // ✅ key unique uid-only
    const analyticsKey = counterKey;

    setStatMeta(entry);

    // ✅ IMPORTANT : initCounters après création des extraLinkBtn → maintenant ça compte aussi
    await initCounters(counterKey, megaHref, archiveHref);

    const btnMega2 = document.getElementById("btnMega");
    if (btnMega2) {
      btnMega2.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        return false;
      });
    }

    setStatRating(0, 0);
    try {
      const j = await rating4Get(analyticsKey);
      if (j?.ok) renderRating4UI(analyticsKey, j);
    } catch {}

    try {
      if (window.GameRelated && typeof window.GameRelated.render === "function") {
        await window.GameRelated.render({
          list,
          page,
          entry,
          display,
          currentTitle: title,
          buildGameUrl,
          getDisplayTitle
        });
      }
    } catch (e) {
      console.warn("GameRelated.render failed", e);
    }

  } catch (e) {
    showError(`Erreur: ${e?.message || e}`);
  }
})();