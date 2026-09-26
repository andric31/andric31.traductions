import { ensureAuthTables, getSessionUser, json } from './_auth.js';
import { config, ensureDiscordTables, signupProof, ticketDb, digest, randomToken,
  readCookie, cookie, sameOrigin, now, FLOW_COOKIE, SIGNUP_COOKIE } from './_discord_oauth.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (!['GET', 'POST', 'DELETE'].includes(request.method)) return json({ ok: false, error: 'Méthode invalide.' }, 405);
  if (request.method !== 'GET' && !sameOrigin(request)) return json({ ok: false, error: 'Origine invalide.' }, 403);
  try {
    const cfg = config(context);
    if (!env?.DB) return request.method === 'GET'
      ? json({ ok: true, configured: false, logged_in: false, linked: null, signup: null })
      : json({ ok: false, error: 'La liaison Discord est indisponible pour le moment.' }, 503);
    await ensureAuthTables(env.DB);
    await ensureDiscordTables(env.DB);
    const user = await getSessionUser(env.DB, env, request);
    const linked = user ? await env.DB.prepare('SELECT discord_id, discord_username, discord_display_name FROM auth_discord_links WHERE user_id = ?').bind(user.id).first() : null;
    if (request.method === 'GET') {
      const proof = user ? null : await signupProof(context);
      return json({ ok: true, configured: cfg.enabled, logged_in: !!user, linked,
        signup: proof ? { discord_username: proof.discord_username, discord_display_name: proof.discord_display_name } : null });
    }
    const body = await request.json().catch(() => ({}));
    if (request.method === 'DELETE') {
      if (body.mode === 'signup') {
        const proof = await signupProof(context);
        if (proof) await ticketDb(env).prepare('DELETE FROM ticket_discord_proofs WHERE token_hash = ?').bind(proof.token_hash).run();
        return json({ ok: true }, 200, { 'set-cookie': cookie(SIGNUP_COOKIE) });
      }
      if (body.mode !== 'link' || !user) return json({ ok: false, error: 'Connexion requise.' }, 401);
      // Invalide aussi les anciens parcours de liaison encore ouverts.
      await env.DB.batch([
        env.DB.prepare('DELETE FROM auth_discord_links WHERE user_id = ?').bind(user.id),
        env.DB.prepare('DELETE FROM auth_discord_flows WHERE user_id = ?').bind(user.id),
      ]);
      return json({ ok: true });
    }
    if (!cfg.enabled) return json({ ok: false, error: 'La connexion Discord est indisponible pour le moment.' }, 503);
    const mode = body.mode;
    if (!['link', 'signup', 'login'].includes(mode)) return json({ ok: false, error: 'Action invalide.' }, 400);
    if (mode === 'link' && !user) return json({ ok: false, error: 'Connecte-toi au site avant de lier Discord.' }, 401);
    if (mode !== 'link' && user) return json({ ok: false, error: 'Tu es déjà connecté. Utilise les paramètres de ton compte.' }, 409);
    if (mode === 'link' && linked) return json({ ok: false, error: 'Un compte Discord est déjà lié. Délie-le avant d’en choisir un autre.' }, 409);
    const previous = readCookie(request, FLOW_COOKIE);
    if (previous) await env.DB.prepare('DELETE FROM auth_discord_flows WHERE browser_hash = ?').bind(await digest(previous)).run();
    const state = randomToken(), browser = randomToken();
    await env.DB.prepare(`INSERT INTO auth_discord_flows (state_hash, browser_hash, mode, user_id, session_hash, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)`).bind(await digest(state), await digest(browser), mode, user?.id || null,
        user ? await digest(readCookie(request, 'andric31_session')) : '', now() + 600).run();
    const url = new URL('https://discord.com/oauth2/authorize');
    url.search = new URLSearchParams({ client_id: cfg.id, response_type: 'code', scope: 'identify',
      redirect_uri: cfg.redirect, state, prompt: 'consent' }).toString();
    return json({ ok: true, url: url.href }, 200, { 'set-cookie': cookie(FLOW_COOKIE, browser, 600) });
  } catch {
    return json({ ok: false, error: 'La liaison Discord est temporairement indisponible. Réessaie plus tard.' }, 503);
  }
}
