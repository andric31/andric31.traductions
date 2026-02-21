export async function onRequest(context) {
  const { request, env } = context;

  const nowSec = Math.floor(Date.now() / 1000);
  const T_24H = 24 * 60 * 60;
  const T_7D  = 7 * 24 * 60 * 60;

  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  };

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Méthode invalide" }), { status: 405, headers });
  }

  try {
    if (!env?.DB) {
      return new Response(JSON.stringify({ ok: false, error: "DB non liée" }), { status: 500, headers });
    }

    let body;
    try { body = await request.json(); }
    catch { return new Response(JSON.stringify({ ok: false, error: "JSON invalide" }), { status: 400, headers }); }

    const idsRaw = Array.isArray(body?.ids) ? body.ids : [];
    const ids = idsRaw
      .map(x => String(x || "").trim())
      .filter(id => id && id.length <= 80);

    if (!ids.length) return new Response(JSON.stringify({ ok: true, stats: {} }), { headers });

    // ✅ table si jamais
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS counters (
        id TEXT PRIMARY KEY,
        views INTEGER NOT NULL DEFAULT 0,
        mega INTEGER NOT NULL DEFAULT 0,
        likes INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
    `).run();

    // ✅ events (pour fenêtres 24h/7j)
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS counter_events (
        id TEXT NOT NULL,
        kind TEXT NOT NULL,
        ts INTEGER NOT NULL DEFAULT (unixepoch())
      );
    `).run();

    // ✅ nettoyage doux (on garde ~8 jours)
    try {
      const pruneBefore = nowSec - (8 * 24 * 60 * 60);
      await env.DB.prepare(`DELETE FROM counter_events WHERE ts < ?1`).bind(pruneBefore).run();
    } catch { /* silencieux */ }

    // ✅ si table existait sans likes → on tente d'ajouter la colonne (ignore si déjà là)
    try {
      await env.DB.prepare(`ALTER TABLE counters ADD COLUMN likes INTEGER NOT NULL DEFAULT 0;`).run();
    } catch { /* déjà présent */ }

    // ✅ IMPORTANT : lot petit pour éviter limites D1
    const CHUNK = 90;
    const stats = {};

    for (let i = 0; i < ids.length; i += CHUNK) {
      const batch = ids.slice(i, i + CHUNK);
      const placeholders = batch.map((_, i) => `?${i + 1}`).join(", ");
      const placeholdersEv = batch.map((_, i) => `?${i + 2}`).join(", ");
      const stmt = env.DB
        .prepare(`SELECT id, views, mega, likes FROM counters WHERE id IN (${placeholders})`)
        .bind(...batch);

      const res = await stmt.all();
      const rows = res?.results || [];

      for (const row of rows) {
        stats[row.id] = {
          views: Number(row.views || 0),
          mega: Number(row.mega || 0),
          likes: Number(row.likes || 0),
          views24h: 0,
          mega24h: 0,
          likes24h: 0,
          views7d: 0,
          mega7d: 0,
          likes7d: 0,
        };
      }

      // ✅ init à zéro même si pas dans la table counters
      for (const id of batch) {
        if (!stats[id]) {
          stats[id] = {
            views: 0, mega: 0, likes: 0,
            views24h: 0, mega24h: 0, likes24h: 0,
            views7d: 0, mega7d: 0, likes7d: 0,
          };
        }
      }

      // ✅ fenêtres 24h
      try {
        const since24 = nowSec - T_24H;
        const stmt24 = env.DB
          .prepare(`
            SELECT id,
              SUM(CASE WHEN kind='view' THEN 1 ELSE 0 END) AS views,
              SUM(CASE WHEN kind='mega' THEN 1 ELSE 0 END) AS mega,
              SUM(CASE WHEN kind='like' THEN 1 ELSE 0 END) AS likes_in,
              SUM(CASE WHEN kind='unlike' THEN 1 ELSE 0 END) AS unlikes
            FROM counter_events
            WHERE ts >= ?1 AND id IN (${placeholdersEv})
            GROUP BY id
          `)
          .bind(since24, ...batch);

        const r24 = await stmt24.all();
        for (const row of (r24?.results || [])) {
          const s = stats[row.id] || (stats[row.id] = { views: 0, mega: 0, likes: 0 });
          const li = Number(row.likes_in || 0);
          const ul = Number(row.unlikes || 0);
          s.views24h = Number(row.views || 0);
          s.mega24h  = Number(row.mega || 0);
          s.likes24h = li - ul;
        }
      } catch { /* silencieux */ }

      // ✅ fenêtres 7j
      try {
        const since7 = nowSec - T_7D;
        const stmt7 = env.DB
          .prepare(`
            SELECT id,
              SUM(CASE WHEN kind='view' THEN 1 ELSE 0 END) AS views,
              SUM(CASE WHEN kind='mega' THEN 1 ELSE 0 END) AS mega,
              SUM(CASE WHEN kind='like' THEN 1 ELSE 0 END) AS likes_in,
              SUM(CASE WHEN kind='unlike' THEN 1 ELSE 0 END) AS unlikes
            FROM counter_events
            WHERE ts >= ?1 AND id IN (${placeholdersEv})
            GROUP BY id
          `)
          .bind(since7, ...batch);

        const r7 = await stmt7.all();
        for (const row of (r7?.results || [])) {
          const s = stats[row.id] || (stats[row.id] = { views: 0, mega: 0, likes: 0 });
          const li = Number(row.likes_in || 0);
          const ul = Number(row.unlikes || 0);
          s.views7d = Number(row.views || 0);
          s.mega7d  = Number(row.mega || 0);
          s.likes7d = li - ul;
        }
      } catch { /* silencieux */ }
    }

    return new Response(JSON.stringify({ ok: true, stats }), { headers });

  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: "Erreur serveur", details: String(e?.message || e) }),
      { status: 500, headers }
    );
  }
}

