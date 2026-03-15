import { ensureAuthTables, json, requireUser, isRoleAllowed } from './_auth.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'GET') return json({ ok: false, error: 'Méthode invalide.' }, 405);
  if (!env?.DB) return json({ ok: false, error: 'DB non liée.' }, 500);

  await ensureAuthTables(env.DB);
  const auth = await requireUser(env.DB, env, request);
  if (!auth.ok) return auth.response;
  if (!isRoleAllowed(auth.user.role, ['admin'])) return json({ ok: false, error: 'Accès refusé.' }, 403);

  const { results } = await env.DB.prepare(`
    SELECT id, username, display_name, role, is_active, created_at, updated_at, last_login_at
    FROM auth_users
    ORDER BY lower(username) ASC
  `).all();

  return json({ ok: true, users: (results || []).map((u) => ({
    id: u.id,
    username: u.username,
    display_name: u.display_name,
    role: u.role,
    is_active: !!u.is_active,
    created_at: u.created_at || '',
    updated_at: u.updated_at || '',
    last_login_at: u.last_login_at || ''
  })) });
}
