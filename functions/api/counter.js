export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const op = (url.searchParams.get("op") || "get").trim();   // get | hit
  const kind = (url.searchParams.get("kind") || "").trim();  // view | mega
  const id = (url.searchParams.get("id") || "").trim();

  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,OPTIONS",
    "access-control-allow-headers": "content-type",
  };

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });

  if (!env.DB) {
    return new Response(JSON.stringify({ ok: false, error: "DB non liée" }), { status: 500, headers });
  }

  if (!id || id.length > 80) {
    return new Response(JSON.stringify({ ok: false, error: "ID invalide" }), { status: 400, headers });
  }

  async function getRow() {
    const row = await env.DB
      .prepare("SELECT id, views, mega FROM counters WHERE id=?1")
      .bind(id)
      .first();
    return row || { id, views: 0, mega: 0 };
  }

  if (op === "get") {
    const row = await getRow();
    return new Response(JSON.stringify({ ok: true, ...row }), { headers });
  }

  if (op === "hit") {
    if (kind === "view") {
      await env.DB.prepare(`
        INSERT INTO counters (id, views, mega, updated_at)
        VALUES (?1, 1, 0, unixepoch())
        ON CONFLICT(id) DO UPDATE SET
          views = views + 1,
          updated_at = unixepoch()
      `).bind(id).run();
    } else if (kind === "mega") {
      await env.DB.prepare(`
        INSERT INTO counters (id, views, mega, updated_at)
        VALUES (?1, 0, 1, unixepoch())
        ON CONFLICT(id) DO UPDATE SET
          mega = mega + 1,
          updated_at = unixepoch()
      `).bind(id).run();
    } else {
      return new Response(JSON.stringify({ ok: false, error: "kind invalide" }), { status: 400, headers });
    }

    const row = await getRow();
    return new Response(JSON.stringify({ ok: true, ...row }), { headers });
  }

  return new Response(JSON.stringify({ ok: false, error: "op invalide" }), { status: 400, headers });
}
