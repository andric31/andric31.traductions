(() => {
  const STORAGE_KEY = 'andric31_seen_notification_id';
  const LIST_URL = '/notifications/notifications.json';
  const els = {
    list: document.getElementById('notifList'),
    status: document.getElementById('notifStatus'),
  };

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[char]));
  }

  function formatDate(iso) {
    try {
      return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
    } catch {
      return iso || '';
    }
  }

  function bellIcon() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18H5.75A1.75 1.75 0 0 1 4 16.25c0-.55.27-1.07.72-1.39l.73-.53a2.5 2.5 0 0 0 1.05-2.03V10a5.5 5.5 0 1 1 11 0v2.3a2.5 2.5 0 0 0 1.05 2.03l.73.53c.45.32.72.84.72 1.39A1.75 1.75 0 0 1 18.25 18H17"/><path d="M9.5 18a2.5 2.5 0 0 0 5 0"/></svg>`;
  }

  async function loadNotifications() {
    const res = await fetch(`${LIST_URL}?v=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Impossible de charger les notifications.');
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('Format de notifications invalide.');
    return data.slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  }

  function render(items) {
    els.list.innerHTML = '';
    const seenId = localStorage.getItem(STORAGE_KEY) || '';

    if (!items.length) {
      els.status.textContent = 'Aucune notification pour le moment.';
      els.status.className = 'notif-empty';
      els.list.classList.add('hidden');
      return;
    }

    els.status.classList.add('hidden');
    els.list.classList.remove('hidden');

    for (const item of items) {
      const article = document.createElement(item.url ? 'a' : 'article');
      article.className = `notif-item${item.id !== seenId ? ' new' : ''}`;
      if (item.url) {
        article.href = item.url;
        article.target = '_blank';
        article.rel = 'noopener noreferrer';
        article.style.textDecoration = 'none';
      }
      article.innerHTML = `
        <div class="notif-icon">${bellIcon()}</div>
        <div class="notif-body">
          <div class="notif-title-row">
            <div class="notif-title">${escapeHtml(item.title || 'Notification')}</div>
            ${item.id !== seenId ? '<span class="notif-badge">Nouveau</span>' : ''}
          </div>
          <p class="notif-text">${escapeHtml(item.text || '')}</p>
          <div class="notif-meta">
            <span>${escapeHtml(formatDate(item.created_at))}</span>
          </div>
        </div>
      `;
      els.list.appendChild(article);
    }

    localStorage.setItem(STORAGE_KEY, String(items[0]?.id || ''));
  }

  async function init() {
    try {
      const items = await loadNotifications();
      render(items);
    } catch (err) {
      els.status.textContent = err?.message || 'Erreur de chargement.';
      els.status.className = 'notif-error';
    }
  }

  init();
})();
