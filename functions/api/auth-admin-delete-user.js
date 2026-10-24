import { assertSameOrigin, ensureAuthTables, json, requireUser, isRoleAllowed } from './_auth.js';

export async function onRequest(context) {
  try {
    const { request, env } = context;
    if (request.method !== 'POST') return json({ ok: false, error: 'Méthode invalide.' }, 405);
    if (!assertSameOrigin(request)) return json({ ok: false, error: 'Origine invalide.' }, 403);
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

    // Certaines tables n'ont pas de clé étrangère, selon leur date et leur
    // ordre de création. Nettoyer explicitement les données liées au compte.
    const tables = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
    const present = new Set((tables.results || []).map(row => row.name));
    const deletions = [env.DB.prepare('DELETE FROM auth_sessions WHERE user_id = ?').bind(userId)];
    for (const table of [
      'user_page_views', 'user_game_state', 'user_watchlist',
      'community_game_tops', 'counter_view_locks',
      'auth_discord_links', 'auth_discord_flows',
    ]) {
      if (present.has(table)) deletions.push(env.DB.prepare(`DELETE FROM ${table} WHERE user_id = ?`).bind(userId));
    }
    if (present.has('message_reactions')) {
      deletions.push(env.DB.prepare('DELETE FROM message_reactions WHERE actor_key = ?').bind(`user:${userId}`));
    }
    // Les messages et tickets identifiés par un pseudo demandent un examen
    // séparé : un pseudo ne suffit pas à attribuer un texte à ce compte.
    deletions.push(env.DB.prepare('DELETE FROM auth_users WHERE id = ?').bind(userId));
    await env.DB.batch(deletions);

    return json({ ok: true, deleted: { id: existing.id, username: existing.username } });
  } catch (e) {
    return json({ ok: false, error: 'Erreur interne suppression membre.', detail: String(e?.message || e || 'unknown') }, 500);
  }
}
