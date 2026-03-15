const AUTH_COOKIE = 'andric31_session';
const SESSION_DAYS = 14;
const PBKDF2_ITERATIONS = 60000;
const MIN_PASSWORD_LENGTH = 8;

function authHeaders(extra = {}) {
  return {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...extra,
  };
}

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: authHeaders(extraHeaders),
  });
}

export function badMethod() {
  return json({ ok: false, error: 'Méthode invalide.' }, 405);
}

export function getOrigin(request) {
  try {
    return new URL(request.url).origin;
  } catch {
    return '';
  }
}

export function assertSameOrigin(request) {
  const origin = request.headers.get('origin') || '';
  if (!origin) return true;
  return origin === getOrigin(request);
}

export function cleanUsername(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 40);
}

export function cleanDisplayName(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50);
}

export function cleanRole(value) {
  const role = String(value ?? '').trim().toLowerCase();
  return ['member', 'translator', 'admin'].includes(role) ? role : 'member';
}

export function validatePassword(password) {
  const s = String(password ?? '');
  if (s.length < MIN_PASSWORD_LENGTH) {
    return `Le mot de passe doit faire au moins ${MIN_PASSWORD_LENGTH} caractères.`;
  }
  if (s.length > 200) {
    return 'Le mot de passe est trop long.';
  }
  return '';
}

function bytesToBase64(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBytes(b64) {
  const binary = atob(String(b64 || ''));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function timingSafeEqual(a, b) {
  const aa = new TextEncoder().encode(String(a || ''));
  const bb = new TextEncoder().encode(String(b || ''));
  if (aa.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= (aa[i] ^ bb[i]);
  return diff === 0;
}

async function sha256Hex(input) {
  const data = new TextEncoder().encode(String(input || ''));
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(String(message || '')));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function pbkdf2Hash(password, saltBytes, iterations = PBKDF2_ITERATIONS) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(password || '')),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  return bytesToBase64(new Uint8Array(derived));
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2Hash(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${bytesToBase64(salt)}$${hash}`;
}

export async function verifyPassword(password, encoded) {
  try {
    const parts = String(encoded || '').split('$');
    if (parts.length !== 4 || parts[0] !== 'pbkdf2_sha256') return false;
    const iterations = Math.max(100000, Number(parts[1]) || PBKDF2_ITERATIONS);
    const salt = base64ToBytes(parts[2]);
    const expected = parts[3];
    const got = await pbkdf2Hash(password, salt, iterations);
    return timingSafeEqual(got, expected);
  } catch {
    return false;
  }
}

export async function ensureAuthTables(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS auth_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      last_login_at TEXT
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      expires_at TEXT NOT NULL,
      ip_hash TEXT,
      user_agent TEXT,
      FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE
    )
  `).run();

  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_auth_sessions_exp ON auth_sessions(expires_at)`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_auth_users_name ON auth_users(username)`).run();
  await db.prepare(`DELETE FROM auth_sessions WHERE expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now')`).run();
}

export async function maybeHashIp(request) {
  const ip = request.headers.get('cf-connecting-ip') || '';
  if (!ip) return '';
  return sha256Hex(`auth:${ip}`);
}

function formatCookie(name, value, maxAgeSeconds) {
  const parts = [
    `${name}=${value}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${Math.max(0, Number(maxAgeSeconds) || 0)}`,
  ];
  return parts.join('; ');
}

export function clearSessionCookie() {
  return formatCookie(AUTH_COOKIE, '', 0);
}

function readCookie(request, name) {
  const raw = request.headers.get('cookie') || '';
  const parts = raw.split(/;\s*/g);
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    if (k !== name) continue;
    return part.slice(idx + 1).trim();
  }
  return '';
}

export async function createSession(db, env, user, request) {
  const sidBytes = crypto.getRandomValues(new Uint8Array(32));
  const sid = Array.from(sidBytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  const secret = String(env?.AUTH_SECRET || '').trim();
  if (!secret) throw new Error('AUTH_SECRET manquant.');
  const sig = await hmacHex(secret, sid);
  const cookieValue = `${sid}.${sig}`;
  const userAgent = String(request.headers.get('user-agent') || '').replace(/\s+/g, ' ').trim().slice(0, 180);
  const ipHash = await maybeHashIp(request);
  const expires = new Date(Date.now() + SESSION_DAYS * 86400 * 1000).toISOString();

  await db.prepare(`
    INSERT INTO auth_sessions (id, user_id, expires_at, ip_hash, user_agent)
    VALUES (?1, ?2, ?3, ?4, ?5)
  `).bind(sid, user.id, expires, ipHash, userAgent).run();

  await db.prepare(`
    UPDATE auth_users
    SET last_login_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?1
  `).bind(user.id).run();

  return {
    setCookie: formatCookie(AUTH_COOKIE, cookieValue, SESSION_DAYS * 86400),
    sessionId: sid,
    expires,
  };
}

export async function destroySession(db, request) {
  const cookie = readCookie(request, AUTH_COOKIE);
  const sid = String(cookie || '').split('.')[0] || '';
  if (sid) {
    await db.prepare(`DELETE FROM auth_sessions WHERE id = ?1`).bind(sid).run();
  }
}

export async function getSessionUser(db, env, request) {
  const secret = String(env?.AUTH_SECRET || '').trim();
  if (!secret) return null;
  const cookie = readCookie(request, AUTH_COOKIE);
  if (!cookie) return null;
  const [sid, sig] = String(cookie).split('.');
  if (!sid || !sig) return null;
  const expected = await hmacHex(secret, sid);
  if (!timingSafeEqual(sig, expected)) return null;

  const row = await db.prepare(`
    SELECT u.id, u.username, u.display_name, u.role, u.is_active, s.expires_at
    FROM auth_sessions s
    JOIN auth_users u ON u.id = s.user_id
    WHERE s.id = ?1
    LIMIT 1
  `).bind(sid).first();

  if (!row) return null;
  if (!row.is_active) return null;
  const expiresTs = Date.parse(String(row.expires_at || ''));
  if (!Number.isFinite(expiresTs) || expiresTs <= Date.now()) {
    await db.prepare(`DELETE FROM auth_sessions WHERE id = ?1`).bind(sid).run();
    return null;
  }

  return {
    id: row.id,
    username: row.username,
    display_name: row.display_name,
    role: row.role,
    expires_at: row.expires_at,
  };
}

export async function requireUser(db, env, request) {
  const user = await getSessionUser(db, env, request);
  if (!user) return { ok: false, response: json({ ok: false, error: 'Connexion requise.' }, 401, { 'set-cookie': clearSessionCookie() }) };
  return { ok: true, user };
}

export function isRoleAllowed(role, allowed = []) {
  const order = { member: 1, translator: 2, admin: 3 };
  const current = order[String(role || 'member')] || 0;
  return allowed.some((r) => current >= (order[String(r)] || 0));
}
