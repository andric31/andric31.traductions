(() => {
  const $ = (s) => document.querySelector(s);
  const stateBox = $('#stateBox');
  const grid = $('#grid');
  const toolbar = $('#toolbar');
  const loginBtn = $('#loginBtn');
  const searchInput = $('#searchInput');
  const engineSelect = $('#engineSelect');
  const sortSelect = $('#sortSelect');
  const miniStats = $('#miniStats');

  const state = { items: [], filtered: [], q: '', engine: 'all', sort: 'date-desc' }; // tri par défaut : Trad MAJ récente

  function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function setState(text, type = '') {
    stateBox.textContent = text || '';
    stateBox.className = `gp-state ${type ? `is-${type}` : ''}`;
  }

  function dateValue(g) {
    const d = Date.parse(g.translationUpdatedAt || g.translationUpdateDate || g.tradUpdatedAt || g.updatedAt || g.date || '');
    return Number.isFinite(d) ? d : 0;
  }

  function parseDateValue(value) {
    const d = Date.parse(value || '');
    return Number.isFinite(d) ? d : 0;
  }

  function formatRawDate(value) {
    const d = parseDateValue(value);
    if (!d) return '';
    try { return new Date(d).toLocaleDateString('fr-FR'); } catch { return ''; }
  }

  function formatGameDate(g) { return formatRawDate(g.date); }
  function formatTranslationUpdatedDate(g) { return formatRawDate(g.translationUpdatedAt || g.translationUpdateDate || g.tradUpdatedAt || g.updatedAt); }
  function formatTranslationCreatedDate(g) { return formatRawDate(g.translationCreatedAt || g.translationCreationDate || g.tradCreatedAt); }

  function fillEngines() {
    const engines = [...new Set(state.items.map((g) => String(g.engine || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
    engineSelect.innerHTML = '<option value="all">Tous les moteurs</option>' + engines.map((e) => `<option value="${esc(e)}">${esc(e)}</option>`).join('');
  }

  function applyFilters() {
    const q = state.q.toLowerCase();
    let arr = state.items.filter((g) => {
      if (state.engine !== 'all' && String(g.engine || '') !== state.engine) return false;
      if (!q) return true;
      const hay = [g.id, g.title, g.developer, g.engine, g.status, g.version, g.description, g.information, ...(g.tags || [])].join(' ').toLowerCase();
      return hay.includes(q);
    });

    if (state.sort === 'date-desc') arr.sort((a, b) => dateValue(b) - dateValue(a) || String(a.title).localeCompare(String(b.title), 'fr'));
    else if (state.sort === 'date-asc') arr.sort((a, b) => dateValue(a) - dateValue(b) || String(a.title).localeCompare(String(b.title), 'fr'));
    else arr.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'fr'));

    state.filtered = arr;
    render();
  }

  function linkKind(link) {
    const section = String(link.section || link.category || '').toLowerCase();
    const key = String(link.key || '').toLowerCase();
    const value = section || key;
    if (['traduction', 'translation', 'trad', 'patch_fr', 'fr'].includes(value)) return 'trad';
    if (['win_linux', 'winlinux', 'windows_linux', 'windows', 'win', 'linux', 'macos', 'mac', 'osx', 'android', 'download', 'jeu', 'game'].includes(value)) return 'download';
    if (['source', 'patreon', 'official', 'discord', 'site', 'itch', 'steam'].includes(value)) return 'source';
    return 'external';
  }

  function linkPlatformLabel(link) {
    const key = String(link.key || '').toLowerCase();
    const label = link.label || link.key || 'Lien';
    if (key === 'win_linux' || key === 'winlinux' || key === 'windows_linux') return 'Windows / Linux';
    if (key === 'macos' || key === 'mac' || key === 'osx') return 'MacOS';
    if (key === 'android') return 'Android';
    if (key === 'download') return 'Téléchargement';
    return label;
  }

  function renderLink(link, kind) {
    let label = String(link.label || '').trim();
    if (!label) label = kind === 'trad' ? 'Télécharger la traduction' : kind === 'download' ? linkPlatformLabel(link) : (link.host || link.key || 'Lien');
    return `<a class="gp-link ${kind === 'trad' ? 'is-trad' : ''}" href="${esc(link.url)}" target="_blank" rel="noopener">${esc(label)}</a>`;
  }

  function renderLinks(g) {
    const links = Array.isArray(g.links) ? g.links : [];
    if (!links.length) return '';
    const groups = {
      trad: links.filter((l) => linkKind(l) === 'trad'),
      download: links.filter((l) => linkKind(l) === 'download'),
      source: links.filter((l) => linkKind(l) === 'source'),
      external: links.filter((l) => linkKind(l) === 'external'),
    };
    const parts = [];
    if (groups.trad.length) {
      parts.push(`<section class="gp-link-group"><div class="gp-link-title"><img src="/assets/flags/fr.svg" alt="">Traduction</div><div class="gp-link-list">${groups.trad.map((l) => renderLink(l, 'trad')).join('')}</div></section>`);
    }
    if (groups.download.length) {
      parts.push(`<section class="gp-link-group"><div class="gp-link-title">⬇️ Téléchargement du jeu</div><div class="gp-link-list">${groups.download.map((l) => renderLink(l, 'download')).join('')}</div></section>`);
    }
    if (groups.source.length) {
      parts.push(`<section class="gp-link-group"><div class="gp-link-title">🔗 Liens / source</div><div class="gp-link-list">${groups.source.map((l) => renderLink(l, 'source')).join('')}</div></section>`);
    }
    if (groups.external.length) {
      parts.push(`<section class="gp-link-group"><div class="gp-link-title">➕ Autres liens</div><div class="gp-link-list">${groups.external.map((l) => renderLink(l, 'external')).join('')}</div></section>`);
    }
    return `<div class="gp-links-box">${parts.join('')}</div>`;
  }

  function renderStats() {
    if (!miniStats) return;
    const engines = [...new Set(state.items.map((g) => String(g.engine || '').trim()).filter(Boolean))];
    const latest = state.items.map(dateValue).filter(Boolean).sort((a, b) => b - a)[0];
    const latestText = latest ? new Date(latest).toLocaleDateString('fr-FR') : '—';
    miniStats.style.display = '';
    miniStats.innerHTML = `
      <div class="gp-stat"><strong>${state.items.length}</strong> jeu${state.items.length > 1 ? 'x' : ''}</div>
      <div class="gp-stat"><strong>${engines.length || '—'}</strong> moteur${engines.length > 1 ? 's' : ''}</div>
      <div class="gp-stat"><strong>${esc(latestText)}</strong> MAJ</div>`;
  }

  function renderGame(g) {
    const img = g.image || g.cover || g.banner || '';
    const gameDate = formatGameDate(g);
    const tradCreated = formatTranslationCreatedDate(g);
    const tradUpdated = formatTranslationUpdatedDate(g);
    const meta = [g.developer, g.engine, g.version, gameDate, tradUpdated ? `Trad MAJ ${tradUpdated}` : '', tradCreated ? `Trad créée ${tradCreated}` : ''].filter(Boolean);
    const tags = (g.tags || []).slice(0, 10).map((t) => `<span class="gp-tag">${esc(t)}</span>`).join('');
    const hasDetails = Boolean(g.information || tags || (Array.isArray(g.links) && g.links.length));
    return `
      <article class="gp-game${hasDetails ? ' has-details' : ''}">
        <div class="gp-card-main" role="button" tabindex="0" aria-expanded="false" title="Ouvrir les informations">
          <div class="gp-media">
            ${img ? `<img src="${esc(img)}" alt="" referrerpolicy="no-referrer" loading="lazy">` : '<div class="gp-placeholder"><div class="gp-placeholder-box"><span class="gp-stars">✨✨</span><span>Game+</span></div></div>'}
            <span class="gp-ribbon">✨✨ Game+</span>
          </div>
          <div class="gp-summary">
            <div>
              <h2 class="gp-title">${esc(g.title)}</h2>
              ${meta.length ? `<div class="gp-meta">${meta.map((m) => `<span class="gp-pill">${esc(m)}</span>`).join('')}</div>` : ''}
            </div>
            ${g.description ? `<p class="gp-desc">${esc(g.description)}</p>` : ''}
            <div class="gp-open-hint"><span>Cliquer pour afficher les infos, téléchargements et sources</span></div>
          </div>
        </div>
        <div class="gp-card-details" hidden>
          ${g.information ? `<div class="gp-info"><strong>Informations</strong><span>${esc(g.information)}</span></div>` : ''}
          ${tags ? `<div class="gp-tags">${tags}</div>` : ''}
          ${renderLinks(g)}
        </div>
      </article>`;
  }

  function render() {
    if (!state.filtered.length) {
      grid.innerHTML = '';
      setState(state.items.length ? 'Aucun jeu ne correspond aux filtres.' : 'Aucun jeu Game+ pour le moment.');
      return;
    }
    setState('', 'ok');
    grid.innerHTML = state.filtered.map(renderGame).join('');
  }

  async function load() {
    setState('Chargement de Game+…');
    try {
      const resp = await fetch('/api/gameplus', { cache: 'no-store', credentials: 'same-origin' });
      const data = await resp.json().catch(() => null);
      if (resp.status === 401 || data?.requiresLogin) {
        loginBtn.style.display = '';
        toolbar.style.display = 'none';
        grid.innerHTML = '';
        setState('Connexion requise pour accéder à Game+.', 'error');
        return;
      }
      if (!resp.ok || !data?.ok) throw new Error(data?.detail || data?.error || 'Chargement impossible.');
      state.items = Array.isArray(data.items) ? data.items : [];
      toolbar.style.display = '';
      if (sortSelect) sortSelect.value = state.sort;
      fillEngines();
      renderStats();
      applyFilters();
    } catch (err) {
      setState(err?.message || 'Impossible de charger Game+.', 'error');
    }
  }

  searchInput?.addEventListener('input', () => { state.q = searchInput.value.trim(); applyFilters(); });
  engineSelect?.addEventListener('change', () => { state.engine = engineSelect.value || 'all'; applyFilters(); });
  sortSelect?.addEventListener('change', () => { state.sort = sortSelect.value || 'title'; applyFilters(); });

  function toggleGame(card, force) {
    if (!card) return;
    const main = card.querySelector('.gp-card-main');
    const details = card.querySelector('.gp-card-details');
    const open = typeof force === 'boolean' ? force : !card.classList.contains('is-open');
    card.classList.toggle('is-open', open);
    if (main) main.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (details) details.hidden = !open;
  }

  grid?.addEventListener('click', (ev) => {
    const main = ev.target.closest('.gp-card-main');
    if (!main || !grid.contains(main)) return;
    toggleGame(main.closest('.gp-game'));
  });

  grid?.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const main = ev.target.closest('.gp-card-main');
    if (!main || !grid.contains(main)) return;
    ev.preventDefault();
    toggleGame(main.closest('.gp-game'));
  });

  load();
})();
