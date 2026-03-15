import { ensureAuthTables, json, requireUser, isRoleAllowed } from './_auth.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'GET') {
    return json({ ok: false, error: 'Méthode invalide.' }, 405);
  }
  if (!env?.DB) return json({ ok: false, error: 'DB non liée.' }, 500);
  await ensureAuthTables(env.DB);

  const auth = await requireUser(env.DB, env, request);
  if (!auth.ok) return auth.response;

  const user = auth.user;
  const canTranslator = isRoleAllowed(user.role, ['translator']);

  return json({
    ok: true,
    title: 'Contenu membre',
    message: canTranslator
      ? 'Tu es connecté avec un rôle traducteur/admin. Ici tu peux afficher des options avancées.'
      : 'Tu es connecté en membre. Ici tu peux afficher des bonus réservés aux personnes connectées.',
    user,
  });
}
