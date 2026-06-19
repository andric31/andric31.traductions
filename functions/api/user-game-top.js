import { ensureAuthTables, requireUser, json } from './_auth.js';

function clean(value, max = 1000) {
  return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}

function getDb(env) {
  if (env?.DB && typeof env.DB.prepare === 'function') return env.DB;
  if (env?.AUTH_DB && typeof env.AUTH_DB.prepare === 'function') return env.AUTH_DB;
  return null;
}

async function ensureUserTopTables(db) {
  await ensureAuthTables(db);
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS user_page_views (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      game_key TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      first_viewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      last_viewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      view_count INTEGER NOT NULL DEFAULT 0,
      UNIQUE(user_id, game_key)
    )
  `).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_user_page_views_user_last ON user_page_views(user_id, last_viewed_at DESC)`).run();
}

async function getUserContext(context) {
  const db = getDb(context.env);
  if (!db) return { db: null, error: json({ ok: false, error: 'DB non liée.' }, 500) };
  await ensureUserTopTables(db);
  const auth = await requireUser(db, context.env, context.request);
  if (!auth.ok) return { db, error: auth.response };
  return { db, user: auth.user, error: null };
}

function compactRow(row) {
  return {
    game_key: clean(row?.game_key, 220),
    title: clean(row?.title, 240),
    view_count: Number(row?.view_count || 0),
    first_viewed_at: row?.first_viewed_at || '',
    last_viewed_at: row?.last_viewed_at || ''
  };
}

export async function onRequestGet(context) {
  const { db, user, error } = await getUserContext(context);
  if (error) return error;

  const url = new URL(context.request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 500), 1), 500);

  const result = await db.prepare(`
    SELECT game_key, title, view_count, first_viewed_at, last_viewed_at
    FROM user_page_views
    WHERE user_id = ?1
    ORDER BY view_count DESC, last_viewed_at DESC
    LIMIT ?2
  `).bind(user.id, limit).all();

  return json({ ok: true, items: (result.results || []).map(compactRow) });
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  return json({ ok: false, error: 'Méthode non autorisée.' }, 405);
}
