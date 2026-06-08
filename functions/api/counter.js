import { ensureAuthTables, getSessionUser } from './_auth.js';
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const op = (url.searchParams.get("op") || "get").trim().toLowerCase();   // get | hit | unhit
  const kind = (url.searchParams.get("kind") || "").trim().toLowerCase();  // view | mega | like
  const id = (url.searchParams.get("id") || "").trim();
  const title = (url.searchParams.get("title") || "").trim().slice(0, 300);

  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,OPTIONS",
    "access-control-allow-headers": "content-type",
  };

  const json = (obj, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers });

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });

  if (request.method !== "GET") {
    return json({ ok: false, error: "Méthode invalide" }, 405);
  }

  if (!env?.DB) return json({ ok: false, error: "DB non liée" }, 500);

  if (!id || id.length > 80) return json({ ok: false, error: "ID invalide" }, 400);

  // ✅ ton format "day" : nombre de jours depuis epoch
  const dayNum = () => Math.floor(Date.now() / 86400000);

  // ✅ Table counters (avec likes)
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS counters (
      id TEXT PRIMARY KEY,
      views INTEGER NOT NULL DEFAULT 0,
      mega INTEGER NOT NULL DEFAULT 0,
      likes INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `).run();

  // ✅ Events (pour fenêtres 24h/7j)
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS counter_events (
      id TEXT NOT NULL,
      kind TEXT NOT NULL,
      ts INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `).run();

  // ✅ Daily rollup (4 semaines / 30j) — schéma réel
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS counter_daily (
      id TEXT NOT NULL,
      kind TEXT NOT NULL,
      day INTEGER NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (id, kind, day)
    );
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS user_page_views (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      game_key TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      first_viewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      last_viewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      view_count INTEGER NOT NULL DEFAULT 0,
      UNIQUE(user_id, game_key)
    );
  `).run();


  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS counter_view_locks (
      user_id INTEGER NOT NULL,
      id TEXT NOT NULL,
      last_hit_at INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (user_id, id)
    );
  `).run();

  // indexes (si déjà créés, OK)
  try {
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_counter_daily_day ON counter_daily(day);`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_counter_daily_kind_day ON counter_daily(kind, day);`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_counter_daily_id_kind_day ON counter_daily(id, kind, day);`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_user_page_views_user_last ON user_page_views(user_id, last_viewed_at DESC);`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_counter_view_locks_last ON counter_view_locks(last_hit_at);`).run();
  } catch {}

  // ✅ Migration douce: si ancienne table sans likes, on tente et on ignore si déjà OK
  try {
    const info = await env.DB.prepare(`PRAGMA table_info(counters);`).all();
    const cols = (info?.results || []).map(r => String(r?.name || "").toLowerCase());
    if (!cols.includes("likes")) {
      await env.DB.prepare(`ALTER TABLE counters ADD COLUMN likes INTEGER NOT NULL DEFAULT 0;`).run();
    }
  } catch {
    // silencieux
  }

  // ✅ Nettoyage doux events (on garde ~8 jours)
  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const pruneBefore = nowSec - (8 * 24 * 60 * 60);
    await env.DB.prepare(`DELETE FROM counter_events WHERE ts < ?1`).bind(pruneBefore).run();
  } catch {
    // silencieux
  }

  async function getRow() {
    const row = await env.DB
      .prepare("SELECT id, views, mega, likes FROM counters WHERE id=?1")
      .bind(id)
      .first();
    return row || { id, views: 0, mega: 0, likes: 0 };
  }

  async function addEvent(evKind) {
    // evKind: 'view' | 'mega' | 'like' | 'unlike'
    await env.DB
      .prepare(`INSERT INTO counter_events (id, kind, ts) VALUES (?1, ?2, unixepoch())`)
      .bind(id, evKind)
      .run();
  }

  async function dailyPlus1(k) {
    const d = dayNum();
    await env.DB.prepare(`
      INSERT INTO counter_daily (id, kind, day, count)
      VALUES (?1, ?2, ?3, 1)
      ON CONFLICT(id, kind, day) DO UPDATE SET count = count + 1
    `).bind(id, k, d).run();
  }

  async function dailyMinus1Like() {
    const d = dayNum();

    // s’assurer que la ligne existe
    await env.DB.prepare(`
      INSERT INTO counter_daily (id, kind, day, count)
      VALUES (?1, 'like', ?2, 0)
      ON CONFLICT(id, kind, day) DO NOTHING
    `).bind(id, d).run();

    // clamp à 0
    await env.DB.prepare(`
      UPDATE counter_daily
      SET count = CASE WHEN count > 0 THEN count - 1 ELSE 0 END
      WHERE id = ?1 AND kind = 'like' AND day = ?2
    `).bind(id, d).run();
  }


  async function resolvePageViewTitle(userId, gameKey, incomingTitle = "") {
    const directTitle = String(incomingTitle || "").trim().slice(0, 300);
    if (directTitle) return directTitle;

    // Le compteur peut recevoir seulement uid:xxx.
    // On essaie donc de récupérer le titre déjà connu côté compte membre
    // pour éviter d'afficher uid:xxx dans le Centre admin.
    const sources = [
      `SELECT title FROM user_page_views WHERE user_id = ?1 AND game_key = ?2 AND COALESCE(title, '') != '' LIMIT 1`,
      `SELECT title FROM user_game_state WHERE user_id = ?1 AND game_key = ?2 AND COALESCE(title, '') != '' LIMIT 1`,
      `SELECT title FROM user_watchlist WHERE user_id = ?1 AND game_key = ?2 AND COALESCE(title, '') != '' LIMIT 1`,
    ];

    for (const sql of sources) {
      try {
        const row = await env.DB.prepare(sql).bind(userId, gameKey).first();
        const found = String(row?.title || "").trim().slice(0, 300);
        if (found) return found;
      } catch {}
    }

    return "";
  }

  async function shouldCountGlobalView() {
    try {
      await ensureAuthTables(env.DB);
      const user = await getSessionUser(env.DB, env, request);
      if (!user?.id) return true;

      // Protection globale séparée de l'historique admin :
      // si deux scripts/API envoient une vue en même temps, une seule passe en 2 minutes.
      const inserted = await env.DB.prepare(`
        INSERT OR IGNORE INTO counter_view_locks (user_id, id, last_hit_at)
        VALUES (?1, ?2, unixepoch())
      `).bind(user.id, id).run();

      if (Number(inserted?.meta?.changes || 0) > 0) return true;

      const updated = await env.DB.prepare(`
        UPDATE counter_view_locks
        SET last_hit_at = unixepoch()
        WHERE user_id = ?1
          AND id = ?2
          AND unixepoch() - last_hit_at >= 120
      `).bind(user.id, id).run();

      return Number(updated?.meta?.changes || 0) > 0;
    } catch {
      return true;
    }
  }

  async function recordLoggedPageView() {
    try {
      await ensureAuthTables(env.DB);
      const user = await getSessionUser(env.DB, env, request);
      if (!user?.id) return { hasUser: false, counted: true };

      // Anti-doublon renforcé : une même page peut appeler plusieurs API au chargement.
      // On ne compte qu'une vue par membre / jeu toutes les 2 minutes.
      // Important : on ne met plus last_viewed_at à jour quand la vue est refusée,
      // sinon deux appels proches peuvent donner l'impression d'une vue récente en double.
      const viewTitle = await resolvePageViewTitle(user.id, id, title);

      const inserted = await env.DB.prepare(`
        INSERT OR IGNORE INTO user_page_views (user_id, game_key, title, view_count, first_viewed_at, last_viewed_at)
        VALUES (?1, ?2, ?3, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      `).bind(user.id, id, viewTitle).run();

      if (Number(inserted?.meta?.changes || 0) > 0) {
        return { hasUser: true, counted: true };
      }

      const updated = await env.DB.prepare(`
        UPDATE user_page_views
        SET
          title = CASE WHEN ?3 != '' THEN ?3 ELSE title END,
          view_count = view_count + 1,
          last_viewed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE user_id = ?1
          AND game_key = ?2
          AND unixepoch('now') - unixepoch(last_viewed_at) >= 120
      `).bind(user.id, id, viewTitle).run();

      const counted = Number(updated?.meta?.changes || 0) > 0;

      // Si la vue est refusée par la protection 2 minutes, on peut quand même
      // compléter le titre manquant sans augmenter view_count ni toucher last_viewed_at.
      if (!counted && viewTitle) {
        try {
          await env.DB.prepare(`
            UPDATE user_page_views
            SET title = ?3
            WHERE user_id = ?1
              AND game_key = ?2
              AND COALESCE(title, '') = ''
          `).bind(user.id, id, viewTitle).run();
        } catch {}
      }

      return { hasUser: true, counted };
    } catch {
      return { hasUser: false, counted: true };
    }
  }

  // ===================== op=get =====================
  if (op === "get") {
    const row = await getRow();
    return json({ ok: true, ...row });
  }

  // ===================== op=hit =====================
  if (op === "hit") {
    if (kind === "view") {
      const countGlobalView = await shouldCountGlobalView();
      await recordLoggedPageView();

      if (countGlobalView) {
        await env.DB.prepare(`
          INSERT INTO counters (id, views, mega, likes, updated_at)
          VALUES (?1, 1, 0, 0, unixepoch())
          ON CONFLICT(id) DO UPDATE SET
            views = views + 1,
            updated_at = unixepoch()
        `).bind(id).run();

        await addEvent("view");
        await dailyPlus1("view");
      }

    } else if (kind === "mega") {
      await env.DB.prepare(`
        INSERT INTO counters (id, views, mega, likes, updated_at)
        VALUES (?1, 0, 1, 0, unixepoch())
        ON CONFLICT(id) DO UPDATE SET
          mega = mega + 1,
          updated_at = unixepoch()
      `).bind(id).run();

      await addEvent("mega");
      await dailyPlus1("mega");

    } else if (kind === "like") {
      await env.DB.prepare(`
        INSERT INTO counters (id, views, mega, likes, updated_at)
        VALUES (?1, 0, 0, 1, unixepoch())
        ON CONFLICT(id) DO UPDATE SET
          likes = likes + 1,
          updated_at = unixepoch()
      `).bind(id).run();

      await addEvent("like");
      await dailyPlus1("like");

    } else {
      return json({ ok: false, error: "kind invalide" }, 400);
    }

    const row = await getRow();
    return json({ ok: true, ...row });
  }

  // ===================== op=unhit =====================
  if (op === "unhit") {
    if (kind !== "like") {
      return json({ ok: false, error: "kind invalide (unhit)" }, 400);
    }

    await env.DB.prepare(`
      INSERT INTO counters (id, views, mega, likes, updated_at)
      VALUES (?1, 0, 0, 0, unixepoch())
      ON CONFLICT(id) DO UPDATE SET
        likes = CASE WHEN likes > 0 THEN likes - 1 ELSE 0 END,
        updated_at = unixepoch()
    `).bind(id).run();

    await addEvent("unlike");
    await dailyMinus1Like();

    const row = await getRow();
    return json({ ok: true, ...row });
  }

  return json({ ok: false, error: "op invalide" }, 400);
}