export async function onRequest(context) {
  const { request } = context;
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,OPTIONS",
    "access-control-allow-headers": "content-type",
  };

  try {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });

    const f95Url = String(url.searchParams.get("url") || "").trim();
    if (!f95Url) return json({ ok:false, error:"url invalide" }, 400, headers);

    let u;
    try { u = new URL(f95Url); } catch {
      return json({ ok:false, error:"url invalide" }, 400, headers);
    }
    if (!String(u.hostname || "").toLowerCase().endsWith("f95zone.to")) {
      return json({ ok:false, error:"host non autorisé" }, 400, headers);
    }

    const cache = caches.default;
    const cacheKey = new Request("https://cache.local/f95gallery?u=" + encodeURIComponent(f95Url), request);
    const cached = await cache.match(cacheKey);
    if (cached) return new Response(await cached.text(), { headers });

    const resp = await fetch(f95Url, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; andric31-trad/1.0)",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9,fr;q=0.8",
        "referer": "https://f95zone.to/",
      },
    });
    if (!resp.ok) return json({ ok:false, error:"fetch F95 failed", status:resp.status }, 502, headers);

    const html = await resp.text();
    const op = extractFirstPostWrapper(html);
    const cleanOp = stripSpoilers(op);

    const cover = getThreadMainImageUrlFromHtml(cleanOp);
    const gallery = getThreadGalleryUrlsFromHtml(cleanOp);
    const payload = {
      ok: true,
      cover: cover || gallery[0] || "",
      gallery: dedupKeepOrder([...(cover ? [cover] : []), ...gallery]).slice(0, 60),
    };

    const body = JSON.stringify(payload);
    await cache.put(cacheKey, new Response(body, { headers: { "content-type":"application/json; charset=utf-8", "cache-control":"public, max-age=1800" } }));
    return new Response(body, { headers });
  } catch (err) {
    return json({ ok:false, error:"Exception Worker", detail:String(err?.message || err) }, 500, headers);
  }
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers });
}

function extractFirstPostWrapper(html) {
  const s = String(html || "");
  const articleMatch = s.match(/<article[^>]*class="[^"]*message--post[^"]*"[\s\S]*?<div[^>]*class="[^"]*bbWrapper[^"]*"[^>]*>([\s\S]*?)<\/div>[\s\S]*?<\/article>/i);
  if (articleMatch?.[1]) return articleMatch[1];
  const wrapperMatch = s.match(/<div[^>]*class="[^"]*bbWrapper[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  return wrapperMatch?.[1] || s;
}

function stripSpoilers(html) {
  let s = String(html || "");
  // remove spoiler blocks to mirror extension logic as much as possible
  s = s.replace(/<div[^>]*class="[^"]*bbCodeSpoiler[^"]*"[^>]*>[\s\S]*?<\/div>/gi, "");
  s = s.replace(/<blockquote[^>]*class="[^"]*bbCodeSpoiler[^"]*"[^>]*>[\s\S]*?<\/blockquote>/gi, "");
  return s;
}

function getThreadMainImageUrlFromHtml(op) {
  try {
    const u1 = pickFromContainer(op, /<div[^>]*class="[^"]*lbContainer-zoomer[^"]*"[^>]*>[\s\S]*?<\/div>/i);
    if (u1) return u1;

    const u2 = pickFromContainer(op, /<div[^>]*class="[^"]*lbContainer(?!-zoomer)[^"]*"[^>]*>[\s\S]*?<\/div>/i);
    if (u2) return u2;

    const lightboxLinks = extractLightboxUrls(op);
    if (lightboxLinks.length) return lightboxLinks[0];

    const imgs = extractStandaloneImageUrls(op);
    return imgs[0] || "";
  } catch {
    return "";
  }
}

function pickFromContainer(op, regex) {
  const m = String(op || "").match(regex);
  if (!m?.[0]) return "";
  const block = m[0];

  const a = block.match(/<a[^>]*class="[^"]*js-lbImage[^"]*"[^>]*href="([^"]+)"/i);
  const href = upgradeF95Url(decodeHtml(a?.[1] || ""));
  if (href && !/\/thumb\//i.test(href)) return href;

  const img = block.match(/<img[^>]+(?:data-src|src)="([^"]+)"[^>]*>/i);
  const u = upgradeF95Url(decodeHtml(img?.[1] || ""));
  if (u && !/\/thumb\//i.test(u) && !/smilie|emoji/i.test(u)) return u;
  return "";
}

function getThreadGalleryUrlsFromHtml(op) {
  try {
    const urls = [];
    urls.push(...extractLightboxUrls(op));
    urls.push(...extractStandaloneImageUrls(op));
    return dedupKeepOrder(urls);
  } catch {
    return [];
  }
}

function extractLightboxUrls(html) {
  const out = [];
  const re = /<a[^>]*class="[^"]*js-lbImage[^"]*"[^>]*href="([^"]+)"/gi;
  let m;
  while ((m = re.exec(String(html || "")))) {
    const u = upgradeF95Url(decodeHtml(m[1]));
    if (!u || /\/thumb\//i.test(u)) continue;
    out.push(u);
  }
  return out;
}

function extractStandaloneImageUrls(html) {
  const out = [];
  const s = String(html || "");
  const re = /<img([^>]+)>/gi;
  let m;
  while ((m = re.exec(s))) {
    const tag = m[0];
    const attrs = m[1] || "";
    if (/smilie|emoji/i.test(tag)) continue;
    // skip imgs already wrapped by a js-lbImage link nearby? hard to know with regex; keep as fallback, dedup later
    const srcm = attrs.match(/(?:data-src|src)="([^"]+)"/i);
    const u = upgradeF95Url(decodeHtml(srcm?.[1] || ""));
    if (!u || /\/thumb\//i.test(u)) continue;
    out.push(u);
  }
  return out;
}

function dedupKeepOrder(list) {
  const out = [];
  const seen = new Set();
  for (const raw of list || []) {
    const u = String(raw || "").trim();
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

function upgradeF95Url(u) {
  const s = String(u || "").trim();
  if (!s) return "";
  if (s.startsWith("//")) return "https:" + s;
  if (s.startsWith("/")) return "https://f95zone.to" + s;
  return s.replace(/&amp;/g, "&");
}

function decodeHtml(s) {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
