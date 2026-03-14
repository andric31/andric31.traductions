(() => {
  const KEY = 'viewerTheme';

  function getStoredTheme() {
    try {
      return (localStorage.getItem(KEY) || 'auto').trim() || 'auto';
    } catch {
      return 'auto';
    }
  }

  function applyTheme(theme) {
    const value = String(theme || 'auto').trim() || 'auto';
    const root = document.documentElement;
    root.removeAttribute('data-theme');
    if (value !== 'auto') root.setAttribute('data-theme', value);
  }

  applyTheme(getStoredTheme());

  try {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const refreshAuto = () => {
      if (getStoredTheme() === 'auto') applyTheme('auto');
    };
    if (typeof media.addEventListener === 'function') media.addEventListener('change', refreshAuto);
    else if (typeof media.addListener === 'function') media.addListener(refreshAuto);
  } catch {}

  window.addEventListener('storage', (event) => {
    if (event.key === KEY) applyTheme(getStoredTheme());
  });
})();
