(() => {
  const API_URL = '/api/messages';
  const DEFAULT_REFRESH_MS = 7000;
  const NICK_KEY = 'andric31_messages_nickname';
  const ROOM_KEY = 'andric31_messages_room';
  const REFRESH_KEY = 'andric31_messages_refresh_ms';
  const REPLY_PREFIX = '[[reply:';
  const REACT_KEY = 'andric31_messages_reactions';
  const EMOJIS = ['😀','😁','😂','🤣','😊','😍','🥰','😘','😎','🤔','😅','😢','😭','😡','👍','👎','👏','🙏','🔥','✅','❌','🎉','💬','❤️'];
  const QUICK_REACTIONS = ['👍','❤️','😂','🔥','👏','🎉','😮','🤔','😢','😡'];

  const els = {
    list: document.getElementById('messagesList'),
    empty: document.getElementById('messagesEmpty'),
    form: document.getElementById('chatForm'),
    nickname: document.getElementById('nickname'),
    message: document.getElementById('messageInput'),
    info: document.getElementById('formInfo'),
    status: document.getElementById('roomStatus'),
    refresh: document.getElementById('refreshBtn'),
    send: document.getElementById('sendBtn'),
    scrollBottom: document.getElementById('scrollBottomBtn'),
    roomKicker: document.getElementById('roomKicker'),
    roomTitle: document.getElementById('roomTitle'),
    roomSubtitle: document.getElementById('roomSubtitle'),
    publicPrivacyBanner: document.getElementById('publicPrivacyBanner'),
    globalNoticeBanner: document.getElementById('globalNoticeBanner'),
    authInfo: document.getElementById('authChatInfo'),
    sidebarRoomList: document.getElementById('sidebarRoomList'),
    emojiToggle: document.getElementById('emojiToggleBtn'),
    emojiPicker: document.getElementById('emojiPicker'),
    replyPreview: document.getElementById('replyPreview'),
    replyAuthor: document.getElementById('replyAuthor'),
    replyExcerpt: document.getElementById('replyExcerpt'),
    refreshDelay: document.getElementById('refreshDelaySelect'),
    cancelReply: document.getElementById('cancelReplyBtn'),
  };

  let messages = [];
  let refreshTimer = null;
  let lastRenderedMessageId = null;
  let replyState = null;
  let openMessageId = null;
  let keepPinnedToBottom = true;
  let lastMessagesSignature = '';

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
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
      return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
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
    return localStorage.getItem(ROOM_KEY) || 'global';
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
      if (els.authInfo) els.authInfo.textContent = 'Connecté : pseudo repris automatiquement depuis ton compte.';
      return true;
    }
    els.nickname.readOnly = false;
    els.nickname.removeAttribute('aria-readonly');
    els.nickname.title = '';
    if (!els.nickname.value) els.nickname.value = localStorage.getItem(NICK_KEY) || '';
    if (els.authInfo) els.authInfo.textContent = 'Non connecté : pseudo mémorisé dans ce navigateur, accès au salon public.';
    return false;
  }

  function getAvailableRooms() {
    const me = getAuthUser();
    const rooms = [{ value: 'global', label: 'Discussion générale', subtitle: 'Salon public', access: 'public' }];
    if (me?.id) {
      rooms.push({ value: 'private:members', label: 'Salon membres', subtitle: 'Réservé aux comptes connectés', access: 'members' });
      if (roleLevel(me.role) >= roleLevel('translator')) rooms.push({ value: 'private:translators', label: 'Salon traducteurs', subtitle: 'Réservé aux traducteurs', access: 'translators' });
      if (roleLevel(me.role) >= roleLevel('admin')) rooms.push({ value: 'private:admins', label: 'Salon admins', subtitle: 'Réservé aux admins', access: 'admins' });
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
    return ({
      global: 'Salon public',
      'private:members': 'Salon privé membres',
      'private:translators': 'Salon privé traducteurs',
      'private:admins': 'Salon privé admins',
    }[String(roomValue || 'global')] || 'Salon');
  }

  function syncRoomBanners(roomValue) {
    const isPublic = String(roomValue || 'global') === 'global';
    if (els.publicPrivacyBanner) els.publicPrivacyBanner.classList.toggle('hidden', !isPublic);
    if (els.globalNoticeBanner) els.globalNoticeBanner.textContent = isPublic
      ? 'Merci de ne pas flooder ni interférer dans les aides en cours.'
      : 'Merci de ne pas flooder ni interférer dans les aides en cours.';
  }

  function roomTitle(roomValue) {
    return ({
      global: 'Discussion générale',
      'private:members': 'Discussion membres',
      'private:translators': 'Discussion traducteurs',
      'private:admins': 'Discussion admins',
    }[String(roomValue || 'global')] || 'Discussion');
  }

  function excerptText(value, max = 90) {
    const clean = String(value || '').replace(/\s+/g, ' ').trim();
    if (clean.length <= max) return clean;
    return clean.slice(0, max - 1) + '…';
  }

  function parseMessage(raw) {
    const text = String(raw || '');
    if (!text.startsWith(REPLY_PREFIX)) return { reply: null, body: text };
    const end = text.indexOf(']]');
    if (end === -1) return { reply: null, body: text };
    const payload = text.slice(REPLY_PREFIX.length, end);
    const sep = payload.indexOf('|');
    if (sep === -1) return { reply: null, body: text };
    const author = payload.slice(0, sep).trim();
    const excerpt = payload.slice(sep + 1).trim();
    const body = text.slice(end + 2).replace(/^\n+/, '');
    return { reply: { author, excerpt }, body };
  }

  function buildStoredMessage(message) {
    if (!replyState) return message;
    return `${REPLY_PREFIX}${replyState.author}|${replyState.excerpt}]]\n${message}`;
  }

  function updateReplyPreview() {
    const hasReply = Boolean(replyState);
    els.replyPreview.classList.toggle('hidden', !hasReply);
    if (!hasReply) return;
    els.replyAuthor.textContent = `Réponse à ${replyState.author}`;
    els.replyExcerpt.textContent = replyState.excerpt;
  }


  function getRefreshDelay() {
    const raw = Number(localStorage.getItem(REFRESH_KEY) || DEFAULT_REFRESH_MS);
    const allowed = new Set([3000, 5000, 7000, 10000, 15000, 30000]);
    return allowed.has(raw) ? raw : DEFAULT_REFRESH_MS;
  }

  function syncRefreshDelayControl() {
    if (!els.refreshDelay) return;
    els.refreshDelay.value = String(getRefreshDelay());
  }

  function isMobileViewport() {
    return window.matchMedia('(max-width: 1080px)').matches;
  }

  function getLastMessageElement() {
    return els.list?.lastElementChild || null;
  }

  function keepLastMessageVisible({ force = false, smooth = false } = {}) {
    const last = getLastMessageElement();
    if (!last) return;
    if (!force && !keepPinnedToBottom && !isNearBottom()) return;
    const run = () => {
      els.list.scrollTop = els.list.scrollHeight;
      if (smooth) {
        last.scrollIntoView({ block: 'end', inline: 'nearest', behavior: 'smooth' });
      }
      els.list.scrollTop = els.list.scrollHeight;
    };
    run();
    if (isMobileViewport()) {
      requestAnimationFrame(run);
      setTimeout(run, 120);
      setTimeout(run, 260);
    }
  }

  function setReplyFromItem(item) {
    const parsed = parseMessage(item?.message);
    replyState = {
      author: String(item?.nickname || 'Message').trim() || 'Message',
      excerpt: excerptText(parsed.body || item?.message || ''),
    };
    updateReplyPreview();
    els.message.focus();
  }

  function clearReply() {
    replyState = null;
    updateReplyPreview();
  }

  function insertAtCursor(input, text) {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const before = input.value.slice(0, start);
    const after = input.value.slice(end);
    input.value = before + text + after;
    const next = start + text.length;
    input.setSelectionRange(next, next);
    input.focus();
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function toggleEmojiPicker(force) {
    const shouldOpen = typeof force === 'boolean' ? force : els.emojiPicker.classList.contains('hidden');
    els.emojiPicker.classList.toggle('hidden', !shouldOpen);
    els.emojiPicker.setAttribute('aria-hidden', String(!shouldOpen));
    els.emojiToggle.setAttribute('aria-expanded', String(shouldOpen));
  }


  function getReactionStore() {
    try {
      return JSON.parse(localStorage.getItem(REACT_KEY) || '{}') || {};
    } catch {
      return {};
    }
  }

  function saveReactionStore(store) {
    localStorage.setItem(REACT_KEY, JSON.stringify(store));
  }

  function getMessageReactions(messageId) {
    const store = getReactionStore();
    return store[String(messageId)] || {};
  }

  function currentReactionUser() {
    const me = getAuthUser();
    return (me?.display_name || me?.username || els.nickname.value || 'Visiteur').trim() || 'Visiteur';
  }

  function hasUserReaction(messageId, emoji) {
    const bucket = getMessageReactions(messageId)[emoji];
    const user = currentReactionUser();
    return Array.isArray(bucket) && bucket.includes(user);
  }

  function toggleReaction(messageId, emoji) {
    const store = getReactionStore();
    const key = String(messageId);
    const user = currentReactionUser();
    store[key] ||= {};
    store[key][emoji] ||= [];
    if (store[key][emoji].includes(user)) {
      store[key][emoji] = store[key][emoji].filter((name) => name !== user);
      if (!store[key][emoji].length) delete store[key][emoji];
    } else {
      store[key][emoji].push(user);
    }
    if (!Object.keys(store[key]).length) delete store[key];
    saveReactionStore(store);
    render();
  }

  function renderEmojiPicker() {
    els.emojiPicker.innerHTML = EMOJIS.map((emoji) => `<button class="msg-emoji-item" type="button" data-emoji="${emoji}" aria-label="Ajouter ${emoji}">${emoji}</button>`).join('');
    els.emojiPicker.querySelectorAll('[data-emoji]').forEach((btn) => {
      btn.addEventListener('click', () => insertAtCursor(els.message, `${btn.getAttribute('data-emoji')} `));
    });
  }


  function buildMessagesSignature(list) {
    try {
      return (Array.isArray(list) ? list : []).map((item) => [
        item?.id ?? '',
        item?.created_at ?? '',
        item?.nickname ?? '',
        item?.message ?? '',
      ].join('¦')).join('||');
    } catch {
      return String(Date.now());
    }
  }

  function render() {
    const previousLastId = lastRenderedMessageId;
    const shouldStickToBottom = keepPinnedToBottom || isNearBottom();
    const nextLastId = messages.length ? String(messages[messages.length - 1].id ?? '') : null;

    els.list.innerHTML = '';
    els.empty.classList.toggle('hidden', messages.length > 0);

    const me = getAuthUser();
    const isAdmin = roleLevel(me?.role) >= roleLevel('admin');

    for (const item of messages) {
      const parsed = parseMessage(item.message);
      const article = document.createElement('article');
      const isOpen = String(item.id) === String(openMessageId);
      const reactions = getMessageReactions(item.id);
      const reactionHtml = Object.entries(reactions).map(([emoji, users]) => `
        <button class="msg-reaction-chip${hasUserReaction(item.id, emoji) ? ' is-active' : ''}" type="button" data-react-chip="${escapeHtml(String(item.id))}" data-emoji="${escapeHtml(emoji)}">${emoji} <span>${Array.isArray(users) ? users.length : 0}</span></button>
      `).join('');
      article.className = `msg-item${isSelfMessage(item) ? ' is-self' : ''}${isOpen ? ' is-open' : ''}`;
      article.innerHTML = `
        <div class="msg-avatar">${escapeHtml(avatarLetter(item.nickname))}</div>
        <div class="msg-bubble" data-open-msg="${escapeHtml(String(item.id))}">
          <div class="msg-bubble-top">
            <div class="msg-body">
              <div class="msg-meta">
                <span class="msg-author">${escapeHtml(item.nickname)}</span>
                <span class="msg-date">${escapeHtml(formatDate(item.created_at))}</span>
              </div>
              ${parsed.reply ? `<div class="msg-quote"><span class="msg-quote-author">${escapeHtml(parsed.reply.author)}</span><span class="msg-quote-text">${escapeHtml(parsed.reply.excerpt)}</span></div>` : ''}
              <div class="msg-text">${escapeHtml(parsed.body)}</div>
              ${reactionHtml ? `<div class="msg-reactions">${reactionHtml}</div>` : ''}
              <div class="msg-actions">
                <div class="msg-tools-left">
                  <button class="msg-inline-btn msg-reply-btn" type="button" data-reply-id="${escapeHtml(String(item.id))}">↩ Répondre</button>
                </div>
                <div class="msg-tools-right">
                  <div class="msg-react-toolbar">
                    ${QUICK_REACTIONS.map((emoji) => `<button class="msg-react-btn${hasUserReaction(item.id, emoji) ? ' is-active' : ''}" type="button" data-react-id="${escapeHtml(String(item.id))}" data-emoji="${emoji}" aria-label="Réagir avec ${emoji}">${emoji}</button>`).join('')}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;

      const bubble = article.querySelector('[data-open-msg]');
      bubble.addEventListener('click', (evt) => {
        if (evt.target.closest('button')) return;
        openMessageId = isOpen ? null : item.id;
        render();
      });

      article.querySelector('[data-reply-id]')?.addEventListener('click', (evt) => {
        evt.stopPropagation();
        setReplyFromItem(item);
      });

      article.querySelectorAll('[data-react-id]').forEach((btn) => {
        btn.addEventListener('click', (evt) => {
          evt.stopPropagation();
          toggleReaction(item.id, btn.getAttribute('data-emoji') || '👍');
        });
      });

      article.querySelectorAll('[data-react-chip]').forEach((btn) => {
        btn.addEventListener('click', (evt) => {
          evt.stopPropagation();
          toggleReaction(item.id, btn.getAttribute('data-emoji') || '👍');
        });
      });

      if (isAdmin) {
        const actions = article.querySelector('.msg-tools-left');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'msg-delete-btn';
        btn.textContent = 'Supprimer';
        btn.addEventListener('click', (evt) => {
          evt.stopPropagation();
          deleteMessage(item.id);
        });
        actions.appendChild(btn);
      }

      els.list.appendChild(article);
    }

    lastRenderedMessageId = nextLastId;
    const hasNewTail = previousLastId !== nextLastId;
    requestAnimationFrame(() => keepLastMessageVisible({ force: hasNewTail || !previousLastId || shouldStickToBottom, smooth: false }));
  }

  async function fetchMessages({ silent = false } = {}) {
    if (!silent) setStatus('Chargement…');
    const room = getSelectedRoom();
    renderSidebarRooms();
    try {
      const res = await fetch(`${API_URL}?limit=80&room=${encodeURIComponent(room)}`, { cache: 'no-store', credentials: 'same-origin' });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Erreur de chargement');
      const nextMessages = Array.isArray(data.messages) ? data.messages : [];
      const nextSignature = buildMessagesSignature(nextMessages);
      const roomChanged = room !== (localStorage.getItem('__andric31_last_room_rendered') || '');
      const shouldRerender = roomChanged || nextSignature !== lastMessagesSignature;
      messages = nextMessages;
      if (shouldRerender) {
        lastMessagesSignature = nextSignature;
        localStorage.setItem('__andric31_last_room_rendered', room);
        render();
      }
      setStatus(`${roomLabel(room)} · actif`, 'ok');
      if (els.roomKicker) els.roomKicker.textContent = roomLabel(room);
      renderSidebarRooms();
      if (els.roomTitle) els.roomTitle.textContent = roomTitle(room);
      if (els.roomSubtitle) els.roomSubtitle.textContent = room === 'global'
        ? 'Salon visible par tous, pratique pour discuter rapidement ou demander de l’aide.'
        : 'Salon réservé selon ton niveau d’accès.';
      syncRoomBanners(room);
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

    if (!nickname) return setInfo('Le pseudo est obligatoire.', 'error'), els.nickname.focus();
    if (nickname.length < 2) return setInfo('Le pseudo est trop court.', 'error'), els.nickname.focus();
    if (!message) return setInfo('Le message est vide.', 'error'), els.message.focus();

    els.send.disabled = true;
    setInfo('Envoi du message…');

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nickname, message: buildStoredMessage(message), room }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Envoi impossible');

      if (!getAuthUser()) localStorage.setItem(NICK_KEY, nickname);
      localStorage.setItem(ROOM_KEY, room);
      els.message.value = '';
      clearReply();
      toggleEmojiPicker(false);
      setInfo('Message envoyé.', 'success');
      await fetchMessages({ silent: true });
      keepLastMessageVisible({ force: true, smooth: false });
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
      const res = await fetch(`${API_URL}?id=${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'same-origin' });
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
    keepPinnedToBottom = true;
    if (!force && !isNearBottom()) return;
    keepLastMessageVisible({ force: true, smooth: false });
  }

  function startAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => fetchMessages({ silent: true }), getRefreshDelay());
  }

  function init() {
    fillNicknameFromAuth();
    syncRoomOptions();
    renderSidebarRooms();
    renderEmojiPicker();
    updateReplyPreview();
    syncRefreshDelayControl();

    els.form.addEventListener('submit', postMessage);
    els.refresh.addEventListener('click', () => fetchMessages());
    els.refreshDelay?.addEventListener('click', (evt) => evt.stopPropagation());
    els.refreshDelay?.addEventListener('change', () => {
      localStorage.setItem(REFRESH_KEY, String(Number(els.refreshDelay.value) || DEFAULT_REFRESH_MS));
      startAutoRefresh();
      setInfo(`Actualisation auto : ${Math.round(getRefreshDelay() / 1000)} s.`, 'success');
    });
    els.scrollBottom.addEventListener('click', () => scrollToBottom({ force: true }));
    els.cancelReply.addEventListener('click', clearReply);
    els.emojiToggle.addEventListener('click', () => toggleEmojiPicker());
    document.addEventListener('click', (evt) => {
      if (!els.emojiPicker.contains(evt.target) && evt.target !== els.emojiToggle) toggleEmojiPicker(false);
    });
    els.list.addEventListener('scroll', () => {
      keepPinnedToBottom = isNearBottom();
    }, { passive: true });
    window.addEventListener('resize', () => {
      if (keepPinnedToBottom) keepLastMessageVisible({ force: true, smooth: false });
    }, { passive: true });
    window.visualViewport?.addEventListener('resize', () => {
      if (keepPinnedToBottom) keepLastMessageVisible({ force: true, smooth: false });
    }, { passive: true });
    els.message.addEventListener('focus', () => {
      keepPinnedToBottom = true;
      keepLastMessageVisible({ force: true, smooth: true });
    });
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
