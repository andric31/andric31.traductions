(() => {
  const DEFAULT_LIST_URL = 'https://raw.githubusercontent.com/andric31/f95list/main/f95list.json';
  const CONFIG_URL = '/evenements/config.json';

  const els = {
    active: document.getElementById('activeEvent'),  };

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function formatDate(value) {
    const date = new Date(value || '');
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(date);
  }

  function dateRange(event) {
    if (event.date_label) return String(event.date_label);
    const start = formatDate(event.start_at);
    const end = formatDate(event.end_at);
    if (start && end && start !== end) return `${start} → ${end}`;
    return start || end || '';
  }

  async function fetchJson(url, fallback) {
    try {
      const glue = url.includes('?') ? '&' : '?';
      const res = await fetch(`${url}${glue}v=${Math.floor(Date.now() / 60000)}`, { cache: 'no-store' });
      if (!res.ok) return fallback;
      return res.json();
    } catch {
      return fallback;
    }
  }


  function getActiveEventUrl(config) {
    const id = String(config?.event_actif || config?.active_event || '').trim();
    if (!id) return '';
    return `/evenements/${id}.json`;
  }

  function getListUrl(event) {
    const eventUrl = String(event?.list_url || '').trim();
    if (eventUrl) return eventUrl;
    try {
      return (localStorage.getItem('f95listUrl') || '').trim() || DEFAULT_LIST_URL;
    } catch {
      return DEFAULT_LIST_URL;
    }
  }

  function flattenGames(raw) {
    const out = [];
    const seen = new Set();

    function add(g, parentCollection = '') {
      if (!g || typeof g !== 'object') return;

      const title = String(g.gameData?.title || g.cleanTitle || g.title || '').trim();
      const id = String(g.id || '').trim();
      const uid = String(g.uid ?? '').trim();
      const key = `${id}|${uid}|${title}`;

      if (title && !seen.has(key)) {
        seen.add(key);
        out.push(parentCollection && !g.collection ? { ...g, collection: parentCollection } : g);
      }

      const collectionId = id || String(g.collection || parentCollection || '').trim();
      ['games', 'children', 'items', 'entries', 'subgames', 'subGames'].forEach((field) => {
        if (Array.isArray(g[field])) g[field].forEach((child) => add(child, collectionId));
      });
    }

    if (Array.isArray(raw)) raw.forEach((g) => add(g));
    else if (Array.isArray(raw?.games)) raw.games.forEach((g) => add(g));
    else if (raw && typeof raw === 'object') Object.values(raw).forEach((v) => {
      if (Array.isArray(v)) v.forEach((g) => add(g));
    });

    return out.filter((g) => String(g.gameData?.title || g.cleanTitle || g.title || '').trim());
  }

  function cleanTitle(title) {
    return String(title || '')
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/\([^)]*\)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || String(title || '').trim() || 'Jeu traduit';
  }

  function getGameTitle(g) {
    return cleanTitle(g.gameData?.title || g.cleanTitle || g.title || 'Jeu traduit');
  }

  function getGameImage(g) {
    return String(g.gameData?.imageUrl || g.imageUrl || g.image || '').trim();
  }

  function getGameDescription(g) {
    return String(g.gameData?.description || g.description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function getGameEngine(g) {
    return String(g.gameData?.engine || g.engine || '').trim();
  }

  function getGameStatus(g) {
    return String(g.gameData?.status || g.status || '').trim();
  }

  function buildGameUrl(g) {
    const coll = String(g.collection || '').trim();
    const id = String(g.id || '').trim();
    const uid = String(g.uid ?? '').trim();
    if (coll) return `/game/?id=${encodeURIComponent(coll)}${uid ? `&uid=${encodeURIComponent(uid)}` : ''}`;
    if (id) return `/game/?id=${encodeURIComponent(id)}`;
    if (uid) return `/game/?uid=${encodeURIComponent(uid)}`;
    return '/';
  }

  function hashText(text) {
    let h = 2166136261;
    for (const ch of String(text)) {
      h ^= ch.charCodeAt(0);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h >>> 0);
  }

  function pickGame(games, event) {
    if (!games.length) return null;

    const wantedId = String(event.selected_game_id || '').trim();
    const wantedUid = String(event.selected_game_uid || '').trim();
    if (wantedId || wantedUid) {
      const found = games.find((g) =>
        (!wantedId || String(g.id || '').trim() === wantedId || String(g.collection || '').trim() === wantedId) &&
        (!wantedUid || String(g.uid ?? '').trim() === wantedUid)
      );
      if (found) return found;
    }

    const candidates = games
      .filter((g) => getGameImage(g))
      .filter((g) => buildGameUrl(g) !== '/')
      .sort((a, b) => getGameTitle(a).localeCompare(getGameTitle(b), 'fr'));

    const pool = candidates.length ? candidates : games;
    const now = new Date();
    const weekKey = `${now.getUTCFullYear()}-${Math.ceil((((now - new Date(Date.UTC(now.getUTCFullYear(),0,1))) / 86400000) + 1) / 7)}`;
    const key = event.selection === 'daily'
      ? `${event.id}|${now.toISOString().slice(0,10)}`
      : `${event.id}|${weekKey}`;
    return pool[hashText(key) % pool.length];
  }

  function nextMondayMidnight() {
    const now = new Date();
    const next = new Date(now);
    next.setHours(0, 0, 0, 0);

    const day = next.getDay(); // 0 dimanche, 1 lundi
    let addDays = (8 - day) % 7;
    if (addDays === 0) addDays = 7;

    next.setDate(next.getDate() + addDays);
    return next;
  }

  function formatNextGameTimer() {
    const remaining = Math.max(0, nextMondayMidnight().getTime() - Date.now());
    const totalSeconds = Math.floor(remaining / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    if (days > 0) return `${days} j ${hours} h`;
    if (hours > 0) return `${hours} h ${minutes} min`;
    return `${minutes} min`;
  }

  function startEventTimer() {
    const timerText = document.querySelector('[data-next-game-timer]');
    if (!timerText) return;

    const update = () => {
      timerText.textContent = `Nouveau jeu dans ${formatNextGameTimer()}`;
    };

    update();
    setInterval(update, 60000);
  }

  function renderActiveEvent(event, game, gameError = '') {
    if (!event || event.enabled === false) {
      els.active.innerHTML = '<div class="event-empty">Aucun événement actif pour le moment.</div>';
      return;
    }

    const tags = Array.isArray(event.tags) ? event.tags : [];
    const period = dateRange(event);

    if (!game) {
      els.active.innerHTML = `
        <article class="active-card summer-card no-game">
          <div class="active-content">
            <div class="event-icon" aria-hidden="true">${escapeHtml(event.icon || '📅')}</div>
            <div class="event-state-row">
              <span class="event-pill is-live">${escapeHtml(event.status_label || 'Événement actif')}</span>
              ${period ? `<span class="event-pill">📆 ${escapeHtml(period)}</span>` : ''}
            </div>
            <h2 class="event-title">${escapeHtml(event.title || 'Événement')}</h2>
            <p class="event-text">Impossible de charger un jeu depuis la base pour le moment.</p>
            ${gameError ? `<p class="event-help">${escapeHtml(gameError)}</p>` : ''}
          </div>
        </article>
      `;
      return;
    }

    const title = getGameTitle(game);
    const image = getGameImage(game);
    const desc = getGameDescription(game);
    const engine = getGameEngine(game);
    const status = getGameStatus(game);
    const gameUrl = buildGameUrl(game);
    const discord = String(game.discordlink || game.discord || '').trim();
    const f95 = String(game.url || game.threadUrl || '').trim();

    els.active.innerHTML = `
      <article class="active-card summer-card">
        <div class="active-content">
          <div class="event-icon" aria-hidden="true">${escapeHtml(event.icon || '☀️')}</div>
          <div class="event-state-row">
            <span class="event-pill is-live">${escapeHtml(event.status_label || 'Événement actif')}</span>
            ${period ? `<span class="event-pill">📆 ${escapeHtml(period)}</span>` : ''}
          </div>
          <h2 class="event-title">${escapeHtml(event.title || 'Jeu traduit de l’été')}</h2>
          <p class="event-text">${escapeHtml(event.text || 'Découvre cette semaine un jeu traduit mis en avant pour l’été.')}</p>
          <div class="event-next-game-timer" aria-live="polite">
            <span aria-hidden="true">⏳</span>
            <span data-next-game-timer>Nouveau jeu dans ${escapeHtml(formatNextGameTimer())}</span>
          </div>
          <div class="event-actions">
            <a class="event-main-link" href="${escapeHtml(gameUrl)}">Voir la fiche du jeu →</a>
            ${discord ? `<a class="event-secondary-link" href="${escapeHtml(discord)}" target="_blank" rel="noopener">Discord</a>` : ''}
            ${f95 ? `<a class="event-secondary-link" href="${escapeHtml(f95)}" target="_blank" rel="noopener">F95Zone</a>` : ''}
          </div>
        </div>

        <aside class="summer-game-card" aria-label="Jeu mis en avant">
          <div class="summer-game-cover">
            ${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy">` : '<div class="summer-game-placeholder">🎮</div>'}
          </div>
          <div class="summer-game-info">
            <span class="summer-game-label">Sélection d’été</span>
            <h3>${escapeHtml(title)}</h3>
            ${desc ? `<p>${escapeHtml(desc).slice(0, 190)}${desc.length > 190 ? '…' : ''}</p>` : '<p>Jeu traduit mis en avant pour l’été.</p>'}

          </div>
        </aside>
      </article>
    `;
  }

  async function init() {
    const config = await fetchJson(CONFIG_URL, { event_actif: 'ete-2026' });
    const eventUrl = getActiveEventUrl(config);
    const event = eventUrl ? await fetchJson(eventUrl, null) : null;

    

    if (!event || event.enabled === false) {
      renderActiveEvent(event, null);
      return;
    }

    const listUrl = getListUrl(event);
    const raw = await fetchJson(listUrl, null);
    const games = flattenGames(raw);
    const game = pickGame(games, event);
    renderActiveEvent(event, game, raw ? '' : 'La base f95list.json est peut-être inaccessible.');
    startEventTimer();
  }

  init().catch((err) => {
    console.warn('[events]', err);
    els.active.innerHTML = '<div class="event-empty">Impossible de charger l’événement.</div>';
    
  });
})();
