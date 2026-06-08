import { ensureAuthTables, json, requireUser, isRoleAllowed } from './_auth.js';

async function ensureAdminMemberInfoTables(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS user_watchlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      game_key TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      game_url TEXT DEFAULT '',
      image_url TEXT DEFAULT '',
      f95_url TEXT DEFAULT '',
      discord_url TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE(user_id, game_key)
    )
  `).run();
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
      UNIQUE(user_id, game_key)
    )
  `).run();
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

async function getMemberStats(db, userId) {
  const watch = await db.prepare(`SELECT COUNT(*) AS n FROM user_watchlist WHERE user_id = ?1`).bind(userId).first();
  const liked = await db.prepare(`SELECT COUNT(*) AS n FROM user_game_state WHERE user_id = ?1 AND liked = 1`).bind(userId).first();
  const rated = await db.prepare(`SELECT COUNT(*) AS n FROM user_game_state WHERE user_id = ?1 AND rating > 0`).bind(userId).first();
  const pageViews = await db.prepare(`SELECT COALESCE(SUM(view_count), 0) AS n FROM user_page_views WHERE user_id = ?1`).bind(userId).first();
  const uniquePages = await db.prepare(`SELECT COUNT(*) AS n FROM user_page_views WHERE user_id = ?1`).bind(userId).first();
  const recent = await db.prepare(`
    SELECT type, title, game_key, value, date FROM (
      SELECT 'watchlist' AS type, title, game_key, '' AS value, COALESCE(created_at, updated_at, '') AS date
      FROM user_watchlist
      WHERE user_id = ?1
      UNION ALL
      SELECT 'like' AS type, title, game_key, '' AS value, COALESCE(liked_at, updated_at, '') AS date
      FROM user_game_state
      WHERE user_id = ?1 AND liked = 1
      UNION ALL
      SELECT 'rating' AS type, title, game_key, CAST(rating AS TEXT) AS value, COALESCE(rated_at, updated_at, '') AS date
      FROM user_game_state
      WHERE user_id = ?1 AND rating > 0
    )
    WHERE date IS NOT NULL AND date != ''
    ORDER BY date DESC
    LIMIT 50
  `).bind(userId).all();
  const recentViews = await db.prepare(`
    SELECT 'page_view' AS type, title, game_key, CAST(view_count AS TEXT) AS value, last_viewed_at AS date
    FROM user_page_views
    WHERE user_id = ?1
    ORDER BY last_viewed_at DESC
    LIMIT 50
  `).bind(userId).all();
  return {
    watchlist_count: Number(watch?.n || 0),
    liked_count: Number(liked?.n || 0),
    rated_count: Number(rated?.n || 0),
    page_views_count: Number(pageViews?.n || 0),
    unique_pages_viewed: Number(uniquePages?.n || 0),
    recent_activity: (recent?.results || []).map((r) => ({
      type: r.type || '',
      title: r.title || r.game_key || 'Jeu sans titre',
      game_key: r.game_key || '',
      value: r.value || '',
      date: r.date || ''
    })),
    recent_page_views: (recentViews?.results || []).map((r) => ({
      type: r.type || '',
      title: r.title || r.game_key || 'Jeu sans titre',
      game_key: r.game_key || '',
      value: r.value || '',
      date: r.date || ''
    }))
  };
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'GET') return json({ ok: false, error: 'Méthode invalide.' }, 405);
  if (!env?.DB) return json({ ok: false, error: 'DB non liée.' }, 500);

  await ensureAuthTables(env.DB);
  await ensureAdminMemberInfoTables(env.DB);
  const auth = await requireUser(env.DB, env, request);
  if (!auth.ok) return auth.response;
  if (!isRoleAllowed(auth.user.role, ['admin'])) return json({ ok: false, error: 'Accès refusé.' }, 403);

  const { results } = await env.DB.prepare(`
    SELECT id, username, display_name, role, is_active, created_at, updated_at, last_login_at
    FROM auth_users
    ORDER BY lower(username) ASC
  `).all();

  const users = await Promise.all((results || []).map(async (u) => {
    let extra = { watchlist_count: 0, liked_count: 0, rated_count: 0, page_views_count: 0, unique_pages_viewed: 0, recent_activity: [], recent_page_views: [] };
    try { extra = await getMemberStats(env.DB, u.id); } catch {}
    return {
      id: u.id,
      username: u.username,
      display_name: u.display_name,
      role: u.role,
      is_active: !!u.is_active,
      created_at: u.created_at || '',
      updated_at: u.updated_at || '',
      last_login_at: u.last_login_at || '',
      ...extra
    };
  }));

  return json({ ok: true, users });
}
