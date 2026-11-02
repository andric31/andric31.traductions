const CACHE_VERSION = 'gallery-v14-fast-gallery';

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

    const threadId = u.pathname.match(/^\/threads\/(?:[^/]*\.)?(\d+)(?:\/|$)/i)[1];
    const cache = caches.default;
    const cacheKey = new Request(`https://cache.local/${CACHE_VERSION}/f95gallery?thread=` + threadId, request);
    const cached = await cache.match(cacheKey);
    if (cached && !debug && url.searchParams.get("refresh") !== "1") return new Response(await cached.text(), { headers });
    const deadline = Date.now() + 10500;
    const remaining = limit => Math.max(1, Math.min(limit, deadline - Date.now()));

    // Le titre de la fiche permet d'éviter le téléchargement préalable du
    // sujet. L'identifiant exact reste obligatoire pour accepter le résultat.
    const latest = { attempted: false, status: 0, matched: false, images: 0, timedOut: false };
    const titleQuery = latestUpdatesQuery('', String(url.searchParams.get('title') || '').slice(0, 300));
    const directMedia = titleQuery ? await fetchLatestUpdatesMedia(threadId, titleQuery, latest, remaining(6000)) : {cover:'', gallery:[]};
    const threadSkipped = new Set(directMedia.gallery.map(mediaKey)).size >= 2;
    let html = '', upstreamStatus = 0;
    if (!threadSkipped) {
      const threadController = new AbortController();
      const threadTimer = setTimeout(() => threadController.abort(), remaining(4000));
      try {
        const resp = await fetch(f95Url, {
          headers: {
            'user-agent': 'Mozilla/5.0 (compatible; andric31-trad/1.0)',
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'accept-language': 'en-US,en;q=0.9,fr;q=0.8',
            'referer': 'https://f95zone.to/',
          },
          signal: threadController.signal,
        });
        upstreamStatus = resp.status;
        if (!resp.ok) {
          if (!directMedia.gallery.length) return json({ ok: false, error: 'fetch F95 failed', status: resp.status }, 502, headers);
        } else html = await resp.text();
      } catch {
        if (!directMedia.gallery.length) return json({ ok: false, error: 'Récupération du message F95 indisponible', code: threadController.signal.aborted ? 'F95_TIMEOUT' : 'F95_FETCH_FAILED' }, 502, headers);
      } finally {
        clearTimeout(threadTimer);
      }
    }
    const firstArticle = extractFirstPostArticle(html);
    const messageBody = extractContainerBlock(firstArticle, 'message-body');
    const rawBody = messageBody || extractContainerBlock(firstArticle, 'bbWrapper') || firstArticle;
    const clean = stripJunk(rawBody);
    // Compteurs uniquement : ne jamais exposer le HTML, les cookies ou les
    // informations de compte de la page reçue dans une réponse de diagnostic.
    const diagnostic = debug ? {
      upstreamStatus,
      threadSkipped,
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
    let gallery = getThreadGalleryUrlsFromHtml(clean);
    let cover = getThreadHeaderImageUrl(html, gallery) || preferFreshUrl(gallery.filter(value => mediaKey(value) === mediaKey(gallery[0]))) || '';
    let source = 'thread';
    // Le HTML invité peut omettre toutes les images du message. Latest Updates
    // expose séparément cover/screens : utiliser uniquement la ligne du même
    // thread_id, jamais le premier résultat de recherche ni un titre approchant.
    if (new Set([cover, ...gallery].filter(Boolean).map(mediaKey)).size < 2) {
      const pageQuery = latestUpdatesQuery(html);
      let media = directMedia;
      if (!threadSkipped && pageQuery && (!latest.attempted || pageQuery !== titleQuery)) {
        const recovered = await fetchLatestUpdatesMedia(threadId, pageQuery, latest, remaining(6000));
        if (recovered.gallery.length) media = recovered;
      }
      if (media.gallery.length) {
        const retained = gallery.filter(value => mediaKey(value) !== mediaKey(cover));
        gallery = dedupKeepOrder([...media.gallery, ...retained]);
        cover = media.cover || cover || gallery[0] || '';
        source = retained.length ? 'thread+latest-updates' : 'latest-updates';
      }
    }
    if (debug) Object.assign(diagnostic, {
      galleryUrls: gallery.length,
      galleryImages: new Set(gallery.map(mediaKey)).size,
      coverFound: !!cover,
      latestAttempted: latest.attempted,
      latestStatus: latest.status,
      latestMatched: latest.matched,
      latestImageUrls: latest.images,
      latestTimedOut: latest.timedOut,
    });
    if (!gallery.length && !cover) return json({
      ok: false,
      error: firstArticle ? 'Aucune image de jeu trouvée dans les sources F95 disponibles' : 'Premier message F95 inaccessible',
      code: firstArticle ? 'F95_IMAGES_MISSING' : 'F95_POST_MISSING',
      ...(debug ? { diagnostic } : {}),
    }, 502, headers);
    const payload = {
      ok: true,
      version: CACHE_VERSION,
      source,
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

function latestUpdatesQuery(html, knownTitle = '') {
  const source = stripNonContentBlocks(html);
  let heading = knownTitle || extractContainerBlock(source, 'p-title-value');
  let prefix;
  while ((prefix = findContainer(heading, attrs => /(?:^|\s)p-title-prefix(?:\s|$)/i.test(attrs.class || '')))) {
    heading = heading.slice(0, prefix.start) + heading.slice(prefix.end);
  }
  if (!heading) {
    for (const tag of matchAll(source, /<meta\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi)) {
      const attrs = imageAttributes(tag[0]);
      if ((attrs.property || '').toLowerCase() === 'og:title') { heading = attrs.content || ''; break; }
    }
  }
  // Pas de recherche avec le titre d'une page de connexion/erreur générique.
  if (!heading) return '';
  const title = decodeHtml(heading.replace(/<[^>]*>/g, ' '))
    .replace(/\[[^\]]*\]/g, ' ').replace(/\s*\|\s*F95zone[\s\S]*$/i, '')
    .replace(/^(?:(?:VN|HTML|Ren['’]?Py|RPGM|Unity|Unreal Engine|Godot|Flash|Java|Others)\s*-\s*)+/i, '')
    .replace(/['’]s\b/gi, '');
  const words = title.match(/[\p{L}\p{N}]+/gu) || [];
  const stop = new Set(['a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'if', 'in', 'into', 'is', 'it', 'no', 'not', 'of', 'on', 'or', 'such', 'that', 'the', 'their', 'then', 'there', 'these', 'they', 'this', 'to', 'was', 'will', 'with']);
  const significant = words.filter(word => !stop.has(word.toLowerCase()));
  // Latest Updates attend une recherche courte. Garder des mots complets
  // plutôt que couper au milieu d'un mot d'un titre long.
  let query = '';
  for (const word of significant.length ? significant : words) {
    const next = query ? query + ' ' + word : word;
    if (next.length > 30) return query || word.slice(0, 30);
    query = next;
  }
  return query;
}

async function fetchLatestUpdatesMedia(threadId, query, diagnostic, timeout = 6000) {
  const empty = { cover: '', gallery: [] };
  if (!query) return empty;
  const endpoint = new URL('https://f95zone.to/sam/latest_alpha/latest_data.php');
  for (const [key, value] of Object.entries({cmd:'list', cat:'games', page:'1', search:query, sort:'likes', rows:'90'})) endpoint.searchParams.set(key, value);
  Object.assign(diagnostic, { attempted:true, status:0, matched:false, images:0, timedOut:false });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(endpoint.href, {
      headers: { 'accept': 'application/json', 'user-agent': 'andric31-trad-gallery/1.0', 'referer': 'https://f95zone.to/sam/latest_alpha/' },
      signal: controller.signal,
    });
    diagnostic.status = response.status;
    if (!response.ok) return empty;
    const data = await response.json();
    if (data?.status !== 'ok' || !Array.isArray(data?.msg?.data)) return empty;
    const row = data.msg.data.find(item => item && String(item.thread_id) === threadId);
    if (!row) return empty;
    diagnostic.matched = true;
    const usable = value => {
      if (typeof value !== 'string') return '';
      const url = upgradeF95Url(value);
      return url && !isExpiredImage(url) ? url : '';
    };
    const cover = usable(row.cover);
    const screens = Array.isArray(row.screens) ? row.screens.slice(0, 80).map(usable).filter(Boolean) : [];
    const gallery = dedupKeepOrder([cover, ...screens].filter(Boolean));
    diagnostic.images = new Set(gallery.map(mediaKey)).size;
    return { cover, gallery };
  } catch {
    diagnostic.timedOut = controller.signal.aborted;
    return empty;
  } finally {
    clearTimeout(timer);
  }
}

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
