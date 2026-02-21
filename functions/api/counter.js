export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const op = (url.searchParams.get("op") || "get").trim();   // get | hit | unhit
  const kind = (url.searchParams.get("kind") || "").trim();  // view | mega | like
  const id = (url.searchParams.get("id") || "").trim();

  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,OPTIONS",
    "access-control-allow-headers": "content-type",
  };

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });

  if (!env?.DB) {
    return new Response(JSON.stringify({ ok: false, error: "DB non liée" }), { status: 500, headers });
  }

  if (!id || id.length > 80) {
    return new Response(JSON.stringify({ ok: false, error: "ID invalide" }), { status: 400, headers });
  }

  // ✅ Table principale (totaux)
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS counters (
      id TEXT PRIMARY KEY,
      views INTEGER NOT NULL DEFAULT 0,
      mega INTEGER NOT NULL DEFAULT 0,
      likes INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `).run();

  // ✅ Migration douce: ancienne table sans likes
  try {
    const info = await env.DB.prepare(`PRAGMA table_info(counters);`).all();
    const cols = (info?.results || []).map(r => String(r?.name || "").toLowerCase());
    if (!cols.includes("likes")) {
      await env.DB.prepare(`ALTER TABLE counters ADD COLUMN likes INTEGER NOT NULL DEFAULT 0;`).run();
    }
  } catch { /* silencieux */ }

  // ✅ Historique (bucket par heure / par jour) → pour 24h / 7j
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS counter_hourly (
      id   TEXT NOT NULL,
      kind TEXT NOT NULL,        -- view|mega|like
      hour INTEGER NOT NULL,     -- floor(unixepoch/3600)
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (id, kind, hour)
    );
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS counter_daily (
      id   TEXT NOT NULL,
      kind TEXT NOT NULL,        -- view|mega|like
      day  INTEGER NOT NULL,     -- floor(unixepoch/86400)
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (id, kind, day)
    );
  `).run();

  const now = Math.floor(Date.now() / 1000);
  const hour = Math.floor(now / 3600);
  const day  = Math.floor(now / 86400);

  async function bumpHistory(delta) {
    // On met à jour les 2 buckets, en empêchant le négatif
    // (utile pour unhit like)
    await env.DB.prepare(`
      INSERT INTO counter_hourly (id, kind, hour, count)
      VALUES (?1, ?2, ?3, ?4)
      ON CONFLICT(id, kind, hour) DO UPDATE SET
        count = CASE
          WHEN (count + ?4) < 0 THEN 0
          ELSE (count + ?4)
        END
    `).bind(id, kind, hour, delta).run();

    await env.DB.prepare(`
      INSERT INTO counter_daily (id, kind, day, count)
      VALUES (?1, ?2, ?3, ?4)
      ON CONFLICT(id, kind, day) DO UPDATE SET
        count = CASE
          WHEN (count + ?4) < 0 THEN 0
          ELSE (count + ?4)
        END
    `).bind(id, kind, day, delta).run();
  }

  async function getRow() {
    const row = await env.DB
      .prepare("SELECT id, views, mega, likes FROM counters WHERE id=?1")
      .bind(id)
      .first();
    return row || { id, views: 0, mega: 0, likes: 0 };
  }

  if (op === "get") {
    const row = await getRow();
    return new Response(JSON.stringify({ ok: true, ...row }), { headers });
  }

  if (op === "hit") {
    if (kind === "view") {
      await env.DB.prepare(`
        INSERT INTO counters (id, views, mega, likes, updated_at)
        VALUES (?1, 1, 0, 0, unixepoch())
        ON CONFLICT(id) DO UPDATE SET
          views = views + 1,
          updated_at = unixepoch()
      `).bind(id).run();

      await bumpHistory(1);

    } else if (kind === "mega") {
      await env.DB.prepare(`
        INSERT INTO counters (id, views, mega, likes, updated_at)
        VALUES (?1, 0, 1, 0, unixepoch())
        ON CONFLICT(id) DO UPDATE SET
          mega = mega + 1,
          updated_at = unixepoch()
      `).bind(id).run();

      await bumpHistory(1);

    } else if (kind === "like") {
      await env.DB.prepare(`
        INSERT INTO counters (id, views, mega, likes, updated_at)
        VALUES (?1, 0, 0, 1, unixepoch())
        ON CONFLICT(id) DO UPDATE SET
          likes = likes + 1,
          updated_at = unixepoch()
      `).bind(id).run();

      await bumpHistory(1);

    } else {
      return new Response(JSON.stringify({ ok: false, error: "kind invalide" }), { status: 400, headers });
    }

    const row = await getRow();
    return new Response(JSON.stringify({ ok: true, ...row }), { headers });
  }

  if (op === "unhit") {
    if (kind !== "like") {
      return new Response(JSON.stringify({ ok: false, error: "kind invalide (unhit)" }), { status: 400, headers });
    }

    await env.DB.prepare(`
      INSERT INTO counters (id, views, mega, likes, updated_at)
      VALUES (?1, 0, 0, 0, unixepoch())
      ON CONFLICT(id) DO UPDATE SET
        likes = CASE WHEN likes > 0 THEN likes - 1 ELSE 0 END,
        updated_at = unixepoch()
    `).bind(id).run();

    await bumpHistory(-1);

    const row = await getRow();
    return new Response(JSON.stringify({ ok: true, ...row }), { headers });
  }

  return new Response(JSON.stringify({ ok: false, error: "op invalide" }), { status: 400, headers });
}
