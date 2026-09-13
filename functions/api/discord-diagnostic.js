import { ensureAuthTables, getSessionUser } from './_auth.js';
import { getDiscordConfiguration, runDiscordTest } from './_discord.js';
import * as ticketModule from './ticket.js';
import * as messagesModule from './messages.js';

const VERSION = 'discord-diagnostic-1';
const EXPECTED_INTEGRATION = 'discord-notifications-1';
function json(data, status = 200) {
  return new Response(JSON.stringify({ version: VERSION, ...data }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  if (!['GET', 'POST'].includes(request.method)) return json({ ok: false, error: 'Méthode non autorisée.' }, 405);
  // Le test envoie un message : uniquement depuis cette page, sur le même site.
  if (request.method === 'POST'
      && (request.headers.get('origin') !== new URL(request.url).origin
        || request.headers.get('x-discord-test') !== '1')) {
    return json({ ok: false, error: 'Ouvre le diagnostic depuis le site pour lancer le test.' }, 403);
  }
  if (!env?.DB) return json({ ok: false, error: 'La base des comptes DB est absente de ce déploiement.' }, 503);
  try {
    await ensureAuthTables(env.DB);
    const user = await getSessionUser(env.DB, env, request);
    if (!user) return json({ ok: false, error: 'Connecte-toi avec ton compte administrateur, puis recharge cette page.' }, 401);
    if (String(user.role || '').toLowerCase() !== 'admin') return json({ ok: false, error: 'Ce diagnostic est réservé aux administrateurs.' }, 403);

    const configuration = getDiscordConfiguration(env);
    const integrations = {
      tickets: ticketModule.DISCORD_NOTIFICATIONS_VERSION === EXPECTED_INTEGRATION,
      messages: messagesModule.DISCORD_NOTIFICATIONS_VERSION === EXPECTED_INTEGRATION,
    };
    if (request.method === 'GET') return json({ ok: true, configuration, integrations });
    const body = await request.json().catch(() => null);
    if (body?.action !== 'send_test') return json({ ok: false, error: 'Action de test invalide.' }, 400);
    const test = await runDiscordTest(context);
    return json({ ok: true, configuration, integrations, test });
  } catch {
    return json({ ok: false, error: 'Le diagnostic n’a pas pu vérifier la session administrateur. Réessaie après t’être reconnecté.' }, 500);
  }
}
