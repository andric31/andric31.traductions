import { getDb, ensureSchema, isAdmin, trustedOrigin, hashTicketKey } from './_tickets.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
    'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff', 'x-robots-tag': 'noindex, noarchive' },
});

export async function onRequest(context) {
  const { request } = context;
  if (request.method !== 'POST') return json({ ok: false, error: 'Méthode non autorisée.' }, 405);
  if (!trustedOrigin(request)) return json({ ok: false, error: 'Origine invalide.' }, 403);
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) {
    return json({ ok: false, error: 'Format invalide.' }, 415);
  }
  try {
    const raw = await request.text();
    if (raw.length > 14000) return json({ ok: false, error: 'Message trop long.' }, 413);
    let body;
    try { body = JSON.parse(raw); } catch { return json({ ok: false, error: 'JSON invalide.' }, 400); }
    const id = Number(body?.id);
    if (!Number.isSafeInteger(id) || id <= 0) return json({ ok: false, error: 'Lien privé invalide ou ticket supprimé.' }, 404);
    const admin = body.admin === true;
    if (admin && !(await isAdmin(context))) return json({ ok: false, error: 'Accès admin requis.' }, 403);
    const key = request.headers.get('x-ticket-key') || '';
    if (!admin && !/^[a-f0-9]{64}$/.test(key)) return json({ ok: false, error: 'Lien privé invalide ou ticket supprimé.' }, 404);
    const db = getDb(context.env);
    if (!db) return json({ ok: false, error: 'Service des tickets indisponible.' }, 503);
    await ensureSchema(db);
    // Explicit public fields: no internal note, contact, IP, password or Discord identifiers.
    let sql = `SELECT id, name, category, title, message, status, created_at, updated_at,
      account_created_at, account_username FROM tickets_global WHERE id = ? AND private_key_hash <> ''`;
    const values = [id];
    if (!admin) { sql += ' AND private_key_hash = ?'; values.push(await hashTicketKey(key)); }
    const ticket = await db.prepare(sql).bind(...values).first();
    if (!ticket) return json({ ok: false, error: 'Lien privé invalide ou ticket supprimé.' }, 404);
    if (body.action === 'read') {
      const before = Number(body.before || 0);
      if (!Number.isSafeInteger(before) || before < 0) return json({ ok: false, error: 'Page invalide.' }, 400);
      const result = await db.prepare(`SELECT id, author, message, created_at FROM ticket_replies
        WHERE ticket_id = ? AND (? = 0 OR id < ?) ORDER BY id DESC LIMIT 51`).bind(id, before, before).all();
      const rows = result.results || [];
      return json({ ok: true, ticket, messages: rows.slice(0, 50).reverse(), has_more: rows.length > 50 });
    }
    if (body.action !== 'reply') return json({ ok: false, error: 'Action invalide.' }, 400);
    const message = typeof body.message === 'string' ? body.message.replace(/\u0000/g, '').trim() : '';
    const requestId = String(body.request_id || '');
    if (!message || message.length > 5000 || !/^[a-zA-Z0-9-]{16,80}$/.test(requestId)) {
      return json({ ok: false, error: 'Réponse invalide (1 à 5 000 caractères).' }, 400);
    }
    const author = admin ? 'admin' : 'visitor';
    const existing = await db.prepare('SELECT id, message FROM ticket_replies WHERE ticket_id = ? AND author = ? AND request_id = ?')
      .bind(id, author, requestId).first();
    if (existing) {
      if (existing.message !== message) return json({ ok: false, error: 'Actualise la page avant un nouvel envoi.' }, 409);
      return json({ ok: true, id: existing.id, duplicate: true });
    }
    if (!admin) {
      const recent = await db.prepare("SELECT COUNT(*) AS count FROM ticket_replies WHERE ticket_id = ? AND author = 'visitor' AND created_at > datetime('now', '-1 minute')").bind(id).first();
      if (Number(recent?.count) >= 6) return json({ ok: false, error: 'Patiente une minute avant une nouvelle réponse.' }, 429);
    }
    await db.batch([
      db.prepare(`INSERT INTO ticket_replies (ticket_id, author, message, request_id) VALUES (?, ?, ?, ?)
        ON CONFLICT(ticket_id, author, request_id) DO NOTHING`).bind(id, author, message, requestId),
      db.prepare(`UPDATE tickets_global SET updated_at = datetime('now'),
        status = CASE WHEN ? = 'visitor' THEN 'open' ELSE status END,
        closed_at = CASE WHEN ? = 'visitor' THEN '' ELSE closed_at END
        WHERE id = ? AND changes() > 0`).bind(author, author, id),
    ]);
    return json({ ok: true }, 201);
  } catch {
    return json({ ok: false, error: 'Le suivi est momentanément indisponible. Réessaie dans un instant.' }, 500);
  }
}
