(() => {
  'use strict';
  const grid = document.getElementById('topGrid');
  const status = document.getElementById('topStatus');

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ranks = ['🥇','🥈','🥉'];

  function dateLabel(value) {
    const d = new Date(value || '');
    if (!Number.isFinite(d.getTime())) return 'Publication récente';
    return `Le ${d.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'})}`;
  }

  function gameUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '#';
    try { const u = new URL(raw, location.origin); return u.pathname + u.search + u.hash; } catch { return raw; }
  }

  function renderCard(top) {
    const name = esc(top.display_name || top.username || 'Membre');
    const games = Array.isArray(top.games) ? top.games : [];
    return `<article class="community-top-card">
      <header class="community-top-card-head">
        <span class="community-top-avatar">👤</span>
        <span class="community-top-member"><strong>${name}</strong><small>${esc(dateLabel(top.updated_at || top.published_at))}</small></span>
      </header>
      <div class="community-top-list">
        ${games.map((game,index)=>`<a class="community-top-game" href="${esc(gameUrl(game.game_url))}" target="_blank" rel="noopener">
          <span class="community-top-rank">${ranks[index] || `${index+1}.`}</span>
          <img class="community-top-cover" src="${esc(game.image_url || '/favicon.png')}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.src='/favicon.png'">
          <span><strong>${esc(game.title || 'Jeu sans titre')}</strong></span>
        </a>`).join('')}
      </div>
    </article>`;
  }

  async function load() {
    try {
      const res = await fetch('/api/community-tops?limit=100', { cache:'no-store' });
      const data = await res.json().catch(()=>null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Chargement impossible.');
      const tops = Array.isArray(data.items) ? data.items.filter((x)=>Array.isArray(x.games)&&x.games.length) : [];
      if (!tops.length) {
        status.textContent = '';
        grid.innerHTML = '<div class="community-top-empty">Aucun membre n’a encore publié son Top jeux.<br>Le premier classement apparaîtra ici dès sa publication.</div>';
        return;
      }
      status.textContent = `${tops.length} top${tops.length>1?'s':''} publié${tops.length>1?'s':''}, du plus récent au plus ancien.`;
      grid.innerHTML = tops.map(renderCard).join('');
    } catch (err) {
      status.textContent = err?.message || 'Chargement impossible.';
      status.classList.add('err');
      grid.innerHTML = '<div class="community-top-empty">Impossible de charger les tops pour le moment.</div>';
    }
  }
  load();
})();
