import {
  assertSameOrigin,
  ensureAuthTables,
  hashPassword,
  isRoleAllowed,
  json,
  requireUser,
} from './_auth.js';

function getTicketDb(env) {
  for (const name of ['TICKETS_DB', 'DB', 'AUTH_DB']) {
    if (env?.[name] && typeof env[name].prepare === 'function') return env[name];
  }
  return null;
}

async function ensureTicketSchema(db) {
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
      account_username TEXT DEFAULT ''
    )
  `).run();
  try { await db.prepare(`ALTER TABLE tickets_global ADD COLUMN signup_password_hash TEXT DEFAULT ''`).run(); } catch {}
  try { await db.prepare(`ALTER TABLE tickets_global ADD COLUMN account_created_at TEXT DEFAULT ''`).run(); } catch {}
  try { await db.prepare(`ALTER TABLE tickets_global ADD COLUMN account_username TEXT DEFAULT ''`).run(); } catch {}
}

function cleanUsernameKeepCase(value) {
  return String(value || '').trim().replace(/\s+/g, '').slice(0, 60);
}

function extractLegacyPassword(message) {
  const match = String(message || '').match(/Mot de passe souhaité\s*:\s*(.+)/i);
  return String(match?.[1] || '').trim();
}

export async function onRequest(context) {
  try {
    const { request, env } = context;
    if (request.method !== 'POST') return json({ ok: false, error: 'Méthode invalide.' }, 405);
    if (!assertSameOrigin(request)) return json({ ok: false, error: 'Origine invalide.' }, 403);
    if (!env?.DB) return json({ ok: false, error: 'DB d’authentification non liée.' }, 500);

    const ticketDb = getTicketDb(env);
    if (!ticketDb) return json({ ok: false, error: 'Base des tickets introuvable.' }, 500);

    await ensureAuthTables(env.DB);
    await ensureTicketSchema(ticketDb);

    const auth = await requireUser(env.DB, env, request);
    if (!auth.ok) return auth.response;
    if (!isRoleAllowed(auth.user.role, ['admin'])) return json({ ok: false, error: 'Accès admin requis.' }, 403);

    let body = {};
    try { body = await request.json(); } catch { return json({ ok: false, error: 'JSON invalide.' }, 400); }
    const id = Number(body?.id || 0);
    if (!Number.isInteger(id) || id <= 0) return json({ ok: false, error: 'Ticket invalide.' }, 400);

    const ticket = await ticketDb.prepare(`
      SELECT id, name, category, message, signup_password_hash, account_created_at, account_username
      FROM tickets_global
      WHERE id = ?1
      LIMIT 1
    `).bind(id).first();

    if (!ticket) return json({ ok: false, error: 'Ticket introuvable.' }, 404);
    if (String(ticket.category || '') !== 'inscription') return json({ ok: false, error: 'Ce ticket n’est pas une demande de création de compte.' }, 400);
    if (ticket.account_created_at) return json({ ok: false, error: `Le compte ${ticket.account_username || ''} a déjà été créé depuis ce ticket.` }, 409);

    const username = cleanUsernameKeepCase(ticket.name);
    if (!username || username.length < 3) return json({ ok: false, error: 'Le pseudo demandé est invalide.' }, 400);

    const exists = await env.DB.prepare(`SELECT id FROM auth_users WHERE lower(username) = lower(?1) LIMIT 1`).bind(username).first();
    if (exists) return json({ ok: false, error: 'Un compte utilise déjà ce nom d’utilisateur.' }, 409);

    let passwordHash = String(ticket.signup_password_hash || '').trim();
    let legacyPasswordUsed = false;
    if (!passwordHash) {
      const legacyPassword = extractLegacyPassword(ticket.message);
      if (legacyPassword.length < 6) {
        return json({ ok: false, error: 'Cet ancien ticket ne contient pas de mot de passe exploitable. Demande à la personne de refaire une demande.' }, 400);
      }
      passwordHash = await hashPassword(legacyPassword);
      legacyPasswordUsed = true;
    }

    await env.DB.prepare(`
      INSERT INTO auth_users (username, display_name, password_hash, role, is_active)
      VALUES (?1, ?2, ?3, 'member', 1)
    `).bind(username, username, passwordHash).run();

    const comment = legacyPasswordUsed
      ? 'Compte créé depuis un ancien ticket. Le mot de passe historique a été accepté exceptionnellement puis supprimé du ticket.'
      : 'Compte créé directement depuis la demande sécurisée.';
    const sanitizedMessage = legacyPasswordUsed
      ? String(ticket.message || '').replace(/Mot de passe souhaité\s*:\s*(.+)/i, 'Mot de passe : supprimé après la création du compte')
      : String(ticket.message || '');

    await ticketDb.prepare(`
      UPDATE tickets_global
      SET status = 'closed',
          closed_at = datetime('now'),
          updated_at = datetime('now'),
          account_created_at = datetime('now'),
          account_username = ?1,
          signup_password_hash = '',
          message = ?2,
          admin_comment = CASE
            WHEN trim(COALESCE(admin_comment, '')) = '' THEN ?3
            ELSE admin_comment || char(10) || ?3
          END
      WHERE id = ?4
    `).bind(username, sanitizedMessage, comment, id).run();

    const updatedTicket = await ticketDb.prepare(`
      SELECT id, name, contact, category, priority, title, message, status, page_url,
             created_at, updated_at, closed_at, admin_comment, account_created_at, account_username
      FROM tickets_global WHERE id = ?1
    `).bind(id).first();

    return json({ ok: true, created: { username, role: 'member' }, ticket: updatedTicket, legacy_password: legacyPasswordUsed });
  } catch (e) {
    return json({ ok: false, error: 'Erreur pendant la création du compte depuis le ticket.', detail: String(e?.message || e || 'unknown') }, 500);
  }
}
