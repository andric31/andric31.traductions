// /functions/api/gameplus-link.js
// Redirection protégée vers les liens Game+ du fichier privé gameplus.json.

const DEFAULT_PRIVATE_OWNER = 'andric31';
const DEFAULT_PRIVATE_REPO = 'f95list_private_links';
const DEFAULT_PRIVATE_BRANCH = 'main';
const DEFAULT_PRIVATE_PATH = 'gameplus.json';

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,OPTIONS',
  'access-control-allow-headers': 'content-type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function decodeBase64Utf8(encoded) {
  const binary = atob(String(encoded || '').replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}
function getEnv(context, name, fallback = '') { return String(context.env?.[name] || fallback || '').trim(); }
function getToken(context) { return getEnv(context, 'GITHUB_PRIVATE_TOKEN') || getEnv(context, 'GITHUB_TOKEN') || getEnv(context, 'GH_TOKEN'); }

async function isLoggedIn(context) {
  try {
    const authUrl = new URL('/api/auth-me', context.request.url);
    const resp = await fetch(authUrl.toString(), { headers: { cookie: context.request.headers.get('cookie') || '' }, cf: { cacheTtl: 0, cacheEverything: false } });
    const data = await resp.json().catch(() => null);
    return !!(resp.ok && data && data.logged_in);
  } catch { return false; }
}

async function fetchDoc(context) {
  const owner = getEnv(context, 'PRIVATE_LINKS_OWNER', DEFAULT_PRIVATE_OWNER);
  const repo = getEnv(context, 'PRIVATE_LINKS_REPO', DEFAULT_PRIVATE_REPO);
  const branch = getEnv(context, 'PRIVATE_LINKS_BRANCH', DEFAULT_PRIVATE_BRANCH);
  const path = getEnv(context, 'GAMEPLUS_PRIVATE_PATH', DEFAULT_PRIVATE_PATH).replace(/^\/+/, '');
  const token = getToken(context);
  if (!token) throw new Error('Token GitHub privé manquant.');
  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`;
  const resp = await fetch(apiUrl, { headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${token}`, 'user-agent': 'andric31-traductions-pages', 'x-github-api-version': '2022-11-28' }, cf: { cacheTtl: 60, cacheEverything: true } });
  if (!resp.ok) throw new Error(`GitHub privé HTTP ${resp.status}`);
  const data = await resp.json();
  return JSON.parse(decodeBase64Utf8(String(data?.content || '').replace(/\s/g, '')));
}

function asItems(doc) {
  if (Array.isArray(doc)) return doc;
  if (Array.isArray(doc?.items)) return doc.items;
  if (doc?.items && typeof doc.items === 'object') return Object.values(doc.items);
  if (doc && typeof doc === 'object') return Object.values(doc);
  return [];
}
function getItem(doc, id) { return asItems(doc).find((x) => String(x?.id || x?.uid || x?.key || '').trim() === id) || null; }
function isAllowedUrl(url) { try { const u = new URL(url); return u.protocol === 'https:' || u.protocol === 'http:'; } catch { return false; } }
function resolveLink(item, type) {
  const links = item?.links;
  if (!links) return '';
  if (Array.isArray(links)) {
    for (let i = 0; i < links.length; i += 1) {
      const link = links[i];
      if (!link) continue;
      if (typeof link === 'string') {
        if (type === String(i) || type === `link_${i}`) return link;
        continue;
      }
      const key = String(link.key || `link_${i}`).trim();
      if (type === key || type === String(i) || type === `link_${i}`) return String(link.url || link.href || link.link || '').trim();
    }
    return '';
  }
  if (typeof links === 'object') {
    const value = links[type];
    if (value && typeof value === 'object') return String(value.url || value.href || value.link || '').trim();
    return String(value || '').trim();
  }
  return '';
}

export async function onRequest(context) {
  const { request } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (request.method !== 'GET') return json({ ok: false, error: 'Méthode non autorisée' }, 405);
  try {
    if (!(await isLoggedIn(context))) return json({ ok: false, error: 'Connexion requise.' }, 401);
    const url = new URL(request.url);
    const id = String(url.searchParams.get('id') || '').trim();
    const type = String(url.searchParams.get('type') || '').trim();
    if (!id || !type) return json({ ok: false, error: 'Paramètres id/type manquants' }, 400);
    const doc = await fetchDoc(context);
    const item = getItem(doc, id);
    if (!item) return json({ ok: false, error: 'Jeu Game+ introuvable' }, 404);
    const target = resolveLink(item, type);
    if (!target) return json({ ok: false, error: 'Lien Game+ introuvable' }, 404);
    if (!isAllowedUrl(target)) return json({ ok: false, error: 'Lien invalide' }, 400);
    return Response.redirect(target, 302);
  } catch (err) {
    return json({ ok: false, error: 'Impossible de récupérer le lien Game+', detail: String(err?.message || err) }, 502);
  }
}
