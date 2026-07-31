import { assertSameOrigin, ensureAuthTables, getSessionUser, normalizePseudoKey } from './_auth.js';

const ALLOWED_REACTION_EMOJIS = new Set([
  '😀','😁','😂','🤣','😊','😍','🥰','😘','😎','🤔','😅','😢','😭','😡',
  '👋','👍','👎','👏','🙏','🔥','✅','❌','🎉','💬','❤️','😮',
]);

function buildHeaders() {
  return {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type',
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: buildHeaders() });
}

function cleanString(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function clampMessage(value) {
  return String(value ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

function messageBodyOnly(value) {
  const text = String(value || '');
  const prefix = '[[reply:';
  if (!text.startsWith(prefix)) return text.trim();

  const end = text.indexOf(']]');
  if (end === -1) return text.trim();

  return text.slice(end + 2).replace(/^\n+/, '').trim();
}


function hasLink(value) {
  return /\b((?:https?:\/\/|www\.)[^\s<>()]+|[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+\/[^^\s<>()]*)/i.test(String(value || ''));
}

async function ensureTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS messages_global (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nickname TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      ip_hash TEXT,
      user_agent TEXT,
      room_type TEXT NOT NULL DEFAULT 'global',
      room_key TEXT NOT NULL DEFAULT 'global',
      owner_user_id INTEGER
    )
  `).run();

  const columns = await db.prepare(`PRAGMA table_info(messages_global)`).all();
  const names = new Set((columns?.results || []).map((x) => x.name));
  if (!names.has('room_type')) await db.prepare(`ALTER TABLE messages_global ADD COLUMN room_type TEXT NOT NULL DEFAULT 'global'`).run();
  if (!names.has('room_key')) await db.prepare(`ALTER TABLE messages_global ADD COLUMN room_key TEXT NOT NULL DEFAULT 'global'`).run();
  if (!names.has('owner_user_id')) await db.prepare(`ALTER TABLE messages_global ADD COLUMN owner_user_id INTEGER`).run();
  if (!names.has('links_allowed')) await db.prepare(`ALTER TABLE messages_global ADD COLUMN links_allowed INTEGER NOT NULL DEFAULT 0`).run();

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_messages_global_created_at
    ON messages_global(created_at DESC)
  `).run();

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_messages_global_room_created
    ON messages_global(room_key, created_at DESC)
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS message_reactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER NOT NULL,
      emoji TEXT NOT NULL,
      actor_key TEXT NOT NULL,
      nickname TEXT NOT NULL DEFAULT 'Visiteur',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE(message_id, emoji, actor_key)
    )
  `).run();

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_message_reactions_message
    ON message_reactions(message_id, id)
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS message_nickname_claims (
      nickname_key TEXT PRIMARY KEY,
      nickname TEXT NOT NULL,
      actor_key TEXT NOT NULL,
      claimed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      last_used_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )
  `).run();

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_message_nickname_claims_actor
    ON message_nickname_claims(actor_key)
  `).run();
}

async function checkRateLimit(db, ipHash) {
  if (!ipHash) return { ok: true };

  const row = await db.prepare(`
    SELECT created_at
    FROM messages_global
    WHERE ip_hash = ?1
    ORDER BY id DESC
    LIMIT 1
  `).bind(ipHash).first();

  if (!row?.created_at) return { ok: true };

  const lastTs = Date.parse(row.created_at);
  if (!Number.isFinite(lastTs)) return { ok: true };

  const seconds = (Date.now() - lastTs) / 1000;
  if (seconds < 8) {
    return { ok: false, wait: Math.ceil(8 - seconds) };
  }
  return { ok: true };
}


function normalizeRole(role) {
  return String(role || 'member').trim().toLowerCase();
}

function roleLevel(role) {
  return ({ member: 1, translator: 2, moderator: 2, admin: 3 }[normalizeRole(role)] || 0);
}

function canModerateMessages(user) {
  const role = normalizeRole(user?.role);
  return role === 'admin' || role === 'moderator';
}

function canAccessTranslatorRoom(user) {
  const role = normalizeRole(user?.role);
  return role === 'admin' || role === 'translator' || role === 'moderator';
}

function canAccessModeratorRoom(user) {
  const role = normalizeRole(user?.role);
  return role === 'admin' || role === 'moderator';
}

function getAllowedRooms(user) {
  const rooms = ['global'];
  if (!user) return rooms;
  rooms.push('private:members');
  if (canAccessTranslatorRoom(user)) rooms.push('private:translators');
  if (canAccessModeratorRoom(user)) rooms.push('private:moderators');
  if (normalizeRole(user.role) === 'admin') rooms.push('private:admins');
  return rooms;
}

function parseRoom(rawRoom, user) {
  const room = String(rawRoom || 'global').trim();
  if (!room || room === 'global') {
    return { ok: true, roomType: 'global', roomKey: 'global', ownerUserId: null };
  }

  if (room === 'private:members') {
    if (!user) return { ok: false, error: 'Connexion requise pour ce salon privé.', status: 401 };
    return { ok: true, roomType: 'private', roomKey: room, ownerUserId: null };
  }

  if (room === 'private:translators') {
    if (!user) return { ok: false, error: 'Connexion requise pour ce salon privé.', status: 401 };
    if (!canAccessTranslatorRoom(user)) {
      return { ok: false, error: 'Accès refusé à ce salon privé.', status: 403 };
    }
    return { ok: true, roomType: 'private', roomKey: room, ownerUserId: null };
  }

  if (room === 'private:moderators') {
    if (!user) return { ok: false, error: 'Connexion requise pour ce salon privé.', status: 401 };
    if (!canAccessModeratorRoom(user)) {
      return { ok: false, error: 'Accès refusé à ce salon privé.', status: 403 };
    }
    return { ok: true, roomType: 'private', roomKey: room, ownerUserId: null };
  }

  if (room === 'private:admins') {
    if (!user) return { ok: false, error: 'Connexion requise pour ce salon privé.', status: 401 };
    if (normalizeRole(user.role) !== 'admin') {
      return { ok: false, error: 'Accès refusé à ce salon privé.', status: 403 };
    }
    return { ok: true, roomType: 'private', roomKey: room, ownerUserId: null };
  }

  return { ok: false, error: 'Salon inconnu.', status: 400 };
}

async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const bytes = Array.from(new Uint8Array(hashBuffer));
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function normalizeVisitorId(value) {
  const visitorId = String(value || '').trim();
  return /^[a-zA-Z0-9_-]{16,80}$/.test(visitorId) ? visitorId : '';
}

async function getReactionActorKey(sessionUser, request, visitorId = '') {
  if (sessionUser?.id) return `user:${sessionUser.id}`;

  const normalizedVisitorId = normalizeVisitorId(visitorId);
  if (normalizedVisitorId) return `guest:${normalizedVisitorId}`;

  const ip = request.headers.get('cf-connecting-ip') || '';
  const userAgent = cleanString(request.headers.get('user-agent') || '').slice(0, 180);
  const language = cleanString(request.headers.get('accept-language') || '').slice(0, 80);
  const fallback = await sha256Hex(`reaction:${ip}:${userAgent}:${language}`);
  return `guest:${fallback}`;
}

async function getNicknameActorKey(env, visitorId = '') {
  const normalizedVisitorId = normalizeVisitorId(visitorId);
  if (!normalizedVisitorId) return '';
  const secret = String(env?.AUTH_SECRET || 'andric31-nickname-claim').trim();
  return `guest:${await sha256Hex(`nickname:${secret}:${normalizedVisitorId}`)}`;
}

async function claimGuestNickname(db, env, nickname, visitorId) {
  const nicknameKey = normalizePseudoKey(nickname);
  if (!nicknameKey) return { ok: false, error: 'Pseudo invalide.', status: 400 };

  const users = await db.prepare(`
    SELECT username, display_name
    FROM auth_users
    WHERE is_active = 1
  `).all();
  for (const user of users?.results || []) {
    if (normalizePseudoKey(user?.username) === nicknameKey || normalizePseudoKey(user?.display_name) === nicknameKey) {
      return {
        ok: false,
        error: 'Ce pseudo appartient à un compte. Connecte-toi avec ce compte ou choisis un autre pseudo.',
        status: 409,
      };
    }
  }

  const actorKey = await getNicknameActorKey(env, visitorId);
  if (!actorKey) {
    return { ok: false, error: 'Impossible de réserver ce pseudo. Actualise la page puis réessaie.', status: 400 };
  }

  const existing = await db.prepare(`
    SELECT actor_key
    FROM message_nickname_claims
    WHERE nickname_key = ?1
    LIMIT 1
  `).bind(nicknameKey).first();

  if (existing?.actor_key && existing.actor_key !== actorKey) {
    return { ok: false, error: 'Ce pseudo est déjà utilisé. Choisis-en un autre.', status: 409 };
  }

  if (existing?.actor_key === actorKey) {
    await db.prepare(`
      UPDATE message_nickname_claims
      SET nickname = ?1, last_used_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE nickname_key = ?2
    `).bind(nickname, nicknameKey).run();
    return { ok: true };
  }

  try {
    await db.prepare(`
      INSERT INTO message_nickname_claims (nickname_key, nickname, actor_key)
      VALUES (?1, ?2, ?3)
    `).bind(nicknameKey, nickname, actorKey).run();
    return { ok: true };
  } catch {
    const raced = await db.prepare(`
      SELECT actor_key
      FROM message_nickname_claims
      WHERE nickname_key = ?1
      LIMIT 1
    `).bind(nicknameKey).first();
    if (raced?.actor_key === actorKey) return { ok: true };
    return { ok: false, error: 'Ce pseudo vient d’être réservé par une autre personne.', status: 409 };
  }
}

async function attachReactions(db, messages, actorKey) {
  const list = Array.isArray(messages) ? messages : [];
  const ids = list
    .map((item) => Number(item?.id || 0))
    .filter((id) => Number.isSafeInteger(id) && id > 0);

  for (const item of list) {
    item.reactions = {};
    item.my_reactions = [];
  }
  if (!ids.length) return list;

  const placeholders = ids.map((_, idx) => `?${idx + 2}`).join(', ');
  const rows = await db.prepare(`
    SELECT
      message_id,
      emoji,
      COUNT(*) AS reaction_count,
      MAX(CASE WHEN actor_key = ?1 THEN 1 ELSE 0 END) AS reacted_by_me,
      MIN(id) AS first_reaction_id
    FROM message_reactions
    WHERE message_id IN (${placeholders})
    GROUP BY message_id, emoji
    ORDER BY first_reaction_id ASC
  `).bind(actorKey, ...ids).all();

  const byId = new Map(list.map((item) => [Number(item.id), item]));
  for (const row of rows?.results || []) {
    const item = byId.get(Number(row.message_id));
    if (!item) continue;
    const emoji = String(row.emoji || '');
    const count = Math.max(0, Number(row.reaction_count || 0));
    if (!emoji || !count) continue;
    item.reactions[emoji] = count;
    if (Number(row.reacted_by_me || 0) > 0) item.my_reactions.push(emoji);
  }

  return list;
}

async function toggleMessageReaction(db, request, sessionUser, body) {
  const messageId = Number(body?.message_id || 0);
  const emoji = String(body?.emoji || '').trim();
  if (!Number.isSafeInteger(messageId) || messageId <= 0) {
    return { response: json({ ok: false, error: 'Message invalide.' }, 400) };
  }
  if (!ALLOWED_REACTION_EMOJIS.has(emoji)) {
    return { response: json({ ok: false, error: 'Emoji non autorisé.' }, 400) };
  }

  const message = await db.prepare(`
    SELECT id, room_key
    FROM messages_global
    WHERE id = ?1
    LIMIT 1
  `).bind(messageId).first();
  if (!message?.id) {
    return { response: json({ ok: false, error: 'Message introuvable.' }, 404) };
  }

  const roomInfo = parseRoom(message.room_key || 'global', sessionUser);
  if (!roomInfo.ok) {
    return { response: json({ ok: false, error: roomInfo.error }, roomInfo.status || 403) };
  }

  const actorKey = await getReactionActorKey(sessionUser, request, body?.visitor_id);
  const nickname = sessionUser
    ? cleanString(sessionUser.display_name || sessionUser.username || 'Membre').slice(0, 40)
    : (cleanString(body?.nickname || 'Visiteur').slice(0, 40) || 'Visiteur');

  const existing = await db.prepare(`
    SELECT id
    FROM message_reactions
    WHERE message_id = ?1 AND emoji = ?2 AND actor_key = ?3
    LIMIT 1
  `).bind(messageId, emoji, actorKey).first();

  if (existing?.id) {
    await db.prepare(`DELETE FROM message_reactions WHERE id = ?1`).bind(existing.id).run();
  } else {
    await db.prepare(`
      INSERT OR IGNORE INTO message_reactions (message_id, emoji, actor_key, nickname)
      VALUES (?1, ?2, ?3, ?4)
    `).bind(messageId, emoji, actorKey, nickname).run();
  }

  const summary = [{ id: messageId }];
  await attachReactions(db, summary, actorKey);
  return {
    data: {
      ok: true,
      message_id: messageId,
      reactions: summary[0].reactions,
      my_reactions: summary[0].my_reactions,
    },
  };
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: buildHeaders() });
  }

  if (!env?.DB) {
    return json({ ok: false, error: 'DB non liée.' }, 500);
  }

  await ensureTable(env.DB);
  await ensureAuthTables(env.DB);
  const sessionUser = await getSessionUser(env.DB, env, request);

  if (request.method === 'GET') {
    const limitRaw = Number(url.searchParams.get('limit') || 80);
    const limit = Math.min(Math.max(limitRaw || 80, 1), 100);
    const scope = String(url.searchParams.get('scope') || '').trim();

    if (scope === 'allowed') {
      const allowedRooms = getAllowedRooms(sessionUser);
      const placeholders = allowedRooms.map((_, idx) => `?${idx + 1}`).join(', ');
      const rows = await env.DB.prepare(`
        SELECT id, nickname, message, created_at, room_key, links_allowed
        FROM messages_global
        WHERE room_key IN (${placeholders})
        ORDER BY id DESC
        LIMIT ?${allowedRooms.length + 1}
      `).bind(...allowedRooms, limit).all();

      const messages = (rows?.results || []).slice().reverse();
      return json({ ok: true, messages, rooms: allowedRooms, scope: 'allowed' });
    }

    const roomInfo = parseRoom(url.searchParams.get('room') || 'global', sessionUser);
    if (!roomInfo.ok) return json({ ok: false, error: roomInfo.error }, roomInfo.status || 400);
    const rows = await env.DB.prepare(`
      SELECT id, nickname, message, created_at, links_allowed
      FROM messages_global
      WHERE room_key = ?1
      ORDER BY id DESC
      LIMIT ?2
    `).bind(roomInfo.roomKey, limit).all();

    const messages = (rows?.results || []).slice().reverse();
    const actorKey = await getReactionActorKey(sessionUser, request, url.searchParams.get('visitor_id'));
    await attachReactions(env.DB, messages, actorKey);
    return json({ ok: true, messages });
  }

  if (request.method === 'POST') {
    if (!assertSameOrigin(request)) {
      return json({ ok: false, error: 'Origine invalide.' }, 403);
    }

    let body = null;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: 'JSON invalide.' }, 400);
    }

    if (body?.action === 'toggle_reaction') {
      const result = await toggleMessageReaction(env.DB, request, sessionUser, body);
      if (result.response) return result.response;
      return json(result.data);
    }

    const nickname = cleanString(body?.nickname);
    const message = clampMessage(body?.message);
    const roomInfo = parseRoom(body?.room || 'global', sessionUser);
    if (!roomInfo.ok) return json({ ok: false, error: roomInfo.error }, roomInfo.status || 400);

    if (!nickname || nickname.length < 2 || nickname.length > 40) {
      return json({ ok: false, error: 'Pseudo invalide.' }, 400);
    }
    const messageBody = messageBodyOnly(message);

    if (!messageBody || messageBody.length < 1 || messageBody.length > 500) {
      return json({ ok: false, error: 'Message invalide.' }, 400);
    }

    const isAdmin = roleLevel(sessionUser?.role) >= roleLevel('admin');
    const messageHasLink = hasLink(messageBody);
    if (roomInfo.roomKey === 'global' && messageHasLink && !isAdmin) {
      return json({ ok: false, error: 'Les liens sont interdits dans le salon public, sauf pour les administrateurs.' }, 403);
    }
    const linksAllowed = messageHasLink && (roomInfo.roomKey !== 'global' || isAdmin) ? 1 : 0;

    const ip = request.headers.get('cf-connecting-ip') || '';
    const userAgent = cleanString(request.headers.get('user-agent') || '').slice(0, 180);
    const ipHash = ip ? await sha256Hex(`messages:${ip}`) : '';
    const rateLimit = await checkRateLimit(env.DB, ipHash);
    if (!rateLimit.ok) {
      return json({ ok: false, error: `Attends ${rateLimit.wait}s avant de renvoyer un message.` }, 429);
    }

    const finalNickname = sessionUser ? cleanString(sessionUser.display_name || sessionUser.username) : nickname;

    if (!sessionUser) {
      const claim = await claimGuestNickname(env.DB, env, finalNickname, body?.visitor_id);
      if (!claim.ok) return json({ ok: false, error: claim.error }, claim.status || 409);
    }

    await env.DB.prepare(`
      INSERT INTO messages_global (nickname, message, created_at, ip_hash, user_agent, room_type, room_key, owner_user_id, links_allowed)
      VALUES (?1, ?2, strftime('%Y-%m-%dT%H:%M:%fZ','now'), ?3, ?4, ?5, ?6, ?7, ?8)
    `).bind(finalNickname, message, ipHash, userAgent, roomInfo.roomType, roomInfo.roomKey, roomInfo.ownerUserId, linksAllowed).run();

    return json({ ok: true });
  }

  if (request.method === 'DELETE') {
    const id = Number(url.searchParams.get('id') || 0);

    if (!sessionUser) {
      return json({ ok: false, error: 'Connexion requise.' }, 401);
    }
    if (!canModerateMessages(sessionUser)) {
      return json({ ok: false, error: 'Accès modérateur requis.' }, 403);
    }
    if (!Number.isInteger(id) || id <= 0) {
      return json({ ok: false, error: 'ID invalide.' }, 400);
    }

    await env.DB.prepare(`DELETE FROM message_reactions WHERE message_id = ?1`).bind(id).run();
    await env.DB.prepare(`DELETE FROM messages_global WHERE id = ?1`).bind(id).run();
    return json({ ok: true });
  }

  return json({ ok: false, error: 'Méthode invalide.' }, 405);
}
