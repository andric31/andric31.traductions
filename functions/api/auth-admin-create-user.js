import {
  assertSameOrigin,
  cleanDisplayName,
  cleanRole,
  cleanUsername,
  ensureAuthTables,
  hashPassword,
  json,
  validatePassword,
} from './_auth.js';

export async function onRequest(context) {
  try {
    const { request, env } = context;
    if (request.method !== 'POST') {
      return json({ ok: false, error: 'Méthode invalide.' }, 405);
    }
    if (!assertSameOrigin(request)) {
      return json({ ok: false, error: 'Origine invalide.' }, 403);
    }
    if (!env?.DB) return json({ ok: false, error: 'DB non liée.' }, 500);

    const expectedToken = String(env?.AUTH_ADMIN_TOKEN || '').trim();
    const gotToken = String(request.headers.get('x-admin-token') || '').trim();
    if (!expectedToken) return json({ ok: false, error: 'AUTH_ADMIN_TOKEN non configuré.' }, 500);
    if (!gotToken || gotToken !== expectedToken) return json({ ok: false, error: 'Token admin invalide.' }, 403);

    await ensureAuthTables(env.DB);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: 'JSON invalide.' }, 400);
    }

    const username = cleanUsername(body?.username);
    const displayName = cleanDisplayName(body?.display_name || body?.displayName || username);
    const password = String(body?.password || '');
    const role = cleanRole(body?.role);

    if (!username || username.length < 3) return json({ ok: false, error: 'Nom d’utilisateur invalide.' }, 400);
    const pwError = validatePassword(password);
    if (pwError) return json({ ok: false, error: pwError }, 400);

    const exists = await env.DB.prepare(`SELECT id FROM auth_users WHERE username = ?1 LIMIT 1`).bind(username).first();
    if (exists) return json({ ok: false, error: 'Cet utilisateur existe déjà.' }, 409);

    let passwordHash = '';
    try {
      passwordHash = await hashPassword(password);
    } catch (e) {
      return json({ ok: false, error: 'Erreur pendant le hash du mot de passe.', detail: String(e?.message || e || 'unknown') }, 500);
    }

    const finalDisplay = displayName || username;

    await env.DB.prepare(`
      INSERT INTO auth_users (username, display_name, password_hash, role, is_active)
      VALUES (?1, ?2, ?3, ?4, 1)
    `).bind(username, finalDisplay, passwordHash, role).run();

    return json({ ok: true, created: { username, display_name: finalDisplay, role } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: 'Erreur interne auth-admin-create-user', detail: String(e?.message || e || 'unknown') }), {
      status: 500,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
    });
  }
}
