export async function onRequest(context) {
  const { request, env } = context;

  const nowSec = Math.floor(Date.now() / 1000);
  const T_24H = 24 * 60 * 60;
  const T_7D  = 7 * 24 * 60 * 60;

  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  };

  const json = (obj, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers });

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });

  if (request.method !== "GET" && request.method !== "POST") {
    return json({ ok: false, error: "Méthode invalide" }, 405);
  }

  try {
    if (!env?.DB) return json({ ok: false, error: "DB non liée" }, 500);

    // --------- helpers ---------
    const normId = (x) => String(x || "").trim().slice(0, 80);
    const normType = (x) => String(x || "").trim().toLowerCase();

    // ===== Daily rollup helper (YYYY-MM-DD) =====
    const todayStr = () => new Date().toISOString().slice(0, 10);

    // --------- parse input (GET/POST) ---------
    let op = "get";
    let type = "view";
    let id = "";
    let ids = [];

    if (request.method === "POST") {
      let body = null;
      try { body = await request.json(); }
      catch { return json({ ok: false, error: "JSON invalide" }, 400); }

      op = String(body?.op || "get").trim().toLowerCase();
      type = normType(body?.type || "view");
      id = normId(body?.id || "");

      const idsRaw = Array.isArray(body?.ids) ? body.ids : [];
      ids = idsRaw.map(normId).filter(x => x);

      // compat POST: si pas ids mais id → on le met dans ids pour get
      if (!ids.length && id) ids = [id];

    } else {
      const u = new URL(request.url);
      op = (u.searchParams.get("op") || "get").trim().toLowerCase();
      type = normType(u.searchParams.get("type") || "view");
      id = normId(u.searchParams.get("id") || "");

      const idsParam = u.searchParams.getAll("ids").flatMap(v => String(v || "").split(","));
      ids = []
        .concat(id ? [id] : [])
        .concat(idsParam.map(normId))
        .filter(x => x);
    }

    // --------- validate op/type ---------
    const OPS = new Set(["get", "hit", "unhit"]);
    if (!OPS.has(op)) return json({ ok: false, error: "op invalide" }, 400);

    const TYPES = new Set(["view", "mega", "like"]);
    if (!TYPES.has(type)) return json({ ok: false, error: "type invalide" }, 400);

    // --------- ensure tables ---------
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS counters (
        id TEXT PRIMARY KEY,
        views INTEGER NOT NULL DEFAULT 0,
        mega INTEGER NOT NULL DEFAULT 0,
        likes INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
    `).run();

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS counter_events (
        id TEXT NOT NULL,
        kind TEXT NOT NULL,
        ts INTEGER NOT NULL DEFAULT (unixepoch())
      );
    `).run();

    // ===== NEW: daily rollup table (30 jours / 4 semaines) =====
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS counter_daily (
        id TEXT NOT NULL,
        day TEXT NOT NULL,
        views INTEGER DEFAULT 0,
        mega INTEGER DEFAULT 0,
        likes INTEGER DEFAULT 0,
        PRIMARY KEY (id, day)
      );
    `).run();

    // indexes (si déjà créés, OK)
    try {
      await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_counter_daily_day ON counter_daily(day);`).run();
      await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_counter_daily_id_day ON counter_daily(id, day);`).run();
    } catch {}

    // si table counters existait sans likes
    try {
      await env.DB.prepare(`ALTER TABLE counters ADD COLUMN likes INTEGER NOT NULL DEFAULT 0;`).run();
    } catch {}

    // prune events (>8 jours)
    try {
      const pruneBefore = nowSec - (8 * 24 * 60 * 60);
      await env.DB.prepare(`DELETE FROM counter_events WHERE ts < ?1`).bind(pruneBefore).run();
    } catch {}

    // ===================== op=hit / op=unhit =====================
    if (op === "hit" || op === "unhit") {
      if (!id) return json({ ok: false, error: "id manquant" }, 400);

      // on crée l'entrée si absente
      await env.DB.prepare(`
        INSERT INTO counters (id, views, mega, likes, updated_at)
        VALUES (?1, 0, 0, 0, unixepoch())
        ON CONFLICT(id) DO NOTHING;
      `).bind(id).run();

      const day = todayStr();

      if (op === "hit") {
        if (type === "view") {
          await env.DB.prepare(`UPDATE counters SET views = views + 1, updated_at = unixepoch() WHERE id = ?1`).bind(id).run();
          await env.DB.prepare(`INSERT INTO counter_events (id, kind, ts) VALUES (?1, 'view', unixepoch())`).bind(id).run();

          // daily +1 views
          await env.DB.prepare(`
            INSERT INTO counter_daily (id, day, views) VALUES (?1, ?2, 1)
            ON CONFLICT(id, day) DO UPDATE SET views = views + 1
          `).bind(id, day).run();

        } else if (type === "mega") {
          await env.DB.prepare(`UPDATE counters SET mega = mega + 1, updated_at = unixepoch() WHERE id = ?1`).bind(id).run();
          await env.DB.prepare(`INSERT INTO counter_events (id, kind, ts) VALUES (?1, 'mega', unixepoch())`).bind(id).run();

          // daily +1 mega
          await env.DB.prepare(`
            INSERT INTO counter_daily (id, day, mega) VALUES (?1, ?2, 1)
            ON CONFLICT(id, day) DO UPDATE SET mega = mega + 1
          `).bind(id, day).run();

        } else if (type === "like") {
          await env.DB.prepare(`UPDATE counters SET likes = likes + 1, updated_at = unixepoch() WHERE id = ?1`).bind(id).run();
          await env.DB.prepare(`INSERT INTO counter_events (id, kind, ts) VALUES (?1, 'like', unixepoch())`).bind(id).run();

          // daily +1 like
          await env.DB.prepare(`
            INSERT INTO counter_daily (id, day, likes) VALUES (?1, ?2, 1)
            ON CONFLICT(id, day) DO UPDATE SET likes = likes + 1
          `).bind(id, day).run();
        }

        return json({ ok: true, op, id, type });
      }

      // op=unhit
      // Important: pour les fenêtres 24h/7j on ne soustrait que les likes via 'unlike'
      if (type === "like") {
        await env.DB.prepare(`
          UPDATE counters
          SET likes = CASE WHEN likes > 0 THEN likes - 1 ELSE 0 END,
              updated_at = unixepoch()
          WHERE id = ?1
        `).bind(id).run();
        await env.DB.prepare(`INSERT INTO counter_events (id, kind, ts) VALUES (?1, 'unlike', unixepoch())`).bind(id).run();

        // daily -1 like (clamp à 0)
        // On s’assure que la ligne du jour existe, puis on décrémente
        await env.DB.prepare(`
          INSERT INTO counter_daily (id, day, likes) VALUES (?1, ?2, 0)
          ON CONFLICT(id, day) DO NOTHING
        `).bind(id, day).run();

        await env.DB.prepare(`
          UPDATE counter_daily
          SET likes = CASE WHEN likes > 0 THEN likes - 1 ELSE 0 END
          WHERE id = ?1 AND day = ?2
        `).bind(id, day).run();

        return json({ ok: true, op, id, type });
      }

      // pour view/mega: on décrémente (optionnel) mais pas de kind inverse compté
      // (on NE touche PAS au daily pour view/mega afin de rester cohérent avec ton système actuel basé sur events)
      if (type === "view") {
        await env.DB.prepare(`
          UPDATE counters
          SET views = CASE WHEN views > 0 THEN views - 1 ELSE 0 END,
              updated_at = unixepoch()
          WHERE id = ?1
        `).bind(id).run();
      } else if (type === "mega") {
        await env.DB.prepare(`
          UPDATE counters
          SET mega = CASE WHEN mega > 0 THEN mega - 1 ELSE 0 END,
              updated_at = unixepoch()
          WHERE id = ?1
        `).bind(id).run();
      }
      return json({ ok: true, op, id, type, note: "unhit view/mega: pas d'event inverse compté" });
    }

    // ===================== op=get =====================
    if (!ids.length) return json({ ok: true, stats: {} });

    // chunk pour D1
    const CHUNK = 90;
    const stats = {};

    for (let i = 0; i < ids.length; i += CHUNK) {
      const batch = ids.slice(i, i + CHUNK);

      const placeholders = batch.map((_, k) => `?${k + 1}`).join(", ");
      const placeholdersEv = batch.map((_, k) => `?${k + 2}`).join(", ");

      // totaux
      const res = await env.DB
        .prepare(`SELECT id, views, mega, likes FROM counters WHERE id IN (${placeholders})`)
        .bind(...batch)
        .all();

      for (const row of (res?.results || [])) {
        stats[row.id] = {
          views: Number(row.views || 0),
          mega: Number(row.mega || 0),
          likes: Number(row.likes || 0),
          views24h: 0, mega24h: 0, likes24h: 0,
          views7d: 0,  mega7d: 0,  likes7d: 0,
        };
      }

      // init zéro si absent
      for (const gid of batch) {
        if (!stats[gid]) {
          stats[gid] = {
            views: 0, mega: 0, likes: 0,
            views24h: 0, mega24h: 0, likes24h: 0,
            views7d: 0,  mega7d: 0,  likes7d: 0,
          };
        }
      }

      // 24h
      try {
        const since24 = nowSec - T_24H;
        const r24 = await env.DB.prepare(`
          SELECT id,
            SUM(CASE WHEN kind='view' THEN 1 ELSE 0 END) AS views,
            SUM(CASE WHEN kind='mega' THEN 1 ELSE 0 END) AS mega,
            SUM(CASE WHEN kind='like' THEN 1 ELSE 0 END) AS likes_in,
            SUM(CASE WHEN kind='unlike' THEN 1 ELSE 0 END) AS unlikes
          FROM counter_events
          WHERE ts >= ?1 AND id IN (${placeholdersEv})
          GROUP BY id
        `).bind(since24, ...batch).all();

        for (const row of (r24?.results || [])) {
          const s = stats[row.id];
          const li = Number(row.likes_in || 0);
          const ul = Number(row.unlikes || 0);
          s.views24h = Number(row.views || 0);
          s.mega24h  = Number(row.mega || 0);
          s.likes24h = li - ul;
        }
      } catch {}

      // 7j
      try {
        const since7 = nowSec - T_7D;
        const r7 = await env.DB.prepare(`
          SELECT id,
            SUM(CASE WHEN kind='view' THEN 1 ELSE 0 END) AS views,
            SUM(CASE WHEN kind='mega' THEN 1 ELSE 0 END) AS mega,
            SUM(CASE WHEN kind='like' THEN 1 ELSE 0 END) AS likes_in,
            SUM(CASE WHEN kind='unlike' THEN 1 ELSE 0 END) AS unlikes
          FROM counter_events
          WHERE ts >= ?1 AND id IN (${placeholdersEv})
          GROUP BY id
        `).bind(since7, ...batch).all();

        for (const row of (r7?.results || [])) {
          const s = stats[row.id];
          const li = Number(row.likes_in || 0);
          const ul = Number(row.unlikes || 0);
          s.views7d = Number(row.views || 0);
          s.mega7d  = Number(row.mega || 0);
          s.likes7d = li - ul;
        }
      } catch {}
    }

    return json({ ok: true, stats });

  } catch (e) {
    return json(
      { ok: false, error: "Erreur serveur", details: String(e?.message || e) },
      500
    );
  }
}