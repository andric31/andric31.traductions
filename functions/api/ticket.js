const json = (data, status = 200) => new Response(JSON.stringify(data, null, 2), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  },
});

const DB_NAMES = ['TICKETS_DB', 'DB', 'AUTH_DB'];

function getDb(env) {
  for (const name of DB_NAMES) {
    if (env && env[name] && typeof env[name].prepare === 'function') return env[name];
  }
  return null;
}

async function ensureSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS tickets_global (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      contact TEXT DEFAULT '',
      category TEXT DEFAULT 'question',
      priority TEXT DEFAULT 'normal',
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT DEFAULT 'open',
      page_url TEXT DEFAULT '',
      user_agent TEXT DEFAULT '',
      ip_hash TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      closed_at TEXT DEFAULT ''
    )
  `).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_tickets_global_status_created ON tickets_global(status, created_at)`).run();
}

function clean(value, max = 1000) {
  return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}

function normalizeCategory(value) {
  const allowed = new Set(['question', 'probleme', 'suggestion', 'autre']);
  const v = clean(value, 40).toLowerCase();
  return allowed.has(v) ? v : 'question';
}

function normalizePriority(value) {
  const allowed = new Set(['faible', 'normal', 'urgent']);
  const v = clean(value, 40).toLowerCase();
  return allowed.has(v) ? v : 'normal';
}

function normalizeStatus(value) {
  const allowed = new Set(['open', 'closed']);
  const v = clean(value, 40).toLowerCase();
  return allowed.has(v) ? v : 'open';
}

async function sha256(text) {
  try {
    const bytes = new TextEncoder().encode(text || '');
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
  } catch {
    return '';
  }
}

async function isAdmin(context) {
  const { request, env } = context;
  const token = request.headers.get('x-admin-token') || '';
  if (env?.ADMIN_TOKEN && token && token === env.ADMIN_TOKEN) return true;

  // Réutilise la session existante si les fonctions auth du site sont déjà déployées.
  try {
    const url = new URL(request.url);
    const meUrl = `${url.origin}/api/auth-me`;
    const resp = await fetch(meUrl, {
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

export async function onRequestGet(context) {
  const db = getDb(context.env);
  if (!db) return json({ ok: false, error: 'Base D1 introuvable. Ajoute un binding DB ou TICKETS_DB.' }, 500);
  await ensureSchema(db);

  const url = new URL(context.request.url);
  const adminMode = url.searchParams.get('admin') === '1';
  if (!adminMode) return json({ ok: true, message: 'API Ticket active.' });
  if (!(await isAdmin(context))) return json({ ok: false, error: 'Accès admin requis.' }, 403);

  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 100), 1), 300);
  const status = url.searchParams.get('status');
  let query = `SELECT id, name, contact, category, priority, title, message, status, page_url, created_at, updated_at, closed_at FROM tickets_global`;
  const binds = [];
  if (status && ['open', 'closed'].includes(status)) {
    query += ` WHERE status = ?`;
    binds.push(status);
  }
  query += ` ORDER BY id DESC LIMIT ?`;
  binds.push(limit);
  const result = await db.prepare(query).bind(...binds).all();
  const countRow = await db.prepare(`SELECT COUNT(*) AS count FROM tickets_global WHERE status = 'open'`).first();
  return json({ ok: true, tickets: result.results || [], open_count: Number(countRow?.count || 0) });
}

export async function onRequestPost(context) {
  const db = getDb(context.env);
  if (!db) return json({ ok: false, error: 'Base D1 introuvable. Ajoute un binding DB ou TICKETS_DB.' }, 500);
  await ensureSchema(db);

  const body = await readJson(context.request);
  const name = clean(body.name, 80);
  const contact = clean(body.contact, 160);
  const title = clean(body.title, 160);
  const message = clean(body.message, 5000);
  const category = normalizeCategory(body.category);
  const priority = normalizePriority(body.priority);
  const pageUrl = clean(body.page_url, 500);
  const userAgent = clean(body.user_agent || context.request.headers.get('user-agent'), 500);
  const ip = context.request.headers.get('cf-connecting-ip') || context.request.headers.get('x-forwarded-for') || '';
  const ipHash = await sha256(ip + '|' + (context.env?.TICKET_HASH_SALT || 'andric31-ticket'));

  if (!name || !title || !message) return json({ ok: false, error: 'Nom, titre et message sont obligatoires.' }, 400);
  if (message.length < 8) return json({ ok: false, error: 'Message trop court.' }, 400);

  const result = await db.prepare(`
    INSERT INTO tickets_global (name, contact, category, priority, title, message, status, page_url, user_agent, ip_hash, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(name, contact, category, priority, title, message, pageUrl, userAgent, ipHash).run();

  const id = result.meta?.last_row_id || result.lastRowId || null;
  return json({ ok: true, id, ticket: { id, name, contact, category, priority, title, status: 'open' } }, 201);
}

export async function onRequestPatch(context) {
  const db = getDb(context.env);
  if (!db) return json({ ok: false, error: 'Base D1 introuvable. Ajoute un binding DB ou TICKETS_DB.' }, 500);
  await ensureSchema(db);
  if (!(await isAdmin(context))) return json({ ok: false, error: 'Accès admin requis.' }, 403);

  const body = await readJson(context.request);
  const id = Number(body.id || 0);
  const status = normalizeStatus(body.status);
  if (!id) return json({ ok: false, error: 'ID du ticket manquant.' }, 400);

  await db.prepare(`UPDATE tickets_global SET status = ?, updated_at = datetime('now'), closed_at = CASE WHEN ? = 'closed' THEN datetime('now') ELSE '' END WHERE id = ?`)
    .bind(status, status, id).run();
  const row = await db.prepare(`SELECT id, name, contact, category, priority, title, message, status, page_url, created_at, updated_at, closed_at FROM tickets_global WHERE id = ?`).bind(id).first();
  if (!row) return json({ ok: false, error: 'Ticket introuvable.' }, 404);
  return json({ ok: true, ticket: row });
}

export async function onRequestDelete(context) {
  const db = getDb(context.env);
  if (!db) return json({ ok: false, error: 'Base D1 introuvable. Ajoute un binding DB ou TICKETS_DB.' }, 500);
  await ensureSchema(db);
  if (!(await isAdmin(context))) return json({ ok: false, error: 'Accès admin requis.' }, 403);

  const body = await readJson(context.request);
  const id = Number(body.id || 0);
  if (!id) return json({ ok: false, error: 'ID du ticket manquant.' }, 400);
  await db.prepare(`DELETE FROM tickets_global WHERE id = ?`).bind(id).run();
  return json({ ok: true, deleted: id });
}

export async function onRequest(context) {
  if (context.request.method === 'PATCH') return onRequestPatch(context);
  if (context.request.method === 'DELETE') return onRequestDelete(context);
  return json({ ok: false, error: 'Méthode non autorisée.' }, 405);
}
