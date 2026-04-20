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
    roomKicker: document.getElementById('roomKicker'),
    roomTitle: document.getElementById('roomTitle'),
    roomSubtitle: document.getElementById('roomSubtitle'),
  };

  let messages = [];
  let refreshTimer = null;
  let lastRenderedMessageId = null;

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

  function isSelfMessage(item) {
    const me = getAuthUser();
    const authName = (me?.display_name || me?.username || '').trim().toLowerCase();
    const currentNick = (els.nickname?.value || '').trim().toLowerCase();
    const itemNick = String(item?.nickname || '').trim().toLowerCase();
    return Boolean(itemNick && (itemNick === authName || itemNick === currentNick));
  }

  function fillNicknameFromAuth() {
    const me = getAuthUser();
    if (me?.display_name || me?.username) {
      els.nickname.value = me.display_name || me.username || '';
      els.nickname.readOnly = true;
      els.nickname.setAttribute('aria-readonly', 'true');
      els.nickname.title = 'Pseudo lié au compte connecté';
      if (els.authInfo) els.authInfo.textContent = 'Connecté : ton pseudo est repris automatiquement depuis ton compte.';
      return true;
    }
    els.nickname.readOnly = false;
    els.nickname.removeAttribute('aria-readonly');
    els.nickname.title = '';
    if (!els.nickname.value) {
      els.nickname.value = localStorage.getItem(NICK_KEY) || '';
    }
    if (els.authInfo) els.authInfo.textContent = 'Non connecté : pseudo mémorisé dans ce navigateur et accès limité au salon public.';
    return false;
  }

  function getAvailableRooms() {
    const me = getAuthUser();
    const rooms = [{ value: 'global', label: 'Discussion générale', subtitle: 'Salon public', access: 'public' }];

    if (me?.id) {
      rooms.push({ value: 'private:members', label: 'Salon membres', subtitle: 'Réservé aux comptes connectés', access: 'members' });
      if (roleLevel(me.role) >= roleLevel('translator')) {
        rooms.push({ value: 'private:translators', label: 'Salon traducteurs', subtitle: 'Réservé aux traducteurs', access: 'translators' });
      }
      if (roleLevel(me.role) >= roleLevel('admin')) {
        rooms.push({ value: 'private:admins', label: 'Salon admins', subtitle: 'Réservé aux admins', access: 'admins' });
      }
    }

    return rooms;
  }

  function syncRoomOptions() {
    const rooms = getAvailableRooms();
    const wanted = localStorage.getItem(ROOM_KEY) || 'global';
    const allowed = new Set(rooms.map((x) => x.value));
    const selected = allowed.has(wanted) ? wanted : 'global';
    localStorage.setItem(ROOM_KEY, selected);
  }

  function renderSidebarRooms() {
    if (!els.sidebarRoomList) return;
    const current = getSelectedRoom();
    const rooms = getAvailableRooms();
    els.sidebarRoomList.innerHTML = rooms.map((room) => {
      const active = room.value === current ? ' is-active' : '';
      const lock = room.access === 'public' ? '' : '<span class="msg-channel-lock">🔒</span>';
      return `
        <button class="msg-channel${active}" type="button" data-room="${escapeHtml(room.value)}">
          <span class="msg-channel-main">
            <strong>${escapeHtml(room.label)}</strong>
            <small>${lock}${escapeHtml(room.subtitle)}</small>
          </span>
          <span class="msg-channel-badge">${room.value === current ? escapeHtml(String(messages.length)) : '•'}</span>
        </button>
      `;
    }).join('');

    els.sidebarRoomList.querySelectorAll('[data-room]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const value = btn.getAttribute('data-room') || 'global';
        if (value === getSelectedRoom()) return;
        localStorage.setItem(ROOM_KEY, value);
        fetchMessages();
      });
    });
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

  function roomTitle(roomValue) {
    const labels = {
      global: 'Discussion générale',
      'private:members': 'Discussion membres',
      'private:translators': 'Discussion traducteurs',
      'private:admins': 'Discussion admins',
    };
    return labels[String(roomValue || 'global')] || 'Discussion';
  }

  function render() {
    const previousLastId = lastRenderedMessageId;
    const nextLastId = messages.length ? String(messages[messages.length - 1].id ?? '') : null;

    els.list.innerHTML = '';
    els.count && (els.count.textContent = String(messages.length));
    els.empty.classList.toggle('hidden', messages.length > 0);

    const me = getAuthUser();
    const isAdmin = roleLevel(me?.role) >= roleLevel('admin');

    for (const item of messages) {
      const article = document.createElement('article');
      article.className = `msg-item${isSelfMessage(item) ? ' is-self' : ''}`;
      article.innerHTML = `
        <div class="msg-avatar">${escapeHtml(avatarLetter(item.nickname))}</div>
        <div class="msg-bubble">
          <div class="msg-meta">
            <span class="msg-author">${escapeHtml(item.nickname)}</span>
            <span class="msg-date">${escapeHtml(formatDate(item.created_at))}</span>
          </div>
          <div class="msg-text">${escapeHtml(item.message)}</div>
          <div class="msg-actions"></div>
        </div>
      `;

      if (isAdmin) {
        const actions = article.querySelector('.msg-actions');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'msg-delete-btn';
        btn.textContent = 'Supprimer';
        btn.addEventListener('click', () => deleteMessage(item.id));
        actions.appendChild(btn);
      }

      els.list.appendChild(article);
    }

    lastRenderedMessageId = nextLastId;
    const hasNewTail = previousLastId !== nextLastId;
    requestAnimationFrame(() => scrollToBottom({ force: hasNewTail || !previousLastId }));
  }

  async function fetchMessages({ silent = false } = {}) {
    if (!silent) setStatus('Chargement…');
    const room = getSelectedRoom();
    renderSidebarRooms();
    try {
      const res = await fetch(`${API_URL}?limit=80&room=${encodeURIComponent(room)}`, { cache: 'no-store', credentials: 'same-origin' });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Erreur de chargement');
      messages = Array.isArray(data.messages) ? data.messages : [];
      render();
      setStatus(`${roomLabel(room)} · actif`, 'ok');
      if (els.roomKicker) els.roomKicker.textContent = roomLabel(room);
      renderSidebarRooms();
      if (els.roomTitle) els.roomTitle.textContent = roomTitle(room);
      if (els.roomSubtitle) {
        els.roomSubtitle.textContent = room === 'global'
          ? 'Salon visible par tous, pratique pour discuter rapidement ou demander de l’aide.'
          : 'Salon réservé selon ton niveau d’accès.';
      }
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
      scrollToBottom({ force: true });
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

  function isNearBottom() {
    return (els.list.scrollHeight - els.list.scrollTop - els.list.clientHeight) < 60;
  }

  function scrollToBottom({ force = false } = {}) {
    if (!force && !isNearBottom()) return;
    els.list.scrollTop = els.list.scrollHeight;
  }

  function startAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => fetchMessages({ silent: true }), REFRESH_MS);
  }

  function init() {
    fillNicknameFromAuth();
    syncRoomOptions();
    renderSidebarRooms();
    els.form.addEventListener('submit', postMessage);
    els.refresh.addEventListener('click', () => fetchMessages());
    els.scrollBottom.addEventListener('click', () => scrollToBottom({ force: true }));
    els.message.addEventListener('input', () => {
      const left = 500 - els.message.value.length;
      setInfo(`${left} caractère${left > 1 ? 's' : ''} restant${left > 1 ? 's' : ''}.`);
    });

    if (window.SiteAuth?.onChange) {
      window.SiteAuth.onChange(() => {
        fillNicknameFromAuth();
        syncRoomOptions();
        renderSidebarRooms();
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
