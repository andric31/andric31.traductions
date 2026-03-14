(() => {
  const API_URL = '/api/messages';
  const REFRESH_MS = 7000;
  const NICK_KEY = 'andric31_messages_nickname';
  const ADMIN_TOKEN_KEY = 'andric31_messages_admin_token';

  const els = {
    list: document.getElementById('messagesList'),
    empty: document.getElementById('messagesEmpty'),
    form: document.getElementById('chatForm'),
    nickname: document.getElementById('nickname'),
    message: document.getElementById('messageInput'),
    info: document.getElementById('formInfo'),
    send: document.getElementById('sendBtn'),
    refresh: document.getElementById('refreshBtn'),
    scrollBottom: document.getElementById('scrollBottomBtn'),
    count: document.getElementById('msgCount'),
    status: document.getElementById('roomStatus'),
  };

  let messages = [];
  let refreshTimer = null;

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function setInfo(text, type = '') {
    els.info.textContent = text;
    els.info.classList.remove('error', 'success');
    if (type) els.info.classList.add(type);
  }

  function setStatus(text, type = '') {
    els.status.textContent = text;
    els.status.classList.remove('ok', 'error');
    if (type) els.status.classList.add(type);
  }

  function formatDate(iso) {
    try {
      return new Intl.DateTimeFormat('fr-FR', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date(iso));
    } catch {
      return iso || '';
    }
  }

  function avatarLetter(name) {
    const cleaned = String(name || '?').trim();
    return (cleaned[0] || '?').toUpperCase();
  }

  function getAdminToken() {
    return localStorage.getItem(ADMIN_TOKEN_KEY) || '';
  }

  function render() {
    els.list.innerHTML = '';
    els.count.textContent = String(messages.length);
    els.empty.classList.toggle('hidden', messages.length > 0);

    const adminToken = getAdminToken();

    for (const item of messages) {
      const article = document.createElement('article');
      article.className = 'msg-item';
      article.innerHTML = `
        <div class="msg-item-head">
          <div class="msg-author">
            <span class="msg-avatar">${escapeHtml(avatarLetter(item.nickname))}</span>
            <span>${escapeHtml(item.nickname)}</span>
          </div>
          <div class="msg-date">${escapeHtml(formatDate(item.created_at))}</div>
        </div>
        <div class="msg-text">${escapeHtml(item.message)}</div>
      `;

      if (adminToken) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'msg-delete-btn';
        btn.textContent = 'Supprimer';
        btn.addEventListener('click', () => deleteMessage(item.id));
        article.appendChild(btn);
      }

      els.list.appendChild(article);
    }
  }

  async function fetchMessages({ silent = false } = {}) {
    if (!silent) setStatus('Chargement…');
    try {
      const res = await fetch(`${API_URL}?limit=80`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Erreur de chargement');
      messages = Array.isArray(data.messages) ? data.messages : [];
      render();
      setStatus('Connecté', 'ok');
    } catch (err) {
      setStatus('Hors ligne', 'error');
      if (!silent) setInfo(err.message || 'Impossible de charger les messages.', 'error');
    }
  }

  async function postMessage(evt) {
    evt.preventDefault();

    const nickname = els.nickname.value.trim();
    const message = els.message.value.trim();

    if (!nickname) {
      setInfo('Le pseudo est obligatoire.', 'error');
      els.nickname.focus();
      return;
    }
    if (nickname.length < 2) {
      setInfo('Le pseudo est trop court.', 'error');
      els.nickname.focus();
      return;
    }
    if (!message) {
      setInfo('Le message est vide.', 'error');
      els.message.focus();
      return;
    }

    els.send.disabled = true;
    setInfo('Envoi du message…');

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nickname, message }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Envoi impossible');

      localStorage.setItem(NICK_KEY, nickname);
      els.message.value = '';
      setInfo('Message envoyé.', 'success');
      await fetchMessages({ silent: true });
      scrollToBottom();
    } catch (err) {
      setInfo(err.message || 'Erreur pendant l’envoi.', 'error');
    } finally {
      els.send.disabled = false;
    }
  }

  async function deleteMessage(id) {
    const token = getAdminToken();
    if (!token) return;
    if (!confirm('Supprimer ce message ?')) return;

    try {
      const res = await fetch(`${API_URL}?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'x-admin-token': token },
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Suppression impossible');
      setInfo('Message supprimé.', 'success');
      await fetchMessages({ silent: true });
    } catch (err) {
      setInfo(err.message || 'Erreur de suppression.', 'error');
    }
  }

  function scrollToBottom() {
    els.list.scrollTop = els.list.scrollHeight;
  }

  function startAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => fetchMessages({ silent: true }), REFRESH_MS);
  }

  function initAdminShortcut() {
    window.addEventListener('keydown', (evt) => {
      if (!evt.ctrlKey || !evt.shiftKey || evt.key.toLowerCase() !== 'm') return;
      const current = getAdminToken();
      const token = prompt('Token admin pour la modération :', current);
      if (token === null) return;
      if (!token.trim()) {
        localStorage.removeItem(ADMIN_TOKEN_KEY);
        setInfo('Mode admin retiré.');
      } else {
        localStorage.setItem(ADMIN_TOKEN_KEY, token.trim());
        setInfo('Mode admin activé.', 'success');
      }
      render();
    });
  }

  function init() {
    els.nickname.value = localStorage.getItem(NICK_KEY) || '';
    els.form.addEventListener('submit', postMessage);
    els.refresh.addEventListener('click', () => fetchMessages());
    els.scrollBottom.addEventListener('click', scrollToBottom);
    els.message.addEventListener('input', () => {
      const left = 500 - els.message.value.length;
      setInfo(`${left} caractère${left > 1 ? 's' : ''} restant${left > 1 ? 's' : ''}.`);
    });
    initAdminShortcut();
    fetchMessages();
    startAutoRefresh();
  }

  init();
})();
