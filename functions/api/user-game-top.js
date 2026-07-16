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
  try {
    const info = await db.prepare(`PRAGMA table_info(user_page_views);`).all();
    const cols = (info?.results || []).map((r) => String(r?.name || '').toLowerCase());
    if (!cols.includes('download_count')) await db.prepare(`ALTER TABLE user_page_views ADD COLUMN download_count INTEGER NOT NULL DEFAULT 0;`).run();
    if (!cols.includes('last_downloaded_at')) await db.prepare(`ALTER TABLE user_page_views ADD COLUMN last_downloaded_at TEXT NOT NULL DEFAULT '';`).run();
  } catch {}
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
    download_count: Number(row?.download_count || 0),
    first_viewed_at: row?.first_viewed_at || '',
    last_viewed_at: row?.last_viewed_at || '',
    last_downloaded_at: row?.last_downloaded_at || ''
  };
}

export async function onRequestGet(context) {
  const { db, user, error } = await getUserContext(context);
  if (error) return error;

  const url = new URL(context.request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 500), 1), 500);

  const result = await db.prepare(`
    SELECT game_key, title, view_count, download_count, first_viewed_at, last_viewed_at, last_downloaded_at
    FROM user_page_views
    WHERE user_id = ?1
    ORDER BY download_count DESC, view_count DESC, last_downloaded_at DESC, last_viewed_at DESC
    LIMIT ?2
  `).bind(user.id, limit).all();

  return json({ ok: true, items: (result.results || []).map(compactRow) });
}



export async function onRequestPost(context) {
  const { db, user, error } = await getUserContext(context);
  if (error) return error;

  let body = {};
  try { body = await context.request.json(); } catch {}
  const gameKey = clean(body?.game_key, 220);
  const title = clean(body?.title, 240);
  if (!gameKey) return json({ ok: false, error: 'Clé du jeu manquante.' }, 400);

  await db.prepare(`
    INSERT OR IGNORE INTO user_page_views (
      user_id, game_key, title, view_count, download_count,
      first_viewed_at, last_viewed_at, last_downloaded_at
    ) VALUES (
      ?1, ?2, ?3, 0, 1,
      strftime('%Y-%m-%dT%H:%M:%fZ','now'),
      strftime('%Y-%m-%dT%H:%M:%fZ','now'),
      strftime('%Y-%m-%dT%H:%M:%fZ','now')
    )
  `).bind(user.id, gameKey, title).run();

  const updated = await db.prepare(`
    UPDATE user_page_views
    SET
      title = CASE WHEN ?3 != '' THEN ?3 ELSE title END,
      download_count = download_count + 1,
      last_downloaded_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE user_id = ?1
      AND game_key = ?2
      AND download_count >= 1
      AND (last_downloaded_at = '' OR unixepoch('now') - unixepoch(last_downloaded_at) >= 300)
  `).bind(user.id, gameKey, title).run();

  const row = await db.prepare(`
    SELECT game_key, title, view_count, download_count, first_viewed_at, last_viewed_at, last_downloaded_at
    FROM user_page_views
    WHERE user_id = ?1 AND game_key = ?2
    LIMIT 1
  `).bind(user.id, gameKey).first();

  return json({ ok: true, counted: Number(updated?.meta?.changes || 0) > 0 || Number(row?.download_count || 0) === 1, item: compactRow(row) });
}

export async function onRequestDelete(context) {
  const { db, user, error } = await getUserContext(context);
  if (error) return error;

  const result = await db.prepare(`
    DELETE FROM user_page_views
    WHERE user_id = ?1
  `).bind(user.id).run();

  return json({ ok: true, deleted: Number(result?.meta?.changes || 0) });
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  if (context.request.method === 'POST') return onRequestPost(context);
  if (context.request.method === 'DELETE') return onRequestDelete(context);
  return json({ ok: false, error: 'Méthode non autorisée.' }, 405);
}
