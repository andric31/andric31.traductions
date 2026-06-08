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

  async function loadSavedEvent(baseEvent) {
    const id = String(baseEvent?.id || '').trim();
    if (!id) return baseEvent;
    const saved = await fetchJson(`/api/evenement?id=${encodeURIComponent(id)}`, null);
    if (saved?.ok && saved.event && typeof saved.event === 'object') {
      return { ...baseEvent, ...saved.event };
    }
    return baseEvent;
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
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p\s*>/gi, '\n\n')
      .replace(/<[^>]*>/g, '')
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
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


  function getGameKey(g) {
    const id = String(g.collection || g.id || '').trim();
    const uid = String(g.uid ?? '').trim();
    const title = normalizeText(getGameTitle(g))
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return [id, uid, title].filter(Boolean).join('|') || title || 'jeu';
  }

  function getBlockedGameKeys(event) {
    const values = [];
    ['blocked_game_keys', 'used_game_keys', 'previous_game_keys'].forEach((field) => {
      if (Array.isArray(event?.[field])) values.push(...event[field]);
    });
    if (Array.isArray(event?.used_games)) {
      event.used_games.forEach((item) => {
        if (!item) return;
        if (typeof item === 'string') values.push(item);
        else {
          values.push(item.key, item.id, item.uid, item.title);
          if (item.collection) values.push(item.collection);
        }
      });
    }
    return new Set(values.map((value) => String(value || '').trim()).filter(Boolean).flatMap((value) => [value, normalizeText(value)]));
  }

  function isBlockedGame(g, event) {
    const blocked = getBlockedGameKeys(event);
    if (!blocked.size) return false;
    const checks = [
      getGameKey(g),
      String(g.collection || '').trim(),
      String(g.id || '').trim(),
      String(g.uid ?? '').trim(),
      getGameTitle(g)
    ].filter(Boolean);
    return checks.some((value) => blocked.has(value) || blocked.has(normalizeText(value)));
  }

  function dedupeRotationPool(entries) {
    const seen = new Set();
    return entries.filter((entry) => {
      const key = getGameKey(entry.game);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const CHANGE_DAYS = {
    sunday: 0, dimanche: 0,
    monday: 1, lundi: 1,
    tuesday: 2, mardi: 2,
    wednesday: 3, mercredi: 3,
    thursday: 4, jeudi: 4,
    friday: 5, vendredi: 5,
    saturday: 6, samedi: 6
  };

  function getChangeDay(event) {
    const raw = normalizeText(event?.change_day || 'monday').trim();
    return Object.prototype.hasOwnProperty.call(CHANGE_DAYS, raw) ? CHANGE_DAYS[raw] : 1;
  }

  function getChangeHour(event) {
    const hour = Number(event?.change_hour);
    return Number.isFinite(hour) ? Math.min(23, Math.max(0, Math.floor(hour))) : 0;
  }

  function getLastChangeBoundary(date, event) {
    const boundary = new Date(date);
    boundary.setHours(getChangeHour(event), 0, 0, 0);

    const targetDay = getChangeDay(event);
    const diff = (boundary.getDay() - targetDay + 7) % 7;
    boundary.setDate(boundary.getDate() - diff);

    if (boundary.getTime() > date.getTime()) {
      boundary.setDate(boundary.getDate() - 7);
    }

    return boundary;
  }

  function getNextChangeDate(event) {
    const next = getLastChangeBoundary(new Date(), event);
    next.setDate(next.getDate() + 7);
    return next;
  }

  function getRotationIndex(event) {
    const now = new Date();
    const configuredStart = new Date(event?.start_at || '');
    const baselineDate = !Number.isNaN(configuredStart.getTime()) && now.getTime() >= configuredStart.getTime()
      ? configuredStart
      : new Date(now.getFullYear(), 0, 1);

    const baseline = getLastChangeBoundary(baselineDate, event);
    const current = getLastChangeBoundary(now, event);
    return Math.max(0, Math.floor((current.getTime() - baseline.getTime()) / WEEK_MS));
  }

  function formatNextGameTimer(event) {
    const remaining = Math.max(0, getNextChangeDate(event).getTime() - Date.now());
    const totalSeconds = Math.floor(remaining / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    if (days > 0) return `${days} j ${hours} h`;
    if (hours > 0) return `${hours} h ${minutes} min`;
    return `${minutes} min`;
  }

  function startEventTimer(event) {
    const timerText = document.querySelector('[data-next-game-timer]');
    if (!timerText) return;

    const update = () => {
      timerText.textContent = `${event?.timer_label || 'Nouveau jeu dans'} ${formatNextGameTimer(event)}`;
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

    const validGames = games
      .filter((g) => getGameImage(g))
      .filter((g) => buildGameUrl(g) !== '/');

    const candidates = validGames
      .map((g) => ({ game: g, analysis: analyseSummerMatch(g, event) }))
      .filter((entry) => entry.analysis.score > 0)
      .sort((a, b) => {
        if (b.analysis.score !== a.analysis.score) return b.analysis.score - a.analysis.score;
        return getGameTitle(a.game).localeCompare(getGameTitle(b.game), 'fr');
      });

    let rotationPool = dedupeRotationPool(candidates);
    let blockedApplied = false;

    const applyBlockedFilter = (pool) => {
      const filtered = dedupeRotationPool(pool).filter((entry) => !isBlockedGame(entry.game, event));
      if (filtered.length) {
        blockedApplied = filtered.length !== dedupeRotationPool(pool).length;
        return filtered;
      }
      return dedupeRotationPool(pool);
    };

    rotationPool = applyBlockedFilter(rotationPool);

    if ((!rotationPool.length || rotationPool.every((entry) => isBlockedGame(entry.game, event))) && String(event.fallback_mode || '').trim() === 'weekly_random') {
      rotationPool = applyBlockedFilter(validGames
        .map((g) => ({
          game: g,
          analysis: {
            score: 0,
            found: [],
            description: getGameDescription(g),
            tags: getGameTags(g)
          }
        }))
        .sort((a, b) => getGameTitle(a.game).localeCompare(getGameTitle(b.game), 'fr')));
    }

    if (!rotationPool.length) {
      return {
        game: null,
        reason: '',
        summary: '',
        tags: [],
        matchedKeywords: []
      };
    }

    // Important : on utilise toute la liste de candidats au thème, pas seulement le petit groupe de tête.
    // Comme ça, le jeu avance vraiment à chaque changement hebdomadaire au lieu de pouvoir retomber sur le même.
    const rotationIndex = getRotationIndex(event);
    const eventOffset = hashText(event.id || event.title || 'event') % rotationPool.length;
    const selected = rotationPool[(rotationIndex + eventOffset) % rotationPool.length];

    const uniqueKeywords = [...new Set((selected.analysis.found || []).map((item) => item.keyword))];
    const reasonBase = uniqueKeywords.length
      ? `Sélection automatique de la semaine, basée sur le thème ${uniqueKeywords.join(', ')}.`
      : 'Sélection automatique de la semaine.';
    const reason = blockedApplied
      ? `${reasonBase} Les jeux déjà utilisés ont été ignorés.`
      : reasonBase;

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
            <span data-next-game-timer>${escapeHtml(event.timer_label || 'Nouveau jeu dans')} ${escapeHtml(formatNextGameTimer(event))}</span>
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
    const baseEvent = eventUrl ? await fetchJson(eventUrl, null) : null;
    const event = baseEvent ? await loadSavedEvent(baseEvent) : null;

    if (!event || event.enabled === false) {
      renderActiveEvent(event, null);
      return;
    }

    const listUrl = getListUrl(event);
    const raw = await fetchJson(listUrl, null);
    const games = flattenGames(raw);
    const selection = pickGame(games, event);
    renderActiveEvent(event, selection, raw ? '' : 'La base f95list.json est peut-être inaccessible.');
    startEventTimer(event);
  }

  init().catch((err) => {
    console.warn('[events]', err);
    els.active.innerHTML = '<div class="event-empty">Impossible de charger l’événement.</div>';
  });
})();
