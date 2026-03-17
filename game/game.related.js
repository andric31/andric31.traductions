"use strict";

(function(){
  function slug(s){
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function escapeHtml(s){
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }


  const CAT_ALLOWED = ['Collection', 'VN'];
  const ENGINE_ALLOWED = ["Ren'Py", 'RPGM', 'Unity', 'HTML', 'Flash', 'Unreal Engine', 'Wolf RPG', 'Others'];
  const STATUS_ALLOWED = ['Completed', 'Abandoned', 'Onhold', 'En cours'];
  const ENGINE_RAW = {
    "ren'py": "Ren'Py",
    renpy: "Ren'Py",
    rpgm: 'RPGM',
    unity: 'Unity',
    html: 'HTML',
    flash: 'Flash',
    unreal: 'Unreal Engine',
    'unreal-engine': 'Unreal Engine',
    wolf: 'Wolf RPG',
    'wolf-rpg': 'Wolf RPG',
    others: 'Others',
    other: 'Others',
  };
  const SEP_RE = /\s*[\[\(\{\|\-–—:]/;

  function ucFirst(s){
    const t = String(s || '').trim().toLowerCase();
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
  }

  function formatInt(n){
    const x = Number(n);
    if (!Number.isFinite(x)) return "0";
    try { return x.toLocaleString("fr-FR"); } catch { return String(Math.floor(x)); }
  }

  function parseDateTs(v){
    if (!v) return 0;
    const t = Date.parse(String(v));
    return Number.isFinite(t) ? t : 0;
  }

  function formatRelativeTranslationTime(ts) {
    const t = Number(ts || 0);
    if (!Number.isFinite(t) || t <= 0) return "—";
    let delta = Date.now() - t;
    if (!Number.isFinite(delta) || delta < 0) delta = 0;
    const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR, WEEK = 7 * DAY, MONTH = 30 * DAY, YEAR = 365 * DAY;
    if (delta < MIN) return "à l’instant";
    if (delta < HOUR) return `${Math.max(1, Math.floor(delta / MIN))} min`;
    if (delta < DAY) return `${Math.max(1, Math.floor(delta / HOUR))} h`;
    if (delta < WEEK) return `${Math.max(1, Math.floor(delta / DAY))} j`;
    if (delta < 5 * WEEK) return `${Math.max(1, Math.floor(delta / WEEK))} sem`;
    if (delta < YEAR) return `${Math.max(1, Math.floor(delta / MONTH))} mois`;
    const n = Math.max(1, Math.floor(delta / YEAR));
    return `${n} an${n > 1 ? "s" : ""}`;
  }

  function formatAbsoluteDateTime(ts) {
    const t = Number(ts || 0);
    if (!Number.isFinite(t) || t <= 0) return "Date de traduction inconnue";
    try {
      return new Date(t).toLocaleString("fr-FR", { year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" });
    } catch {
      return new Date(t).toISOString();
    }
  }

  function formatRatingForCard(avg, count) {
    const a = Number(avg || 0), c = Number(count || 0);
    if (c <= 0 || a <= 0) return "—";
    const rounded = Math.round(a * 10) / 10;
    return `${Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)}/4`;
  }

  function getDisplayData(g){
    return g && g.gameData ? g.gameData : g || {};
  }

  function getTags(g){
    const d = getDisplayData(g);
    const raw = Array.isArray(d.tags) ? d.tags : Array.isArray(g?.tags) ? g.tags : [];
    return [...new Set(raw.map(x => String(x || "").trim().toLowerCase()).filter(Boolean))];
  }


  function getAuthorFromEntry(g){
    const d = getDisplayData(g);
    const source = String(g?.cleanTitle || d.cleanTitle || d.title || g?.title || '').trim();
    if (!source) return '';
    const matches = [...source.matchAll(/\[([^\]]+)\]/g)];
    if (!matches.length) return '';
    const last = String(matches[matches.length - 1][1] || '').trim();
    if (!last) return '';
    if (/^v(?:ersion)?/i.test(last)) return '';
    return last;
  }


  function cleanTitleParts(raw){
    let t = String(raw || '').trim();
    let categories = [];
    let engines = [];
    let status = null;
    let othersExplicit = false;

    if (/^collection\b/i.test(t)) {
      categories.push('Collection');
      t = t.replace(/^collection[ :\-]*/i, '').trim();
    }

    const head = t.split(SEP_RE)[0];
    const tokens = head.split(/[\s/|,]+/).filter(Boolean);
    let cut = 0;

    for (let i = 0; i < tokens.length; i++) {
      const wRaw = tokens[i];
      const w = wRaw.toLowerCase();
      const norm = w.replace(/[^\w']/g, '');

      if (norm === 'vn') {
        if (!categories.includes('VN')) categories.push('VN');
        cut = i + 1;
        continue;
      }

      if (norm === 'wolf' && tokens[i + 1] && tokens[i + 1].toLowerCase().replace(/[^\w']/g, '') === 'rpg') {
        if (!engines.includes('Wolf RPG')) engines.push('Wolf RPG');
        cut = i + 2;
        i++;
        continue;
      }

      if (norm === 'wolf') break;

      if (norm === 'flash') {
        cut = i + 1;
        continue;
      }

      if (norm === 'others' || norm === 'other') {
        if (!engines.includes('Others')) engines.push('Others');
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

      if (w === '&' || w === 'and' || w === '/') {
        cut = i + 1;
        continue;
      }

      break;
    }

    if (cut > 0) {
      const headSlice = tokens.slice(0, cut).join(' ');
      t = t.slice(headSlice.length).trim();
      t = t.replace(/^[\u2014\u2013\-:|]+/, '').trim();
    }

    if (!status) status = 'En cours';

    categories = categories.filter((c) => CAT_ALLOWED.includes(c));
    engines = engines.filter((e) => ENGINE_ALLOWED.includes(e));

    if (!othersExplicit && engines.includes('Others') && engines.some((e) => e !== 'Others')) {
      engines = engines.filter((e) => e !== 'Others');
    }

    return { title: t, categories, engines, status };
  }

  function getBadgeParts(g){
    const d = getDisplayData(g);
    const rawTitle = String(d.title || g?.title || '').trim();
    const parsed = cleanTitleParts(rawTitle);
    return {
      categories: Array.isArray(parsed.categories) ? parsed.categories : [],
      engines: Array.isArray(parsed.engines) ? parsed.engines : [],
      status: parsed.status || 'En cours'
    };
  }

  function titleWords(g){
    const d = getDisplayData(g);
    const raw = String(d.title || g?.cleanTitle || g?.title || "").toLowerCase();
    return [...new Set(raw
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/[^a-z0-9 ]+/g, ' ')
      .split(/\s+/)
      .map(x => x.trim())
      .filter(x => x && x.length >= 4 && !['others','unity','renpy','collection','completed','ongoing','abandoned','onhold','flash','html'].includes(x))
    )];
  }

  function intersectCount(a,b){
    const bs = new Set(b); let n=0; for (const x of a) if (bs.has(x)) n++; return n;
  }

  function getCanonicalKey(g){
    const id = String(g?.id || "").trim();
    const uid = String(g?.uid || "").trim();
    const coll = String(g?.collection || "").trim();
    if (coll && uid) return `c:${coll}|u:${uid}`;
    if (id) return `id:${id}`;
    if (uid) return `uid:${uid}`;
    return '';
  }

  function isSameUniverse(a,b){
    const aId = String(a?.id || "").trim();
    const bId = String(b?.id || "").trim();
    const aColl = String(a?.collection || "").trim();
    const bColl = String(b?.collection || "").trim();
    if (!a || !b) return false;
    if (getCanonicalKey(a) === getCanonicalKey(b)) return true;
    if (aId && bColl && aId === bColl) return true;
    if (bId && aColl && bId === aColl) return true;
    if (aColl && bColl && aColl === bColl) return true;
    return false;
  }

  function computeScore(base, candidate){
    const baseTags = getTags(base);
    const candTags = getTags(candidate);
    const tagMatches = intersectCount(baseTags, candTags);
    if (!tagMatches) return 0;
    const baseWords = titleWords(base);
    const candWords = titleWords(candidate);
    const wordMatches = intersectCount(baseWords, candWords);
    let score = tagMatches * 100;
    score += Math.min(30, candTags.length);
    score += Math.min(25, tagMatches * 5);
    score += wordMatches * 8;
    const bp = getBadgeParts(base), cp = getBadgeParts(candidate);
    const be = Array.isArray(bp.engines) ? bp.engines : [];
    const ce = Array.isArray(cp.engines) ? cp.engines : [];
    if (be.some((e) => ce.includes(e))) score += 20;
    const bc = Array.isArray(bp.categories) ? bp.categories : [];
    const cc = Array.isArray(cp.categories) ? cp.categories : [];
    if (bc.some((c) => cc.includes(c))) score += 10;
    return score;
  }

  function buildCounterKeyFromEntry(entry){
    const uid = String(entry?.uid ?? "").trim();
    return uid ? `uid:${uid}` : "";
  }

  function getLastTranslationTs(g){
    const d = getDisplayData(g);
    return parseDateTs(d.updatedAtLocal) || parseDateTs(d.createdAtLocal) || parseDateTs(d.updatedAt) || 0;
  }

  function badgeHtml(text, type){
    const cls = type ? ` badge ${type}` : ' badge';
    return `<span class="${cls.trim()}">${escapeHtml(text)}</span>`;
  }


  function badgesLineHtml(g) {
    const out = [];
    const parts = getBadgeParts(g);
    const cats = Array.isArray(parts.categories) ? parts.categories : [];
    const engs = Array.isArray(parts.engines) ? parts.engines : [];

    for (const cat of cats) {
      if (CAT_ALLOWED.includes(cat)) out.push(badgeHtml(cat, `cat cat-${slug(cat)}`));
    }
    for (const eng of engs) {
      if (ENGINE_ALLOWED.includes(eng)) out.push(badgeHtml(eng, `eng eng-${slug(eng)}`));
    }
    if (parts.status) out.push(badgeHtml(parts.status, `status status-${slug(parts.status)}`));
    return out.join(' ');
  }

  const STATS_CACHE = new Map();
  const RATING_CACHE = new Map();

  async function fetchStats(counterKey){
    if (!counterKey) return { views:0, mega:0, likes:0 };
    if (STATS_CACHE.has(counterKey)) return STATS_CACHE.get(counterKey);
    const p = (async () => {
      try {
        const r = await fetch(`/api/counter?op=get&id=${encodeURIComponent(counterKey)}`, { cache: 'no-store' });
        if (!r.ok) throw new Error(String(r.status));
        const j = await r.json();
        return { views:Number(j?.views||0), mega:Number(j?.mega||0), likes:Number(j?.likes||0) };
      } catch {
        return { views:0, mega:0, likes:0 };
      }
    })();
    STATS_CACHE.set(counterKey, p);
    return p;
  }

  async function fetchRating(counterKey){
    if (!counterKey) return { avg:0, count:0 };
    if (RATING_CACHE.has(counterKey)) return RATING_CACHE.get(counterKey);
    const p = (async () => {
      try {
        const r = await fetch(`/api/rating4?op=get&id=${encodeURIComponent(counterKey)}`, { cache: 'no-store' });
        if (!r.ok) throw new Error(String(r.status));
        const j = await r.json();
        if (!j?.ok) return { avg:0, count:0 };
        return { avg:Number(j.avg || 0), count:Number(j.count || 0) };
      } catch {
        return { avg:0, count:0 };
      }
    })();
    RATING_CACHE.set(counterKey, p);
    return p;
  }

  const HOVER_GALLERY = {
    cache: new Map(),
    inflight: new Map(),
    timers: new WeakMap(),
    activeToken: new WeakMap(),
    baseSrc: new WeakMap(),
    baseFallback: new WeakMap(),
    preload: new Map(),
  };

  function normalizeF95MediaKey(url) {
    const u = String(url || "").trim();
    if (!u) return "";
    try {
      const x = new URL(u, location.origin);
      const host = (x.hostname || "").toLowerCase();
      let path = (x.pathname || "").replace(/\\/g, "/");
      if (host === "preview.f95zone.to" || host === "attachments.f95zone.to") {
        path = path.replace(/^\/(\d{4})\/(\d{2})\/(thumb\/)?/i, "/");
        return path.toLowerCase();
      }
      return `${host}${path}`.toLowerCase();
    } catch {
      return String(url || "").trim().replace(/[?#].*$/, "").toLowerCase();
    }
  }

  function galleryUrlKey(url) {
    return normalizeF95MediaKey(url);
  }

  function sameImageUrl(a, b) {
    const aa = String(a || "").trim();
    const bb = String(b || "").trim();
    if (!aa || !bb) return false;
    const ka = normalizeF95MediaKey(aa);
    const kb = normalizeF95MediaKey(bb);
    if (ka && kb) return ka === kb;
    return aa === bb;
  }

  function preloadImage(url) {
    const u = String(url || '').trim();
    if (!u) return Promise.resolve();
    if (HOVER_GALLERY.preload.has(u)) return HOVER_GALLERY.preload.get(u);
    const p = new Promise((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.loading = 'eager';
      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = u;
    });
    HOVER_GALLERY.preload.set(u, p);
    return p;
  }

  function buildF95GalleryApiUrl(rawUrl) {
    const u = String(rawUrl || "").trim();
    return u ? `/api/f95gallery?url=${encodeURIComponent(u)}` : "";
  }

  function dedupKeepOrder(arr) {
    const out = [];
    const seen = new Set();
    for (const raw of Array.isArray(arr) ? arr : []) {
      const u = String(raw || "").trim();
      if (!u) continue;
      const k = galleryUrlKey(u);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(u);
    }
    return out;
  }

  async function loadHoverGallery(rawEntry, fallbackUrl) {
    const d = getDisplayData(rawEntry);
    const apiUrl = buildF95GalleryApiUrl(d.url || rawEntry?.url || "");
    const base = String(fallbackUrl || '').trim();
    if (!apiUrl) return base ? [base] : [];
    if (HOVER_GALLERY.cache.has(apiUrl)) return HOVER_GALLERY.cache.get(apiUrl);
    if (HOVER_GALLERY.inflight.has(apiUrl)) return HOVER_GALLERY.inflight.get(apiUrl);
    const p = (async () => {
      try {
        const r = await fetch(apiUrl, { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        const raw = Array.isArray(data?.gallery) ? data.gallery : [];
        const cleaned = [];
        const seen = new Set();
        const baseKey = normalizeF95MediaKey(base);
        if (base) {
          seen.add(baseKey || base);
          cleaned.push(base);
        }
        for (const item of raw) {
          const u = String(item || '').trim();
          if (!u) continue;
          const key = normalizeF95MediaKey(u) || u;
          if (base && sameImageUrl(u, base)) continue;
          if (seen.has(key)) continue;
          seen.add(key);
          cleaned.push(u);
        }
        const out = cleaned.length ? cleaned : (base ? [base] : []);
        HOVER_GALLERY.cache.set(apiUrl, out);
        return out;
      } catch {
        const out = base ? [base] : [];
        HOVER_GALLERY.cache.set(apiUrl, out);
        return out;
      } finally {
        HOVER_GALLERY.inflight.delete(apiUrl);
      }
    })();
    HOVER_GALLERY.inflight.set(apiUrl, p);
    return p;
  }

  function setCardImage(img, src, isFallback) {
    if (!img) return;
    img.src = src || "/favicon.png";
    img.classList.toggle("is-fallback", !!isFallback);
  }

  function stopCardHoverSlideshow(card) {
    const timer = HOVER_GALLERY.timers.get(card);
    if (timer) clearInterval(timer);
    HOVER_GALLERY.timers.delete(card);
    const img = card?.querySelector(".similarThumb");
    const baseSrc = HOVER_GALLERY.baseSrc.get(card) || "";
    const baseFallback = !!HOVER_GALLERY.baseFallback.get(card);
    setCardImage(img, baseSrc || "/favicon.png", baseFallback);
  }

  function bindCardHoverGallery(card, rawEntry, fallbackUrl) {
    const img = card?.querySelector(".similarThumb");
    if (!card || !img) return;
    const baseSrc = String(fallbackUrl || img.getAttribute("src") || "").trim() || "/favicon.png";
    const baseFallback = !baseSrc || /\/favicon\.png$/i.test(baseSrc);
    HOVER_GALLERY.baseSrc.set(card, baseSrc);
    HOVER_GALLERY.baseFallback.set(card, baseFallback);

    card.addEventListener("mouseleave", () => {
      HOVER_GALLERY.activeToken.set(card, null);
      stopCardHoverSlideshow(card);
    });

    card.addEventListener("mouseenter", async () => {
      stopCardHoverSlideshow(card);
      const token = Symbol("hoverGallery");
      HOVER_GALLERY.activeToken.set(card, token);
      const fetched = await loadHoverGallery(rawEntry, baseSrc);
      if (HOVER_GALLERY.activeToken.get(card) !== token) return;
      const baseKey = galleryUrlKey(baseSrc);
      const urls = dedupKeepOrder([baseSrc, ...fetched.filter((u) => galleryUrlKey(u) !== baseKey)]);
      if (urls.length <= 1) {
        setCardImage(img, baseSrc, baseFallback);
        return;
      }
      let idx = 0;
      if (urls.length > 1 && galleryUrlKey(urls[0]) === baseKey) idx = 1;
      setCardImage(img, urls[idx], false);
      preloadImage(urls[(idx + 1) % urls.length]);
      const timer = setInterval(() => {
        if (!card.matches(":hover")) {
          stopCardHoverSlideshow(card);
          return;
        }
        idx = (idx + 1) % urls.length;
        setCardImage(img, urls[idx], false);
        preloadImage(urls[(idx + 1) % urls.length]);
      }, 2000);
      HOVER_GALLERY.timers.set(card, timer);
    });
  }

  function enableHorizontalWheelScroll(el){
    if (!el || el.dataset.wheelBound === '1') return;
    el.dataset.wheelBound = '1';
    el.addEventListener('wheel', (e) => {
      const canScrollX = el.scrollWidth > el.clientWidth + 4;
      if (!canScrollX) return;
      const dx = Math.abs(e.deltaX), dy = Math.abs(e.deltaY);
      const delta = dx > dy ? e.deltaX : e.deltaY;
      if (!delta) return;
      e.preventDefault();
      el.scrollLeft += delta;
    }, { passive:false });
  }

  function prepareGridForReveal(grid){
    if (!grid) return;
    grid.classList.remove('is-ready');
    grid.classList.add('is-loading');
  }

  function revealGrid(grid){
    if (!grid) return;
    requestAnimationFrame(() => {
      grid.classList.remove('is-loading');
      grid.classList.add('is-ready');
    });
  }

  async function enrichPicked(picked){
    await Promise.all(picked.map(async (x) => {
      const counterKey = buildCounterKeyFromEntry(x.g);
      const [stats, rating] = await Promise.all([fetchStats(counterKey), fetchRating(counterKey)]);
      x.counterKey = counterKey;
      x.stats = stats;
      x.rating = rating;
      x.lastTranslationTs = getLastTranslationTs(x.g);
    }));
  }

  function buildCard(candidate, helpers, extra){
    const d = getDisplayData(candidate);
    const title = helpers.getDisplayTitle(candidate) || d.title || candidate.title || 'Sans titre';
    const href = helpers.buildGameUrl(candidate);
    const image = String(d.imageUrl || candidate.imageUrl || '/favicon.png').trim() || '/favicon.png';
    const ratingText = formatRatingForCard(extra?.rating?.avg, extra?.rating?.count);
    const translationText = formatRelativeTranslationTime(extra?.lastTranslationTs);
    const translationTitle = formatAbsoluteDateTime(extra?.lastTranslationTs);

    return `
      <a class="similarCard card card-link" href="${href}" target="_blank" rel="noopener" aria-label="Ouvrir : ${escapeHtml(title)}">
        <img class="similarThumb thumb" src="${escapeHtml(image)}" alt="" referrerpolicy="no-referrer"
             loading="lazy"
             onerror="this.onerror=null;this.src='/favicon.png';this.classList.add('is-fallback');">
        <div class="similarBody body">
          <h3 class="similarTitle name clamp-2">${escapeHtml(title)}</h3>
          <div class="similarBadges badges-line one-line">${badgesLineHtml(candidate)}</div>
          <div class="card-meta">
            <div class="card-stats" aria-label="Statistiques de la vignette">
              <span class="card-stat" title="${escapeHtml(translationTitle)}">
                <span class="stat-icon stat-icon-time" aria-hidden="true"></span>
                <span>${escapeHtml(translationText)}</span>
              </span>
              <span class="card-stat" title="Nombre de vues">
                <span class="stat-icon stat-icon-views" aria-hidden="true"></span>
                <span>${formatInt(extra?.stats?.views)}</span>
              </span>
              <span class="card-stat" title="Nombre de téléchargements">
                <span class="stat-icon stat-icon-downloads" aria-hidden="true"></span>
                <span>${formatInt(extra?.stats?.mega)}</span>
              </span>
              <span class="card-stat" title="Nombre de j'aime">
                <span class="stat-icon stat-icon-likes" aria-hidden="true"></span>
                <span>${formatInt(extra?.stats?.likes)}</span>
              </span>
              <span class="card-stat" title="Note étoile moyenne et nombre de votes">
                <span class="stat-icon stat-icon-rating" aria-hidden="true"></span>
                <span>${escapeHtml(ratingText)}</span>
              </span>
            </div>
          </div>
        </div>
      </a>
    `;
  }





  function buildGhostCards(count){
    const n = Math.max(0, Number(count) || 0);
    return Array.from({ length:n }, () => `
      <div class="similarCard similarGhostCard" aria-hidden="true">
        <div class="similarThumb similarGhostThumb"></div>
        <div class="similarBody">
          <div class="similarGhostLine similarGhostLineTitle"></div>
          <div class="similarGhostBadges">
            <span class="similarGhostPill"></span>
            <span class="similarGhostPill similarGhostPillShort"></span>
          </div>
          <div class="card-meta">
            <div class="card-stats">
              <span class="card-stat"><span class="stat-icon stat-icon-time" aria-hidden="true"></span><span>—</span></span>
              <span class="card-stat"><span class="stat-icon stat-icon-views" aria-hidden="true"></span><span>—</span></span>
              <span class="card-stat"><span class="stat-icon stat-icon-downloads" aria-hidden="true"></span><span>—</span></span>
            </div>
          </div>
        </div>
      </div>
    `).join('');
  }

  function getGhostFillCount(count, perRow){
    const total = Math.max(0, Number(count) || 0);
    const cols = Math.max(1, Number(perRow) || 1);
    const mod = total % cols;
    return mod === 0 ? 0 : (cols - mod);
  }
  function buildMoreCard(){
    return `
      <a class="similarCard similarMoreCard" href="https://andric31-traductions.pages.dev/" aria-label="Ouvrir la page principale Andric31 Traductions">
        <div class="similarMoreInner">
          <div class="similarMoreIcon" aria-hidden="true">✨</div>
          <h3 class="similarMoreTitle">Voir plus de jeux</h3>
          <p class="similarMoreText">Ouvre la page principale pour parcourir davantage de titres.</p>
        </div>
      </a>
    `;
  }
  async function render(ctx){
    const block = document.getElementById('similarGamesBlock');
    const grid = document.getElementById('similarGamesGrid');
    const sub = document.getElementById('similarGamesSub');
    const authorBlock = document.getElementById('sameAuthorBlock');
    const authorGrid = document.getElementById('sameAuthorGrid');
    const authorSub = document.getElementById('sameAuthorSub');
    if (!ctx?.list || !ctx?.entry) return;

    const current = ctx.entry;
    const currentTags = getTags(current);
    const currentKey = getCanonicalKey(current);

    let hasAnything = false;

    if (authorBlock && authorGrid) {
      const author = getAuthorFromEntry(current);
      if (!author) {
        authorBlock.style.display = 'none';
      } else {
        const normAuthor = slug(author);
        const authorPicked = (ctx.list || [])
          .filter(g => g && getCanonicalKey(g) !== currentKey && slug(getAuthorFromEntry(g)) === normAuthor)
          .sort((a,b) => {
            const ta = getLastTranslationTs(a), tb = getLastTranslationTs(b);
            if (tb !== ta) return tb - ta;
            return String(ctx.getDisplayTitle(a) || '').localeCompare(String(ctx.getDisplayTitle(b) || ''), 'fr');
          })
          .map(g => ({ g }));

        if (!authorPicked.length) {
          authorBlock.style.display = 'none';
        } else {
          prepareGridForReveal(authorGrid);
          await enrichPicked(authorPicked);
          const ghostCount = getGhostFillCount(authorPicked.length, 5);
          authorGrid.innerHTML = authorPicked.map(x => buildCard(x.g, ctx, x)).join('') + buildGhostCards(ghostCount);
          [...authorGrid.querySelectorAll('.similarCard')].forEach((card, idx) => {
            const item = authorPicked[idx];
            if (item) bindCardHoverGallery(card, item.g, String(getDisplayData(item.g).imageUrl || item.g.imageUrl || '/favicon.png').trim() || '/favicon.png');
          });
          if (authorSub) authorSub.textContent = author;
          authorBlock.style.display = '';
          revealGrid(authorGrid);
          hasAnything = true;
        }
      }
    }
    if (block && grid) {
      if (!currentTags.length) {
        block.style.display = 'none';
      } else {
        const picked = (ctx.list || [])
          .filter(g => g && !isSameUniverse(current, g))
          .map(g => ({ g, score: computeScore(current, g), matches: intersectCount(currentTags, getTags(g)) }))
          .filter(x => x.score > 0 && x.matches > 0)
          .sort((a,b) => (b.score - a.score) || (b.matches - a.matches) || String(ctx.getDisplayTitle(a.g) || '').localeCompare(String(ctx.getDisplayTitle(b.g) || ''), 'fr'))
          .slice(0, 9);

        if (!picked.length) {
          block.style.display = 'none';
        } else {
          prepareGridForReveal(grid);
          await enrichPicked(picked);
          grid.innerHTML = picked.map(x => buildCard(x.g, ctx, x)).join('') + buildMoreCard();
          [...grid.querySelectorAll('.similarCard')].forEach((card, idx) => {
            const item = picked[idx];
            if (item) bindCardHoverGallery(card, item.g, String(getDisplayData(item.g).imageUrl || item.g.imageUrl || '/favicon.png').trim() || '/favicon.png');
          });

          const maxMatches = Math.max(...picked.map(x => x.matches), 0);
          if (sub) {
            sub.textContent = maxMatches > 1
              ? `Basé sur les tags les plus proches · jusqu’à ${maxMatches} tags en commun`
              : 'Basé sur les tags les plus proches';
          }
          block.style.display = '';
          revealGrid(grid);
          hasAnything = true;
        }
      }
    }



    if (!hasAnything && block) block.style.display = 'none';
  }

  window.GameRelated = { render };
})();
