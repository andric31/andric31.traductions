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

function parseEventRow(row) {
  if (!row) return null;
  try { return JSON.parse(row.event_json || '{}'); } catch { return null; }
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
  if (!db) return json({ ok: false, error: 'Base D1 introuvable. Ajoute le binding EVENTS_DB.' }, 500);
  await ensureSchema(db);

  const activeRow = await db.prepare(`SELECT event_json, updated_at FROM event_state WHERE id = '__active__'`).first();
  const active = parseEventRow(activeRow) || {};

  const rows = await db.prepare(`
    SELECT id, event_json, updated_at
    FROM event_state
    WHERE id <> '__active__'
    ORDER BY updated_at DESC
  `).all();

  const events = (rows?.results || []).map((row) => {
    const event = parseEventRow(row) || {};
    return {
      id: row.id,
      title: event.title || row.id,
      enabled: event.enabled !== false,
      updated_at: row.updated_at,
      source: 'cloudflare'
    };
  });

  return json({
    ok: true,
    active_event: active.active_event || '',
    enabled: active.enabled !== false,
    updated_at: activeRow?.updated_at || null,
    events
  });
}

export async function onRequestPost(context) {
  const db = getDb(context.env);
  if (!db) return json({ ok: false, error: 'Base D1 introuvable. Ajoute le binding EVENTS_DB.' }, 500);
  await ensureSchema(db);
  if (!(await isAdmin(context))) return json({ ok: false, error: 'Accès admin requis.' }, 403);

  const body = await readJson(context.request);
  const activeEvent = cleanEventId(body.active_event || body.id || '');
  const enabled = body.enabled !== false;
  const state = {
    active_event: enabled ? activeEvent : '',
    enabled,
    updated_at: new Date().toISOString()
  };

  await db.prepare(`
    INSERT INTO event_state (id, event_json, updated_at)
    VALUES ('__active__', ?1, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      event_json = excluded.event_json,
      updated_at = CURRENT_TIMESTAMP
  `).bind(JSON.stringify(state)).run();

  const row = await db.prepare(`SELECT updated_at FROM event_state WHERE id = '__active__'`).first();
  return json({ ok: true, ...state, updated_at: row?.updated_at || state.updated_at });
}

export async function onRequestDelete(context) {
  const db = getDb(context.env);
  if (!db) return json({ ok: false, error: 'Base D1 introuvable. Ajoute le binding EVENTS_DB.' }, 500);
  await ensureSchema(db);
  if (!(await isAdmin(context))) return json({ ok: false, error: 'Accès admin requis.' }, 403);
  await db.prepare(`DELETE FROM event_state WHERE id = '__active__'`).run();
  return json({ ok: true, active_event: '', enabled: false });
}
