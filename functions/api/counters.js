// functions/api/counters.js
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  };

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });

  if (!env.DB) {
    return new Response(JSON.stringify({ ok: false, error: "DB non liée" }), { status: 500, headers });
  }

  // ✅ récup ids soit via GET ?ids=a,b,c soit via POST {ids:[...]}
  let ids = [];

  function cleanIds(arr) {
    const out = [];
    const seen = new Set();
    for (const v of (arr || [])) {
      const id = String(v || "").trim();
      if (!id) continue;
      if (id.length > 80) continue; // même règle que ton /api/counter
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  }

  try {
    const q = (url.searchParams.get("ids") || "").trim();
    if (q) {
      ids = cleanIds(q.split(","));
    } else if (request.method === "POST") {
      const ct = request.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        const body = await request.json().catch(() => null);
        ids = cleanIds(body?.ids || []);
      }
    }
  } catch {
    // ignore
  }

  if (!ids.length) {
    return new Response(JSON.stringify({ ok: true, stats: {} }), { headers });
  }

  // ✅ D1: on chunk pour éviter trop de variables SQL
  const CHUNK = 200;
  const stats = {}; // id -> {views, mega}

  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const placeholders = chunk.map(() => "?").join(",");

    // init à 0
    for (const id of chunk) stats[id] = { views: 0, mega: 0 };

    const res = await env.DB
      .prepare(`SELECT id, views, mega FROM counters WHERE id IN (${placeholders})`)
      .bind(...chunk)
      .all();

    for (const row of (res?.results || [])) {
      const rid = String(row.id || "");
      stats[rid] = {
        views: Number(row.views || 0),
        mega: Number(row.mega || 0)
      };
    }
  }

  return new Response(JSON.stringify({ ok: true, stats }), { headers });
}
