export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const op = (url.searchParams.get("op") || "get").trim(); // get | vote
  const id = (url.searchParams.get("id") || "").trim();
  const vRaw = (url.searchParams.get("v") || "").trim();
  const prevRaw = (url.searchParams.get("prev") || "").trim(); // optionnel: ancien vote (1..4)

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
      .prepare("SELECT id, sum, count FROM ratings4 WHERE id=?1")
      .bind(id)
      .first();
    const sum = row?.sum ?? 0;
    const count = row?.count ?? 0;
    const avg = count > 0 ? (sum / count) : 0;
    return { id, sum, count, avg };
  }

  if (op === "get") {
    const row = await getRow();
    return new Response(JSON.stringify({ ok: true, ...row }), { headers });
  }

  if (op === "vote") {
    const v = Number(vRaw);
    if (!Number.isFinite(v) || v < 1 || v > 4) {
      return new Response(JSON.stringify({ ok: false, error: "Vote invalide (1..4)" }), { status: 400, headers });
    }

    let prev = Number(prevRaw);
    if (!Number.isFinite(prev)) prev = 0;
    if (prev < 1 || prev > 4) prev = 0;

    // Transaction "logique" : on retire prev si fourni, puis on ajoute v
    // (D1 ne supporte pas toujours BEGIN/COMMIT dans toutes configs, donc on fait en 2 updates safe)
    // 1) s'assurer que la ligne existe
    await env.DB.prepare(`
      INSERT INTO ratings4 (id, sum, count, updated_at)
      VALUES (?1, 0, 0, unixepoch())
      ON CONFLICT(id) DO UPDATE SET updated_at = unixepoch()
    `).bind(id).run();

    // 2) retirer l'ancien vote si présent (sans descendre sous 0)
    if (prev) {
      await env.DB.prepare(`
        UPDATE ratings4
        SET
          sum = CASE WHEN sum >= ?2 THEN sum - ?2 ELSE 0 END,
          count = CASE WHEN count > 0 THEN count - 1 ELSE 0 END,
          updated_at = unixepoch()
        WHERE id = ?1
      `).bind(id, prev).run();
    }

    // 3) ajouter le nouveau vote
    await env.DB.prepare(`
      UPDATE ratings4
      SET
        sum = sum + ?2,
        count = count + 1,
        updated_at = unixepoch()
      WHERE id = ?1
    `).bind(id, v).run();

    const row = await getRow();
    return new Response(JSON.stringify({ ok: true, ...row }), { headers });
  }

  return new Response(JSON.stringify({ ok: false, error: "op invalide" }), { status: 400, headers });
}
