export async function onRequest(context) {
  const { request, env } = context;

  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  };

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "GET" && request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Méthode invalide" }), { status: 405, headers });
  }

  try {
    if (!env?.DB) {
      return new Response(JSON.stringify({ ok: false, error: "DB non liée" }), { status: 500, headers });
    }

    // ✅ table events (au cas où)
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS counter_events (
        id TEXT NOT NULL,
        kind TEXT NOT NULL,
        ts INTEGER NOT NULL DEFAULT (unixepoch())
      );
    `).run();

    // ✅ récupère ids + days
    let ids = [];
    let days = 7;

    if (request.method === "POST") {
      let body = null;
      try { body = await request.json(); } catch {}
      const idsRaw = Array.isArray(body?.ids) ? body.ids : [];
      ids = idsRaw.map(x => String(x || "").trim()).filter(x => x && x.length <= 80);
      days = Number(body?.days || 7);
    } else {
      const u = new URL(request.url);
      const single = (u.searchParams.get("id") || "").trim();
      const idsParam = u.searchParams.getAll("ids").flatMap(v => String(v || "").split(","));
      ids = []
        .concat(single ? [single] : [])
        .concat(idsParam)
        .map(x => String(x || "").trim())
        .filter(x => x && x.length <= 80);

      days = Number(u.searchParams.get("days") || 7);
    }

    if (!Number.isFinite(days) || days <= 0) days = 7;
    days = Math.max(1, Math.min(30, Math.floor(days))); // 1..30 max

    if (!ids.length) {
      return new Response(JSON.stringify({ ok: true, days, timeline: {} }), { headers });
    }

    // ✅ fenetre (N jours) : depuis minuit (UTC) pour éviter les effets “glissant bizarre”
    // D1/SQLite : ts est unix seconds; on ramène au jour via date(ts,'unixepoch')
    const nowSec = Math.floor(Date.now() / 1000);
    const sinceSec = nowSec - (days * 24 * 60 * 60);

    // ✅ chunk pour éviter limites SQL
    const CHUNK = 80;
    const timeline = {};

    for (let i = 0; i < ids.length; i += CHUNK) {
      const batch = ids.slice(i, i + CHUNK);

      // placeholders: ?2..?N+1 car ?1 = since
      const ph = batch.map((_, idx) => `?${idx + 2}`).join(", ");

      const q = `
        SELECT
          id,
          date(ts, 'unixepoch') AS day,
          SUM(CASE WHEN kind='view' THEN 1 ELSE 0 END) AS views,
          SUM(CASE WHEN kind='mega' THEN 1 ELSE 0 END) AS mega,
          SUM(CASE WHEN kind='like' THEN 1 ELSE 0 END) AS likes_in,
          SUM(CASE WHEN kind='unlike' THEN 1 ELSE 0 END) AS unlikes
        FROM counter_events
        WHERE ts >= ?1
          AND id IN (${ph})
        GROUP BY id, day
        ORDER BY day ASC
      `;

      const res = await env.DB.prepare(q).bind(sinceSec, ...batch).all();
      const rows = res?.results || [];

      // init
      for (const id of batch) {
        if (!timeline[id]) timeline[id] = [];
      }

      // remplit partiel
      for (const r of rows) {
        const id = String(r.id);
        const day = String(r.day || "");
        const views = Number(r.views || 0);
        const mega = Number(r.mega || 0);
        const likes = Number(r.likes_in || 0) - Number(r.unlikes || 0);

        timeline[id].push({ day, views, mega, likes });
      }
    }

    // ✅ “densifie” : renvoie tous les jours (même à 0) pour chaque id
    // on prend les N derniers jours (UTC)
    const daysList = [];
    {
      // construit une liste de dates ISO yyyy-mm-dd
      // en UTC, en remontant (days-1 .. 0)
      const baseMs = Date.now();
      for (let k = days - 1; k >= 0; k--) {
        const d = new Date(baseMs - k * 24 * 60 * 60 * 1000);
        const yyyy = d.getUTCFullYear();
        const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
        const dd = String(d.getUTCDate()).padStart(2, "0");
        daysList.push(`${yyyy}-${mm}-${dd}`);
      }
    }

    for (const id of Object.keys(timeline)) {
      const map = new Map(timeline[id].map(x => [x.day, x]));
      timeline[id] = daysList.map(day => {
        const v = map.get(day);
        return v ? v : { day, views: 0, mega: 0, likes: 0 };
      });
    }

    return new Response(JSON.stringify({ ok: true, days, timeline }), { headers });

  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: "Erreur serveur", details: String(e?.message || e) }),
      { status: 500, headers }
    );
  }
}