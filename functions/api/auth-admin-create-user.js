import {
  assertSameOrigin,
  cleanDisplayName,
  cleanRole,
  cleanUsername,
  ensureAuthTables,
  findAuthPseudoConflict,
  hashPassword,
  json,
  validatePassword,
  requireUser,
  isRoleAllowed,
} from './_auth.js';


function cleanUsernameKeepCase(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .slice(0, 60);
}

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

    await ensureAuthTables(env.DB);
    const auth = await requireUser(env.DB, env, request);
    if (!auth.ok) return auth.response;
    if (!isRoleAllowed(auth.user.role, ['admin'])) return json({ ok: false, error: 'Accès refusé.' }, 403);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: 'JSON invalide.' }, 400);
    }

    const username = cleanUsernameKeepCase(body?.username);
    const displayName = cleanDisplayName(body?.display_name || body?.displayName || username);
    const password = String(body?.password || '');
    const role = cleanRole(body?.role);

    if (!username || username.length < 3) return json({ ok: false, error: 'Nom d’utilisateur invalide.' }, 400);
    const pwError = validatePassword(password);
    if (pwError) return json({ ok: false, error: pwError }, 400);

    const finalDisplay = displayName || username;
    const conflict = await findAuthPseudoConflict(env.DB, [username, finalDisplay]);
    if (conflict) {
      return json({ ok: false, error: 'Ce pseudo ou ce nom affiché est déjà utilisé par un autre compte.' }, 409);
    }

    let passwordHash = '';
    try {
      passwordHash = await hashPassword(password);
    } catch (e) {
      return json({ ok: false, error: 'Erreur pendant le hash du mot de passe.', detail: String(e?.message || e || 'unknown') }, 500);
    }

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
