import { getDb, ensureSchema, isAdmin, trustedOrigin, newTicketKey, hashTicketKey, trackingFields } from './_tickets.js';
import { ensureAuthTables, findAuthPseudoConflict, hashPassword, normalizePseudoKey, validatePassword } from './_auth.js';
import { notifyTicketOpened } from './_discord.js';
import { ensureDiscordTables, signupProof, discordOwner, sameOrigin, cookie, SIGNUP_COOKIE } from './_discord_oauth.js';
export const DISCORD_NOTIFICATIONS_VERSION = 'discord-notifications-1';

const json = (data, status = 200, extraHeaders = {}) => new Response(JSON.stringify(data, null, 2), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...extraHeaders,
  },
});


function clean(value, max = 1000) {
  return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}

function normalizeCategory(value) {
  const allowed = new Set(['question', 'probleme', 'suggestion', 'inscription', 'compte', 'confidentialite', 'autre']);
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
  let query = `SELECT id, name, contact, category, priority, title, message, status, page_url, created_at, updated_at, closed_at, admin_comment, account_created_at, account_username, signup_discord_id, signup_discord_username, ${trackingFields} FROM tickets_global`;
  const binds = [];
  if (status && ['open', 'closed'].includes(status)) {
    query += ` WHERE status = ?`;
    binds.push(status);
  }
  query += ` ORDER BY updated_at DESC, id DESC LIMIT ?`;
  binds.push(limit);
  const result = await db.prepare(query).bind(...binds).all();
  const countRow = await db.prepare(`SELECT COUNT(*) AS count FROM tickets_global WHERE status = 'open'`).first();
  return json({ ok: true, tickets: result.results || [], open_count: Number(countRow?.count || 0) });
}

export async function onRequestPost(context) {
  if (!trustedOrigin(context.request)) return json({ ok: false, error: 'Origine invalide.' }, 403);
  const db = getDb(context.env);
  if (!db) return json({ ok: false, error: 'Base D1 introuvable. Ajoute un binding DB ou TICKETS_DB.' }, 500);
  await ensureSchema(db);

  const body = await readJson(context.request);
  const name = clean(body.name, 80);
  const contact = clean(body.contact, 160);
  const title = clean(body.title, 160);
  let message = clean(body.message, 5000);
  const signupPassword = String(body.password || '').trim();
  const signupPasswordConfirm = String(body.password_confirm || '').trim();
  const category = normalizeCategory(body.category);
  const priority = normalizePriority(body.priority);
  const pageUrl = clean(body.page_url, 500);
  const userAgent = clean(body.user_agent || context.request.headers.get('user-agent'), 500);
  const ip = context.request.headers.get('cf-connecting-ip') || context.request.headers.get('x-forwarded-for') || '';
  const ipHash = await sha256(ip + '|' + (context.env?.TICKET_HASH_SALT || 'andric31-ticket'));

  if (!name || !title || !message) return json({ ok: false, error: 'Nom, titre et message sont obligatoires.' }, 400);
  if (message.length < 8) return json({ ok: false, error: 'Message trop court.' }, 400);
  let signupPasswordHash = '';
  let discord = null;
  if (category === 'inscription') {
    const requestedPseudoKey = normalizePseudoKey(name);
    if (!requestedPseudoKey || name.length < 3) {
      return json({ ok: false, error: 'Le pseudo demandé est invalide.' }, 400);
    }

    if (context.env?.DB) {
      await ensureAuthTables(context.env.DB);
      const accountConflict = await findAuthPseudoConflict(context.env.DB, [name]);
      if (accountConflict) {
        return json({ ok: false, error: 'Ce pseudo est déjà utilisé par un compte.' }, 409);
      }
    }

    const pendingRows = await db.prepare(`
      SELECT id, name
      FROM tickets_global
      WHERE category = 'inscription' AND status = 'open'
      ORDER BY id DESC
      LIMIT 1000
    `).all();
    const pendingConflict = (pendingRows?.results || []).find((row) => normalizePseudoKey(row?.name) === requestedPseudoKey);
    if (pendingConflict) {
      return json({ ok: false, error: 'Une demande de création de compte utilise déjà ce pseudo.' }, 409);
    }

    if (body.link_discord === true) {
      if (!sameOrigin(context.request) || !context.env?.DB) return json({ ok: false, error: 'Liaison Discord indisponible.' }, 403);
      discord = await signupProof(context);
      if (!discord) return json({ ok: false, error: 'La vérification Discord a expiré. Associe à nouveau ton compte Discord avant l’envoi.' }, 400);
      await ensureDiscordTables(context.env.DB);
      if (await discordOwner(context.env.DB, discord.discord_id)) return json({ ok: false, error: 'Ce compte Discord est déjà lié à un compte du site.' }, 409);
      const pendingDiscord = await db.prepare(`SELECT id FROM tickets_global WHERE signup_discord_id = ? AND category = 'inscription' AND status = 'open' AND account_created_at = ''`).bind(discord.discord_id).first();
      if (pendingDiscord) return json({ ok: false, error: 'Une demande est déjà en attente pour ce compte Discord.' }, 409);
    }

    if (!signupPassword || !signupPasswordConfirm) return json({ ok: false, error: 'Mot de passe obligatoire pour une création de compte.' }, 400);
    if (signupPassword !== signupPasswordConfirm) return json({ ok: false, error: 'Les deux mots de passe ne sont pas identiques.' }, 400);
    const pwError = validatePassword(signupPassword);
    if (pwError) return json({ ok: false, error: pwError }, 400);
    try {
      signupPasswordHash = await hashPassword(signupPassword);
    } catch (e) {
      return json({ ok: false, error: 'Impossible de sécuriser le mot de passe.', detail: String(e?.message || e || 'unknown') }, 500);
    }
    message = `${message}

--- Création de compte ---
Pseudo souhaité : ${name}
Mot de passe : enregistré de manière sécurisée (non visible par l’administrateur)`.slice(0, 5000);
  }

  // Only the hash is stored; the secret is returned once to the visitor.
  const privateKey = newTicketKey();
  const privateKeyHash = await hashTicketKey(privateKey);
  let result;
  try {
    const insert = db.prepare(`
      INSERT INTO tickets_global (name, contact, category, priority, title, message, status, page_url, user_agent, ip_hash, signup_password_hash,
        signup_discord_id, signup_discord_username, signup_discord_proof, private_key_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(name, contact, category, priority, title, message, pageUrl, userAgent, ipHash, signupPasswordHash,
      discord?.discord_id || '', discord?.discord_username || '', discord?.token_hash || '', privateKeyHash);
    result = discord ? (await db.batch([insert,
      db.prepare('DELETE FROM ticket_discord_proofs WHERE token_hash = ?').bind(discord.token_hash)
    ]))[0] : await insert.run();
  } catch (error) {
    if (discord && /unique|constraint/i.test(String(error?.message))) return json({ ok: false, error: 'Cette demande Discord a déjà été envoyée.' }, 409);
    throw error;
  }

  const id = result.meta?.last_row_id || result.lastRowId || null;
  // A notification must not copy a private subject, name or access key to Discord.
  await notifyTicketOpened(context, { id, name: 'Demande privée', category, priority, title: 'Nouvelle demande à consulter dans l’administration' });
  return json({ ok: true, id, tracking: { key: privateKey, path: '/ticket/suivi' }, ticket: { id, name, contact, category, priority, title, status: 'open', admin_comment: '' } }, 201,
    discord ? { 'set-cookie': cookie(SIGNUP_COOKIE) } : {});
}

export async function onRequestPatch(context) {
  if (!trustedOrigin(context.request)) return json({ ok: false, error: 'Origine invalide.' }, 403);
  const db = getDb(context.env);
  if (!db) return json({ ok: false, error: 'Base D1 introuvable. Ajoute un binding DB ou TICKETS_DB.' }, 500);
  await ensureSchema(db);
  if (!(await isAdmin(context))) return json({ ok: false, error: 'Accès admin requis.' }, 403);

  const body = await readJson(context.request);
  const id = Number(body.id || 0);
  if (!id) return json({ ok: false, error: 'ID du ticket manquant.' }, 400);

  const current = await db.prepare(`SELECT status FROM tickets_global WHERE id = ?`).bind(id).first();
  if (!current) return json({ ok: false, error: 'Ticket introuvable.' }, 404);

  const hasStatus = Object.prototype.hasOwnProperty.call(body, 'status');
  const status = hasStatus ? normalizeStatus(body.status) : normalizeStatus(current.status);
  const hasComment = Object.prototype.hasOwnProperty.call(body, 'admin_comment');
  const adminComment = clean(body.admin_comment, 3000);

  if (hasComment) {
    await db.prepare(`UPDATE tickets_global SET status = ?, admin_comment = ?, updated_at = datetime('now'), closed_at = CASE WHEN ? = 'closed' THEN COALESCE(NULLIF(closed_at, ''), datetime('now')) ELSE '' END WHERE id = ?`)
      .bind(status, adminComment, status, id).run();
  } else {
    await db.prepare(`UPDATE tickets_global SET status = ?, updated_at = datetime('now'), closed_at = CASE WHEN ? = 'closed' THEN COALESCE(NULLIF(closed_at, ''), datetime('now')) ELSE '' END WHERE id = ?`)
      .bind(status, status, id).run();
  }
  const row = await db.prepare(`SELECT id, name, contact, category, priority, title, message, status, page_url, created_at, updated_at, closed_at, admin_comment, account_created_at, account_username, signup_discord_id, signup_discord_username, ${trackingFields} FROM tickets_global WHERE id = ?`).bind(id).first();
  if (!row) return json({ ok: false, error: 'Ticket introuvable.' }, 404);
  return json({ ok: true, ticket: row });
}

export async function onRequestDelete(context) {
  if (!trustedOrigin(context.request)) return json({ ok: false, error: 'Origine invalide.' }, 403);
  const db = getDb(context.env);
  if (!db) return json({ ok: false, error: 'Base D1 introuvable. Ajoute un binding DB ou TICKETS_DB.' }, 500);
  await ensureSchema(db);
  if (!(await isAdmin(context))) return json({ ok: false, error: 'Accès admin requis.' }, 403);

  const body = await readJson(context.request);
  const id = Number(body.id || 0);
  if (!id) return json({ ok: false, error: 'ID du ticket manquant.' }, 400);
  await db.batch([
    db.prepare('DELETE FROM ticket_replies WHERE ticket_id = ?').bind(id),
    db.prepare('DELETE FROM tickets_global WHERE id = ?').bind(id),
  ]);
  return json({ ok: true, deleted: id });
}

export async function onRequest(context) {
  if (context.request.method === 'PATCH') return onRequestPatch(context);
  if (context.request.method === 'DELETE') return onRequestDelete(context);
  return json({ ok: false, error: 'Méthode non autorisée.' }, 405);
}
