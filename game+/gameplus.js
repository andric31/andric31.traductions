(() => {
  const $ = (s) => document.querySelector(s);
  const stateBox = $('#stateBox');
  const grid = $('#grid');
  const toolbar = $('#toolbar');
  const loginBtn = $('#loginBtn');
  const searchInput = $('#searchInput');
  const engineSelect = $('#engineSelect');
  const sortSelect = $('#sortSelect');

  const state = { items: [], filtered: [], q: '', engine: 'all', sort: 'title' };

  function esc(v) {
    return String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function setState(text, type = '') {
    stateBox.textContent = text || '';
    stateBox.className = `gp-state ${type ? `is-${type}` : ''}`;
  }

  function dateValue(g) {
    const d = Date.parse(g.date || g.updatedAt || '');
    return Number.isFinite(d) ? d : 0;
  }

  function fillEngines() {
    const engines = [...new Set(state.items.map((g) => String(g.engine || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
    engineSelect.innerHTML = '<option value="all">Tous les moteurs</option>' + engines.map((e) => `<option value="${esc(e)}">${esc(e)}</option>`).join('');
  }

  function applyFilters() {
    const q = state.q.toLowerCase();
    let arr = state.items.filter((g) => {
      if (state.engine !== 'all' && String(g.engine || '') !== state.engine) return false;
      if (!q) return true;
      const hay = [g.title, g.developer, g.engine, g.status, g.version, g.description, ...(g.tags || [])].join(' ').toLowerCase();
      return hay.includes(q);
    });

    if (state.sort === 'date-desc') arr.sort((a, b) => dateValue(b) - dateValue(a) || String(a.title).localeCompare(String(b.title), 'fr'));
    else if (state.sort === 'date-asc') arr.sort((a, b) => dateValue(a) - dateValue(b) || String(a.title).localeCompare(String(b.title), 'fr'));
    else arr.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'fr'));

    state.filtered = arr;
    render();
  }

  function renderLinks(g) {
    const links = Array.isArray(g.links) ? g.links : [];
    if (!links.length) return '';
    return `<div class="gp-links">${links.map((l) => `<a class="gp-link" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label || l.key || 'Lien')}</a>`).join('')}</div>`;
  }

  function renderCard(g) {
    const img = g.cover || g.banner || g.image || '';
    const meta = [g.developer, g.engine, g.version].filter(Boolean).join(' · ');
    const tags = (g.tags || []).slice(0, 8).map((t) => `<span class="gp-tag">${esc(t)}</span>`).join('');
    return `
      <article class="gp-card">
        <div class="gp-cover">
          ${img ? `<img src="${esc(img)}" alt="" referrerpolicy="no-referrer" loading="lazy">` : '<div class="gp-cover-placeholder">⭐</div>'}
          <span class="gp-badge">⭐ Game+</span>
        </div>
        <div class="gp-body">
          <h2 class="gp-title">${esc(g.title)}</h2>
          ${meta ? `<div class="gp-meta">${esc(meta)}</div>` : ''}
          ${g.description ? `<p class="gp-desc">${esc(g.description)}</p>` : ''}
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
    grid.innerHTML = state.filtered.map(renderCard).join('');
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
      fillEngines();
      applyFilters();
    } catch (err) {
      setState(err?.message || 'Impossible de charger Game+.', 'error');
    }
  }

  searchInput?.addEventListener('input', () => { state.q = searchInput.value.trim(); applyFilters(); });
  engineSelect?.addEventListener('change', () => { state.engine = engineSelect.value || 'all'; applyFilters(); });
  sortSelect?.addEventListener('change', () => { state.sort = sortSelect.value || 'title'; applyFilters(); });

  load();
})();
