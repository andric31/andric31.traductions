(() => {
  const API_URL = '/api/messages';
  const READ_STATE_API_URL = '/api/message-read-state';
  const SEEN_MESSAGE_KEY = 'andric31_seen_message_id';
  const DEFAULT_REFRESH_MS = 7000;
  const NICK_KEY = 'andric31_messages_nickname';
  const ROOM_KEY = 'andric31_messages_room';
  const REFRESH_KEY = 'andric31_messages_refresh_ms';
  const REPLY_PREFIX = '[[reply:';
  const MESSAGE_MAX_LENGTH = 500;
  const REACTION_VISITOR_KEY = 'andric31_messages_reaction_visitor';
  const EMOJIS = ['😀','😁','😂','🤣','😊','😍','🥰','😘','😎','🤔','😅','😢','😭','😡','👋','👍','👎','👏','🙏','🔥','✅','❌','🎉','💬','❤️'];
  const QUICK_REACTIONS = ['👋','👍','❤️','🤣','🔥','👏','🎉','😮','🤔','😢','😡'];
  const LOCAL_EMOJI_ASSETS = new Map([['🥰', 'emoji/1f970.svg']]);
  const VALID_ROOMS = new Set(['global', 'private:members', 'private:translators', 'private:moderators', 'private:admins']);

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
  let lastSyncedSeenMessageId = 0;

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function emojiGraphicHtml(value) {
    const emoji = String(value || '');
    const asset = LOCAL_EMOJI_ASSETS.get(emoji);
    if (!asset) return escapeHtml(emoji);
    return `<img class="msg-emoji-image" src="${asset}" alt="${escapeHtml(emoji)}" draggable="false" loading="eager">`;
  }

  function renderEmojiAwareText(value) {
    let out = escapeHtml(String(value || ''));
    for (const emoji of LOCAL_EMOJI_ASSETS.keys()) {
      out = out.split(emoji).join(emojiGraphicHtml(emoji));
    }
    return out;
  }

  function getEditorText() {
    if (!els.message) return '';
    if (!els.message.isContentEditable) return String(els.message.value || '');

    function readNode(node) {
      let out = '';
      for (const child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          out += child.nodeValue || '';
          continue;
        }
        if (child.nodeType !== Node.ELEMENT_NODE) continue;

        const tag = child.tagName;
        if (tag === 'IMG' && child.hasAttribute('data-emoji')) {
          out += child.getAttribute('data-emoji') || child.getAttribute('alt') || '';
        } else if (tag === 'BR') {
          out += '\n';
        } else {
          out += readNode(child);
          if (/^(DIV|P|LI)$/.test(tag) && child.nextSibling && !out.endsWith('\n')) out += '\n';
        }
      }
      return out;
    }

    return readNode(els.message).replaceAll('\u00a0', ' ');
  }

  function clearEditor() {
    if (!els.message) return;
    if (els.message.isContentEditable) els.message.innerHTML = '';
    else els.message.value = '';
  }

  function editorSelectionRange() {
    const selection = window.getSelection?.();
    if (!selection) return null;

    if (selection.rangeCount > 0) {
      const current = selection.getRangeAt(0);
      if (els.message.contains(current.commonAncestorContainer)) return current;
    }

    const range = document.createRange();
    range.selectNodeContents(els.message);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    return range;
  }

  function insertEditorNode(node, trailingSpace = false) {
    const range = editorSelectionRange();
    const selection = window.getSelection?.();
    if (!range || !selection) return;

    range.deleteContents();
    const fragment = document.createDocumentFragment();
    fragment.appendChild(node);
    const spacer = trailingSpace ? document.createTextNode(' ') : null;
    if (spacer) fragment.appendChild(spacer);
    range.insertNode(fragment);

    range.setStartAfter(spacer || node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    els.message.focus();
    els.message.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function insertEmojiAtCursor(emoji) {
    const value = String(emoji || '');
    if (!els.message.isContentEditable) {
      insertAtCursor(els.message, `${value} `);
      return;
    }

    const asset = LOCAL_EMOJI_ASSETS.get(value);
    if (!asset) {
      insertEditorNode(document.createTextNode(`${value} `));
      return;
    }

    const image = document.createElement('img');
    image.className = 'msg-emoji-image';
    image.src = asset;
    image.alt = value;
    image.setAttribute('data-emoji', value);
    image.setAttribute('draggable', 'false');
    insertEditorNode(image, true);
  }

  function insertPlainTextAtCursor(text) {
    if (!els.message.isContentEditable) {
      insertAtCursor(els.message, String(text || ''));
      return;
    }
    insertEditorNode(document.createTextNode(String(text || '')));
  }


  const LINK_RE = /\b((?:https?:\/\/|www\.)[^\s<>()]+|[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+\/[^^\s<>()]*)/ig;

  function normalizeRole(role) {
    return String(role || 'member').trim().toLowerCase();
  }

  function canModerateMessages() {
    const role = normalizeRole(getAuthUser()?.role);
    return role === 'admin' || role === 'moderator';
  }

  function canAccessTranslatorRoom(role) {
    const r = normalizeRole(role);
    return r === 'admin' || r === 'translator' || r === 'moderator';
  }

  function isAdminUser() {
    return normalizeRole(getAuthUser()?.role) === 'admin';
  }

  function canAccessModeratorRoom(role) {
    const r = normalizeRole(role);
    return r === 'admin' || r === 'moderator';
  }

  function hasLink(value) {
    LINK_RE.lastIndex = 0;
    return LINK_RE.test(String(value || ''));
  }

  function normalizeUrlForHref(raw) {
    const value = String(raw || '').trim();
    if (/^https?:\/\//i.test(value)) return value;
    return `https://${value}`;
  }

  function renderMessageText(value, allowLinks = false) {
    const text = String(value || '');
    if (!allowLinks) return renderEmojiAwareText(text);

    LINK_RE.lastIndex = 0;
    let out = '';
    let last = 0;
    let match;
    while ((match = LINK_RE.exec(text))) {
      const raw = match[0].replace(/[.,!?;:)]$/, '');
      const trailing = match[0].slice(raw.length);
      const start = match.index;
      out += renderEmojiAwareText(text.slice(last, start));
      const href = normalizeUrlForHref(raw);
      out += `<a class="msg-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(raw)}</a>${escapeHtml(trailing)}`;
      last = start + match[0].length;
    }
    out += renderEmojiAwareText(text.slice(last));
    return out;
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

  function getRequestedRoomFromUrl() {
    try {
      const room = new URLSearchParams(window.location.search).get('room') || '';
      return VALID_ROOMS.has(room) ? room : '';
    } catch {
      return '';
    }
  }

  function updateRoomInUrl(room) {
    try {
      const url = new URL(window.location.href);
      if (room && room !== 'global') url.searchParams.set('room', room);
      else url.searchParams.delete('room');
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {
      // Navigation toujours fonctionnelle même si l'URL ne peut pas être modifiée.
    }
  }

  function getSelectedRoom() {
    return localStorage.getItem(ROOM_KEY) || 'global';
  }

  function roleLevel(role) {
    return ({ member: 1, translator: 2, moderator: 2, admin: 3 }[normalizeRole(role)] || 0);
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
    if (els.authInfo) els.authInfo.textContent = 'Non connecté : ton pseudo sera réservé à ce navigateur dans le salon public.';
    return false;
  }

  function getAvailableRooms() {
    const me = getAuthUser();
    const rooms = [{ value: 'global', label: 'Discussion générale', subtitle: 'Salon public', access: 'public' }];
    if (me?.id) {
      rooms.push({ value: 'private:members', label: 'Salon membres', subtitle: 'Réservé aux comptes connectés', access: 'members' });
      if (canAccessTranslatorRoom(me.role)) rooms.push({ value: 'private:translators', label: 'Salon traducteurs', subtitle: 'Réservé traducteurs et modérateurs', access: 'translators' });
      if (canAccessModeratorRoom(me.role)) rooms.push({ value: 'private:moderators', label: 'Salon modérateurs', subtitle: 'Réservé modérateurs et admins', access: 'moderators' });
      if (normalizeRole(me.role) === 'admin') rooms.push({ value: 'private:admins', label: 'Salon admins', subtitle: 'Réservé admins', access: 'admins' });
    }
    return rooms;
  }

  function syncRoomOptions() {
    const rooms = getAvailableRooms();
    const requested = getRequestedRoomFromUrl();
    const stored = localStorage.getItem(ROOM_KEY) || 'global';
    const wanted = requested || stored;
    const allowed = new Set(rooms.map((x) => x.value));
    const selected = allowed.has(wanted) ? wanted : (allowed.has(stored) ? stored : 'global');
    localStorage.setItem(ROOM_KEY, selected);

    // Tant que l'authentification n'est pas chargée, on conserve le salon privé
    // demandé dans l'URL. Il sera appliqué dès que le compte sera reconnu.
    if (!requested || allowed.has(requested) || window.SiteAuth?.loaded) {
      updateRoomInUrl(selected);
    }
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
        updateRoomInUrl(value);
        fetchMessages();
      });
    });
  }

  function roomLabel(roomValue) {
    return ({
      global: 'Salon public',
      'private:members': 'Salon privé membres',
      'private:translators': 'Salon privé traducteurs',
      'private:moderators': 'Salon privé modérateurs',
      'private:admins': 'Salon privé admins',
    }[String(roomValue || 'global')] || 'Salon');
  }

  function syncRoomBanners(roomValue) {
    const isPublic = String(roomValue || 'global') === 'global';
    if (els.publicPrivacyBanner) els.publicPrivacyBanner.classList.toggle('hidden', !isPublic);
    if (els.globalNoticeBanner) els.globalNoticeBanner.textContent = isPublic
      ? 'Merci de garder la discussion claire et de ne pas flooder.'
      : 'Merci de garder la discussion claire et de ne pas flooder.';
  }

  function roomTitle(roomValue) {
    return ({
      global: 'Discussion générale',
      'private:members': 'Discussion membres',
      'private:translators': 'Discussion traducteurs',
      'private:moderators': 'Discussion modérateurs',
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

  function getReactionVisitorId() {
    let value = localStorage.getItem(REACTION_VISITOR_KEY) || '';
    if (/^[a-zA-Z0-9_-]{16,80}$/.test(value)) return value;

    try {
      value = crypto.randomUUID().replaceAll('-', '');
    } catch {
      value = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
    }
    localStorage.setItem(REACTION_VISITOR_KEY, value);
    return value;
  }

  function getMessageById(messageId) {
    return messages.find((item) => String(item?.id) === String(messageId)) || null;
  }

  function getMessageReactions(messageOrId) {
    const item = typeof messageOrId === 'object' && messageOrId
      ? messageOrId
      : getMessageById(messageOrId);
    return item?.reactions && typeof item.reactions === 'object' ? item.reactions : {};
  }

  function currentReactionUser() {
    const me = getAuthUser();
    return (me?.display_name || me?.username || els.nickname.value || 'Visiteur').trim() || 'Visiteur';
  }

  function hasUserReaction(messageId, emoji) {
    const item = getMessageById(messageId);
    return Array.isArray(item?.my_reactions) && item.my_reactions.includes(emoji);
  }

  async function toggleReaction(messageId, emoji) {
    const item = getMessageById(messageId);
    if (!item) return;

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'toggle_reaction',
          message_id: Number(messageId),
          emoji,
          room: getSelectedRoom(),
          nickname: currentReactionUser(),
          visitor_id: getReactionVisitorId(),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Réaction impossible');

      item.reactions = data.reactions || {};
      item.my_reactions = Array.isArray(data.my_reactions) ? data.my_reactions : [];
      lastMessagesSignature = buildMessagesSignature(messages);
      render();
    } catch (err) {
      setInfo(err.message || 'Impossible d’ajouter cette réaction.', 'error');
    }
  }

  function renderEmojiPicker() {
    els.emojiPicker.innerHTML = EMOJIS.map((emoji) => `<button class="msg-emoji-item" type="button" data-emoji="${emoji}" aria-label="Ajouter ${emoji}">${emojiGraphicHtml(emoji)}</button>`).join('');
    els.emojiPicker.querySelectorAll('[data-emoji]').forEach((btn) => {
      btn.addEventListener('click', () => insertEmojiAtCursor(btn.getAttribute('data-emoji')));
    });
  }


  function buildMessagesSignature(list) {
    try {
      return (Array.isArray(list) ? list : []).map((item) => [
        item?.id ?? '',
        item?.created_at ?? '',
        item?.nickname ?? '',
        item?.message ?? '',
        JSON.stringify(item?.reactions || {}),
        JSON.stringify(item?.my_reactions || []),
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

    const isAdmin = canModerateMessages();

    for (const item of messages) {
      const parsed = parseMessage(item.message);
      const article = document.createElement('article');
      const isOpen = String(item.id) === String(openMessageId);
      const reactions = getMessageReactions(item);
      const reactionHtml = Object.entries(reactions).map(([emoji, count]) => `
        <button class="msg-reaction-chip${hasUserReaction(item.id, emoji) ? ' is-active' : ''}" type="button" data-react-chip="${escapeHtml(String(item.id))}" data-emoji="${escapeHtml(emoji)}" aria-label="${escapeHtml(String(count))} réaction(s) ${escapeHtml(emoji)}">${emojiGraphicHtml(emoji)} <span>${Number(count) || 0}</span></button>
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
              ${parsed.reply ? `<div class="msg-quote"><span class="msg-quote-author">${escapeHtml(parsed.reply.author)}</span><span class="msg-quote-text">${renderEmojiAwareText(parsed.reply.excerpt)}</span></div>` : ''}
              <div class="msg-text">${renderMessageText(parsed.body, Boolean(item.links_allowed) || getSelectedRoom() !== 'global')}</div>
              ${reactionHtml ? `<div class="msg-reactions">${reactionHtml}</div>` : ''}
              <div class="msg-actions">
                <div class="msg-tools-left">
                  <button class="msg-inline-btn msg-reply-btn" type="button" data-reply-id="${escapeHtml(String(item.id))}">↩ Répondre</button>
                </div>
                <div class="msg-tools-right">
                  <div class="msg-react-toolbar">
                    ${QUICK_REACTIONS.map((emoji) => `<button class="msg-react-btn${hasUserReaction(item.id, emoji) ? ' is-active' : ''}" type="button" data-react-id="${escapeHtml(String(item.id))}" data-emoji="${emoji}" aria-label="Réagir avec ${emoji}">${emojiGraphicHtml(emoji)}</button>`).join('')}
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

  async function markLatestVisibleMessageSeen() {
    if (document.visibilityState !== 'visible' || !messages.length) return;

    const latestId = Number(messages[messages.length - 1]?.id || 0);
    if (!Number.isSafeInteger(latestId) || latestId <= 0) return;

    const localSeenId = Number(localStorage.getItem(SEEN_MESSAGE_KEY) || 0);
    if (latestId > localSeenId) localStorage.setItem(SEEN_MESSAGE_KEY, String(latestId));

    const me = getAuthUser();
    if (!me?.id || latestId <= lastSyncedSeenMessageId) return;

    try {
      const res = await fetch(READ_STATE_API_URL, {
        method: 'POST',
        credentials: 'same-origin',
        keepalive: true,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message_id: latestId }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        lastSyncedSeenMessageId = Math.max(latestId, Number(data.seen_message_id || 0));
      }
    } catch {
      // Une prochaine actualisation réessaiera automatiquement.
    }
  }

  async function fetchMessages({ silent = false } = {}) {
    if (!silent) setStatus('Chargement…');
    const room = getSelectedRoom();
    renderSidebarRooms();
    try {
      const visitorId = getReactionVisitorId();
      const res = await fetch(`${API_URL}?limit=80&room=${encodeURIComponent(room)}&visitor_id=${encodeURIComponent(visitorId)}`, { cache: 'no-store', credentials: 'same-origin' });
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
      await markLatestVisibleMessageSeen();
    } catch (err) {
      setStatus('Hors ligne', 'error');
      if (!silent) setInfo(err.message || 'Impossible de charger les messages.', 'error');
    }
  }

  async function postMessage(evt) {
    evt.preventDefault();
    fillNicknameFromAuth();
    const nickname = els.nickname.value.trim();
    const message = getEditorText().trim();
    const room = getSelectedRoom();

    if (!nickname) return setInfo('Le pseudo est obligatoire.', 'error'), els.nickname.focus();
    if (nickname.length < 2) return setInfo('Le pseudo est trop court.', 'error'), els.nickname.focus();
    if (!message) return setInfo('Le message est vide.', 'error'), els.message.focus();
    if (message.length > MESSAGE_MAX_LENGTH) return setInfo(`Le message est trop long (${MESSAGE_MAX_LENGTH} caractères max, hors réponse épinglée).`, 'error'), els.message.focus();
    if (room === 'global' && !isAdminUser() && hasLink(message)) {
      return setInfo('Les liens sont interdits dans le salon public, sauf pour les administrateurs.', 'error'), els.message.focus();
    }

    els.send.disabled = true;
    setInfo('Envoi du message…');

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nickname, message: buildStoredMessage(message), room, visitor_id: getReactionVisitorId() }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Envoi impossible');

      if (!getAuthUser()) localStorage.setItem(NICK_KEY, nickname);
      localStorage.setItem(ROOM_KEY, room);
      clearEditor();
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
    if (!canModerateMessages()) return;
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
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void markLatestVisibleMessageSeen();
    });
    els.message.addEventListener('focus', () => {
      keepPinnedToBottom = true;
      keepLastMessageVisible({ force: true, smooth: true });
    });
    els.message.addEventListener('input', () => {
      const left = MESSAGE_MAX_LENGTH - getEditorText().length;
      setInfo(`${left} caractère${Math.abs(left) > 1 ? 's' : ''} restant${Math.abs(left) > 1 ? 's' : ''}.`, left < 0 ? 'error' : '');
    });
    els.message.addEventListener('blur', () => {
      if (!getEditorText().trim()) clearEditor();
    });
    els.message.addEventListener('paste', (evt) => {
      if (!els.message.isContentEditable) return;
      evt.preventDefault();
      insertPlainTextAtCursor(evt.clipboardData?.getData('text/plain') || '');
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
