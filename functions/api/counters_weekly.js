export async function onRequest(context) {
  const { request, env } = context;

  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,OPTIONS",
    "access-control-allow-headers": "content-type",
  };

  const json = (obj, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers });

  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers });

  if (request.method !== "GET")
    return json({ ok: false, error: "Méthode invalide" }, 405);

  try {
    if (!env?.DB)
      return json({ ok: false, error: "DB non liée" }, 500);

    const u = new URL(request.url);

    const metric = (u.searchParams.get("metric") || "views").toLowerCase();
    const top = Math.max(1, Math.min(50, Number(u.searchParams.get("top") || 10)));
    const weeksCount = Math.max(1, Math.min(8, Number(u.searchParams.get("weeks") || 4)));

    const kindMap = { views: "view", mega: "mega", likes: "like" };
    const kind = kindMap[metric];
    if (!kind) return json({ ok: false, error: "metric invalide" }, 400);

    // ---- helpers dates (UTC semaine lundi->dimanche) ----
    const utcMidnight = (d) =>
      new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

    // IMPORTANT: ton "day" = Math.floor(ms / 86400000)
    const toDayNumber = (dUTC00) => Math.floor(dUTC00.getTime() / 86400000);

    const startOfWeekUTC = (dateUTC00) => {
      const dow = dateUTC00.getUTCDay();
      const offset = (dow + 6) % 7; // lundi
      const s = new Date(dateUTC00);
      s.setUTCDate(s.getUTCDate() - offset);
      return utcMidnight(s);
    };

    const isoDay = (d) => d.toISOString().slice(0, 10);

    const todayUTC = utcMidnight(new Date());
    const thisWeekStart = startOfWeekUTC(todayUTC);

    const weeks = [];

    for (let i = 0; i < weeksCount; i++) {
      const start = new Date(thisWeekStart);
      start.setUTCDate(start.getUTCDate() - (i * 7));
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 6);

      const startStr = isoDay(start);
      const endStr = isoDay(end);

      const startDayNum = toDayNumber(start);
      const endDayNum = toDayNumber(end);

      const rows = await env.DB.prepare(`
        SELECT id, SUM(count) as total
        FROM counter_daily
        WHERE kind = ?1
          AND day BETWEEN ?2 AND ?3
        GROUP BY id
        ORDER BY total DESC
        LIMIT ?4
      `).bind(kind, startDayNum, endDayNum, top).all();

      weeks.push({
        weekStart: startStr,
        weekEnd: endStr,
        metric,
        rows: (rows?.results || []).map(r => ({
          id: String(r.id),
          total: Number(r.total || 0),
        })),
      });
    }

    return json({ ok: true, weeks });

  } catch (e) {
    return json(
      { ok: false, error: "Erreur serveur", details: String(e?.message || e) },
      500
    );
  }
}