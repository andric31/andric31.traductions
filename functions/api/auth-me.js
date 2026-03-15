import { ensureAuthTables, getSessionUser, json, clearSessionCookie } from './_auth.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'GET') {
    return json({ ok: false, error: 'Méthode invalide.' }, 405);
  }
  if (!env?.DB) return json({ ok: false, error: 'DB non liée.' }, 500);
  await ensureAuthTables(env.DB);
  const user = await getSessionUser(env.DB, env, request);
  if (!user) {
    return json({ ok: true, logged_in: false }, 200, { 'set-cookie': clearSessionCookie() });
  }
  return json({ ok: true, logged_in: true, user });
}
