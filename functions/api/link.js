// /functions/api/link.js
// Redirection protégée vers les liens privés d'un jeu.
// Source privée : GitHub privé andric31/f95list_private_links/f95list_links.json

const DEFAULT_PRIVATE_OWNER = 'andric31';
const DEFAULT_PRIVATE_REPO = 'f95list_private_links';
const DEFAULT_PRIVATE_BRANCH = 'main';
const DEFAULT_PRIVATE_PATH = 'f95list_links.json';

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,OPTIONS',
  'access-control-allow-headers': 'content-type',
};

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extraHeaders,
    },
  });
}

function decodeBase64Utf8(encoded) {
  const binary = atob(String(encoded || '').replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

function getEnv(context, name, fallback = '') {
  return String(context.env?.[name] || fallback || '').trim();
}

function getToken(context) {
  return getEnv(context, 'GITHUB_PRIVATE_TOKEN') || getEnv(context, 'GITHUB_TOKEN') || getEnv(context, 'GH_TOKEN');
}

async function fetchPrivateLinksDoc(context) {
  const owner = getEnv(context, 'PRIVATE_LINKS_OWNER', DEFAULT_PRIVATE_OWNER);
  const repo = getEnv(context, 'PRIVATE_LINKS_REPO', DEFAULT_PRIVATE_REPO);
  const branch = getEnv(context, 'PRIVATE_LINKS_BRANCH', DEFAULT_PRIVATE_BRANCH);
  const path = getEnv(context, 'PRIVATE_LINKS_PATH', DEFAULT_PRIVATE_PATH).replace(/^\/+/, '');
  const token = getToken(context);

  if (!token) {
    throw new Error('Token GitHub privé manquant. Ajoute GITHUB_PRIVATE_TOKEN dans les variables Cloudflare Pages.');
  }

  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`;

  const resp = await fetch(apiUrl, {
    headers: {
      'accept': 'application/vnd.github+json',
      'authorization': `Bearer ${token}`,
      'user-agent': 'andric31-traductions-pages',
      'x-github-api-version': '2022-11-28',
    },
    cf: { cacheTtl: 60, cacheEverything: true },
  });

  if (!resp.ok) {
    throw new Error(`GitHub privé HTTP ${resp.status}`);
  }

  const data = await resp.json();
  const encoded = String(data?.content || '').replace(/\s/g, '');
  if (!encoded) throw new Error('Fichier privé vide ou illisible');

  const text = decodeBase64Utf8(encoded);
  return JSON.parse(text);
}

function getItem(doc, key) {
  const k = String(key || '').trim();
  if (!k) return null;
  const items = doc?.items && typeof doc.items === 'object' ? doc.items : doc;
  if (!items || typeof items !== 'object') return null;
  return items[k] || null;
}

function getExtraLink(item, index) {
  const arr = Array.isArray(item?.translationsExtra) ? item.translationsExtra : [];
  const i = Number(index || 0);
  if (!Number.isFinite(i) || i < 0 || i >= arr.length) return '';
  const x = arr[i];
  if (typeof x === 'string') return x.trim();
  if (x && typeof x === 'object') return String(x.link || x.url || '').trim();
  return '';
}

function isAllowedUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

export async function onRequest(context) {
  const { request } = context;

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (request.method !== 'GET') return json({ ok: false, error: 'Méthode non autorisée' }, 405);

  try {
    const url = new URL(request.url);
    const key = (url.searchParams.get('key') || '').trim();
    const type = (url.searchParams.get('type') || '').trim();
    const index = url.searchParams.get('index') || url.searchParams.get('i') || '0';

    if (!key || !type) return json({ ok: false, error: 'Paramètres key/type manquants' }, 400);

    const doc = await fetchPrivateLinksDoc(context);
    const item = getItem(doc, key);
    if (!item) return json({ ok: false, error: 'Lien privé introuvable pour ce jeu' }, 404);

    let target = '';
    if (type === 'translationsExtra') target = getExtraLink(item, index);
    else target = String(item[type] || '').trim();

    if (!target) return json({ ok: false, error: 'Lien demandé introuvable' }, 404);
    if (!isAllowedUrl(target)) return json({ ok: false, error: 'Lien invalide' }, 400);

    return Response.redirect(target, 302);
  } catch (err) {
    return json({ ok: false, error: 'Impossible de récupérer le lien privé', detail: String(err?.message || err) }, 502);
  }
}
