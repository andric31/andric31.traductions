import { ensureAuthTables, getSessionUser, json, clearSessionCookie } from './_auth.js';

async function ensureLastSeenColumn(db) {
  try {
    await db.prepare(`ALTER TABLE auth_users ADD COLUMN last_seen_at TEXT DEFAULT ''`).run();
  } catch {}
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'GET') {
    return json({ ok: false, error: 'Méthode invalide.' }, 405);
  }
  if (!env?.DB) return json({ ok: false, error: 'DB non liée.' }, 500);
  await ensureAuthTables(env.DB);
  await ensureLastSeenColumn(env.DB);
  const user = await getSessionUser(env.DB, env, request);
  if (!user) {
    return json({ ok: true, logged_in: false }, 200, { 'set-cookie': clearSessionCookie() });
  }
  try {
    const now = new Date().toISOString();
    await env.DB.prepare(`
      UPDATE auth_users
      SET last_seen_at = ?1
      WHERE id = ?2
    `).bind(now, user.id).run();
    user.last_seen_at = now;
  } catch {}
  return json({ ok: true, logged_in: true, user });
}
