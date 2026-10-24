import { ensureTicketDiscordColumns } from './_discord_oauth.js';

const DB_NAMES = ['TICKETS_DB', 'DB', 'AUTH_DB'];

export function getDb(env) {
  for (const name of DB_NAMES) {
    if (env && env[name] && typeof env[name].prepare === 'function') return env[name];
  }
  return null;
}

export async function ensureSchema(db) {
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
      closed_at TEXT DEFAULT '',
      admin_comment TEXT DEFAULT '',
      signup_password_hash TEXT DEFAULT '',
      account_created_at TEXT DEFAULT '',
      account_username TEXT DEFAULT '',
      private_key_hash TEXT NOT NULL DEFAULT ''
    )
  `).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_tickets_global_status_created ON tickets_global(status, created_at)`).run();
  try { await db.prepare(`ALTER TABLE tickets_global ADD COLUMN admin_comment TEXT DEFAULT ''`).run(); } catch {}
  try { await db.prepare(`ALTER TABLE tickets_global ADD COLUMN signup_password_hash TEXT DEFAULT ''`).run(); } catch {}
  try { await db.prepare(`ALTER TABLE tickets_global ADD COLUMN account_created_at TEXT DEFAULT ''`).run(); } catch {}
  try { await db.prepare(`ALTER TABLE tickets_global ADD COLUMN account_username TEXT DEFAULT ''`).run(); } catch {}
  const columns = await db.prepare('PRAGMA table_info(tickets_global)').all();
  if (!(columns.results || []).some(c => c.name === 'private_key_hash')) {
    try { await db.prepare("ALTER TABLE tickets_global ADD COLUMN private_key_hash TEXT NOT NULL DEFAULT ''").run(); }
    catch (error) {
      const current = await db.prepare('PRAGMA table_info(tickets_global)').all();
      if (!(current.results || []).some(c => c.name === 'private_key_hash')) throw error;
    }
  }
  await db.prepare(`CREATE TABLE IF NOT EXISTS ticket_replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL REFERENCES tickets_global(id) ON DELETE CASCADE,
    author TEXT NOT NULL CHECK(author IN ('visitor', 'admin')),
    message TEXT NOT NULL,
    request_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ticket_id, author, request_id)
  )`).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_ticket_replies_thread ON ticket_replies(ticket_id, id)').run();
  await ensureTicketDiscordColumns(db);
}

export async function isAdmin(context) {
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


export function trustedOrigin(request) {
  const origin = request.headers.get('origin');
  return request.headers.get('sec-fetch-site') !== 'cross-site'
    && (!origin || origin === new URL(request.url).origin);
}

export function newTicketKey() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
}

export async function hashTicketKey(key) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}

export const trackingFields = `(CASE WHEN private_key_hash <> '' THEN 1 ELSE 0 END) AS has_private_tracking,
  (SELECT author FROM ticket_replies WHERE ticket_id = tickets_global.id ORDER BY id DESC LIMIT 1) AS last_reply_author,
  (SELECT COUNT(*) FROM ticket_replies WHERE ticket_id = tickets_global.id) AS reply_count`;
