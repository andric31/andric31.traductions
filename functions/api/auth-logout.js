import { assertSameOrigin, clearSessionCookie, destroySession, ensureAuthTables, json } from './_auth.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') {
    return json({ ok: false, error: 'Méthode invalide.' }, 405);
  }
  if (!assertSameOrigin(request)) {
    return json({ ok: false, error: 'Origine invalide.' }, 403);
  }
  if (!env?.DB) return json({ ok: false, error: 'DB non liée.' }, 500);
  await ensureAuthTables(env.DB);
  await destroySession(env.DB, request);
  return json({ ok: true }, 200, { 'set-cookie': clearSessionCookie() });
}
