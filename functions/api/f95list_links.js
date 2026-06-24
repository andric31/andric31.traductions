// /functions/api/f95list_links.js
// Renvoie uniquement les infos privées nécessaires à UNE fiche jeu, sans exposer les vrais liens.

const DEFAULT_PRIVATE_OWNER = 'andric31';
const DEFAULT_PRIVATE_REPO = 'f95list_private_links';
const DEFAULT_PRIVATE_BRANCH = 'main';
const DEFAULT_PRIVATE_PATH = 'f95list_links.json';

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

async function fetchPrivateLinksDoc(context) {
  const owner = getEnv(context, 'PRIVATE_LINKS_OWNER', DEFAULT_PRIVATE_OWNER);
  const repo = getEnv(context, 'PRIVATE_LINKS_REPO', DEFAULT_PRIVATE_REPO);
  const branch = getEnv(context, 'PRIVATE_LINKS_BRANCH', DEFAULT_PRIVATE_BRANCH);
  const path = getEnv(context, 'PRIVATE_LINKS_PATH', DEFAULT_PRIVATE_PATH).replace(/^\/+/, '');
  const token = getToken(context);

  if (!token) throw new Error('Token GitHub privé manquant. Ajoute GITHUB_PRIVATE_TOKEN dans les variables Cloudflare Pages.');

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
  if (!resp.ok) throw new Error(`GitHub privé HTTP ${resp.status}`);
  const data = await resp.json();
  const encoded = String(data?.content || '').replace(/\s/g, '');
  if (!encoded) throw new Error('Fichier privé vide ou illisible');
  return JSON.parse(decodeBase64Utf8(encoded));
}

function getItem(doc, key) {
  const k = String(key || '').trim();
  const items = doc?.items && typeof doc.items === 'object' ? doc.items : doc;
  if (!items || typeof items !== 'object') return null;
  return items[k] || null;
}

function hasValue(v) {
  if (Array.isArray(v)) return v.length > 0;
  if (v && typeof v === 'object') return Object.keys(v).length > 0;
  return String(v || '').trim() !== '';
}

function hostLabel(rawUrl, fallback = 'Lien') {
  try {
    const host = new URL(String(rawUrl || '')).hostname.toLowerCase();
    if (host.includes('mega.nz')) return 'MEGA';
    if (host.includes('drive.google')) return 'Google Drive';
    if (host.includes('gofile')) return 'Gofile';
    if (host.includes('f95zone')) return 'F95Zone';
  } catch {}
  return String(fallback || 'Lien').trim() || 'Lien';
}

function proxyUrl(key, type, index = null) {
  const qs = new URLSearchParams({ key, type });
  if (index !== null && index !== undefined) qs.set('index', String(index));
  return `/api/link?${qs.toString()}`;
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

function cleanPublicLinkList(list) {
  if (!Array.isArray(list)) return [];
  return list.map((x) => {
    const name = typeof x === 'string' ? '' : String(x?.name || x?.host || 'Lien').trim();
    const link = typeof x === 'string' ? String(x || '').trim() : String(x?.link || x?.url || '').trim();
    const host = typeof x === 'string' ? hostLabel(x, name || 'Lien') : String(x?.host || hostLabel(link, name || 'Lien')).trim();
    if (!link) return null;

    const out = { name: name || host || 'Lien', host: host || name || 'Lien', link };
    if (x && typeof x === 'object') {
      const version = String(x.version || '').trim();
      const platform = String(x.platform || '').trim();
      const section = String(x.section || '').trim();
      const mainSection = String(x.mainSection || x.group || '').trim();
      const sourceLine = String(x.sourceLine || x.context || '').trim();
      if (version) out.version = version;
      if (platform) out.platform = platform;
      if (section) out.section = section;
      if (mainSection) out.mainSection = mainSection;
      if (sourceLine) out.sourceLine = sourceLine;
    }
    return out;
  }).filter(Boolean);
}

function cleanF95ExtraInfos(list) {
  if (!Array.isArray(list)) return [];
  return list.map((x) => {
    if (typeof x === 'string') {
      const raw = x.trim();
      if (!raw) return null;
      const parts = raw.split(/\s*:\s*/);
      return parts.length > 1
        ? { name: parts.shift().trim() || 'Info', value: parts.join(': ').trim() }
        : { name: 'Info', value: raw };
    }
    if (!x || typeof x !== 'object') return null;
    const name = String(x.name || x.label || 'Info').trim() || 'Info';
    const value = String(x.value || x.text || '').trim();
    if (!value && !name) return null;
    return { name, value };
  }).filter(Boolean);
}

function cleanF95Info(info) {
  if (!info || typeof info !== 'object' || Array.isArray(info)) return null;
  const out = {
    threadUpdated: String(info.threadUpdated || info.updatedAt || '').trim(),
    lastEdited: String(info.lastEdited || info.lastEditedAt || info.lastEdit || info.editedAt || info.last_edited || '').trim(),
    releaseDate: String(info.releaseDate || '').trim(),
    developer: String(info.developer || '').trim(),
    developerLinks: cleanPublicLinkList(info.developerLinks),
    status: String(info.status || '').trim(),
    engine: String(info.engine || '').trim(),
    version: String(info.version || '').trim(),
    censored: String(info.censored || '').trim(),
    os: String(info.os || '').trim(),
    extraInfos: cleanF95ExtraInfos(info.extraInfos),
    threadLinks: cleanPublicLinkList(info.threadLinks || info.links || info.downloadLinks),
  };
  const hasText = ['threadUpdated', 'lastEdited', 'releaseDate', 'developer', 'status', 'engine', 'version', 'censored', 'os']
    .some((k) => String(out[k] || '').trim());
  const hasLinks = out.developerLinks.length > 0 || out.threadLinks.length > 0;
  const hasExtra = out.extraInfos.length > 0;
  return (hasText || hasLinks || hasExtra) ? out : null;
}

export async function onRequest(context) {
  const { request } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (request.method !== 'GET') return json({ ok: false, error: 'Méthode non autorisée' }, 405);

  try {
    const url = new URL(request.url);
    const key = (url.searchParams.get('key') || '').trim();
    if (!key) return json({ ok: false, error: 'Paramètre key manquant' }, 400);

    const doc = await fetchPrivateLinksDoc(context);
    const item = getItem(doc, key);
    if (!item) return json({ ok: false, found: false, key });

    const loggedIn = await isLoggedIn(context);
    const f95Info = loggedIn ? cleanF95Info(item.f95Info) : null;

    const extrasRaw = Array.isArray(item.translationsExtra) ? item.translationsExtra : [];
    const translationsExtra = extrasRaw.map((x, index) => {
      let name = 'Lien';
      let link = '';
      if (typeof x === 'string') link = x.trim();
      else if (x && typeof x === 'object') {
        name = String(x.name || 'Lien').trim() || 'Lien';
        link = String(x.link || x.url || '').trim();
      }
      if (!link) return null;
      return {
        name,
        host: hostLabel(link, name),
        link: proxyUrl(key, 'translationsExtra', index),
      };
    }).filter(Boolean);

    return json({
      ok: true,
      found: true,
      key,
      translationType: String(item.translationType || '').trim(),
      description: String(item.description || '').trim(),
      notes: String(item.notes || '').trim(),
      f95Info,
      f95InfoRequiresLogin: !loggedIn && hasValue(item.f95Info),
      discordlink: hasValue(item.discordlink) ? proxyUrl(key, 'discordlink') : '',
      translation: hasValue(item.translation) ? proxyUrl(key, 'translation') : '',
      translationsArchive: hasValue(item.translationsArchive) ? proxyUrl(key, 'translationsArchive') : '',
      translationsExtra,
      hasDiscord: hasValue(item.discordlink),
      hasTranslation: hasValue(item.translation),
      hasTranslationsArchive: hasValue(item.translationsArchive),
      hasTranslationsExtra: translationsExtra.length > 0,
      hasDescription: hasValue(item.description),
      hasNotes: hasValue(item.notes),
      hasF95Info: hasValue(item.f95Info),
    });
  } catch (err) {
    return json({ ok: false, error: 'Impossible de récupérer les infos privées', detail: String(err?.message || err) }, 502);
  }
}
