// /functions/api/link.js
// Redirection protégée vers les liens privés d'un jeu.
// Source privée : GitHub privé andric31/f95list_private_links/f95list_links.json
import { getDiscordExclusivity } from './_discord_exclusive.js';
import { validKey, category } from './_r2.js';
import { preview } from './_r2_explorer.js';

import { fetchPrivateLinksDoc } from './_list_sources.js';

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

    if (type !== 'discordlink' && await getDiscordExclusivity(context, key, item)) {
      return json({ ok: false, error: 'Traduction disponible exclusivement sur Discord.' }, 403);
    }

    let target = '';
    if (type === 'translationsExtra') target = getExtraLink(item, index);
    else target = String(item[type] || '').trim();

    if (!target) return json({ ok: false, error: 'Lien demandé introuvable' }, 404);
    if (!isAllowedUrl(target)) return json({ ok: false, error: 'Lien invalide' }, 400);

    if(type === 'cloudflareTranslation') {
      const stored=new URL(target),origin=new URL(request.url).origin;
      if(stored.origin!==origin || !stored.pathname.startsWith('/medias/traductions/') || stored.search || stored.hash)
        return json({ok:false,error:'Lien Cloudflare invalide'},400);
      const objectKey=decodeURIComponent(stored.pathname.slice('/medias/'.length));
      if(!validKey(objectKey)||category(objectKey)!=='archive')return json({ok:false,error:'Archive Cloudflare invalide'},400);
      if(!context.env.MEDIA_BUCKET)return json({ok:false,error:'Cloudflare indisponible'},503);
      // Same game authorization as every other translation, checked above.
      // /medias/ itself remains restricted for archives; no public bypass.
      return await preview(request,context.env.MEDIA_BUCKET,objectKey,true);
    }
    return Response.redirect(target, 302);
  } catch (err) {
    return json({ ok: false, error: 'Impossible de récupérer le lien privé', detail: String(err?.message || err) }, 502);
  }
}
