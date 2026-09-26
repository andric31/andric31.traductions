// Identité Discord vérifiée par OAuth2. Aucun token Discord n'est conservé.
export const FLOW_COOKIE = 'andric31_discord_flow';
export const SIGNUP_COOKIE = 'andric31_discord_signup';
export const now = () => Math.floor(Date.now() / 1000);
export const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
export async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
export function readCookie(request, name) {
  return (request.headers.get('cookie') || '').split(/;\s*/).find(x => x.startsWith(name + '='))?.slice(name.length + 1) || '';
}
export function cookie(name, value = '', seconds = 0) {
  return `${name}=${value}; Path=/api/; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`;
}
export function sameOrigin(request) {
  return request.headers.get('origin') === new URL(request.url).origin;
}
export function config(context) {
  const id = String(context.env?.DISCORD_CLIENT_ID || '').trim();
  const secret = String(context.env?.DISCORD_CLIENT_SECRET || '').trim();
  const redirect = new URL('/api/auth-discord-callback', context.request.url).href;
  return { id, secret, redirect, enabled: !!(/^\d{17,20}$/.test(id) && secret && context.env?.AUTH_SECRET && context.env?.DB) };
}
export function ticketDb(env) {
  return env?.TICKETS_DB || env?.DB || env?.AUTH_DB;
}
export async function ensureDiscordTables(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS auth_discord_links (
    user_id INTEGER PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
    discord_id TEXT NOT NULL UNIQUE, discord_username TEXT NOT NULL,
    discord_display_name TEXT NOT NULL DEFAULT '', linked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS auth_discord_flows (
    state_hash TEXT PRIMARY KEY, browser_hash TEXT NOT NULL, mode TEXT NOT NULL,
    user_id INTEGER, session_hash TEXT NOT NULL DEFAULT '', expires_at INTEGER NOT NULL
  )`).run();
  await db.prepare('DELETE FROM auth_discord_flows WHERE expires_at <= ?').bind(now()).run();
}
export async function ensureProofTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS ticket_discord_proofs (
    token_hash TEXT PRIMARY KEY, discord_id TEXT NOT NULL, discord_username TEXT NOT NULL,
    discord_display_name TEXT NOT NULL DEFAULT '', expires_at INTEGER NOT NULL
  )`).run();
  await db.prepare('DELETE FROM ticket_discord_proofs WHERE expires_at <= ?').bind(now()).run();
}
export async function ensureTicketDiscordColumns(db) {
  const result = await db.prepare('PRAGMA table_info(tickets_global)').all();
  const names = new Set((result.results || []).map(x => x.name));
  for (const name of ['signup_discord_id', 'signup_discord_username', 'signup_discord_proof']) {
    if (names.has(name)) continue;
    try { await db.prepare(`ALTER TABLE tickets_global ADD COLUMN ${name} TEXT DEFAULT ''`).run(); }
    catch (error) { if (!/duplicate column/i.test(String(error?.message))) throw error; }
  }
  await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_ticket_discord_proof ON tickets_global(signup_discord_proof) WHERE signup_discord_proof <> ''`).run();
  await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_ticket_discord_pending ON tickets_global(signup_discord_id)
    WHERE signup_discord_id <> '' AND category = 'inscription' AND status = 'open' AND account_created_at = ''`).run();
}
export async function signupProof(context) {
  const token = readCookie(context.request, SIGNUP_COOKIE);
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const db = ticketDb(context.env);
  if (!db) return null;
  await ensureProofTable(db);
  return db.prepare('SELECT * FROM ticket_discord_proofs WHERE token_hash = ? AND expires_at > ?')
    .bind(await digest(token), now()).first();
}
export async function discordOwner(db, id) {
  return db.prepare(`SELECT u.id, u.username, u.display_name, u.role, u.is_active
    FROM auth_discord_links d JOIN auth_users u ON u.id = d.user_id WHERE d.discord_id = ?`).bind(id).first();
}
export function redirectResult(context, mode, result, cookies = []) {
  const path = mode === 'signup' ? '/ticket/?category=inscription' : mode === 'link' ? '/compte/' : '/connexion/';
  const url = new URL(result === 'logged_in' ? '/compte/' : path, context.request.url);
  url.searchParams.set('discord_result', result);
  const headers = new Headers({ location: url.href, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' });
  headers.append('set-cookie', cookie(FLOW_COOKIE));
  for (const c of cookies) headers.append('set-cookie', c);
  return new Response(null, { status: 303, headers });
}
const OAUTH_ERROR_CODES = new Set(['invalid_client', 'invalid_grant', 'invalid_request',
  'invalid_scope', 'unauthorized_client', 'unsupported_grant_type', 'access_denied',
  'server_error', 'temporarily_unavailable']);
class DiscordOAuthError extends Error {
  constructor(stage, reason, status = 0, code = '') {
    super('Discord OAuth failed');
    this.stage = stage;
    this.reason = reason;
    this.status = status;
    this.code = OAUTH_ERROR_CODES.has(code) ? code : '';
  }
}
// Journalise seulement des catégories contrôlées : jamais l'URL du callback,
// les cookies, le corps des réponses Discord, les codes OAuth ni les secrets.
export function logDiscordError(stage, error) {
  const known = error instanceof DiscordOAuthError;
  const message = String(error?.message || '');
  const reason = known ? error.reason : stage === 'configuration' ? 'configuration_missing'
    : /no such table|no such column|syntax error/i.test(message) ? 'database_schema_error'
    : /D1_ERROR|SQLITE|constraint|database/i.test(message) ? 'database_error' : 'server_error';
  const detail = { stage: known ? error.stage : stage, reason };
  if (known && error.status) detail.http_status = error.status;
  if (known && error.code) detail.discord_error = error.code;
  console.error('[Discord OAuth]', JSON.stringify(detail));
}
async function discordFetch(url, options, stage) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    // workerd n'accepte pas toujours redirect: 'error'. En mode manual,
    // aucun secret n'est transféré à une autre URL : tout 3xx est refusé ici.
    const response = await fetch(url, { ...options, signal: controller.signal, redirect: 'manual' });
    if (response.status >= 300 && response.status < 400) {
      throw new DiscordOAuthError(stage, 'unexpected_redirect', response.status);
    }
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new DiscordOAuthError(stage, 'http_error', response.status, body?.error);
    }
    try { return await response.json(); }
    catch { throw new DiscordOAuthError(stage, 'invalid_response', response.status); }
  } catch (error) {
    if (error instanceof DiscordOAuthError) throw error;
    const reason = controller.signal.aborted ? 'timeout'
      : /invalid redirect|unsupported.*redirect/i.test(String(error?.message || '')) ? 'unsupported_redirect_mode' : 'network_error';
    throw new DiscordOAuthError(stage, reason);
  } finally { clearTimeout(timer); }
}
export async function exchangeIdentity(context, code) {
  const cfg = config(context);
  const token = await discordFetch('https://discord.com/api/v10/oauth2/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cfg.id, client_secret: cfg.secret,
      grant_type: 'authorization_code', code, redirect_uri: cfg.redirect }).toString(),
  }, 'token_exchange');
  if (!token?.access_token) throw new DiscordOAuthError('token_exchange', 'missing_access_token');
  if (!String(token.scope || '').split(' ').includes('identify')) throw new DiscordOAuthError('token_exchange', 'missing_identify_scope');
  const user = await discordFetch('https://discord.com/api/v10/users/@me', {
    headers: { authorization: `Bearer ${token.access_token}` },
  }, 'identity_read');
  if (!/^\d{17,20}$/.test(String(user?.id || '')) || user.bot) throw new DiscordOAuthError('identity_read', 'invalid_identity');
  const clean = value => String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80);
  return { id: String(user.id), username: clean(user.username), display_name: clean(user.global_name || user.username) };
}
