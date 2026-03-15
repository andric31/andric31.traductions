import { ensureAuthTables, json, requireUser, isRoleAllowed } from './_auth.js';

export async function onRequest(context) {
  try {
    const { request, env } = context;
    if (request.method !== 'POST') return json({ ok: false, error: 'Méthode invalide.' }, 405);
    if (!env?.DB) return json({ ok: false, error: 'DB non liée.' }, 500);

    await ensureAuthTables(env.DB);
    const auth = await requireUser(env.DB, env, request);
    if (!auth.ok) return auth.response;
    if (!isRoleAllowed(auth.user.role, ['admin'])) return json({ ok: false, error: 'Accès refusé.' }, 403);

    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: 'JSON invalide.' }, 400); }
    const userId = Number(body?.id || 0);
    if (!Number.isInteger(userId) || userId <= 0) return json({ ok: false, error: 'Utilisateur invalide.' }, 400);
    if (userId === auth.user.id) return json({ ok: false, error: 'Tu ne peux pas supprimer ton propre compte.' }, 400);

    const existing = await env.DB.prepare(`SELECT id, username FROM auth_users WHERE id = ?1 LIMIT 1`).bind(userId).first();
    if (!existing) return json({ ok: false, error: 'Utilisateur introuvable.' }, 404);

    await env.DB.prepare(`DELETE FROM auth_sessions WHERE user_id = ?1`).bind(userId).run();
    await env.DB.prepare(`DELETE FROM auth_users WHERE id = ?1`).bind(userId).run();

    return json({ ok: true, deleted: { id: existing.id, username: existing.username } });
  } catch (e) {
    return json({ ok: false, error: 'Erreur interne suppression membre.', detail: String(e?.message || e || 'unknown') }, 500);
  }
}
