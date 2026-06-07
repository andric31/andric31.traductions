(() => {
  const DEFAULT_LIST_URL = 'https://raw.githubusercontent.com/andric31/f95list/main/f95list.json';
  const CONFIG_URL = '/evenements/config.json';

  const els = {
    active: document.getElementById('activeEvent')
  };

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function escapeRegExp(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
    return id ? `/evenements/${id}.json` : '';
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
    else if (raw && typeof raw === 'object') {
      Object.values(raw).forEach((v) => {
        if (Array.isArray(v)) v.forEach((g) => add(g));
      });
    }

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
    return String(g.gameData?.description || g.description || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getGameTags(g) {
    const raw = g.gameData?.tags || g.tags || [];
    if (Array.isArray(raw)) return raw.map((tag) => String(tag || '').trim()).filter(Boolean);
    return String(raw || '').split(',').map((tag) => tag.trim()).filter(Boolean);
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

  function nextMondayMidnight() {
    const now = new Date();
    const next = new Date(now);
    next.setHours(0, 0, 0, 0);

    const day = next.getDay();
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

  function buildKeywordRegex(keyword) {
    const normalized = normalizeText(keyword).trim();
    if (!normalized) return null;
    return new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalized)}([^a-z0-9]|$)`, 'i');
  }

  function analyseSummerMatch(game, event) {
    const keywords = (Array.isArray(event.selection_keywords) ? event.selection_keywords : [])
      .map((keyword) => String(keyword || '').trim())
      .filter(Boolean);

    const title = getGameTitle(game);
    const description = getGameDescription(game);
    const tags = getGameTags(game);

    const sources = {
      title: normalizeText(title),
      description: normalizeText(description),
      tags: normalizeText(tags.join(' '))
    };

    const found = [];
    let score = 0;

    keywords.forEach((keyword) => {
      const regex = buildKeywordRegex(keyword);
      if (!regex) return;

      const hits = [];
      if (regex.test(sources.title)) hits.push('title');
      if (regex.test(sources.description)) hits.push('description');
      if (regex.test(sources.tags)) hits.push('tags');
      if (!hits.length) return;

      let keywordScore = 0;
      if (hits.includes('title')) keywordScore += 8;
      if (hits.includes('description')) keywordScore += 5;
      if (hits.includes('tags')) keywordScore += 2;
      score += keywordScore;
      found.push({ keyword, hits, score: keywordScore });
    });

    return {
      score,
      found,
      title,
      description,
      tags
    };
  }

  function pickGame(games, event) {
    if (!games.length) return { game: null, reason: '', summary: '', tags: [] };

    const wantedId = String(event.selected_game_id || '').trim();
    const wantedUid = String(event.selected_game_uid || '').trim();
    if (wantedId || wantedUid) {
      const forced = games.find((g) =>
        (!wantedId || String(g.id || '').trim() === wantedId || String(g.collection || '').trim() === wantedId) &&
        (!wantedUid || String(g.uid ?? '').trim() === wantedUid)
      );
      if (forced) {
        return {
          game: forced,
          reason: 'Jeu sélectionné manuellement pour cet événement.',
          summary: getGameDescription(forced),
          tags: getGameTags(forced),
          matchedKeywords: []
        };
      }
    }

    const candidates = games
      .filter((g) => getGameImage(g))
      .filter((g) => buildGameUrl(g) !== '/')
      .map((g) => ({ game: g, analysis: analyseSummerMatch(g, event) }))
      .filter((entry) => entry.analysis.score > 0)
      .sort((a, b) => {
        if (b.analysis.score !== a.analysis.score) return b.analysis.score - a.analysis.score;
        return getGameTitle(a.game).localeCompare(getGameTitle(b.game), 'fr');
      });

    if (!candidates.length) {
      return {
        game: null,
        reason: '',
        summary: '',
        tags: [],
        matchedKeywords: []
      };
    }

    const topScore = candidates[0].analysis.score;
    const pool = candidates.filter((entry) => entry.analysis.score >= Math.max(8, topScore - 3));

    const now = new Date();
    const weekKey = `${now.getUTCFullYear()}-${Math.ceil((((now - new Date(Date.UTC(now.getUTCFullYear(), 0, 1))) / 86400000) + 1) / 7)}`;
    const key = `${event.id || 'event'}|${weekKey}`;
    const selected = pool[hashText(key) % pool.length];

    const uniqueKeywords = [...new Set(selected.analysis.found.map((item) => item.keyword))];
    const reason = uniqueKeywords.length
      ? `Sélection automatique, basée sur le thème ${uniqueKeywords.join(', ')}.`
      : 'Choisi automatiquement pour cet événement.';

    return {
      game: selected.game,
      reason,
      summary: selected.analysis.description || getGameDescription(selected.game),
      tags: selected.analysis.tags || getGameTags(selected.game),
      matchedKeywords: uniqueKeywords
    };
  }

  function renderNoGame(event, gameError = '') {
    const period = dateRange(event || {});
    els.active.innerHTML = `
      <article class="active-card summer-card no-game">
        <div class="active-content">
          <div class="event-icon" aria-hidden="true">${escapeHtml(event?.icon || '📅')}</div>
          <div class="event-state-row">
            <span class="event-pill is-live">${escapeHtml(event?.status_label || 'Événement actif')}</span>
            ${period ? `<span class="event-pill">📆 ${escapeHtml(period)}</span>` : ''}
          </div>
          <h2 class="event-title">${escapeHtml(event?.title || 'Événement')}</h2>
          <p class="event-text">Aucun jeu de la base ne correspond actuellement au thème de cet événement.</p>
          ${gameError ? `<p class="event-help">${escapeHtml(gameError)}</p>` : ''}
        </div>
      </article>
    `;
  }

  function renderDetails(summary, tags, reason) {
    const summaryText = summary || 'Aucun résumé disponible pour ce jeu.';
    const safeTags = Array.isArray(tags) ? tags.filter(Boolean).slice(0, 18) : [];

    return `
      <section class="event-details" aria-label="Détails du jeu sélectionné">
        <article class="event-detail-card event-detail-summary">
          <h3>Résumé</h3>
          <p>${escapeHtml(summaryText)}</p>
          <div class="event-tags-list event-tags-in-summary">
            ${safeTags.length ? safeTags.map((tag) => `<span class="event-tag-pill">${escapeHtml(tag)}</span>`).join('') : '<span class="event-no-tags">Aucun tag disponible.</span>'}
          </div>
        </article>
      </section>
    `;
  }

  function renderActiveEvent(event, selection, gameError = '') {
    if (!event || event.enabled === false) {
      els.active.innerHTML = '<div class="event-empty">Aucun événement actif pour le moment.</div>';
      return;
    }

    const game = selection?.game || null;
    if (!game) {
      renderNoGame(event, gameError);
      return;
    }

    const period = dateRange(event);
    const title = getGameTitle(game);
    const image = getGameImage(game);
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
          <h2 class="event-title">${escapeHtml(event.title || 'Traduction de l’été')}</h2>
          <p class="event-text">${escapeHtml(event.text || 'Découvre cette semaine un jeu traduit mis en avant pour l’été.')}</p>
          <div class="event-next-game-timer" aria-live="polite">
            <span aria-hidden="true">⏳</span>
            <span data-next-game-timer>${escapeHtml(event.timer_label || 'Nouveau jeu dans')} ${escapeHtml(formatNextGameTimer())}</span>
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
            <span class="summer-game-label">${escapeHtml(event.status || 'Sélection d’été')}</span>
            <h3>${escapeHtml(title)}</h3>
            <p class="summer-game-why">${escapeHtml(selection.reason || 'Choisi pour l’événement d’été.')}</p>
          </div>
        </aside>
      </article>
      ${renderDetails(selection.summary, selection.tags, selection.reason)}
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
    const selection = pickGame(games, event);
    renderActiveEvent(event, selection, raw ? '' : 'La base f95list.json est peut-être inaccessible.');
    startEventTimer();
  }

  init().catch((err) => {
    console.warn('[events]', err);
    els.active.innerHTML = '<div class="event-empty">Impossible de charger l’événement.</div>';
  });
})();
