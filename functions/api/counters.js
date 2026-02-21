export async function onRequest(context) {
  const { request, env } = context;

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

    // ✅ table principale si jamais
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS counters (
        id TEXT PRIMARY KEY,
        views INTEGER NOT NULL DEFAULT 0,
        mega INTEGER NOT NULL DEFAULT 0,
        likes INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
    `).run();

    // ✅ migration douce (ancienne table sans likes)
    try { await env.DB.prepare(`ALTER TABLE counters ADD COLUMN likes INTEGER NOT NULL DEFAULT 0;`).run(); }
    catch { /* déjà présent */ }

    // ✅ historique (pour 24h / 7j)
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS counter_hourly (
        id   TEXT NOT NULL,
        kind TEXT NOT NULL,
        hour INTEGER NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (id, kind, hour)
      );
    `).run();

    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS counter_daily (
        id   TEXT NOT NULL,
        kind TEXT NOT NULL,
        day  INTEGER NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (id, kind, day)
      );
    `).run();

    const now = Math.floor(Date.now() / 1000);
    const curHour = Math.floor(now / 3600);
    const curDay  = Math.floor(now / 86400);

    const hourFrom = curHour - 23; // 24 heures glissantes
    const dayFrom  = curDay - 6;   // 7 jours (aujourd'hui inclus)

    // ✅ IMPORTANT : lot petit pour éviter limites D1
    const CHUNK = 80;

    // structure résultat
    const stats = {};

    // init defaults
    for (const id of ids) {
      stats[id] = {
        views: 0, mega: 0, likes: 0,
        views24h: 0, views7d: 0,
        mega24h: 0, mega7d: 0,
        likes24h: 0, likes7d: 0,
      };
    }

    for (let i = 0; i < ids.length; i += CHUNK) {
      const batch = ids.slice(i, i + CHUNK);
      const placeholders = batch.map((_, i) => `?${i + 1}`).join(", ");

      // --- Totaux ---
      {
        const stmt = env.DB
          .prepare(`SELECT id, views, mega, likes FROM counters WHERE id IN (${placeholders})`)
          .bind(...batch);

        const res = await stmt.all();
        const rows = res?.results || [];
        for (const row of rows) {
          const id = row.id;
          if (!stats[id]) continue;
          stats[id].views = Number(row.views || 0);
          stats[id].mega  = Number(row.mega || 0);
          stats[id].likes = Number(row.likes || 0);
        }
      }

      // --- 24h (hourly) ---
      {
        const stmt = env.DB
          .prepare(`SELECT id, kind, SUM(count) AS s
                    FROM counter_hourly
                    WHERE hour >= ?1 AND id IN (${placeholders})
                    GROUP BY id, kind`)
          .bind(hourFrom, ...batch);

        const res = await stmt.all();
        const rows = res?.results || [];
        for (const row of rows) {
          const id = row.id;
          const k = String(row.kind || "");
          const v = Number(row.s || 0);
          if (!stats[id]) continue;
          if (k === "view") stats[id].views24h = v;
          else if (k === "mega") stats[id].mega24h = v;
          else if (k === "like") stats[id].likes24h = v;
        }
      }

      // --- 7j (daily) ---
      {
        const stmt = env.DB
          .prepare(`SELECT id, kind, SUM(count) AS s
                    FROM counter_daily
                    WHERE day >= ?1 AND id IN (${placeholders})
                    GROUP BY id, kind`)
          .bind(dayFrom, ...batch);

        const res = await stmt.all();
        const rows = res?.results || [];
        for (const row of rows) {
          const id = row.id;
          const k = String(row.kind || "");
          const v = Number(row.s || 0);
          if (!stats[id]) continue;
          if (k === "view") stats[id].views7d = v;
          else if (k === "mega") stats[id].mega7d = v;
          else if (k === "like") stats[id].likes7d = v;
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, stats }), { headers });

  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: "Erreur serveur", details: String(e?.message || e) }),
      { status: 500, headers }
    );
  }
}
