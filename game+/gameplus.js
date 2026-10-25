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
  const dialog = $('#gameDialog');
  let selectedId = '';
  let requestNumber = 0;

  const state = { items: [], filtered: [], q: '', engine: 'all', sort: 'date-desc' }; // tri par défaut : Trad MAJ récente
  const GAMEPLUS_SEEN_KEY = 'andric31.gameplus.seenSignature.v1';

  function cleanSignatureValue(v) { return String(v ?? '').trim(); }

  function gamePlusSignature(items) {
    if (!Array.isArray(items) || !items.length) return 'empty';
    return items.map((g) => {
      const id = cleanSignatureValue(g.id || g.uid || g.key);
      const title = cleanSignatureValue(g.title || g.cleanTitle || g.name);
      const date = cleanSignatureValue(g.date || g.translationUpdatedAt || g.updatedAt || g.updateDate || g.lastUpdate || g.last_update);
      const tradDate = cleanSignatureValue(g.translationUpdatedAt || g.translationUpdateDate || g.tradUpdatedAt || g.updatedAt || g.updateDate || g.lastUpdate || g.last_update);
      const created = cleanSignatureValue(g.translationCreatedAt || g.translationCreationDate || g.tradCreatedAt || g.createdAt);
      const version = cleanSignatureValue(g.version);
      return [id, title, date, tradDate, created, version].join('~');
    }).sort().join('||');
  }

  function markGamePlusSeen(items) {
    try { localStorage.setItem(GAMEPLUS_SEEN_KEY, gamePlusSignature(items)); } catch {}
  }

  function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function linkifyText(v) {
    const text = String(v ?? '');
    const re = /https?:\/\/[^\s<>"']+/g;
    let out = '';
    let last = 0;
    let match;
    while ((match = re.exec(text))) {
      let url = match[0];
      let end = re.lastIndex;
      const trailing = url.match(/[),.;:!?]+$/)?.[0] || '';
      if (trailing) {
        url = url.slice(0, -trailing.length);
        end -= trailing.length;
      }
      out += esc(text.slice(last, match.index));
      out += `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a>`;
      last = end;
      re.lastIndex = end;
    }
    out += esc(text.slice(last));
    return out.replace(/\n/g, '<br>');
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

  function renderSources(g) {
    const sources = (Array.isArray(g.links) ? g.links : []).filter(link => linkKind(link) === 'source');
    if (!sources.length) return '';
    return `<section class="gp-link-group gp-sources" aria-label="Sources du jeu"><div class="gp-link-title">🔗 Liens / source</div><div class="gp-link-list">${sources.map(link => renderLink(link, 'source')).join('')}</div></section>`;
  }

  function renderLinks(g) {
    const links = Array.isArray(g.links) ? g.links : [];
    if (!links.length) return '';
    const groups = {
      trad: links.filter((l) => linkKind(l) === 'trad'),
      download: links.filter((l) => linkKind(l) === 'download'),
      external: links.filter((l) => linkKind(l) === 'external'),
    };
    const parts = [];
    if (groups.trad.length) {
      parts.push(`<section class="gp-link-group"><div class="gp-link-title"><img src="/assets/flags/fr.svg" alt="">Traduction</div><div class="gp-link-list">${groups.trad.map((l) => renderLink(l, 'trad')).join('')}</div></section>`);
    }
    if (groups.download.length) {
      parts.push(`<section class="gp-link-group"><div class="gp-link-title">⬇️ Téléchargement du jeu</div><div class="gp-link-list">${groups.download.map((l) => renderLink(l, 'download')).join('')}</div></section>`);
    }
    if (groups.external.length) {
      parts.push(`<section class="gp-link-group"><div class="gp-link-title">➕ Autres liens</div><div class="gp-link-list">${groups.external.map((l) => renderLink(l, 'external')).join('')}</div></section>`);
    }
    return parts.length ? `<div class="gp-links-box">${parts.join('')}</div>` : '';
  }

  function renderStats() {
    const engines = new Set(state.items.map(g => String(g.engine || '').trim()).filter(Boolean));
    miniStats.textContent = `${state.filtered.length} jeu${state.filtered.length > 1 ? 'x' : ''} · ${engines.size} moteur${engines.size > 1 ? 's' : ''}`;
  }

  function imageSource(raw) {
    if (!raw) return '';
    try { const url = new URL(raw, location.href); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
  }

  function cover(g) {
    const src = imageSource(g.banner || g.image || g.cover);
    return `<div class="gp-cover"><div class="gp-cover-placeholder" ${src ? 'hidden' : ''}><span aria-hidden="true">✨</span><small>${src ? 'Image indisponible' : 'Game+'}</small></div>${src ? `<img src="${esc(src)}" alt="" referrerpolicy="no-referrer" loading="lazy">` : ''}</div>`;
  }

  function watchImages(container) {
    container.querySelectorAll('.gp-cover img').forEach(img => img.addEventListener('error', () => {
      img.parentElement.querySelector('.gp-cover-placeholder').hidden = false;
      img.remove();
    }, { once: true }));
  }

  function renderGame(g, index) {
    const author = authorMarkup(g);
    return `<article class="ml-card gp-card"><button type="button" data-open="${index}" aria-haspopup="dialog" aria-label="${esc('Ouvrir : ' + g.title)}">${cover(g)}<div class="ml-card-info"><h3 class="gp-title">${titleMarkup(g)}</h3>${author ? `<p class="gp-card-author gp-author-line">${author}</p>` : ''}</div></button></article>`;
  }

  function render() {
    renderStats();
    if (!state.filtered.length) {
      grid.replaceChildren();
      setState(state.items.length ? 'Aucun jeu ne correspond aux filtres.' : 'Aucun jeu Game+ pour le moment.');
      return;
    }
    setState('', 'ok');
    grid.innerHTML = state.filtered.map(renderGame).join('');
    watchImages(grid);
  }

  function engineBadge(value) {
    const label = String(value || '').trim();
    if (!label) return '';
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '');
    const aliases = {rpg:'rpgm',rpgmaker:'rpgm',rpgmakerxp:'rpgm',rpgmakermv:'rpgm',rpgmakermz:'rpgm',unreal:'unrealengine',ue4:'unrealengine',ue5:'unrealengine',html5:'html',web:'html',other:'others'};
    const key = Object.hasOwn(aliases, slug) ? aliases[slug] : slug;
    return `<span class="badge eng eng-${key} gp-engine-badge" title="${esc('Moteur : ' + label)}">${esc(label)}</span>`;
  }

  function authorMarkup(g) {
    const developer = String(g.developer || '').trim();
    return (developer ? `<span>Par ${esc(developer)}</span> ` : '') + engineBadge(g.engine);
  }

  function titleMarkup(g) {
    return `<span>${esc(g.title)}</span>${g.version ? ` <span class="gp-title-version" aria-label="${esc('Version ' + g.version)}">${esc(g.version)}</span>` : ''}`;
  }

  function showGame(g) {
    if (!g) return;
    selectedId = String(g.id);
    $('#gameTitle').innerHTML = titleMarkup(g);
    const author = authorMarkup(g);
    $('#gameDeveloper').innerHTML = author;
    $('#gameDeveloper').hidden = !author;
    const images = [g.banner || g.image || g.cover, ...(g.gallery || [])].map(imageSource).filter(Boolean);
    $('#gameVisual').innerHTML = cover(g) + (images.length > 1 ? `<div class="gp-gallery" aria-label="Galerie">${images.map((src, i) => `<button type="button" data-gallery="${i}" aria-label="Afficher l’image ${i + 1}" aria-pressed="${i === 0}">${i + 1}</button>`).join('')}</div>` : '');
    watchImages($('#gameVisual'));
    const date = formatGameDate(g), created = formatTranslationCreatedDate(g), updated = formatTranslationUpdatedDate(g);
    const facts = [['Statut', g.status], ['Sortie du jeu', date]].filter(([, value]) => value);
    const dates = [['Créée le', created], ['Mise à jour le', updated]].filter(([, value]) => value);
    const rows = entries => entries.map(([label, value, wide]) => `<div${wide ? ' class="gp-fact-wide"' : ''}><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join('');
    $('#gameMeta').innerHTML = (facts.length ? `<section class="gp-facts-section" aria-label="Informations du jeu"><dl class="gp-facts">${rows(facts)}</dl></section>` : '') + (dates.length ? `<section class="gp-facts-section gp-translation-facts" aria-label="Dates de la traduction"><h3><img src="/assets/flags/fr.svg" alt="">Traduction française</h3><dl class="gp-facts">${rows(dates)}</dl></section>` : '') + renderSources(g);
    $('#gameDescription').textContent = g.description || '';
    $('#gameDescription').hidden = !g.description;
    $('#gameSynopsis').hidden = !g.description;
    $('#gameTags').innerHTML = (g.tags || []).map(t => `<span class="gp-tag">${esc(t)}</span>`).join('');
    $('#gameInformation').innerHTML = g.information ? '<h3>Informations</h3>' + linkifyText(g.information) : '';
    $('#gameInformation').hidden = !g.information;
    const linksMarkup = renderLinks(g);
    $('#gameLinks').innerHTML = linksMarkup;
    $('#gameLinks').hidden = !linksMarkup;
    if (!dialog.open) dialog.showModal();
    document.body.style.overflow = 'hidden';
  }

  function clearPrivateView() {
    if (dialog.open) dialog.close();
    state.items = []; state.filtered = [];
    grid.replaceChildren();
    toolbar.hidden = true;
  }

  function showGate(message, login = false) {
    clearPrivateView();
    $('#app').hidden = true; $('#gate').hidden = false;
    $('#gateTitle').textContent = login ? '🔒 Game+' : 'Chargement de Game+';
    $('#gateText').textContent = message;
    loginBtn.hidden = !login; $('#retry').hidden = login;
  }

  async function load() {
    const requestId = ++requestNumber;
    if ($('#app').hidden) {
      $('#gate').hidden = false; $('#gateTitle').textContent = '✨ Game+';
      $('#gateText').textContent = 'Vérification de la connexion…';
      loginBtn.hidden = true; $('#retry').hidden = true;
    }
    try {
      const resp = await fetch('/api/gameplus', { cache: 'no-store', credentials: 'same-origin' });
      const data = await resp.json().catch(() => null);
      if (requestId !== requestNumber) return;
      if (resp.status === 401 || data?.requiresLogin) {
        showGate('Connecte-toi pour accéder à cette section privée et à ses jeux.', true);
        return;
      }
      if (!resp.ok || !data?.ok) throw new Error(data?.error || 'Chargement impossible.');
      state.items = Array.isArray(data.items) ? data.items : [];
      markGamePlusSeen(state.items);
      toolbar.hidden = false;
      loginBtn.hidden = true; $('#retry').hidden = true;
      $('#gate').hidden = true; $('#app').hidden = false;
      sortSelect.value = state.sort;
      fillEngines();
      if (![...engineSelect.options].some(o => o.value === state.engine)) state.engine = 'all';
      engineSelect.value = state.engine;
      applyFilters();
      if (dialog.open) {
        const selected = state.items.find(g => String(g.id) === selectedId);
        if (selected) showGame(selected); else dialog.close();
      }
    } catch (err) {
      if (requestId !== requestNumber) return;
      showGate('Le catalogue ne répond pas pour le moment. Réessaie dans un instant.');
    }
  }

  $('#retry').addEventListener('click', load);
  searchInput?.addEventListener('input', () => { state.q = searchInput.value.trim(); applyFilters(); });
  engineSelect?.addEventListener('change', () => { state.engine = engineSelect.value || 'all'; applyFilters(); });
  sortSelect?.addEventListener('change', () => { state.sort = sortSelect.value || 'title'; applyFilters(); });

  grid.addEventListener('click', ev => {
    const button = ev.target.closest('[data-open]');
    if (button) showGame(state.filtered[Number(button.dataset.open)]);
  });
  $('#closeGame').addEventListener('click', () => dialog.close());
  $('#gameVisual').addEventListener('click', ev => {
    const button = ev.target.closest('[data-gallery]'), g = state.items.find(item => String(item.id) === selectedId);
    if (!button || !g) return;
    const images = [g.banner || g.image || g.cover, ...(g.gallery || [])].map(imageSource).filter(Boolean), src = images[Number(button.dataset.gallery)];
    if (!src) return;
    const wrapper = $('#gameVisual').querySelector('.gp-cover');
    wrapper.querySelector('img')?.remove();
    wrapper.querySelector('.gp-cover-placeholder').hidden = true;
    const image = document.createElement('img'); image.src = src; image.alt = ''; image.referrerPolicy = 'no-referrer'; wrapper.append(image);
    watchImages(wrapper);
    $('#gameVisual').querySelectorAll('[data-gallery]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
  });
  dialog.addEventListener('close', () => {
    selectedId = '';
    for (const id of ['gameVisual', 'gameMeta', 'gameTags', 'gameInformation', 'gameLinks']) $('#' + id).replaceChildren();
    $('#gameTitle').textContent = ''; $('#gameDescription').textContent = '';
    document.body.style.overflow = '';
  });
  dialog.addEventListener('click', ev => {
    if (ev.target !== dialog) return;
    const b = dialog.getBoundingClientRect();
    if (ev.clientX < b.left || ev.clientX > b.right || ev.clientY < b.top || ev.clientY > b.bottom) dialog.close();
  });
  const theme = $('#theme');
  try { theme.value = localStorage.getItem('viewerTheme') || 'auto'; } catch {}
  if (!theme.value) theme.value = 'auto';
  theme.addEventListener('change', () => {
    if (theme.value === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.dataset.theme = theme.value;
    try { localStorage.setItem('viewerTheme', theme.value); } catch {}
  });
  window.addEventListener('pageshow', e => { if (e.persisted) load(); });
  window.addEventListener('focus', load);
  load();
})();
