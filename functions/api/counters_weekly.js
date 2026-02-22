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

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "GET") return json({ ok: false, error: "Méthode invalide" }, 405);

  try {
    if (!env?.DB) return json({ ok: false, error: "DB non liée" }, 500);

    const u = new URL(request.url);

    // metric = views | mega | likes
    const metric = (u.searchParams.get("metric") || "views").trim().toLowerCase();
    const METRICS = new Set(["views", "mega", "likes"]);
    if (!METRICS.has(metric)) return json({ ok: false, error: "metric invalide" }, 400);

    // top N (par semaine)
    let top = Number(u.searchParams.get("top") || 10);
    if (!Number.isFinite(top)) top = 10;
    top = Math.max(1, Math.min(50, Math.floor(top)));

    // weeks = 4 par défaut
    let weeksCount = Number(u.searchParams.get("weeks") || 4);
    if (!Number.isFinite(weeksCount)) weeksCount = 4;
    weeksCount = Math.max(1, Math.min(8, Math.floor(weeksCount)));

    // weekStart = monday|sunday (par défaut monday)
    const weekStart = (u.searchParams.get("weekStart") || "monday").trim().toLowerCase();
    const startMonday = weekStart !== "sunday";

    // ---- helpers dates (UTC) ----
    const isoDay = (d) => d.toISOString().slice(0, 10); // YYYY-MM-DD
    const utcMidnight = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

    const startOfWeekUTC = (dateUTC00) => {
      const dow = dateUTC00.getUTCDay(); // 0=dim ... 6=sam
      const offset = startMonday ? ((dow + 6) % 7) : dow; // monday: lundi=0 ; sunday: dimanche=0
      const s = new Date(dateUTC00);
      s.setUTCDate(s.getUTCDate() - offset);
      return utcMidnight(s);
    };

    const todayUTC = utcMidnight(new Date());
    const thisWeekStart = startOfWeekUTC(todayUTC);

    // ✅ order expr (pas d’alias, sinon D1 peut râler)
    const orderExpr =
      metric === "views" ? "SUM(views)" :
      metric === "mega"  ? "SUM(mega)"  :
                           "SUM(likes)";

    const weeks = [];

    for (let i = 0; i < weeksCount; i++) {
      const start = new Date(thisWeekStart);
      start.setUTCDate(start.getUTCDate() - (i * 7));
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 6);

      const startStr = isoDay(start);
      const endStr = isoDay(end);

      const rows = await env.DB.prepare(`
        SELECT
          id,
          SUM(views) AS views,
          SUM(mega)  AS mega,
          SUM(likes) AS likes
        FROM counter_daily
        WHERE day BETWEEN ?1 AND ?2
        GROUP BY id
        ORDER BY ${orderExpr} DESC
        LIMIT ?3
      `).bind(startStr, endStr, top).all();

      weeks.push({
        weekStart: startStr,
        weekEnd: endStr,
        metric,
        top,
        rows: (rows?.results || []).map(r => ({
          id: String(r.id),
          views: Number(r.views || 0),
          mega: Number(r.mega || 0),
          likes: Number(r.likes || 0),
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