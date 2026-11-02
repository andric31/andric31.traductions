const CACHE_VERSION = 'gallery-v12-nested-posts';

export async function onRequest(context) {
  const { request } = context;
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'x-f95-gallery-version': CACHE_VERSION,
  };

  try {
    const url = new URL(request.url);
    const debug = url.searchParams.get('debug') === '1';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });

    const f95Url = String(url.searchParams.get('url') || '').trim();
    if (!f95Url) return json({ ok: false, error: 'url invalide' }, 400, headers);

    let u;
    try { u = new URL(f95Url); } catch {
      return json({ ok: false, error: 'url invalide' }, 400, headers);
    }
    if (!/^https?:$/.test(u.protocol) || u.username || u.password || !/^(?:www\.)?f95zone\.to$/i.test(u.hostname) || !/^\/threads\/(?:[^/]*\.)?\d+(?:\/|$)/i.test(u.pathname)) {
      return json({ ok: false, error: 'host non autorisé' }, 400, headers);
    }

    const cache = caches.default;
    const cacheKey = new Request(`https://cache.local/${CACHE_VERSION}/f95gallery?u=` + encodeURIComponent(f95Url), request);
    const cached = await cache.match(cacheKey);
    if (cached && !debug && url.searchParams.get("refresh") !== "1") return new Response(await cached.text(), { headers });

    const resp = await fetch(f95Url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; andric31-trad/1.0)',
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9,fr;q=0.8',
        'referer': 'https://f95zone.to/',
      },
    });
    if (!resp.ok) {
      return json({ ok: false, error: 'fetch F95 failed', status: resp.status }, 502, headers);
    }

    const html = await resp.text();
    const firstArticle = extractFirstPostArticle(html);
    const messageBody = extractContainerBlock(firstArticle, 'message-body');
    const rawBody = messageBody || extractContainerBlock(firstArticle, 'bbWrapper') || firstArticle;
    const clean = stripJunk(rawBody);
    // Compteurs uniquement : ne jamais exposer le HTML, les cookies ou les
    // informations de compte de la page reçue dans une réponse de diagnostic.
    const diagnostic = debug ? {
      upstreamStatus: resp.status,
      htmlLength: html.length,
      postFound: !!firstArticle,
      postLength: firstArticle.length,
      messageBodyFound: !!messageBody,
      pageImageTags: countImageTags(stripNonContentBlocks(html)),
      pageAttachmentUrls: countAttachmentUrls(html),
      postImageTags: countImageTags(firstArticle),
      rawBodyLength: rawBody.length,
      rawBodyImageTags: countImageTags(rawBody),
      rawBodyAttachmentUrls: countAttachmentUrls(rawBody),
      bodyLength: clean.length,
      imageTags: countImageTags(clean),
      bodyAttachmentUrls: countAttachmentUrls(clean),
      lightboxTags: matchAll(clean, /<[^>]*\bclass\s*=\s*["'][^"']*\bjs-lbImage\b[^"']*["'][^>]*>/gi).length,
    } : null;
    if (!firstArticle) return json({
      ok: false, error: 'Premier message F95 inaccessible', code: 'F95_POST_MISSING',
      ...(debug ? { diagnostic } : {}),
    }, 502, headers);

    const gallery = getThreadGalleryUrlsFromHtml(clean);
    const cover = getThreadHeaderImageUrl(html, gallery) || preferFreshUrl(gallery.filter(value => mediaKey(value) === mediaKey(gallery[0]))) || '';
    if (debug) Object.assign(diagnostic, {
      galleryUrls: gallery.length,
      galleryImages: new Set(gallery.map(mediaKey)).size,
      coverFound: !!cover,
    });
    if (!gallery.length && !cover) return json({
      ok: false, error: 'Aucune image de jeu trouvée dans la page reçue de F95', code: 'F95_IMAGES_MISSING',
      ...(debug ? { diagnostic } : {}),
    }, 502, headers);
    const payload = {
      ok: true,
      version: CACHE_VERSION,
      cover: cover || gallery[0] || '',
      gallery: dedupKeepOrder([...(cover ? [cover] : []), ...gallery]).slice(0, 80),
      originals: dedupKeepOrder([cover, ...gallery].filter(value => value && !isThumbnailUrl(value))).slice(0, 80),
      ...(debug ? { diagnostic } : {}),
    };

    const body = JSON.stringify(payload);
    const expirations = payload.gallery.map(value => {
      try { return imageExpiry(value) / 1000 || Infinity; }
      catch { return Infinity; }
    });
    const ttl = Math.max(0, Math.min(1800, Math.floor(Math.min(...expirations) - Date.now() / 1000 - 30)));
    if (!debug && payload.gallery.length && ttl > 0) await cache.put(
      cacheKey,
      new Response(body, {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': `public, max-age=${ttl}`,
        },
      })
    );
    return new Response(body, { headers });
  } catch (err) {
    return json({ ok: false, error: 'Exception Worker', detail: String(err?.message || err) }, 500, headers);
  }
}

function json(obj, status, headers) {
  return new Response(JSON.stringify({ ...obj, version: CACHE_VERSION }), { status, headers });
}

// Attributs simples, doubles ou non quotés ; les blocs imbriqués gardent
// leurs limites, notamment les captures rangées dans plusieurs spoilers.
const TAG_PATTERN = /<\/?([a-z][\w:-]*)\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi;

function extractFirstPostArticle(html) {
  // Le corps XenForo est lui-même un <article>. Ne pas tronquer le post à
  // la fermeture d'un article enfant (encart, citation ou contenu du corps).
  const source = stripNonContentBlocks(html);
  for (const className of ['message-threadStarterPost', 'message--post']) {
    const re = new RegExp('(?:^|\\s)' + className + '(?:\\s|$)', 'i');
    const range = findContainer(source, (attrs, name) => name === 'article' && re.test(attrs.class || ''));
    if (range) return source.slice(range.start, range.end);
  }
  return '';
}

function stripNonContentBlocks(html) {
  return String(html || '').replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)\b(?:"[^"]*"|'[^']*'|[^'">])*>[\s\S]*?<\/\1\s*>/gi, '');
}

function countImageTags(html) { return matchAll(html, /<img\b/gi).length; }
function countAttachmentUrls(html) { return matchAll(html, /(?:attachments|preview)\.f95zone\.to\//gi).length; }

function findContainer(html, matches) {
  const re = new RegExp(TAG_PATTERN.source, 'gi');
  let token;
  while ((token = re.exec(html))) {
    if (token[0].startsWith('</')) continue;
    const name = token[1].toLowerCase(), attrs = imageAttributes(token[0]);
    if (!matches(attrs, name)) continue;
    const start = token.index;
    if (/^(?:img|source|br|hr|input|meta|link)$/.test(name) || /\/\s*>$/.test(token[0])) return {start, end:re.lastIndex};
    let depth = 1, inner;
    while ((inner = re.exec(html))) {
      if (inner[1].toLowerCase() !== name) continue;
      if (inner[0].startsWith('</')) depth--;
      else if (!/\/\s*>$/.test(inner[0])) depth++;
      if (!depth) return {start, end:re.lastIndex};
    }
    return null;
  }
  return null;
}

function extractContainerBlock(html, className) {
  const re = new RegExp('(?:^|\\s)' + escapeRegExp(className) + '(?:\\s|$)', 'i');
  const range = findContainer(String(html || ''), attrs => re.test(attrs.class || ''));
  return range ? html.slice(range.start, range.end) : '';
}

function stripJunk(html) {
  let s = stripNonContentBlocks(html);
  const unwanted = /(?:^|\s)(?:bbCodeBlock--quote|message-signature|avatar|smilie|emoji)(?:\s|$)/i;
  let range;
  while ((range = findContainer(s, attrs => unwanted.test(attrs.class || '')))) s = s.slice(0, range.start) + s.slice(range.end);
  // Les spoilers sont du contenu du jeu : ne pas les supprimer.
  return s;
}

function getThreadHeaderImageUrl(html, gallery) {
  const fresh = value => {
    const url = upgradeF95Url(value);
    if (!url) return '';
    const same = gallery.filter(other => mediaKey(other) === mediaKey(url));
    return preferFreshUrl([url, ...same]);
  };
  for (const tag of matchAll(String(html || ''), /<meta\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi)) {
    const attrs = imageAttributes(tag[0]);
    if (!/^(?:og:image|twitter:image)$/i.test(attrs.property || attrs.name || '')) continue;
    const url = fresh(attrs.content);
    if (url) return url;
  }
  const header = extractContainerBlock(html, 'cover-thread');
  const attrs = imageAttributes(header.match(/^<[^>]+>/)?.[0] || '');
  return fresh((attrs.style || '').match(/background(?:-image)?\s*:[^;]*?url\(["']?(.*?)["']?\)/i)?.[1]);
}

function getThreadGalleryUrlsFromHtml(html) {
  const urls = [];
  let pictureDepth = 0;
  for (const tag of matchAll(String(html || ''), new RegExp(TAG_PATTERN.source, 'gi'))) {
    const name = tag[1].toLowerCase();
    if (name === 'picture') pictureDepth = Math.max(0, pictureDepth + (tag[0].startsWith('</') ? -1 : 1));
    if (tag[0].startsWith('</')) continue;
    const attrs = imageAttributes(tag[0]);
    const image = name === 'img' || (name === 'source' && (pictureDepth > 0 || /^image\//i.test(attrs.type || '')));
    const lightbox = /(?:^|\s)(?:js-lbImage|bbImageWrapper)(?:\s|$)/i.test(attrs.class || '');
    if (!image && !lightbox && !(name === 'a' && isAllowedImageUrl(attrs.href))) continue;
    if (/smilie|emoji|\bavatar(?:\b|[-_])/i.test(attrs.class || '')) continue;
    for (const key of ['data-url', 'data-original', 'data-src', 'data-lazy-src', ...(name === 'a' ? ['href'] : []), ...(image ? ['src'] : [])]) {
      const url = upgradeF95Url(attrs[key]);
      if (url && !isExpiredImage(url)) urls.push(url);
    }
    if (image) for (const key of ['data-srcset', 'srcset']) {
      if (/^\s*data:/i.test(attrs[key] || '')) continue;
      const candidates = String(attrs[key] || '').split(',').map(value => value.trim().split(/\s+/))
        .sort((a, b) => (parseFloat(b[1]) || 0) - (parseFloat(a[1]) || 0));
      for (const [value] of candidates) {
        const url = upgradeF95Url(value);
        if (url && !isExpiredImage(url)) urls.push(url);
      }
    }
  }
  // Garder les variantes complètes et miniatures : leurs signatures ne sont
  // pas interchangeables. Le navigateur choisit une variante utilisable.
  return dedupKeepOrder(urls);
}

function isThumbnailUrl(value) {
  try { const u = new URL(value); return /^(?:preview)\.f95zone\.to$/i.test(u.hostname) || /\/thumb\//i.test(u.pathname); }
  catch { return false; }
}
function mediaKey(value) {
  try {
    const u = new URL(value);
    if (/^(?:attachments|preview)\.f95zone\.to$/i.test(u.hostname)) return u.pathname.replace(/^(\/\d{4}\/\d{2})\/thumb\//i, '$1/');
    for (const key of ['h', 'e', 'u']) if (/(^|\.)f95zone\.to$/i.test(u.hostname)) u.searchParams.delete(key);
    return u.href;
  } catch { return value; }
}
function imageExpiry(value) {
  try {
    const u = new URL(value);
    if (!/(^|\.)f95zone\.to$/i.test(u.hostname)) return 0;
    const e = u.searchParams.get('e') || '';
    return /^\d{10}(?:\d{3})?$/.test(e) ? Number(e) * (e.length === 10 ? 1000 : 1) : 0;
  } catch { return 0; }
}
function isExpiredImage(value) { const expiry = imageExpiry(value); return !!expiry && expiry <= Date.now() + 1000; }
function preferFreshUrl(urls) {
  return urls.filter(value => value && !isExpiredImage(value)).reduce((best, value) => {
    if (!best) return value;
    if (imageExpiry(value) !== imageExpiry(best)) return imageExpiry(value) > imageExpiry(best) ? value : best;
    if (isThumbnailUrl(best) !== isThumbnailUrl(value)) return isThumbnailUrl(best) ? value : best;
    return best;
  }, '');
}

function imageAttributes(source) {
  const attrs = {};
  const re = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s'"=<>`]+))/g;
  let match;
  while ((match = re.exec(source))) {
    attrs[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attrs;
}

function dedupKeepOrder(list) {
  const out = [];
  const seen = new Set();
  for (const raw of list || []) {
    const u = String(raw || '').trim();
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

function isAllowedImageUrl(u) {
  const s = String(u || '').trim().toLowerCase();
  if (!s) return false;
  return /\.(jpg|jpeg|png|webp|gif|avif)(?:[?#].*)?$/.test(s);
}

function isPollutingUrl(u) {
  const s = String(u || '').trim().toLowerCase();
  if (!s) return true;
  try {
    const parsed = new URL(s);
    if (/(^|\.)f95zone\.to$/i.test(parsed.hostname) && /^\/(?:assets\/|styles\/)/i.test(decodeURIComponent(parsed.pathname))) return true;
  } catch { return true; }
  if (/\/data\/avatars?\//i.test(s)) return true;
  if (/^https?:\/\/(?:[^/]+\.)?gravatar\.com\/avatar\//i.test(s)) return true;
  if (/smilie|emoji|favicon|blank\.gif|loading\.gif/i.test(s.split(/[?#]/)[0])) return true;
  if (/\.(zip|rar|7z|pdf|txt)(?:[?#].*)?$/.test(s)) return true;
  return false;
}

function upgradeF95Url(u) {
  const s = String(u || '').trim();
  if (!s) return '';
  try {
    const url = new URL(decodeHtml(s), 'https://f95zone.to/');
    // Les images de remplissage ne sont jamais des médias de la galerie.
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return '';
    return isPollutingUrl(url.href) ? '' : url.href;
  } catch { return ''; }
}

function decodeHtml(s) {
  return String(s || '')
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (whole, value) => {
      const code = /^x/i.test(value) ? parseInt(value.slice(1), 16) : Number(value);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    })
    .replace(/&amp;/g, '&')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function matchAll(s, re) {
  const out = [];
  let m;
  while ((m = re.exec(s))) out.push(m);
  return out;
}

function escapeRegExp(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
