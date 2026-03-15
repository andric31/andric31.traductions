import {
  assertSameOrigin,
  cleanUsername,
  ensureAuthTables,
  json,
  verifyPassword,
  createSession,
} from './_auth.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') {
    return json({ ok: false, error: 'Méthode invalide.' }, 405);
  }
  if (!assertSameOrigin(request)) {
    return json({ ok: false, error: 'Origine invalide.' }, 403);
  }
  if (!env?.DB) return json({ ok: false, error: 'DB non liée.' }, 500);
  if (!String(env?.AUTH_SECRET || '').trim()) {
    return json({ ok: false, error: 'AUTH_SECRET non configuré.' }, 500);
  }

  await ensureAuthTables(env.DB);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'JSON invalide.' }, 400);
  }

  const username = cleanUsername(body?.username);
  const password = String(body?.password || '');
  if (!username || !password) {
    return json({ ok: false, error: 'Identifiants invalides.' }, 400);
  }

  const user = await env.DB.prepare(`
    SELECT id, username, display_name, password_hash, role, is_active
    FROM auth_users
    WHERE username = ?1
    LIMIT 1
  `).bind(username).first();

  if (!user || !user.is_active) {
    return json({ ok: false, error: 'Nom d’utilisateur ou mot de passe incorrect.' }, 401);
  }

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    return json({ ok: false, error: 'Nom d’utilisateur ou mot de passe incorrect.' }, 401);
  }

  const session = await createSession(env.DB, env, user, request);
  return json({
    ok: true,
    logged_in: true,
    user: {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      role: user.role,
    }
  }, 200, { 'set-cookie': session.setCookie });
}
