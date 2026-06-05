import { ensureAuthTables, requireUser, json } from './_auth.js';

function clean(value, max = 1000) {
  return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}

function getDb(env) {
  if (env?.DB && typeof env.DB.prepare === 'function') return env.DB;
  if (env?.AUTH_DB && typeof env.AUTH_DB.prepare === 'function') return env.AUTH_DB;
  return null;
}

async function ensureWatchlistTable(db) {
  await ensureAuthTables(db);
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS user_watchlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      game_key TEXT NOT NULL,
      title TEXT NOT NULL,
      game_url TEXT DEFAULT '',
      image_url TEXT DEFAULT '',
      f95_url TEXT DEFAULT '',
      discord_url TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE(user_id, game_key),
      FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE
    )
  `).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_user_watchlist_user_created ON user_watchlist(user_id, created_at DESC)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_user_watchlist_key ON user_watchlist(game_key)`).run();
}

async function readBody(request) {
  try { return await request.json(); } catch { return {}; }
}

async function getUserContext(context) {
  const db = getDb(context.env);
  if (!db) return { db: null, error: json({ ok: false, error: 'DB non liée.' }, 500) };
  await ensureWatchlistTable(db);
  const auth = await requireUser(db, context.env, context.request);
  if (!auth.ok) return { db, error: auth.response };
  return { db, user: auth.user, error: null };
}

export async function onRequestGet(context) {
  const { db, user, error } = await getUserContext(context);
  if (error) return error;

  const url = new URL(context.request.url);
  const gameKey = clean(url.searchParams.get('game_key'), 220);

  if (gameKey) {
    const row = await db.prepare(`
      SELECT id, game_key, title, game_url, image_url, f95_url, discord_url, created_at, updated_at
      FROM user_watchlist
      WHERE user_id = ?1 AND game_key = ?2
      LIMIT 1
    `).bind(user.id, gameKey).first();
    return json({ ok: true, in_watchlist: !!row, item: row || null });
  }

  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 200), 1), 500);
  const result = await db.prepare(`
    SELECT id, game_key, title, game_url, image_url, f95_url, discord_url, created_at, updated_at
    FROM user_watchlist
    WHERE user_id = ?1
    ORDER BY created_at DESC, id DESC
    LIMIT ?2
  `).bind(user.id, limit).all();

  return json({ ok: true, items: result.results || [] });
}

export async function onRequestPost(context) {
  const { db, user, error } = await getUserContext(context);
  if (error) return error;

  const body = await readBody(context.request);
  const gameKey = clean(body.game_key, 220);
  const title = clean(body.title, 240);
  const gameUrl = clean(body.game_url, 600);
  const imageUrl = clean(body.image_url, 1200);
  const f95Url = clean(body.f95_url, 600);
  const discordUrl = clean(body.discord_url, 600);

  if (!gameKey) return json({ ok: false, error: 'Clé du jeu manquante.' }, 400);
  if (!title) return json({ ok: false, error: 'Titre du jeu manquant.' }, 400);

  await db.prepare(`
    INSERT INTO user_watchlist (user_id, game_key, title, game_url, image_url, f95_url, discord_url, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(user_id, game_key) DO UPDATE SET
      title = excluded.title,
      game_url = excluded.game_url,
      image_url = excluded.image_url,
      f95_url = excluded.f95_url,
      discord_url = excluded.discord_url,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  `).bind(user.id, gameKey, title, gameUrl, imageUrl, f95Url, discordUrl).run();

  const row = await db.prepare(`
    SELECT id, game_key, title, game_url, image_url, f95_url, discord_url, created_at, updated_at
    FROM user_watchlist
    WHERE user_id = ?1 AND game_key = ?2
    LIMIT 1
  `).bind(user.id, gameKey).first();

  return json({ ok: true, in_watchlist: true, item: row });
}

export async function onRequestDelete(context) {
  const { db, user, error } = await getUserContext(context);
  if (error) return error;

  const body = await readBody(context.request);
  const url = new URL(context.request.url);
  const gameKey = clean(body.game_key || url.searchParams.get('game_key'), 220);
  const id = Number(body.id || url.searchParams.get('id') || 0);

  if (id > 0) {
    await db.prepare(`DELETE FROM user_watchlist WHERE user_id = ?1 AND id = ?2`).bind(user.id, id).run();
    return json({ ok: true, deleted: id });
  }

  if (!gameKey) return json({ ok: false, error: 'Clé du jeu manquante.' }, 400);
  await db.prepare(`DELETE FROM user_watchlist WHERE user_id = ?1 AND game_key = ?2`).bind(user.id, gameKey).run();
  return json({ ok: true, deleted: gameKey });
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  if (context.request.method === 'POST') return onRequestPost(context);
  if (context.request.method === 'DELETE') return onRequestDelete(context);
  return json({ ok: false, error: 'Méthode non autorisée.' }, 405);
}
