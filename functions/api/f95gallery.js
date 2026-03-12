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
    if (!f95Url) return new Response(JSON.stringify({ ok:false, error:"url invalide" }), { status:400, headers });

    let u;
    try { u = new URL(f95Url); } catch {
      return new Response(JSON.stringify({ ok:false, error:"url invalide" }), { status:400, headers });
    }
    if (!String(u.hostname || "").toLowerCase().endsWith("f95zone.to")) {
      return new Response(JSON.stringify({ ok:false, error:"host non autorisé" }), { status:400, headers });
    }

    const cache = caches.default;
    const cacheKey = new Request("https://cache.local/f95gallery?u=" + encodeURIComponent(f95Url), request);
    const cached = await cache.match(cacheKey);
    if (cached) return new Response(await cached.text(), { headers });

    const resp = await fetch(f95Url, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; andric31-trad/1.0)",
        accept: "text/html,*/*",
      },
    });
    if (!resp.ok) return new Response(JSON.stringify({ ok:false, error:"fetch F95 failed", status:resp.status }), { status:502, headers });

    const html = await resp.text();
    const op = extractFirstPost(html);
    const gallery = dedupKeepOrder([
      ...extractLightboxUrls(op),
      ...extractImageUrls(op),
      ...extractPreviewUrls(op),
    ]).slice(0, 25);

    const payload = JSON.stringify({ ok:true, cover: gallery[0] || "", gallery });
    await cache.put(cacheKey, new Response(payload, { headers: { "content-type":"application/json; charset=utf-8", "cache-control":"public, max-age=1800" } }));
    return new Response(payload, { headers });
  } catch (err) {
    return new Response(JSON.stringify({ ok:false, error:"Exception Worker", detail:String(err?.message || err) }), { status:500, headers });
  }
}

function extractFirstPost(html) {
  const s = String(html || "");
  const m = s.match(/<article[^>]*class="[^"]*message--post[^"]*"[\s\S]*?<div[^>]*class="[^"]*bbWrapper[^"]*"[^>]*>([\s\S]*?)<\/div>[\s\S]*?<\/article>/i);
  if (m && m[1]) return m[1];
  const m2 = s.match(/<div[^>]*class="[^"]*bbWrapper[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  return m2 ? m2[1] : s;
}

function extractLightboxUrls(html) {
  const out = [];
  const re = /<a[^>]*class="[^"]*js-lbImage[^"]*"[^>]*href="([^"]+)"/gi;
  let m;
  while ((m = re.exec(html))) {
    const u = upgradeF95Url(decodeHtml(m[1]));
    if (!u || /\/thumb\//i.test(u)) continue;
    out.push(u);
  }
  return out;
}

function extractImageUrls(html) {
  const out = [];
  const re = /<img[^>]+(?:data-src|src)="([^"]+)"[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const u = upgradeF95Url(decodeHtml(m[1]));
    if (!u || /\/thumb\//i.test(u)) continue;
    if (/smilie|emoji/i.test(u)) continue;
    out.push(u);
  }
  return out;
}

function extractPreviewUrls(html) {
  const out = [];
  const re = /https?:\/\/attachments\.f95zone\.to\/[^"'\s<>]+/gi;
  const m = html.match(re) || [];
  for (const raw of m) {
    const u = upgradeF95Url(raw);
    if (u) out.push(u);
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
