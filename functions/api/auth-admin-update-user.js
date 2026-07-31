import {
  cleanDisplayName,
  cleanRole,
  cleanUsername,
  ensureAuthTables,
  findAuthPseudoConflict,
  hashPassword,
  json,
  requireUser,
  isRoleAllowed,
  validatePassword,
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

    const existing = await env.DB.prepare(`SELECT id, username, role FROM auth_users WHERE id = ?1 LIMIT 1`).bind(userId).first();
    if (!existing) return json({ ok: false, error: 'Utilisateur introuvable.' }, 404);

    const username = cleanUsernameKeepCase(body?.username);
    const displayName = cleanDisplayName(body?.display_name || body?.displayName || '');
    const role = cleanRole(body?.role || existing.role);
    const isActive = body?.is_active ? 1 : 0;
    const password = String(body?.password || '');

    if (!username || username.length < 3) return json({ ok: false, error: 'Nom d’utilisateur invalide.' }, 400);
    if (!displayName) return json({ ok: false, error: 'Nom affiché invalide.' }, 400);

    const conflict = await findAuthPseudoConflict(env.DB, [username, displayName], userId);
    if (conflict) {
      return json({ ok: false, error: 'Ce pseudo ou ce nom affiché est déjà utilisé par un autre compte.' }, 409);
    }

    if (existing.id === auth.user.id && role !== 'admin') {
      return json({ ok: false, error: 'Tu ne peux pas retirer ton propre rôle admin.' }, 400);
    }
    if (existing.id === auth.user.id && !isActive) {
      return json({ ok: false, error: 'Tu ne peux pas désactiver ton propre compte.' }, 400);
    }

    let passwordHash = null;
    if (password) {
      const pwError = validatePassword(password);
      if (pwError) return json({ ok: false, error: pwError }, 400);
      passwordHash = await hashPassword(password);
    }

    if (passwordHash) {
      await env.DB.prepare(`
        UPDATE auth_users
        SET username = ?1, display_name = ?2, role = ?3, is_active = ?4, password_hash = ?5,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id = ?6
      `).bind(username, displayName, role, isActive, passwordHash, userId).run();

      await env.DB.prepare(`DELETE FROM auth_sessions WHERE user_id = ?1`).bind(userId).run();
    } else {
      await env.DB.prepare(`
        UPDATE auth_users
        SET username = ?1, display_name = ?2, role = ?3, is_active = ?4,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id = ?5
      `).bind(username, displayName, role, isActive, userId).run();

      if (!isActive) {
        await env.DB.prepare(`DELETE FROM auth_sessions WHERE user_id = ?1`).bind(userId).run();
      }
    }

    return json({ ok: true, updated: { id: userId, username, display_name: displayName, role, is_active: !!isActive }, password_reset: !!passwordHash });
  } catch (e) {
    return json({ ok: false, error: 'Erreur interne mise à jour membre.', detail: String(e?.message || e || 'unknown') }, 500);
  }
}
