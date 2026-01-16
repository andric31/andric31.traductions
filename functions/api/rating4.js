export async function onRequest(context) {
  const { request, env } = context;

  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,OPTIONS",
    "access-control-allow-headers": "content-type",
  };

  try {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    if (!env || !env.DB) {
      return new Response(JSON.stringify({ ok: false, error: "DB non liée (binding manquant)" }), { status: 500, headers });
    }

    // ⚠️ Sécurité: crée la table si elle n’existe pas (évite 1101 si oubli SQL)
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS ratings4 (
        id TEXT PRIMARY KEY,
        sum INTEGER NOT NULL DEFAULT 0,
        count INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
    `).run();

    const op = (url.searchParams.get("op") || "get").trim(); // get | vote
    const id = (url.searchParams.get("id") || "").trim();
    const vRaw = (url.searchParams.get("v") || "").trim();
    const prevRaw = (url.searchParams.get("prev") || "").trim();

    if (!id || id.length > 80) {
      return new Response(JSON.stringify({ ok: false, error: "ID invalide" }), { status: 400, headers });
    }

    async function getRow() {
      const row = await env.DB
        .prepare("SELECT id, sum, count FROM ratings4 WHERE id=?1")
        .bind(id)
        .first();

      const sum = Number(row?.sum ?? 0);
      const count = Number(row?.count ?? 0);
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
      if (!Number.isFinite(prev) || prev < 1 || prev > 4) prev = 0;

      // Assure une ligne existante
      await env.DB.prepare(`
        INSERT INTO ratings4 (id, sum, count, updated_at)
        VALUES (?1, 0, 0, unixepoch())
        ON CONFLICT(id) DO UPDATE SET updated_at = unixepoch()
      `).bind(id).run();

      // Retire l’ancien vote (si fourni)
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

      // Ajoute le nouveau vote
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

  } catch (err) {
    // ✅ Ne jamais renvoyer 1101 : on renvoie un JSON d’erreur
    return new Response(JSON.stringify({
      ok: false,
      error: "Exception Worker",
      detail: String(err?.message || err),
    }), { status: 500, headers });
  }
}

