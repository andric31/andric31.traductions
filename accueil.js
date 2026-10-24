(() => {
  const local = location.protocol === 'file:';
  function setLink(a, path) {
    a.href = (local ? 'https://andric31-traductions.pages.dev' : '') + path;
    if (local) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
  }
  document.querySelectorAll('[data-path]').forEach(a => setLink(a, a.dataset.path));
  const aboutDialog = document.getElementById('aboutDialog');
  document.getElementById('aboutOpen').addEventListener('click', () => aboutDialog.showModal());
  aboutDialog.querySelectorAll('[data-about-close]').forEach(button => button.addEventListener('click', () => aboutDialog.close()));
  aboutDialog.addEventListener('click', event => {
    const bounds = aboutDialog.getBoundingClientRect();
    if (event.target === aboutDialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) aboutDialog.close();
  });
  const accountLink = document.getElementById('accountLink');
  function showSession(me) {
    document.querySelectorAll('[data-auth-only]').forEach(a => a.classList.toggle('auth-hidden', !me));
    accountLink.textContent = me ? '👤 Mon compte' : '🔐 Se connecter';
    accountLink.dataset.path = me ? '/compte' : '/connexion';
    setLink(accountLink, accountLink.dataset.path);
  }
  let sessionRequest = null;
  async function refreshSession() {
    // Un HTML ouvert par double-clic n’a pas accès au cookie de connexion du site.
    if (location.protocol === 'file:') { showSession(null); return; }
    if (window.SiteAuth?.loaded) { showSession(window.SiteAuth.me); return; }
    if (sessionRequest) return sessionRequest;
    sessionRequest = (async () => {
      try {
        const res = await fetch('/api/auth-me', { credentials: 'same-origin', cache: 'no-store' });
        const data = res.ok ? await res.json() : null;
        showSession(data?.logged_in && data.user ? data.user : null);
      } catch { showSession(null); }
    })().finally(() => { sessionRequest = null; });
    return sessionRequest;
  }
  window.SiteAuth?.onChange?.(showSession);
  void refreshSession();
  window.addEventListener('focus', () => { void refreshSession(); });

  const theme = document.getElementById('theme');
  try { theme.value = localStorage.getItem('viewerTheme') || 'auto'; } catch { theme.value = 'auto'; }
  if (!theme.value) theme.value = 'auto';
  theme.addEventListener('change', () => {
    if (theme.value === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme.value);
    try { localStorage.setItem('viewerTheme', theme.value); } catch {}
  });
  const menu = document.getElementById('menu'), nav = document.getElementById('navigation');
  function toggle(open) { nav.classList.toggle('is-open', open); menu.setAttribute('aria-expanded', String(open)); menu.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu'); }
  menu.addEventListener('click', () => toggle(menu.getAttribute('aria-expanded') !== 'true'));
  nav.addEventListener('click', event => { if (event.target.closest('a')) toggle(false); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { toggle(false); if (document.activeElement === menu || nav.contains(document.activeElement)) menu.focus(); } });
})();
