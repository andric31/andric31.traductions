(() => {
  'use strict';

  const WATCHLIST_ICON = '<span class="account-watchlist-icon" aria-hidden="true"><svg viewBox="0 0 24 24" role="img" aria-hidden="true"><path d="M7 3.5h10a1 1 0 0 1 1 1v16.2l-6-3.9-6 3.9V4.5a1 1 0 0 1 1-1z" fill="none" stroke="#ff7a00" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';
  const DEFAULT_LIST_URL = 'https://raw.githubusercontent.com/andric31/f95list/main/f95list.json';

  const $ = (sel) => document.querySelector(sel);
  const els = {
    guest: $('#accountGamesGuest'),
    app: $('#accountGamesApp'),
    user: $('#accountGamesUser'),
    grid: $('#accountGamesGrid'),
    status: $('#accountGamesStatus'),
    search: $('#accountGamesSearch'),
    sort: $('#accountGamesSort'),
    refresh: $('#accountGamesRefresh'),
    total: $('#statTotal'),
    watch: $('#statWatch'),
    likes: $('#statLikes'),
    notes: $('#statNotes'),
    tabs: Array.from(document.querySelectorAll('[data-account-tab]')),
  };

  const state = {
    me: null,
    currentTab: new URLSearchParams(location.search).get('tab') || (location.hash || '#all').replace('#','') || 'all',
    q: '',
    sort: 'translationDate',
    items: [],
    loading: false,
  };

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setStatus(text, isErr = false) {
    if (!els.status) return;
    els.status.textContent = text || '';
    els.status.classList.toggle('err', !!isErr);
  }

  function normalizeGameUrl(url) {
    const u = String(url || '').trim();
    if (!u) return '#';
    try {
      const parsed = new URL(u, location.origin);
      return parsed.pathname + parsed.search + parsed.hash;
    } catch { return u; }
  }

  function formatDate(value) {
    if (!value) return '';
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) return '';
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function parseIsoDateTime(value) {
    const raw = String(value || '').trim();
    if (!raw) return 0;
    const d = new Date(raw);
    return Number.isFinite(d.getTime()) ? d.getTime() : 0;
  }

  function parseFrenchDate(value) {
    const raw = String(value || '').trim();
    if (!raw) return 0;
    const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
    if (!m) return parseIsoDateTime(raw);
    const day = Number(m[1]);
    const month = Number(m[2]) - 1;
    const year = Number(m[3]);
    const hour = Number(m[4] || 0);
    const minute = Number(m[5] || 0);
    const d = new Date(year, month, day, hour, minute, 0, 0);
    return Number.isFinite(d.getTime()) ? d.getTime() : 0;
  }

  function cleanTitleKey(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  function getUrlKeys(value) {
    const keys = [];
    const raw = String(value || '').trim();
    if (!raw) return keys;
    keys.push(raw);
    try {
      const u = new URL(raw, location.origin);
      keys.push(u.pathname + u.search + u.hash);
      keys.push(u.href);
      const id = u.searchParams.get('id');
      const uid = u.searchParams.get('uid');
      if (id) keys.push(id);
      if (uid) keys.push(uid);
      if (id && uid) keys.push(`${id}::${uid}`);
    } catch {}
    return keys.filter(Boolean);
  }

  function addCatalogKey(map, key, info) {
    const k = String(key || '').trim();
    if (!k) return;
    if (!map.has(k)) map.set(k, info);
    const t = cleanTitleKey(k);
    if (t && !map.has(`title:${t}`)) map.set(`title:${t}`, info);
  }

  function translationDateOfGame(game) {
    return (
      parseIsoDateTime(game.updatedAtLocal) ||
      parseIsoDateTime(game.createdAtLocal) ||
      parseFrenchDate(game.updatedAt) ||
      parseIsoDateTime(game.updatedAtDateTime) ||
      parseIsoDateTime(game.createdAtDateTime) ||
      0
    );
  }

  function buildCatalogIndex(list) {
    const map = new Map();
    (Array.isArray(list) ? list : []).forEach((game) => {
      if (!game || typeof game !== 'object') return;
      const title = game.gameData?.title || game.cleanTitle || game.title || '';
      const info = {
        translationDateTs: translationDateOfGame(game),
        translationDateRaw: game.updatedAtLocal || game.createdAtLocal || game.updatedAt || '',
        title,
        image_url: game.gameData?.imageUrl || game.imageUrl || '',
        f95_url: game.url || game.threadUrl || '',
        discord_url: game.discordlink || game.discord_url || '',
      };

      [
        game.uid,
        game.id,
        game.collection,
        game.game_key,
        title,
        game.title,
        game.cleanTitle,
        game.url,
        game.threadUrl,
        game.discordlink,
      ].forEach((key) => addCatalogKey(map, key, info));

      getUrlKeys(game.url).forEach((key) => addCatalogKey(map, key, info));
      getUrlKeys(game.threadUrl).forEach((key) => addCatalogKey(map, key, info));

      const coll = String(game.collection || '').trim();
      const uid = String(game.uid || '').trim();
      if (coll && uid) addCatalogKey(map, `${coll}::${uid}`, info);
    });
    return map;
  }

  async function loadTranslationCatalog() {
    try {
      const resp = await fetch(DEFAULT_LIST_URL, { cache: 'no-store' });
      if (!resp.ok) return new Map();
      const data = await resp.json().catch(() => []);
      return buildCatalogIndex(Array.isArray(data) ? data : []);
    } catch {
      return new Map();
    }
  }

  function findCatalogInfo(index, item) {
    if (!index || !index.size || !item) return null;
    const keys = [
      item.game_key,
      item.key,
      item.title,
      item.game_url,
      item.f95_url,
      item.discord_url,
    ];
    getUrlKeys(item.game_url).forEach((key) => keys.push(key));
    getUrlKeys(item.f95_url).forEach((key) => keys.push(key));
    getUrlKeys(item.discord_url).forEach((key) => keys.push(key));
    for (const key of keys) {
      const raw = String(key || '').trim();
      if (!raw) continue;
      const direct = index.get(raw);
      if (direct) return direct;
      const title = cleanTitleKey(raw);
      if (title) {
        const byTitle = index.get(`title:${title}`);
        if (byTitle) return byTitle;
      }
    }
    return null;
  }

  function enrichWithTranslationDates(items, catalogIndex) {
    if (!catalogIndex || !catalogIndex.size) return items;
    return items.map((item) => {
      const info = findCatalogInfo(catalogIndex, item);
      if (!info) return item;
      return {
        ...item,
        translationDateTs: info.translationDateTs || item.translationDateTs || 0,
        translationDateRaw: info.translationDateRaw || item.translationDateRaw || '',
        image_url: item.image_url || info.image_url || '',
        f95_url: item.f95_url || info.f95_url || '',
        discord_url: item.discord_url || info.discord_url || '',
      };
    });
  }

  async function fetchJson(url, options = {}) {
    const resp = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...options });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data?.ok) throw new Error(data?.error || 'Erreur de chargement.');
    return data;
  }

  function mergeItem(map, raw, source) {
    const key = String(raw.game_key || raw.id || raw.game_url || raw.title || '').trim();
    if (!key) return;
    const old = map.get(key) || {
      key,
      game_key: raw.game_key || key,
      title: '', game_url: '', image_url: '', f95_url: '', discord_url: '',
      watchlist: false, liked: false, rating: 0,
      watchDate: '', likedDate: '', ratedDate: '', updatedDate: '', translationDateTs: 0, translationDateRaw: '',
    };

    old.title = old.title || raw.title || 'Jeu sans titre';
    old.game_url = old.game_url || raw.game_url || '';
    old.image_url = old.image_url || raw.image_url || '';
    old.f95_url = old.f95_url || raw.f95_url || '';
    old.discord_url = old.discord_url || raw.discord_url || '';

    if (source === 'watchlist') {
      old.watchlist = true;
      old.watchId = raw.id || old.watchId || '';
      old.watchDate = raw.created_at || raw.updated_at || old.watchDate;
    }
    if (source === 'state') {
      old.liked = !!raw.liked;
      old.rating = Number(raw.rating || 0);
      old.likedDate = raw.liked_at || old.likedDate;
      old.ratedDate = raw.rated_at || old.ratedDate;
    }
    old.updatedDate = [old.watchDate, old.likedDate, old.ratedDate, raw.updated_at].filter(Boolean).sort().pop() || '';
    map.set(key, old);
  }

  async function loadAll() {
    if (state.loading) return;
    state.loading = true;
    setStatus('Chargement de tes jeux…');
    try {
      const [watchData, stateData, catalogIndex] = await Promise.all([
        fetchJson('/api/watchlist?limit=500'),
        fetchJson('/api/user-game-state?limit=500'),
        loadTranslationCatalog(),
      ]);
      const map = new Map();
      (watchData.items || []).forEach((item) => mergeItem(map, item, 'watchlist'));
      (stateData.items || []).forEach((item) => mergeItem(map, item, 'state'));
      state.items = enrichWithTranslationDates(Array.from(map.values()), catalogIndex);
      render();
    } catch (err) {
      state.items = [];
      render();
      setStatus(err?.message || 'Chargement impossible.', true);
    } finally {
      state.loading = false;
    }
  }

  function filteredItems() {
    let list = state.items.slice();
    if (state.currentTab === 'watchlist') list = list.filter((x) => x.watchlist);
    if (state.currentTab === 'likes') list = list.filter((x) => x.liked);
    if (state.currentTab === 'notes') list = list.filter((x) => Number(x.rating || 0) > 0);

    const q = state.q.trim().toLowerCase();
    if (q) {
      list = list.filter((x) => [x.title, x.game_key, x.f95_url, x.discord_url].some((v) => String(v || '').toLowerCase().includes(q)));
    }

    list.sort((a, b) => {
      if (state.sort === 'title') return String(a.title || '').localeCompare(String(b.title || ''), 'fr', { sensitivity: 'base' });
      if (state.sort === 'rating') return (Number(b.rating || 0) - Number(a.rating || 0)) || String(a.title || '').localeCompare(String(b.title || ''), 'fr');
      if (state.sort === 'translationDate') {
        const ta = Number(a.translationDateTs || 0);
        const tb = Number(b.translationDateTs || 0);
        if (ta !== tb) return tb - ta;
        return String(a.title || '').localeCompare(String(b.title || ''), 'fr', { sensitivity: 'base' });
      }
      const da = Date.parse(a.updatedDate || a.ratedDate || a.likedDate || a.watchDate || '') || 0;
      const db = Date.parse(b.updatedDate || b.ratedDate || b.likedDate || b.watchDate || '') || 0;
      return db - da;
    });
    return list;
  }

  function updateStats() {
    const watch = state.items.filter((x) => x.watchlist).length;
    const likes = state.items.filter((x) => x.liked).length;
    const notes = state.items.filter((x) => Number(x.rating || 0) > 0).length;
    const total = new Set(state.items.map((x) => x.key)).size;
    if (els.total) els.total.textContent = total;
    if (els.watch) els.watch.textContent = watch;
    if (els.likes) els.likes.textContent = likes;
    if (els.notes) els.notes.textContent = notes;
    els.tabs.forEach((tab) => {
      const name = tab.getAttribute('data-account-tab');
      const count = name === 'all' ? total : name === 'watchlist' ? watch : name === 'likes' ? likes : notes;
      const b = tab.querySelector('b');
      if (b) b.textContent = count;
      tab.classList.toggle('active', name === state.currentTab);
    });
  }

  function badges(item) {
    const out = [];
    if (item.watchlist) out.push(`<span class="account-game-badge">${WATCHLIST_ICON} Watchlist</span>`);
    if (item.liked) out.push('<span class="account-game-badge">❤️ Liké</span>');
    if (Number(item.rating || 0) > 0) out.push(`<span class="account-game-badge">⭐ ${Number(item.rating)}/4</span>`);
    return out.join('');
  }

  function metaLines(item) {
    const lines = [];
    if (item.translationDateTs) lines.push(`🗓️ Traduction${formatDate(item.translationDateTs) ? ' le ' + escapeHtml(formatDate(item.translationDateTs)) : ''}`);
    if (item.watchlist) lines.push(`${WATCHLIST_ICON} Ajouté à la Watchlist${formatDate(item.watchDate) ? ' le ' + escapeHtml(formatDate(item.watchDate)) : ''}`);
    if (item.liked) lines.push(`❤️ Liké${formatDate(item.likedDate) ? ' le ' + escapeHtml(formatDate(item.likedDate)) : ''}`);
    if (Number(item.rating || 0) > 0) lines.push(`<span class="account-game-rating">⭐ Note : ${Number(item.rating)}/4${formatDate(item.ratedDate) ? ' · ' + escapeHtml(formatDate(item.ratedDate)) : ''}</span>`);
    return lines.map((line) => `<div>${line}</div>`).join('');
  }

  function renderCard(item) {
    const title = escapeHtml(item.title || 'Jeu sans titre');
    const img = escapeHtml(item.image_url || '/favicon.png');
    const gameUrl = escapeHtml(normalizeGameUrl(item.game_url));
    const f95 = item.f95_url ? `<a class="account-games-btn" href="${escapeHtml(item.f95_url)}" target="_blank" rel="noopener">F95</a>` : '';
    const discord = item.discord_url ? `<a class="account-games-btn" href="${escapeHtml(item.discord_url)}" target="_blank" rel="noopener">Discord</a>` : '';
    const tab = state.currentTab || 'all';
    const showWatchAction = item.watchlist && (tab === 'all' || tab === 'watchlist');
    const showLikeAction = item.liked && (tab === 'all' || tab === 'likes');
    const showRatingAction = Number(item.rating || 0) > 0 && (tab === 'all' || tab === 'notes');
    const removeWatch = showWatchAction ? `<button class="account-games-btn warn" type="button" data-remove-watch="${escapeHtml(item.game_key)}">Retirer Watchlist</button>` : '';
    const removeLike = showLikeAction ? `<button class="account-games-btn warn" type="button" data-remove-like="${escapeHtml(item.game_key)}">Retirer like</button>` : '';
    const removeRating = showRatingAction ? `<button class="account-games-btn warn" type="button" data-remove-rating="${escapeHtml(item.game_key)}">Supprimer note</button>` : '';
    return `
      <article class="account-game-card" data-game-key="${escapeHtml(item.game_key)}">
        <a class="account-game-cover-link" href="${gameUrl}" target="_blank" rel="noopener">
          <img class="account-game-cover" src="${img}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.src='/favicon.png'">
          <div class="account-game-badges">${badges(item)}</div>
        </a>
        <div class="account-game-body">
          <a class="account-game-title" href="${gameUrl}" target="_blank" rel="noopener">${title}</a>
          <div class="account-game-meta">${metaLines(item)}</div>
          <div class="account-game-card-actions">
            <a class="account-games-btn primary" href="${gameUrl}" target="_blank" rel="noopener">Voir la fiche</a>
            ${f95}${discord}${removeWatch}${removeLike}${removeRating}
          </div>
        </div>
      </article>`;
  }

  function render() {
    updateStats();
    const list = filteredItems();
    const label = state.currentTab === 'all' ? 'jeu' : state.currentTab === 'watchlist' ? 'jeu en Watchlist' : state.currentTab === 'likes' ? 'jeu liké' : 'jeu noté';
    if (!list.length) {
      els.grid.innerHTML = `<div class="account-games-empty">Aucun ${label}${state.q ? ' pour cette recherche' : ''}.</div>`;
      setStatus('');
      return;
    }
    els.grid.innerHTML = list.map(renderCard).join('');
    setStatus(`${list.length} ${label}${list.length > 1 ? 'x' : ''} affiché${list.length > 1 ? 's' : ''}.`);
  }

  async function updateUserGameState(payload) {
    return fetchJson('/api/user-game-state', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload || {}),
    });
  }

  async function removeWatch(gameKey) {
    return fetchJson('/api/watchlist', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ game_key: gameKey }),
    });
  }

  async function handleAction(e) {
    const btn = e.target.closest('[data-remove-watch],[data-remove-like],[data-remove-rating]');
    if (!btn) return;
    const gameKey = btn.getAttribute('data-remove-watch') || btn.getAttribute('data-remove-like') || btn.getAttribute('data-remove-rating') || '';
    if (!gameKey) return;
    btn.disabled = true;
    try {
      if (btn.hasAttribute('data-remove-watch')) await removeWatch(gameKey);
      if (btn.hasAttribute('data-remove-like')) await updateUserGameState({ game_key: gameKey, liked: false });
      if (btn.hasAttribute('data-remove-rating')) await updateUserGameState({ game_key: gameKey, rating: 0 });
      await loadAll();
    } catch (err) {
      btn.disabled = false;
      setStatus(err?.message || 'Modification impossible.', true);
    }
  }

  function bind() {
    els.tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        state.currentTab = tab.getAttribute('data-account-tab') || 'all';
        history.replaceState(null, '', `#${state.currentTab}`);
        render();
      });
    });
    els.search?.addEventListener('input', () => { state.q = els.search.value || ''; render(); });
    els.sort?.addEventListener('change', () => { state.sort = els.sort.value || 'translationDate'; render(); });
    els.refresh?.addEventListener('click', loadAll);
    els.grid?.addEventListener('click', handleAction);
  }

  function showGuest() {
    els.guest?.classList.remove('auth-hidden');
    els.app?.classList.add('auth-hidden');
  }

  function showApp(me) {
    els.guest?.classList.add('auth-hidden');
    els.app?.classList.remove('auth-hidden');
    if (els.user) els.user.textContent = me?.display_name || me?.username || 'compte connecté';
    loadAll();
  }

  function initAuth(me) {
    state.me = me || null;
    if (!state.me) showGuest();
    else showApp(state.me);
  }

  bind();
  if (window.SiteAuth?.onChange) window.SiteAuth.onChange(initAuth);
  if (window.SiteAuth?.loaded) initAuth(window.SiteAuth.me);
})();
