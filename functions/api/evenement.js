const json = (data, status = 200) => new Response(JSON.stringify(data, null, 2), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type,x-admin-token',
  },
});

function getDb(env) {
  return env && env.EVENTS_DB && typeof env.EVENTS_DB.prepare === 'function' ? env.EVENTS_DB : null;
}

function clean(value, max = 120) {
  return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}

function cleanEventId(value) {
  const id = clean(value, 80).toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{1,79}$/.test(id) ? id : '';
}

async function ensureSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS event_state (
      id TEXT PRIMARY KEY,
      event_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
}

async function isAdmin(context) {
  const { request, env } = context;
  const token = request.headers.get('x-admin-token') || '';
  if (env?.ADMIN_TOKEN && token && token === env.ADMIN_TOKEN) return true;

  try {
    const url = new URL(request.url);
    const resp = await fetch(`${url.origin}/api/auth-me`, {
      headers: { cookie: request.headers.get('cookie') || '' },
      cf: { cacheTtl: 0, cacheEverything: false },
    });
    const data = await resp.json().catch(() => null);
    return !!(resp.ok && data?.logged_in && String(data?.user?.role || '').toLowerCase() === 'admin');
  } catch {
    return false;
  }
}

async function readJson(request) {
  try { return await request.json(); } catch { return {}; }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
      'access-control-allow-headers': 'content-type,x-admin-token',
    },
  });
}

export async function onRequestGet(context) {
  const db = getDb(context.env);
  if (!db) return json({ ok: false, error: 'Base D1 introuvable. Ajoute un binding EVENTS_DB dédié aux événements.' }, 500);
  await ensureSchema(db);

  const url = new URL(context.request.url);
  const id = cleanEventId(url.searchParams.get('id'));
  if (!id) return json({ ok: false, error: 'ID événement invalide.' }, 400);

  const row = await db.prepare(`SELECT id, event_json, updated_at FROM event_state WHERE id = ?1`).bind(id).first();
  if (!row) return json({ ok: true, id, event: null, updated_at: null });

  let event = null;
  try { event = JSON.parse(row.event_json || '{}'); } catch { event = null; }
  return json({ ok: true, id: row.id, event, updated_at: row.updated_at });
}

export async function onRequestPost(context) {
  const db = getDb(context.env);
  if (!db) return json({ ok: false, error: 'Base D1 introuvable. Ajoute un binding EVENTS_DB dédié aux événements.' }, 500);
  await ensureSchema(db);
  if (!(await isAdmin(context))) return json({ ok: false, error: 'Accès admin requis.' }, 403);

  const body = await readJson(context.request);
  const event = body.event && typeof body.event === 'object' ? body.event : body;
  const id = cleanEventId(event?.id || body.id);
  if (!id) return json({ ok: false, error: 'ID événement invalide.' }, 400);

  const savedEvent = { ...event, id };
  const eventJson = JSON.stringify(savedEvent);
  if (eventJson.length > 250000) return json({ ok: false, error: 'Événement trop volumineux.' }, 413);

  await db.prepare(`
    INSERT INTO event_state (id, event_json, updated_at)
    VALUES (?1, ?2, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      event_json = excluded.event_json,
      updated_at = CURRENT_TIMESTAMP
  `).bind(id, eventJson).run();

  const row = await db.prepare(`SELECT updated_at FROM event_state WHERE id = ?1`).bind(id).first();
  return json({ ok: true, id, event: savedEvent, updated_at: row?.updated_at || null });
}

export async function onRequestDelete(context) {
  const db = getDb(context.env);
  if (!db) return json({ ok: false, error: 'Base D1 introuvable. Ajoute un binding EVENTS_DB dédié aux événements.' }, 500);
  await ensureSchema(db);
  if (!(await isAdmin(context))) return json({ ok: false, error: 'Accès admin requis.' }, 403);

  const url = new URL(context.request.url);
  const id = cleanEventId(url.searchParams.get('id'));
  if (!id) return json({ ok: false, error: 'ID événement invalide.' }, 400);

  await db.prepare(`DELETE FROM event_state WHERE id = ?1`).bind(id).run();
  return json({ ok: true, id, deleted: true });
}
