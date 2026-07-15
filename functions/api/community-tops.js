import { ensureAuthTables, requireUser, json } from './_auth.js';

function clean(value, max = 1000) {
  return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}

function getDb(env) {
  if (env?.DB && typeof env.DB.prepare === 'function') return env.DB;
  if (env?.AUTH_DB && typeof env.AUTH_DB.prepare === 'function') return env.AUTH_DB;
  return null;
}

async function ensureTables(db) {
  await ensureAuthTables(db);
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS community_game_tops (
      user_id INTEGER PRIMARY KEY,
      items_json TEXT NOT NULL DEFAULT '[]',
      published_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )
  `).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_community_game_tops_updated ON community_game_tops(updated_at DESC)`).run();
}

function normalizeItems(input) {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 5).map((item, index) => ({
    rank: index + 1,
    game_key: clean(item?.game_key, 220),
    title: clean(item?.title, 240) || 'Jeu sans titre',
    image_url: clean(item?.image_url, 1000),
    game_url: clean(item?.game_url, 1000),
    score: Number(item?.score || 0)
  })).filter((item) => item.game_key || item.title);
}

function parseItems(raw) {
  try { return normalizeItems(JSON.parse(raw || '[]')); } catch { return []; }
}

export async function onRequestGet(context) {
  const db = getDb(context.env);
  if (!db) return json({ ok: false, error: 'DB non liée.' }, 500);
  await ensureTables(db);
  const url = new URL(context.request.url);

  if (url.searchParams.get('mine') === '1') {
    const auth = await requireUser(db, context.env, context.request);
    if (!auth.ok) return auth.response;
    const row = await db.prepare(`SELECT items_json, published_at, updated_at FROM community_game_tops WHERE user_id = ?1`).bind(auth.user.id).first();
    return json({ ok: true, published: !!row, items: row ? parseItems(row.items_json) : [], published_at: row?.published_at || '', updated_at: row?.updated_at || '' });
  }

  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 50), 1), 100);
  const result = await db.prepare(`
    SELECT t.user_id, t.items_json, t.published_at, t.updated_at, u.username, u.display_name
    FROM community_game_tops t
    JOIN auth_users u ON u.id = t.user_id
    WHERE u.is_active = 1
    ORDER BY t.updated_at DESC
    LIMIT ?1
  `).bind(limit).all();

  return json({
    ok: true,
    items: (result.results || []).map((row) => ({
      user_id: Number(row.user_id),
      username: clean(row.username, 120),
      display_name: clean(row.display_name, 160) || clean(row.username, 120),
      games: parseItems(row.items_json),
      published_at: row.published_at || '',
      updated_at: row.updated_at || ''
    }))
  });
}

export async function onRequestPost(context) {
  const db = getDb(context.env);
  if (!db) return json({ ok: false, error: 'DB non liée.' }, 500);
  await ensureTables(db);
  const auth = await requireUser(db, context.env, context.request);
  if (!auth.ok) return auth.response;
  const body = await context.request.json().catch(() => ({}));
  const items = normalizeItems(body?.items);
  if (!items.length) return json({ ok: false, error: 'Ton top est vide.' }, 400);

  await db.prepare(`
    INSERT INTO community_game_tops (user_id, items_json, published_at, updated_at)
    VALUES (?1, ?2, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(user_id) DO UPDATE SET
      items_json = excluded.items_json,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  `).bind(auth.user.id, JSON.stringify(items)).run();

  return json({ ok: true, published: true, items });
}

export async function onRequestDelete(context) {
  const db = getDb(context.env);
  if (!db) return json({ ok: false, error: 'DB non liée.' }, 500);
  await ensureTables(db);
  const auth = await requireUser(db, context.env, context.request);
  if (!auth.ok) return auth.response;
  await db.prepare(`DELETE FROM community_game_tops WHERE user_id = ?1`).bind(auth.user.id).run();
  return json({ ok: true, published: false });
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  if (context.request.method === 'POST') return onRequestPost(context);
  if (context.request.method === 'DELETE') return onRequestDelete(context);
  return json({ ok: false, error: 'Méthode non autorisée.' }, 405);
}
