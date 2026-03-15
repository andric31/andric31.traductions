import { ensureAuthTables, getSessionUser } from './_auth.js';

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

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_messages_global_created_at
    ON messages_global(created_at DESC)
  `).run();

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_messages_global_room_created
    ON messages_global(room_key, created_at DESC)
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


function roleLevel(role) {
  return ({ member: 1, translator: 2, admin: 3 }[String(role || 'member')] || 0);
}

function getAllowedRooms(user) {
  const rooms = ['global'];
  if (!user) return rooms;
  if (roleLevel(user.role) >= roleLevel('member')) rooms.push('private:members');
  if (roleLevel(user.role) >= roleLevel('translator')) rooms.push('private:translators');
  if (roleLevel(user.role) >= roleLevel('admin')) rooms.push('private:admins');
  return rooms;
}

function parseRoom(rawRoom, user) {
  const room = String(rawRoom || 'global').trim();
  if (!room || room === 'global') {
    return { ok: true, roomType: 'global', roomKey: 'global', ownerUserId: null };
  }

  const sharedRooms = {
    'private:members': { minRole: 'member' },
    'private:translators': { minRole: 'translator' },
    'private:admins': { minRole: 'admin' },
  };

  const shared = sharedRooms[room];
  if (shared) {
    if (!user) return { ok: false, error: 'Connexion requise pour ce salon privé.', status: 401 };
    if (roleLevel(user.role) < roleLevel(shared.minRole)) {
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
        SELECT id, nickname, message, created_at, room_key
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
      SELECT id, nickname, message, created_at
      FROM messages_global
      WHERE room_key = ?1
      ORDER BY id DESC
      LIMIT ?2
    `).bind(roomInfo.roomKey, limit).all();

    const messages = (rows?.results || []).slice().reverse();
    return json({ ok: true, messages });
  }

  if (request.method === 'POST') {
    let body = null;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: 'JSON invalide.' }, 400);
    }

    const nickname = cleanString(body?.nickname);
    const message = clampMessage(body?.message);
    const roomInfo = parseRoom(body?.room || 'global', sessionUser);
    if (!roomInfo.ok) return json({ ok: false, error: roomInfo.error }, roomInfo.status || 400);

    if (!nickname || nickname.length < 2 || nickname.length > 40) {
      return json({ ok: false, error: 'Pseudo invalide.' }, 400);
    }
    if (!message || message.length < 1 || message.length > 500) {
      return json({ ok: false, error: 'Message invalide.' }, 400);
    }

    const ip = request.headers.get('cf-connecting-ip') || '';
    const userAgent = cleanString(request.headers.get('user-agent') || '').slice(0, 180);
    const ipHash = ip ? await sha256Hex(`messages:${ip}`) : '';
    const rateLimit = await checkRateLimit(env.DB, ipHash);
    if (!rateLimit.ok) {
      return json({ ok: false, error: `Attends ${rateLimit.wait}s avant de renvoyer un message.` }, 429);
    }

    const finalNickname = sessionUser ? cleanString(sessionUser.display_name || sessionUser.username) : nickname;

    await env.DB.prepare(`
      INSERT INTO messages_global (nickname, message, created_at, ip_hash, user_agent, room_type, room_key, owner_user_id)
      VALUES (?1, ?2, strftime('%Y-%m-%dT%H:%M:%fZ','now'), ?3, ?4, ?5, ?6, ?7)
    `).bind(finalNickname, message, ipHash, userAgent, roomInfo.roomType, roomInfo.roomKey, roomInfo.ownerUserId).run();

    return json({ ok: true });
  }

  if (request.method === 'DELETE') {
    const id = Number(url.searchParams.get('id') || 0);

    if (!sessionUser) {
      return json({ ok: false, error: 'Connexion requise.' }, 401);
    }
    if (roleLevel(sessionUser.role) < roleLevel('admin')) {
      return json({ ok: false, error: 'Accès admin requis.' }, 403);
    }
    if (!Number.isInteger(id) || id <= 0) {
      return json({ ok: false, error: 'ID invalide.' }, 400);
    }

    await env.DB.prepare(`DELETE FROM messages_global WHERE id = ?1`).bind(id).run();
    return json({ ok: true });
  }

  return json({ ok: false, error: 'Méthode invalide.' }, 405);
}
