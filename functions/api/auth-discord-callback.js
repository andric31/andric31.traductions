import { ensureAuthTables, getSessionUser, createSession } from './_auth.js';
import { config, ensureDiscordTables, ensureProofTable, ticketDb, discordOwner, exchangeIdentity,
  digest, randomToken, readCookie, cookie, now, redirectResult, logDiscordError, FLOW_COOKIE, SIGNUP_COOKIE } from './_discord_oauth.js';

export async function onRequest(context) {
  if (context.request.method !== 'GET') return new Response('Méthode invalide.', { status: 405 });
  let mode = 'login';
  let stage = 'configuration';
  try {
    if (!config(context).enabled) {
      logDiscordError(stage);
      return redirectResult(context, mode, 'unavailable');
    }
    const { env, request } = context;
    stage = 'auth_tables';
    await ensureAuthTables(env.DB);
    stage = 'discord_tables';
    await ensureDiscordTables(env.DB);
    const url = new URL(request.url), state = url.searchParams.get('state') || '';
    const browser = readCookie(request, FLOW_COOKIE);
    if (!/^[a-f0-9]{64}$/.test(state) || !/^[a-f0-9]{64}$/.test(browser)) return redirectResult(context, mode, 'expired');
    // Consommation atomique : un callback ne peut être utilisé qu'une seule fois.
    stage = 'flow_read';
    const flow = await env.DB.prepare(`DELETE FROM auth_discord_flows
      WHERE state_hash = ? AND browser_hash = ? AND expires_at > ? RETURNING *`)
      .bind(await digest(state), await digest(browser), now()).first();
    if (!flow) return redirectResult(context, mode, 'expired');
    mode = flow.mode;
    if (url.searchParams.has('error')) return redirectResult(context, mode, 'cancelled');
    stage = 'session_read';
    const current = await getSessionUser(env.DB, env, request);
    if (mode === 'link' && (!current || current.id !== flow.user_id ||
        await digest(readCookie(request, 'andric31_session')) !== flow.session_hash)) return redirectResult(context, mode, 'session_changed');
    if (mode !== 'link' && current) return redirectResult(context, mode, 'session_changed');
    const code = url.searchParams.get('code') || '';
    if (!code || code.length > 2048) return redirectResult(context, mode, 'expired');
    stage = 'token_exchange';
    const discord = await exchangeIdentity(context, code);
    stage = 'owner_read';
    const owner = await discordOwner(env.DB, discord.id);
    if (mode === 'login') {
      if (!owner) return redirectResult(context, mode, 'not_linked');
      if (!owner.is_active) return redirectResult(context, mode, 'inactive');
      stage = 'session_create';
      const session = await createSession(env.DB, env, owner, request);
      return redirectResult(context, mode, 'logged_in', [session.setCookie]);
    }
    if (owner) return redirectResult(context, mode, 'already_linked');
    if (mode === 'link') {
      stage = 'link_save';
      try {
        await env.DB.prepare(`INSERT INTO auth_discord_links (user_id, discord_id, discord_username, discord_display_name)
          VALUES (?, ?, ?, ?)`).bind(current.id, discord.id, discord.username, discord.display_name).run();
      } catch (error) {
        if (/unique|constraint/i.test(String(error?.message))) return redirectResult(context, mode, 'already_linked');
        throw error;
      }
      return redirectResult(context, mode, 'linked');
    }
    stage = 'signup_proof_save';
    const db = ticketDb(env);
    await ensureProofTable(db);
    const previous = readCookie(request, SIGNUP_COOKIE);
    if (previous) await db.prepare('DELETE FROM ticket_discord_proofs WHERE token_hash = ?').bind(await digest(previous)).run();
    const token = randomToken();
    await db.prepare(`INSERT INTO ticket_discord_proofs (token_hash, discord_id, discord_username, discord_display_name, expires_at)
      VALUES (?, ?, ?, ?, ?)`).bind(await digest(token), discord.id, discord.username, discord.display_name, now() + 1800).run();
    return redirectResult(context, mode, 'verified', [cookie(SIGNUP_COOKIE, token, 1800)]);
  } catch (error) {
    logDiscordError(stage, error);
    return redirectResult(context, mode, 'unavailable');
  }
}
