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
  const carousel = document.querySelector('[data-tools-carousel]');
  if (carousel) {
    const viewport = carousel.querySelector('.tools-carousel__viewport');
    const track = carousel.querySelector('.tools-carousel__track');
    const slides = [...track.querySelectorAll('.viewer-release')];
    const controls = carousel.querySelector('.tools-carousel__controls');
    const dots = [...controls.querySelectorAll('[data-carousel-go]')];
    const pauseButton = controls.querySelector('[data-carousel-pause]');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let current = 0;
    let timer = null;
    let paused = reducedMotion.matches;
    let hovered = false;
    let focused = false;

    function showSlide(index) {
      const previous = current;
      current = (index + slides.length) % slides.length;
      slides.forEach((slide, i) => {
        const active = i === current;
        slide.classList.toggle('is-active', active);
        slide.classList.toggle('is-previous', !active && i === previous);
        slide.inert = !active;
        slide.setAttribute('aria-hidden', String(!active));
        slide.setAttribute('role', 'group');
        slide.setAttribute('aria-roledescription', 'diapositive');
        dots[i].toggleAttribute('data-active', active);
        if (active) dots[i].setAttribute('aria-current', 'true');
        else dots[i].removeAttribute('aria-current');
      });
    }

    function schedule() {
      window.clearTimeout(timer);
      timer = null;
      const running = slides.length > 1 && !paused && !hovered && !focused && !document.hidden;
      track.setAttribute('aria-live', running ? 'off' : 'polite');
      pauseButton.textContent = paused ? '▶ Reprendre' : 'Ⅱ Pause';
      pauseButton.setAttribute('aria-label', paused ? 'Reprendre le défilement automatique' : 'Mettre le défilement en pause');
      if (running) {
        timer = window.setTimeout(() => {
          showSlide(current + 1);
          schedule();
        }, 3000);
      }
    }

    dots.forEach((dot, index) => {
      dot.addEventListener('click', () => { showSlide(index); schedule(); });
      dot.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? dots.length - 1 :
          (index + (event.key === 'ArrowRight' ? 1 : -1) + dots.length) % dots.length;
        dots[next].focus();
        showSlide(next);
        schedule();
      });
    });
    pauseButton.addEventListener('click', () => {
      paused = !paused;
      if (!paused) focused = false;
      schedule();
    });
    viewport.addEventListener('pointerenter', event => {
      if (event.pointerType === 'mouse') { hovered = true; schedule(); }
    });
    viewport.addEventListener('pointerleave', () => { hovered = false; schedule(); });
    carousel.addEventListener('focusin', () => { focused = true; schedule(); });
    carousel.addEventListener('focusout', event => {
      if (!carousel.contains(event.relatedTarget)) { focused = false; schedule(); }
    });
    document.addEventListener('visibilitychange', schedule);
    reducedMotion.addEventListener('change', event => {
      if (event.matches) paused = true;
      schedule();
    });
    showSlide(0);
    carousel.classList.add('is-ready');
    controls.hidden = false;
    schedule();
  }
})();
