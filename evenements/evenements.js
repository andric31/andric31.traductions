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

  function getActiveEventUrl(config, forcedId = '') {
    const id = String(forcedId || config?.event_actif || config?.active_event || '').trim();
    return id ? `/evenements/${id}.json` : '';
  }

  async function loadActiveState(config) {
    const saved = await fetchJson('/api/evenements', null);
    if (saved?.ok) {
      return {
        activeId: String(saved.active_event || config?.event_actif || config?.active_event || '').trim(),
        enabled: saved.enabled !== false,
        source: saved.active_event ? 'cloudflare' : 'config'
      };
    }
    return {
      activeId: String(config?.event_actif || config?.active_event || '').trim(),
      enabled: true,
      source: 'config'
    };
  }


  function looksLikeAdventEventRaw(event) {
    const type = normalizeText(event?.type || event?.mode || '');
    const id = String(event?.id || '').toLowerCase();
    return type.includes('advent') || id.includes('avent');
  }
  function isRealAdventDay(item) {
    if (!item || typeof item !== 'object') return false;
    const title = String(item.title || '').trim();
    return item.locked === false || !!String(item.imageUrl || item.image || item.f95 || item.f95_url || item.mega || item.mega_url || '').trim() || (title && !title.startsWith('Surprise du jour'));
  }
  function mergeAdventDays(baseEvent, savedEvent) {
    if (!looksLikeAdventEventRaw(baseEvent)) return { ...baseEvent, ...savedEvent };
    const baseDays = Array.isArray(baseEvent.days) ? baseEvent.days : [];
    const savedDays = Array.isArray(savedEvent.days) ? savedEvent.days : [];
    const byDay = new Map();
    baseDays.forEach((item) => { const day = parseInt(item?.day, 10); if (day) byDay.set(day, item); });
    savedDays.forEach((item) => { const day = parseInt(item?.day, 10); if (day && isRealAdventDay(item)) byDay.set(day, item); });
    return { ...baseEvent, ...savedEvent, id: baseEvent.id || savedEvent.id, type: baseEvent.type || savedEvent.type, css: baseEvent.css || savedEvent.css, days: Array.from({ length: 24 }, (_, i) => byDay.get(i + 1) || { day: i + 1, title: `Surprise du jour ${i + 1}`, text: 'À remplir plus tard.', locked: true }) };
  }

  async function loadSavedEvent(baseEvent) {
    const id = String(baseEvent?.id || '').trim();
    if (!id) return baseEvent;
    const saved = await fetchJson(`/api/evenement?id=${encodeURIComponent(id)}`, null);
    if (saved?.ok && saved.event && typeof saved.event === 'object') {
      const merged = mergeAdventDays(baseEvent, saved.event);
      // On garde les informations structurelles et les dates du fichier local.
      // Sinon une ancienne sauvegarde Cloudflare peut continuer à afficher
      // les anciennes dates même après modification du JSON local.
      if (baseEvent.id) merged.id = baseEvent.id;
      if (baseEvent.type) merged.type = baseEvent.type;
      if (baseEvent.css) merged.css = baseEvent.css;
      if (baseEvent.start_at) merged.start_at = baseEvent.start_at;
      if (baseEvent.end_at) merged.end_at = baseEvent.end_at;
      if (baseEvent.date_label) merged.date_label = baseEvent.date_label;
      if (baseEvent.date) merged.date = baseEvent.date;
      return merged;
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

  function buildPrivateLinksKey(game) {
    const g = game && typeof game === 'object' ? game : {};
    const id = String(g.id || '').trim();
    if (id) return id;

    const collection = String(g.collection || '').trim();
    const uid = String(g.uid ?? '').trim();
    if (collection && uid) return `${collection}__${uid}`;
    if (uid) return `uid__${uid}`;

    const title = String(g.cleanTitle || g.title || g.gameData?.title || '').trim();
    return title ? `title__${title}` : '';
  }

  async function fetchPrivateGameData(game) {
    const key = buildPrivateLinksKey(game);
    if (!key) return null;
    try {
      const res = await fetch(`/api/f95list_links?key=${encodeURIComponent(key)}`, { cache: 'no-store' });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || data.ok === false || !data.found) return null;
      return data;
    } catch (err) {
      console.warn('[events] Infos privées indisponibles', err);
      return null;
    }
  }

  function mergePrivateGameData(game, privateData) {
    if (!privateData || typeof privateData !== 'object') return game;
    const out = { ...(game || {}) };
    ['discordlink', 'translationType', 'description', 'notes', 'translationsArchive'].forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(privateData, field) && String(privateData[field] || '').trim()) {
        out[field] = privateData[field];
      }
    });
    if (Array.isArray(privateData.translationsExtra) && privateData.translationsExtra.length) out.translationsExtra = privateData.translationsExtra;
    ['hasDiscord', 'hasTranslation', 'hasTranslationsExtra', 'hasTranslationsArchive', 'hasDescription', 'hasNotes'].forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(privateData, field)) out[field] = !!privateData[field];
    });
    return out;
  }

  async function enrichSelectionWithPrivateData(selection) {
    if (!selection?.game) return selection;
    const privateData = await fetchPrivateGameData(selection.game);
    if (!privateData) return selection;
    const game = mergePrivateGameData(selection.game, privateData);
    return {
      ...selection,
      game,
      summary: selection.summary || getGameDescription(game),
      tags: Array.isArray(selection.tags) && selection.tags.length ? selection.tags : getGameTags(game),
    };
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



  function weekKeyFromDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function parseDateOnly(value) {
    const parts = String(value || '').slice(0, 10).split('-').map((part) => parseInt(part, 10));
    if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function getCalendarFirstWeek(event) {
    const eventId = String(event?.id || '').trim();
    if (eventId === 'ete-2026') return new Date(2026, 5, 8);
    const configuredStart = parseDateOnly(event?.start_at);
    return getLastChangeBoundary(configuredStart || new Date(new Date().getFullYear(), 0, 1), event);
  }

  function getCalendarWeekIndex(event, date = new Date()) {
    const first = getLastChangeBoundary(getCalendarFirstWeek(event), event);
    const current = getLastChangeBoundary(date, event);
    return Math.max(0, Math.floor((current.getTime() - first.getTime()) / WEEK_MS));
  }

  function isWeeklyCalendarEvent(event) {
    const id = String(event?.id || '').trim();
    const mode = String(event?.selection_mode || event?.selection || event?.change_frequency || '').toLowerCase();
    return id === 'ete-2026' || mode.includes('weekly') || mode.includes('semaine');
  }

  function getWeeklyOverride(event, weekKey) {
    const overrides = event?.weekly_overrides;
    if (!overrides || typeof overrides !== 'object' || !weekKey) return null;
    const item = overrides[weekKey];
    return item && typeof item === 'object' ? item : null;
  }

  function findGameByRef(games, ref) {
    const wantedId = String(ref?.id || ref?.selected_game_id || '').trim();
    const wantedUid = String(ref?.uid || ref?.selected_game_uid || '').trim();
    if (!wantedId && !wantedUid) return null;
    return games.find((g) => {
      const gameId = String(g.id || '').trim();
      const collection = String(g.collection || '').trim();
      const uid = String(g.uid ?? '').trim();
      const idOk = !wantedId || gameId === wantedId || collection === wantedId;
      const uidOk = !wantedUid || uid === wantedUid;
      return idOk && uidOk;
    }) || null;
  }

  function getCalendarSeedOffset(event, poolLength) {
    if (!poolLength) return 0;
    const seedValue = String(event?.calendar_seed || event?.rotation_seed || event?.id || event?.title || 'event').trim();
    return hashText(seedValue) % poolLength;
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

    // Priorité au changement manuel de la semaine en cours.
    // Comme ça, si tu changes uniquement la semaine du 08/15/22...,
    // la page publique affiche le même jeu que l'admin pour cette semaine.
    const weeklyMode = isWeeklyCalendarEvent(event);
    const currentWeekKey = weekKeyFromDate(getLastChangeBoundary(new Date(), event));
    const weeklyForced = findGameByRef(games, getWeeklyOverride(event, currentWeekKey));
    if (weeklyForced) {
      return {
        game: weeklyForced,
        reason: '',
        summary: getGameDescription(weeklyForced),
        tags: getGameTags(weeklyForced),
        matchedKeywords: []
      };
    }

    // Pour un événement à calendrier hebdomadaire, on ignore l'ancien jeu global forcé.
    // Sinon l'admin, le calendrier et la page publique peuvent afficher trois jeux différents.
    if (!weeklyMode) {
      const wantedId = String(event.selected_game_id || '').trim();
      const wantedUid = String(event.selected_game_uid || '').trim();
      if (wantedId || wantedUid) {
        const forced = findGameByRef(games, { id: wantedId, uid: wantedUid });
        if (forced) {
          return {
            game: forced,
            reason: '',
            summary: getGameDescription(forced),
            tags: getGameTags(forced),
            matchedKeywords: []
          };
        }
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
    const rotationIndex = getCalendarWeekIndex(event);
    const eventOffset = getCalendarSeedOffset(event, rotationPool.length);
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


  function cssIdFromEvent(event) {
    return String(event?.css || event?.style || event?.theme || event?.id || '')
      .trim()
      .replace(/^\/evenements\//, '')
      .replace(/\.css$/i, '')
      .replace(/[^a-z0-9_-]/gi, '');
  }

  function getEventThemeClass(event) {
    const id = cssIdFromEvent(event);
    return id ? `event-theme-${id}` : 'event-theme-default';
  }

  function loadEventCss(event) {
    const id = cssIdFromEvent(event);
    if (!id) return;
    const href = `/evenements/${id}.css`;
    const versionedHref = `${href}?v=${Math.floor(Date.now() / 60000)}`;
    const domId = 'event-specific-css';
    let link = document.getElementById(domId);
    if (!link) {
      link = document.createElement('link');
      link.id = domId;
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    if (!link.href.includes(href)) link.href = versionedHref;
  }

  function renderEmptyEvent(message = 'Aucun événement actif pour le moment.') {
    if (!els.active) return;
    els.active.innerHTML = `<div class="event-empty">${escapeHtml(message)}</div>`;
  }


  function isNoEventMode(event) {
    const type = normalizeText(event?.type || event?.mode || '');
    const id = normalizeText(event?.id || '');
    return type === 'no_event' || type === 'aucun_evenement' || type === 'aucun-evenement' || id === 'aucun-evenement';
  }

  function renderNoEventCard(event) {
    const period = dateRange(event || {});
    const details = Array.isArray(event?.details) ? event.details.filter(Boolean) : [];
    const actions = Array.isArray(event?.actions) ? event.actions.filter((action) => action && action.href && action.label) : [];

    els.active.innerHTML = `
      <article class="active-card ${escapeHtml(getEventThemeClass(event))} no-event-card">
        <div class="active-content">
          <div class="event-icon" aria-hidden="true">${escapeHtml(event?.icon || '🌙')}</div>
          <div class="event-state-row">
            <span class="event-pill is-live">${escapeHtml(event?.status_label || 'Pause événement')}</span>
            ${period ? `<span class="event-pill">📆 ${escapeHtml(period)}</span>` : ''}
          </div>
          <h2 class="event-title">${escapeHtml(event?.title || 'Aucun événement en cours')}</h2>
          <p class="event-text">${escapeHtml(event?.text || 'Il n’y a pas d’événement spécial actif pour le moment.')}</p>

          ${details.length ? `<div class="event-no-event-panel">
            ${details.map((line) => `<div class="event-info-line"><span>✨</span><p>${escapeHtml(line)}</p></div>`).join('')}
          </div>` : ''}

          ${actions.length ? `<div class="event-actions">
            ${actions.map((action, index) => `<a class="${index === 0 ? 'event-main-link' : 'event-secondary-link'}" href="${escapeHtml(action.href)}">${escapeHtml(action.label)}</a>`).join('')}
          </div>` : ''}
        </div>
      </article>
    `;
  }

  function renderNoGame(event, gameError = '') {
    const period = dateRange(event || {});
    els.active.innerHTML = `
      <article class="active-card ${escapeHtml(getEventThemeClass(event))} no-game">
        <div class="active-content">
          <div class="event-icon" aria-hidden="true">${escapeHtml(event?.icon || '📅')}</div>
          <div class="event-state-row">
            <span class="event-pill is-live">${escapeHtml(event?.status_label || 'Événement actif')}</span>
            ${period ? `<span class="event-pill">📆 ${escapeHtml(period)}</span>` : ''}
          </div>
          <h2 class="event-title">${escapeHtml(event?.title || 'Événement')}</h2>
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


  function isAdventEvent(event) {
    const type = normalizeText(event?.type || event?.mode || '');
    const id = String(event?.id || '').toLowerCase();
    return type.includes('advent') || id.includes('avent');
  }

  function normalizeAdventDays(event) {
    const raw = Array.isArray(event?.days) ? event.days : [];
    const byDay = new Map();
    raw.forEach((item) => {
      const day = Math.min(24, Math.max(1, parseInt(item?.day, 10) || 0));
      if (day) byDay.set(day, { ...item, day });
    });
    return Array.from({ length: 24 }, (_, i) => byDay.get(i + 1) || { day: i + 1, title: `Surprise du jour ${i + 1}`, locked: true });
  }

  function getAdventOpenDay(event) {
    const now = new Date();
    const start = parseDateOnly(event?.start_at) || new Date(now.getFullYear(), 11, 1);
    const end = parseDateOnly(event?.end_at) || new Date(start.getFullYear(), 11, 24);
    if (now.getTime() < start.getTime()) return 0;
    if (now.getTime() > new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59).getTime()) return 24;
    if (now.getFullYear() === start.getFullYear() && now.getMonth() === start.getMonth()) {
      return Math.min(24, Math.max(1, now.getDate() - start.getDate() + 1));
    }
    return Math.min(24, Math.max(1, Math.floor((now.getTime() - start.getTime()) / 86400000) + 1));
  }

  function getAdventImage(day) {
    return String(day?.imageUrl || day?.imageURL || day?.image_url || day?.image || day?.cover || '').trim();
  }

  function getAdventStorageKey(event) {
    return `event_advent_opened_${String(event?.id || 'calendrier-avent').trim()}`;
  }

  function readAdventOpenedDays(event) {
    try {
      const raw = localStorage.getItem(getAdventStorageKey(event));
      const list = JSON.parse(raw || '[]');
      if (!Array.isArray(list)) return new Set();
      return new Set(list.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value >= 1 && value <= 24));
    } catch {
      return new Set();
    }
  }

  function writeAdventOpenedDays(event, openedDays) {
    try {
      localStorage.setItem(getAdventStorageKey(event), JSON.stringify(Array.from(openedDays).sort((a, b) => a - b)));
    } catch {}
  }

  function renderAdventEvent(event) {
    const period = dateRange(event);
    const days = normalizeAdventDays(event);
    const openUntil = getAdventOpenDay(event);
    const openedDays = readAdventOpenedDays(event);
    let selectedDayNumber = null;

    function isAvailable(dayNumber) {
      return Number(dayNumber) <= openUntil;
    }

    function isRevealed(dayNumber) {
      return openedDays.has(Number(dayNumber));
    }

    function renderClosed(day, available, revealed) {
      const title = revealed && String(day?.title || '').trim() ? String(day.title).trim() : '';
      return `
        <div class="xmas-door-front">
          <span class="xmas-door-number">${escapeHtml(day.day)}</span>
          <span class="xmas-door-status">${escapeHtml(!available ? 'Fermée' : revealed ? 'Ouverte' : 'À ouvrir')}</span>
          ${title ? `<span class="xmas-door-mini-title">${escapeHtml(title)}</span>` : ''}
        </div>
      `;
    }

    function renderOpened(day) {
      const image = getAdventImage(day);
      const title = String(day?.title || `Surprise du jour ${day.day}`).trim();
      const text = String(day?.text || '').trim();
      const f95 = String(day?.f95 || day?.f95_url || '').trim();
      const mega = String(day?.mega || day?.mega_url || '').trim();

      return `
        <div class="xmas-door-content">
          <div class="xmas-door-image">
            ${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy">` : '<div class="xmas-door-placeholder">🎁</div>'}
          </div>
          <div class="xmas-door-body">
            <span class="xmas-door-badge">Jour ${escapeHtml(day.day)}</span>
            <strong>${escapeHtml(title)}</strong>
            ${text ? `<p>${escapeHtml(text)}</p>` : ''}
            <div class="xmas-door-links">
              ${f95 ? `<a href="${escapeHtml(f95)}" target="_blank" rel="noopener">F95</a>` : ''}
              ${mega ? `<a href="${escapeHtml(mega)}" target="_blank" rel="noopener">Mega</a>` : ''}
            </div>
          </div>
        </div>
      `;
    }

    function buildDoor(day) {
      const dayNumber = Number(day.day);
      const available = isAvailable(dayNumber);
      const revealed = isRevealed(dayNumber);
      const selected = selectedDayNumber === dayNumber;
      const opened = selected && revealed;
      const today = available && dayNumber === openUntil;

      return `
        <button
          class="xmas-door ${available ? 'is-available' : 'is-locked'} ${revealed ? 'is-revealed' : ''} ${opened ? 'is-opened' : ''} ${today ? 'is-today' : ''}"
          type="button"
          data-advent-day="${escapeHtml(dayNumber)}"
          ${available ? '' : 'disabled'}
        >
          ${opened ? renderOpened(day) : renderClosed(day, available, revealed)}
        </button>
      `;
    }

    function renderGrid() {
      const grid = els.active.querySelector('[data-xmas-grid]');
      if (!grid) return;
      grid.innerHTML = days.map((day) => buildDoor(day)).join('');
      bindDoors();
    }

    function bindDoors() {
      els.active.querySelectorAll('[data-advent-day]').forEach((button) => {
        const dayNumber = Number(button.dataset.adventDay);
        if (!isAvailable(dayNumber)) return;

        button.addEventListener('click', () => {
          if (!openedDays.has(dayNumber)) {
            button.classList.add('is-opening');
            window.setTimeout(() => {
              openedDays.add(dayNumber);
              writeAdventOpenedDays(event, openedDays);
              selectedDayNumber = dayNumber;
              renderGrid();
            }, 620);
            return;
          }

          selectedDayNumber = selectedDayNumber === dayNumber ? null : dayNumber;
          renderGrid();
        });
      });
    }

    els.active.innerHTML = `
      <article class="active-card ${escapeHtml(getEventThemeClass(event))} xmas-calendar-card">
        <header class="xmas-hero">
          <div class="xmas-pills">
            <span>${escapeHtml(event.status_label || 'Calendrier de l’avent')}</span>
            ${period ? `<span>📆 ${escapeHtml(period)}</span>` : ''}
          </div>
          <h2>${escapeHtml(event.title || 'Calendrier de l’avent')}</h2>
          <p>${escapeHtml(event.text || 'Ouvre une case par jour et découvre les surprises de décembre.')}</p>
        </header>

        <section class="xmas-calendar-grid" data-xmas-grid aria-label="Calendrier de l’avent"></section>

        <div class="xmas-reset-zone">
          <button class="xmas-reset-btn" type="button" data-xmas-reset>🔄 Réinitialiser les cases ouvertes</button>
        </div>
      </article>
    `;

    renderGrid();

    const resetBtn = els.active.querySelector('[data-xmas-reset]');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        try {
          localStorage.removeItem(getAdventStorageKey(event));
        } catch {}
        openedDays.clear();
        selectedDayNumber = null;
        renderGrid();
      });
    }
  }
  function renderActiveEvent(event, selection, gameError = '') {
    if (!event || event.enabled === false) {
      renderEmptyEvent('Aucun événement actif pour le moment.');
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
      <article class="active-card ${escapeHtml(getEventThemeClass(event))}">
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

        <aside class="event-game-card" aria-label="Jeu mis en avant">
          <div class="event-game-cover">
            ${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy">` : '<div class="event-game-placeholder">🎮</div>'}
          </div>
          <div class="event-game-info">
            <span class="event-game-label">Cette semaine</span>
            <h3>${escapeHtml(title)}</h3>
          </div>
        </aside>
      </article>
      ${renderDetails(selection.summary, selection.tags, selection.reason)}
    `;
  }

  async function init() {
    const params = new URLSearchParams(window.location.search);
    const testId = String(params.get('test') || '').trim();
    const testNoEvent = ['none', 'no-event', 'aucun', 'off'].includes(testId.toLowerCase());
    const normalizedTestId = testNoEvent ? 'aucun-evenement' : testId;

    const config = await fetchJson(CONFIG_URL, { event_actif: 'ete-2026', event_files: ['ete-2026'] });
    const activeState = normalizedTestId ? { activeId: normalizedTestId, enabled: true, source: 'test' } : await loadActiveState(config);

    if (!activeState.enabled || !activeState.activeId) {
      renderEmptyEvent('Aucun événement actif pour le moment.');
      return;
    }

    const eventUrl = getActiveEventUrl(config, activeState.activeId);
    const baseEvent = eventUrl ? await fetchJson(eventUrl, null) : null;
    // En mode test, on affiche le fichier de l’événement tel qu’il est déployé,
    // sans le mélanger avec une ancienne sauvegarde Cloudflare.
    let event = baseEvent ? await loadSavedEvent(baseEvent) : null;

    if (normalizedTestId && event) {
      event = { ...event, enabled: true, status_label: isNoEventMode(event) ? (event.status_label || 'Pause événement') : 'Mode test admin' };
    }

    if (event) loadEventCss(event);

    if (!event || event.enabled === false) {
      renderActiveEvent(event, null);
      return;
    }

    if (isNoEventMode(event)) {
      renderNoEventCard(event);
      return;
    }

    if (isAdventEvent(event)) {
      renderAdventEvent(event);
      return;
    }

    const listUrl = getListUrl(event);
    const raw = await fetchJson(listUrl, null);
    const games = flattenGames(raw);
    const selection = await enrichSelectionWithPrivateData(pickGame(games, event));
    renderActiveEvent(event, selection, raw ? '' : 'La base f95list.json est peut-être inaccessible.');
    startEventTimer(event);
  }

  init().catch((err) => {
    console.warn('[events]', err);
    renderEmptyEvent('Impossible de charger l’événement.');
  });
})();
