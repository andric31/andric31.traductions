import {
  assertSameOrigin,
  ensureAuthTables,
  hashPassword,
  json,
  requireUser,
  validatePassword,
} from './_auth.js';

export async function onRequest(context) {
  try {
    const { request, env } = context;
    if (request.method !== 'POST') return json({ ok: false, error: 'Méthode invalide.' }, 405);
    if (!assertSameOrigin(request)) return json({ ok: false, error: 'Origine invalide.' }, 403);
    if (!env?.DB) return json({ ok: false, error: 'DB non liée.' }, 500);

    await ensureAuthTables(env.DB);
    const auth = await requireUser(env.DB, env, request);
    if (!auth.ok) return auth.response;

    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: 'JSON invalide.' }, 400); }

    const password = String(body?.password || '');
    const passwordConfirm = String(body?.password_confirm || body?.passwordConfirm || '');
    if (!password || !passwordConfirm) return json({ ok: false, error: 'Les deux mots de passe sont obligatoires.' }, 400);
    if (password !== passwordConfirm) return json({ ok: false, error: 'Les deux mots de passe ne sont pas identiques.' }, 400);

    const pwError = validatePassword(password);
    if (pwError) return json({ ok: false, error: pwError }, 400);

    const passwordHash = await hashPassword(password);
    await env.DB.prepare(`
      UPDATE auth_users
      SET password_hash = ?1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id = ?2
    `).bind(passwordHash, auth.user.id).run();

    return json({ ok: true, password_changed: true });
  } catch (e) {
    return json({ ok: false, error: 'Erreur interne changement mot de passe.', detail: String(e?.message || e || 'unknown') }, 500);
  }
}
