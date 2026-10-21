import { requireUser } from '../api/_auth.js';

// Protection côté serveur des fichiers statiques /admin-r2/*.
// Réutilise la session et le rôle admin du site.
export async function onRequest(context) {
  const { env, request } = context;
  if (!env.DB) return new Response('Configuration de connexion indisponible.', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  try {
    const auth = await requireUser(env.DB, env, request);
    if (!auth.ok) return new Response('Connexion administrateur requise.', { status: 401, headers: { 'Cache-Control': 'no-store' } });
    if (auth.user.role !== 'admin') return new Response('Accès réservé à l’administrateur.', { status: 403, headers: { 'Cache-Control': 'no-store' } });
    const response = await context.next();
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'private, no-store');
    headers.set('X-Content-Type-Options', 'nosniff');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  } catch (_) {
    return new Response('Vérification administrateur indisponible.', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
