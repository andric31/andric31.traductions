import {
  assertSameOrigin,
  ensureAuthTables,
  getSessionUser,
  json,
} from './_auth.js';

async function ensureMessageReadColumn(db) {
  try {
    await db.prepare(`
      ALTER TABLE auth_users
      ADD COLUMN last_seen_message_id INTEGER NOT NULL DEFAULT 0
    `).run();
  } catch {
    // La colonne existe déjà.
  }
}

function normalizeMessageId(value) {
  const id = Number(value || 0);
  return Number.isSafeInteger(id) && id >= 0 ? id : 0;
}

export async function onRequest(context) {
  const { request, env } = context;

  if (!env?.DB) return json({ ok: false, error: 'DB non liée.' }, 500);

  await ensureAuthTables(env.DB);
  await ensureMessageReadColumn(env.DB);

  const user = await getSessionUser(env.DB, env, request);
  if (!user) {
    return json({ ok: true, logged_in: false, seen_message_id: 0 });
  }

  if (request.method === 'GET') {
    const row = await env.DB.prepare(`
      SELECT COALESCE(last_seen_message_id, 0) AS last_seen_message_id
      FROM auth_users
      WHERE id = ?1
      LIMIT 1
    `).bind(user.id).first();

    return json({
      ok: true,
      logged_in: true,
      seen_message_id: normalizeMessageId(row?.last_seen_message_id),
    });
  }

  if (request.method === 'POST') {
    if (!assertSameOrigin(request)) {
      return json({ ok: false, error: 'Origine refusée.' }, 403);
    }

    let body = null;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: 'JSON invalide.' }, 400);
    }

    const messageId = normalizeMessageId(body?.message_id);
    if (messageId <= 0) {
      return json({ ok: false, error: 'ID de message invalide.' }, 400);
    }

    await env.DB.prepare(`
      UPDATE auth_users
      SET last_seen_message_id = MAX(COALESCE(last_seen_message_id, 0), ?1),
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id = ?2
    `).bind(messageId, user.id).run();

    const row = await env.DB.prepare(`
      SELECT COALESCE(last_seen_message_id, 0) AS last_seen_message_id
      FROM auth_users
      WHERE id = ?1
      LIMIT 1
    `).bind(user.id).first();

    return json({
      ok: true,
      logged_in: true,
      seen_message_id: normalizeMessageId(row?.last_seen_message_id),
    });
  }

  return json({ ok: false, error: 'Méthode invalide.' }, 405);
}
