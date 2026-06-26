// /functions/api/gameplus.js
// Base Game+ privée : lit andric31/f95list_private_links/gameplus.json via token Cloudflare.
// Accès réservé aux comptes connectés.

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
    headers: {
      ...CORS_HEADERS,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
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

async function isLoggedIn(context) {
  try {
    const authUrl = new URL('/api/auth-me', context.request.url);
    const resp = await fetch(authUrl.toString(), {
      headers: { cookie: context.request.headers.get('cookie') || '' },
      cf: { cacheTtl: 0, cacheEverything: false },
    });
    const data = await resp.json().catch(() => null);
    return !!(resp.ok && data && data.logged_in);
  } catch {
    return false;
  }
}

async function fetchGamePlusDoc(context) {
  const owner = getEnv(context, 'PRIVATE_LINKS_OWNER', DEFAULT_PRIVATE_OWNER);
  const repo = getEnv(context, 'PRIVATE_LINKS_REPO', DEFAULT_PRIVATE_REPO);
  const branch = getEnv(context, 'PRIVATE_LINKS_BRANCH', DEFAULT_PRIVATE_BRANCH);
  const path = getEnv(context, 'GAMEPLUS_PRIVATE_PATH', DEFAULT_PRIVATE_PATH).replace(/^\/+/, '');
  const token = getToken(context);

  if (!token) throw new Error('Token GitHub privé manquant. Ajoute GITHUB_PRIVATE_TOKEN dans les variables Cloudflare Pages.');

  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`;
  const resp = await fetch(apiUrl, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'user-agent': 'andric31-traductions-pages',
      'x-github-api-version': '2022-11-28',
    },
    cf: { cacheTtl: 60, cacheEverything: true },
  });

  if (!resp.ok) throw new Error(`GitHub privé HTTP ${resp.status}`);
  const data = await resp.json();
  const encoded = String(data?.content || '').replace(/\s/g, '');
  if (!encoded) throw new Error('Fichier gameplus.json vide ou illisible');
  return JSON.parse(decodeBase64Utf8(encoded));
}

function asItems(doc) {
  if (Array.isArray(doc)) return doc;
  if (Array.isArray(doc?.items)) return doc.items;
  if (doc?.items && typeof doc.items === 'object') return Object.values(doc.items);
  if (doc && typeof doc === 'object') return Object.values(doc);
  return [];
}

function cleanText(v) {
  return String(v ?? '').trim();
}

function cleanTags(v) {
  if (Array.isArray(v)) return v.map(cleanText).filter(Boolean);
  const s = cleanText(v);
  if (!s) return [];
  return s.split(',').map(cleanText).filter(Boolean);
}

function hostLabel(rawUrl, fallback = 'Lien') {
  try {
    const host = new URL(String(rawUrl || '')).hostname.toLowerCase();
    if (host.includes('patreon.com')) return 'Patreon';
    if (host.includes('mega.nz')) return 'MEGA';
    if (host.includes('drive.google')) return 'Google Drive';
    if (host.includes('gofile')) return 'Gofile';
    if (host.includes('discord')) return 'Discord';
    return host.replace(/^www\./, '');
  } catch {}
  return cleanText(fallback) || 'Lien';
}

function labelForLink(key, value) {
  const k = cleanText(key).toLowerCase();
  if (k === 'win_linux' || k === 'winlinux' || k === 'windows_linux') return 'Windows / Linux';
  if (k === 'windows' || k === 'win') return 'Windows';
  if (k === 'linux') return 'Linux';
  if (k === 'macos' || k === 'mac' || k === 'osx') return 'MacOS';
  if (k === 'android') return 'Android';
  if (k === 'patreon') return 'Patreon';
  if (k === 'discord') return 'Discord';
  if (k === 'official') return 'Site officiel';
  if (k === 'download') return 'Téléchargement';
  if (k === 'traduction' || k === 'translation' || k === 'trad' || k === 'patch_fr') return 'Télécharger la traduction';
  return cleanText(key) || hostLabel(value, 'Lien');
}

function sectionForLink(link, key = '') {
  const raw = cleanText(link?.section || link?.category || link?.kind || link?.type || '').toLowerCase();
  const k = cleanText(key || link?.key || '').toLowerCase();
  const v = raw || k;
  if (['traduction', 'trad', 'translation', 'patch_fr', 'fr'].includes(v)) return 'traduction';
  if (['win_linux', 'winlinux', 'windows_linux', 'windows', 'win', 'linux', 'macos', 'mac', 'osx', 'android', 'download', 'jeu', 'game'].includes(v)) return 'download';
  if (['patreon', 'discord', 'official', 'source', 'site', 'itch', 'steam'].includes(v)) return 'source';
  return 'other';
}

function cleanOneLink(id, link, index, key = '') {
  let raw = link;
  if (typeof raw === 'string') raw = { url: raw };
  if (!raw || typeof raw !== 'object') return null;
  const url = cleanText(raw.url || raw.href || raw.link);
  if (!url) return null;
  const linkKey = cleanText(raw.key || key || `link_${index}`);
  const label = cleanText(raw.label || raw.name || raw.title || labelForLink(linkKey, url));
  const section = sectionForLink(raw, linkKey);
  return {
    key: linkKey || `link_${index}`,
    section,
    label: label || hostLabel(url, 'Lien'),
    host: hostLabel(url, linkKey),
    url: `/api/gameplus-link?id=${encodeURIComponent(id)}&type=${encodeURIComponent(linkKey || `link_${index}`)}`,
  };
}

function cleanLinks(id, links) {
  const out = [];
  if (!links) return out;
  if (Array.isArray(links)) {
    links.forEach((link, index) => {
      const item = cleanOneLink(id, link, index);
      if (item) out.push(item);
    });
    return out;
  }
  if (typeof links === 'object') {
    Object.entries(links).forEach(([key, value], index) => {
      const item = cleanOneLink(id, value && typeof value === 'object' ? value : { url: value }, index, key);
      if (item) out.push(item);
    });
  }
  return out;
}

function cleanGame(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = cleanText(raw.id || raw.uid || raw.key);
  const title = cleanText(raw.title || raw.cleanTitle || raw.name);
  if (!id || !title) return null;
  if (raw.visible === false || raw.visible === 0 || raw.hidden === true) return null;

  const cover = cleanText(raw.cover || raw.cover_url || raw.image || raw.img);
  const banner = cleanText(raw.banner || raw.banner_url || '');
  const gallery = Array.isArray(raw.gallery) ? raw.gallery.map(cleanText).filter(Boolean) : [];

  return {
    id,
    uid: id,
    title,
    cleanTitle: cleanText(raw.cleanTitle) || title,
    developer: cleanText(raw.developer || raw.author || raw.creator),
    engine: cleanText(raw.engine),
    status: cleanText(raw.status),
    version: cleanText(raw.version),
    date: cleanText(raw.date),
    translationCreatedAt: cleanText(raw.translationCreatedAt || raw.translationCreationDate || raw.tradCreatedAt || raw.createdAt),
    translationUpdatedAt: cleanText(raw.translationUpdatedAt || raw.translationUpdateDate || raw.tradUpdatedAt || raw.updatedAt || raw.updateDate || raw.last_update || raw.lastUpdate),
    cover,
    banner,
    image: cover || banner,
    description: cleanText(raw.description || raw.desc),
    information: cleanText(raw.information || raw.informations || raw.info || raw.notes),
    tags: cleanTags(raw.tags),
    links: cleanLinks(id, raw.links),
    gallery,
    isGamePlus: true,
  };
}

export async function onRequest(context) {
  const { request } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (request.method !== 'GET') return json({ ok: false, error: 'Méthode non autorisée' }, 405);

  try {
    const loggedIn = await isLoggedIn(context);
    if (!loggedIn) return json({ ok: false, error: 'Connexion requise.', requiresLogin: true, items: [] }, 401);

    const doc = await fetchGamePlusDoc(context);
    const items = asItems(doc).map(cleanGame).filter(Boolean);
    return json({
      ok: true,
      version: doc?.version || 1,
      updatedAt: cleanText(doc?.updatedAt),
      count: items.length,
      items,
    });
  } catch (err) {
    return json({ ok: false, error: 'Impossible de récupérer Game+', detail: String(err?.message || err), items: [] }, 502);
  }
}
