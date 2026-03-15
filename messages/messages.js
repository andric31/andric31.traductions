(() => {
  const API_URL = '/api/messages';
  const REFRESH_MS = 7000;
  const NICK_KEY = 'andric31_messages_nickname';
  const ROOM_KEY = 'andric31_messages_room';

  const els = {
    list: document.getElementById('messagesList'),
    empty: document.getElementById('messagesEmpty'),
    form: document.getElementById('chatForm'),
    nickname: document.getElementById('nickname'),
    message: document.getElementById('messageInput'),
    info: document.getElementById('formInfo'),
    authInfo: document.getElementById('authChatInfo'),
    roomSelect: document.getElementById('roomSelect'),
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

  function getAuthUser() {
    return window.SiteAuth?.me || null;
  }

  function getSelectedRoom() {
    return els.roomSelect?.value || localStorage.getItem(ROOM_KEY) || 'global';
  }

  function roleLevel(role) {
    return ({ member: 1, translator: 2, admin: 3 }[String(role || 'member')] || 0);
  }

  function fillNicknameFromAuth() {
    const me = getAuthUser();
    if (me?.display_name || me?.username) {
      els.nickname.value = me.display_name || me.username || '';
      els.nickname.readOnly = true;
      els.nickname.setAttribute('aria-readonly', 'true');
      els.nickname.title = 'Pseudo lié au compte connecté';
      if (els.authInfo) els.authInfo.textContent = '';
      return true;
    }
    els.nickname.readOnly = false;
    els.nickname.removeAttribute('aria-readonly');
    els.nickname.title = '';
    if (!els.nickname.value) {
      els.nickname.value = localStorage.getItem(NICK_KEY) || '';
    }
    if (els.authInfo) els.authInfo.textContent = '';
    return false;
  }

  function syncRoomOptions() {
    if (!els.roomSelect) return;
    const me = getAuthUser();
    const wanted = localStorage.getItem(ROOM_KEY) || 'global';
    const options = [{ value: 'global', label: 'Global public' }];

    if (me?.id) {
      options.push({ value: 'private:members', label: 'Privé — Membres connectés' });
      if (roleLevel(me.role) >= roleLevel('translator')) {
        options.push({ value: 'private:translators', label: 'Privé — Traducteurs' });
      }
      if (roleLevel(me.role) >= roleLevel('admin')) {
        options.push({ value: 'private:admins', label: 'Privé — Admins' });
      }
    }

    els.roomSelect.innerHTML = options.map((opt) => `<option value="${escapeHtml(opt.value)}">${escapeHtml(opt.label)}</option>`).join('');
    const allowed = new Set(options.map((x) => x.value));
    els.roomSelect.value = allowed.has(wanted) ? wanted : 'global';
    localStorage.setItem(ROOM_KEY, els.roomSelect.value);
  }

  function roomLabel(roomValue) {
    const labels = {
      global: 'Salon public',
      'private:members': 'Salon privé membres',
      'private:translators': 'Salon privé traducteurs',
      'private:admins': 'Salon privé admins',
    };
    return labels[String(roomValue || 'global')] || 'Salon';
  }

  function render() {
    els.list.innerHTML = '';
    els.count.textContent = String(messages.length);
    els.empty.classList.toggle('hidden', messages.length > 0);

    const me = getAuthUser();
    const isAdmin = roleLevel(me?.role) >= roleLevel('admin');

    for (const item of messages) {
      const article = document.createElement('article');
      article.className = 'msg-item';
      article.innerHTML = `
        <div class="msg-item-main">
          <div class="msg-author">
            <span class="msg-avatar">${escapeHtml(avatarLetter(item.nickname))}</span>
            <span>${escapeHtml(item.nickname)}</span>
          </div>
          <div class="msg-text">${escapeHtml(item.message)}</div>
        </div>
        <div class="msg-head-actions">
          <div class="msg-date">${escapeHtml(formatDate(item.created_at))}</div>
        </div>
      `;

      if (isAdmin) {
        const actions = article.querySelector('.msg-head-actions');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'msg-delete-btn';
        btn.textContent = 'Supprimer';
        btn.addEventListener('click', () => deleteMessage(item.id));
        actions.appendChild(btn);
      }

      els.list.appendChild(article);
    }
  }

  async function fetchMessages({ silent = false } = {}) {
    if (!silent) setStatus('Chargement…');
    const room = getSelectedRoom();
    try {
      const res = await fetch(`${API_URL}?limit=80&room=${encodeURIComponent(room)}`, { cache: 'no-store', credentials: 'same-origin' });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Erreur de chargement');
      messages = Array.isArray(data.messages) ? data.messages : [];
      render();
      setStatus(`${roomLabel(room)} · actif`, 'ok');
      const headKicker = document.querySelector('.msg-main-kicker');
      const headTitle = document.querySelector('.msg-main-head h2');
      if (headKicker) headKicker.textContent = roomLabel(room);
      if (headTitle) headTitle.textContent = room === 'global' ? 'Discussion générale' : roomLabel(room);
    } catch (err) {
      setStatus('Hors ligne', 'error');
      if (!silent) setInfo(err.message || 'Impossible de charger les messages.', 'error');
    }
  }

  async function postMessage(evt) {
    evt.preventDefault();

    fillNicknameFromAuth();
    const nickname = els.nickname.value.trim();
    const message = els.message.value.trim();
    const room = getSelectedRoom();

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
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nickname, message, room }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Envoi impossible');

      if (!getAuthUser()) localStorage.setItem(NICK_KEY, nickname);
      localStorage.setItem(ROOM_KEY, room);
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
    const me = getAuthUser();
    if (roleLevel(me?.role) < roleLevel('admin')) return;
    if (!confirm('Supprimer ce message ?')) return;

    try {
      const res = await fetch(`${API_URL}?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
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


  function init() {
    fillNicknameFromAuth();
    syncRoomOptions();
    els.form.addEventListener('submit', postMessage);
    els.refresh.addEventListener('click', () => fetchMessages());
    els.roomSelect?.addEventListener('change', () => {
      localStorage.setItem(ROOM_KEY, getSelectedRoom());
      fetchMessages();
    });
    els.scrollBottom.addEventListener('click', scrollToBottom);
    els.message.addEventListener('input', () => {
      const left = 500 - els.message.value.length;
      setInfo(`${left} caractère${left > 1 ? 's' : ''} restant${left > 1 ? 's' : ''}.`);
    });
    if (window.SiteAuth?.onChange) {
      window.SiteAuth.onChange(() => {
        fillNicknameFromAuth();
        syncRoomOptions();
        fetchMessages({ silent: true });
      });
      if (!window.SiteAuth.loaded && window.SiteAuth.fetchMe) {
        window.SiteAuth.fetchMe().finally(() => {
          fillNicknameFromAuth();
          syncRoomOptions();
          fetchMessages();
        });
      } else {
        fillNicknameFromAuth();
        syncRoomOptions();
        fetchMessages();
      }
    } else {
      fetchMessages();
    }
    startAutoRefresh();
  }

  init();
})();
