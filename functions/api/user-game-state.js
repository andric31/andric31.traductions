import { ensureAuthTables, requireUser, json } from './_auth.js';

function clean(value, max = 1000) {
  return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}

function getDb(env) {
  if (env?.DB && typeof env.DB.prepare === 'function') return env.DB;
  if (env?.AUTH_DB && typeof env.AUTH_DB.prepare === 'function') return env.AUTH_DB;
  return null;
}

function dayNum() {
  return Math.floor(Date.now() / 86400000);
}

async function ensureGameStateTables(db) {
  await ensureAuthTables(db);
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS user_game_state (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      game_key TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      game_url TEXT DEFAULT '',
      image_url TEXT DEFAULT '',
      f95_url TEXT DEFAULT '',
      discord_url TEXT DEFAULT '',
      liked INTEGER NOT NULL DEFAULT 0,
      rating INTEGER NOT NULL DEFAULT 0,
      liked_at TEXT DEFAULT '',
      rated_at TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE(user_id, game_key),
      FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE
    )
  `).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_user_game_state_user_like ON user_game_state(user_id, liked, liked_at DESC)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_user_game_state_user_rating ON user_game_state(user_id, rating, rated_at DESC)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_user_game_state_key ON user_game_state(game_key)`).run();
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

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS counters (
      id TEXT PRIMARY KEY,
      views INTEGER NOT NULL DEFAULT 0,
      mega INTEGER NOT NULL DEFAULT 0,
      likes INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `).run();
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS counter_events (
      id TEXT NOT NULL,
      kind TEXT NOT NULL,
      ts INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `).run();
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS counter_daily (
      id TEXT NOT NULL,
      kind TEXT NOT NULL,
      day INTEGER NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (id, kind, day)
    )
  `).run();
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ratings4 (
      id TEXT PRIMARY KEY,
      sum INTEGER NOT NULL DEFAULT 0,
      count INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `).run();

  try {
    const info = await db.prepare(`PRAGMA table_info(counters);`).all();
    const cols = (info?.results || []).map(r => String(r?.name || '').toLowerCase());
    if (!cols.includes('likes')) await db.prepare(`ALTER TABLE counters ADD COLUMN likes INTEGER NOT NULL DEFAULT 0;`).run();
  } catch {}
}

async function readBody(request) {
  try { return await request.json(); } catch { return {}; }
}

async function getUserContext(context) {
  const db = getDb(context.env);
  if (!db) return { db: null, error: json({ ok: false, error: 'DB non liée.' }, 500) };
  await ensureGameStateTables(db);
  const auth = await requireUser(db, context.env, context.request);
  if (!auth.ok) return { db, error: auth.response };
  return { db, user: auth.user, error: null };
}


async function recordPageView(db, userId, gameKey, title = '') {
  if (!userId || !gameKey) return;
  const cleanTitle = clean(title, 300);
  await db.prepare(`
    INSERT INTO user_page_views (user_id, game_key, title, view_count, first_viewed_at, last_viewed_at)
    VALUES (?1, ?2, ?3, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(user_id, game_key) DO UPDATE SET
      title = CASE WHEN excluded.title != '' THEN excluded.title ELSE user_page_views.title END,
      view_count = user_page_views.view_count + 1,
      last_viewed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  `).bind(userId, gameKey, cleanTitle).run();
}

async function getCounterRow(db, gameKey) {
  const row = await db.prepare(`SELECT id, views, mega, likes FROM counters WHERE id = ?1`).bind(gameKey).first();
  return row || { id: gameKey, views: 0, mega: 0, likes: 0 };
}

async function getRatingRow(db, gameKey) {
  const row = await db.prepare(`SELECT id, sum, count FROM ratings4 WHERE id = ?1`).bind(gameKey).first();
  const sum = Number(row?.sum || 0);
  const count = Number(row?.count || 0);
  return { id: gameKey, sum, count, avg: count > 0 ? sum / count : 0 };
}

async function dailyPlus1Like(db, gameKey) {
  await db.prepare(`
    INSERT INTO counter_daily (id, kind, day, count)
    VALUES (?1, 'like', ?2, 1)
    ON CONFLICT(id, kind, day) DO UPDATE SET count = count + 1
  `).bind(gameKey, dayNum()).run();
}

async function dailyMinus1Like(db, gameKey) {
  const d = dayNum();
  await db.prepare(`
    INSERT INTO counter_daily (id, kind, day, count)
    VALUES (?1, 'like', ?2, 0)
    ON CONFLICT(id, kind, day) DO NOTHING
  `).bind(gameKey, d).run();
  await db.prepare(`
    UPDATE counter_daily
    SET count = CASE WHEN count > 0 THEN count - 1 ELSE 0 END
    WHERE id = ?1 AND kind = 'like' AND day = ?2
  `).bind(gameKey, d).run();
}

async function applyLike(db, gameKey, liked, prevLiked) {
  if (!!liked === !!prevLiked) return await getCounterRow(db, gameKey);

  if (liked) {
    await db.prepare(`
      INSERT INTO counters (id, views, mega, likes, updated_at)
      VALUES (?1, 0, 0, 1, unixepoch())
      ON CONFLICT(id) DO UPDATE SET likes = likes + 1, updated_at = unixepoch()
    `).bind(gameKey).run();
    await db.prepare(`INSERT INTO counter_events (id, kind, ts) VALUES (?1, 'like', unixepoch())`).bind(gameKey).run();
    await dailyPlus1Like(db, gameKey);
  } else {
    await db.prepare(`
      INSERT INTO counters (id, views, mega, likes, updated_at)
      VALUES (?1, 0, 0, 0, unixepoch())
      ON CONFLICT(id) DO UPDATE SET likes = CASE WHEN likes > 0 THEN likes - 1 ELSE 0 END, updated_at = unixepoch()
    `).bind(gameKey).run();
    await db.prepare(`INSERT INTO counter_events (id, kind, ts) VALUES (?1, 'unlike', unixepoch())`).bind(gameKey).run();
    await dailyMinus1Like(db, gameKey);
  }
  return await getCounterRow(db, gameKey);
}

async function applyRating(db, gameKey, rating, prevRating) {
  const next = Number(rating || 0);
  const prev = Number(prevRating || 0);
  if (next === prev) return await getRatingRow(db, gameKey);

  if (next === 0 && prev === 0) return await getRatingRow(db, gameKey);

  await db.prepare(`
    INSERT INTO ratings4 (id, sum, count, updated_at)
    VALUES (?1, 0, 0, unixepoch())
    ON CONFLICT(id) DO UPDATE SET updated_at = unixepoch()
  `).bind(gameKey).run();

  if (prev > 0) {
    await db.prepare(`
      UPDATE ratings4
      SET sum = CASE WHEN sum >= ?2 THEN sum - ?2 ELSE 0 END,
          count = CASE WHEN count > 0 THEN count - 1 ELSE 0 END,
          updated_at = unixepoch()
      WHERE id = ?1
    `).bind(gameKey, prev).run();
  }

  if (next > 0) {
    await db.prepare(`
      UPDATE ratings4
      SET sum = sum + ?2,
          count = count + 1,
          updated_at = unixepoch()
      WHERE id = ?1
    `).bind(gameKey, next).run();
  }

  const after = await getRatingRow(db, gameKey);
  if (after.count <= 0) {
    await db.prepare(`DELETE FROM ratings4 WHERE id = ?1`).bind(gameKey).run();
    return { id: gameKey, sum: 0, count: 0, avg: 0 };
  }
  return after;
}

function compactItem(row) {
  return {
    id: row.id,
    game_key: row.game_key,
    title: row.title || 'Jeu sans titre',
    game_url: row.game_url || '',
    image_url: row.image_url || '',
    f95_url: row.f95_url || '',
    discord_url: row.discord_url || '',
    liked: !!row.liked,
    rating: Number(row.rating || 0),
    liked_at: row.liked_at || '',
    rated_at: row.rated_at || '',
    updated_at: row.updated_at || ''
  };
}

export async function onRequestGet(context) {
  const { db, user, error } = await getUserContext(context);
  if (error) return error;

  const url = new URL(context.request.url);
  const gameKey = clean(url.searchParams.get('game_key'), 220);
  const list = clean(url.searchParams.get('list'), 20).toLowerCase();
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 200), 1), 500);

  if (gameKey) {
    const titleParam = clean(url.searchParams.get('title'), 300);
    try { await recordPageView(db, user.id, gameKey, titleParam); } catch {}
    const row = await db.prepare(`
      SELECT id, game_key, title, game_url, image_url, f95_url, discord_url, liked, rating, liked_at, rated_at, updated_at
      FROM user_game_state
      WHERE user_id = ?1 AND game_key = ?2
      LIMIT 1
    `).bind(user.id, gameKey).first();
    return json({
      ok: true,
      state: row ? compactItem(row) : { game_key: gameKey, liked: false, rating: 0 },
      counters: await getCounterRow(db, gameKey),
      rating_stats: await getRatingRow(db, gameKey)
    });
  }

  let where = 'user_id = ?1 AND (liked = 1 OR rating > 0)';
  let order = 'updated_at DESC, id DESC';
  if (list === 'liked') { where = 'user_id = ?1 AND liked = 1'; order = 'liked_at DESC, updated_at DESC, id DESC'; }
  if (list === 'rated') { where = 'user_id = ?1 AND rating > 0'; order = 'rated_at DESC, updated_at DESC, id DESC'; }

  const result = await db.prepare(`
    SELECT id, game_key, title, game_url, image_url, f95_url, discord_url, liked, rating, liked_at, rated_at, updated_at
    FROM user_game_state
    WHERE ${where}
    ORDER BY ${order}
    LIMIT ?2
  `).bind(user.id, limit).all();

  return json({ ok: true, items: (result.results || []).map(compactItem) });
}

export async function onRequestPost(context) {
  const { db, user, error } = await getUserContext(context);
  if (error) return error;

  const body = await readBody(context.request);
  const gameKey = clean(body.game_key, 220);
  if (!gameKey) return json({ ok: false, error: 'Clé du jeu manquante.' }, 400);

  const title = clean(body.title, 240);
  const gameUrl = clean(body.game_url, 600);
  const imageUrl = clean(body.image_url, 1200);
  const f95Url = clean(body.f95_url, 600);
  const discordUrl = clean(body.discord_url, 600);

  const current = await db.prepare(`
    SELECT liked, rating FROM user_game_state
    WHERE user_id = ?1 AND game_key = ?2
    LIMIT 1
  `).bind(user.id, gameKey).first();

  const prevLiked = !!current?.liked;
  const prevRating = Number(current?.rating || 0);
  const hasLiked = Object.prototype.hasOwnProperty.call(body || {}, 'liked');
  const hasRating = Object.prototype.hasOwnProperty.call(body || {}, 'rating');
  const nextLiked = hasLiked ? !!body.liked : prevLiked;
  let nextRating = hasRating ? Number(body.rating || 0) : prevRating;
  if (!Number.isFinite(nextRating) || nextRating < 0 || nextRating > 4) {
    return json({ ok: false, error: 'Note invalide (0..4).' }, 400);
  }
  nextRating = Math.trunc(nextRating);

  await db.prepare(`
    INSERT INTO user_game_state (
      user_id, game_key, title, game_url, image_url, f95_url, discord_url,
      liked, rating, liked_at, rated_at, created_at, updated_at
    ) VALUES (
      ?1, ?2, ?3, ?4, ?5, ?6, ?7,
      ?8, ?9,
      CASE WHEN ?8 = 1 THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE '' END,
      CASE WHEN ?9 > 0 THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE '' END,
      strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
    )
    ON CONFLICT(user_id, game_key) DO UPDATE SET
      title = CASE WHEN excluded.title != '' THEN excluded.title ELSE user_game_state.title END,
      game_url = CASE WHEN excluded.game_url != '' THEN excluded.game_url ELSE user_game_state.game_url END,
      image_url = CASE WHEN excluded.image_url != '' THEN excluded.image_url ELSE user_game_state.image_url END,
      f95_url = CASE WHEN excluded.f95_url != '' THEN excluded.f95_url ELSE user_game_state.f95_url END,
      discord_url = CASE WHEN excluded.discord_url != '' THEN excluded.discord_url ELSE user_game_state.discord_url END,
      liked = excluded.liked,
      rating = excluded.rating,
      liked_at = CASE
        WHEN excluded.liked = 1 AND user_game_state.liked = 0 THEN strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHEN excluded.liked = 0 THEN ''
        ELSE user_game_state.liked_at
      END,
      rated_at = CASE
        WHEN excluded.rating > 0 AND excluded.rating != user_game_state.rating THEN strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHEN excluded.rating = 0 THEN ''
        ELSE user_game_state.rated_at
      END,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  `).bind(user.id, gameKey, title, gameUrl, imageUrl, f95Url, discordUrl, nextLiked ? 1 : 0, nextRating).run();

  let counters = await getCounterRow(db, gameKey);
  let ratingStats = await getRatingRow(db, gameKey);
  if (hasLiked) counters = await applyLike(db, gameKey, nextLiked, prevLiked);
  if (hasRating) ratingStats = await applyRating(db, gameKey, nextRating, prevRating);

  const row = await db.prepare(`
    SELECT id, game_key, title, game_url, image_url, f95_url, discord_url, liked, rating, liked_at, rated_at, updated_at
    FROM user_game_state
    WHERE user_id = ?1 AND game_key = ?2
    LIMIT 1
  `).bind(user.id, gameKey).first();

  return json({ ok: true, state: compactItem(row), counters, rating_stats: ratingStats });
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  if (context.request.method === 'POST') return onRequestPost(context);
  return json({ ok: false, error: 'Méthode non autorisée.' }, 405);
}
