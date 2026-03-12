// /functions/api/f95gallery.js
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
    const reqUrl = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    const f95Url = (reqUrl.searchParams.get("url") || "").trim();
    if (!f95Url || f95Url.length > 1000) {
      return new Response(JSON.stringify({ ok: false, error: "url invalide" }), { status: 400, headers });
    }

    let u;
    try {
      u = new URL(f95Url);
    } catch {
      return new Response(JSON.stringify({ ok: false, error: "url invalide" }), { status: 400, headers });
    }

    const host = (u.hostname || "").toLowerCase();
    if (!host.endsWith("f95zone.to")) {
      return new Response(JSON.stringify({ ok: false, error: "host non autorisé" }), { status: 400, headers });
    }

    const cacheKey = new Request("https://cache.local/f95gallery?u=" + encodeURIComponent(f95Url), request);
    const cache = caches.default;
    const cached = await cache.match(cacheKey);
    if (cached) {
      const data = await cached.json();
      return new Response(JSON.stringify({ ok: true, ...(data || {}) }), { headers });
    }

    const resp = await fetch(f95Url, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; andric31-trad/1.0)",
        accept: "text/html,*/*",
      },
    });

    if (!resp.ok) {
      return new Response(
        JSON.stringify({ ok: false, error: "fetch F95 failed", status: resp.status }),
        { status: 502, headers }
      );
    }

    const html = await resp.text();
    const payloadToCache = extractGalleryPayload(html);

    await cache.put(
      cacheKey,
      new Response(JSON.stringify(payloadToCache), {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "public, max-age=1800",
        },
      })
    );

    return new Response(JSON.stringify({ ok: true, ...payloadToCache }), { headers });
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: "Exception Worker", detail: String(err?.message || err) }),
      { status: 500, headers }
    );
  }
}

function extractGalleryPayload(html) {
  const opHtml = extractFirstPostHtml(html);
  const urls = [];

  const lbRe = /<a[^>]*class="[^"]*js-lbImage[^"]*"[^>]*href="([^"]+)"[^>]*>/gi;
  let m;
  while ((m = lbRe.exec(opHtml))) {
    const href = cleanupUrl(m[1]);
    if (!href || /\/thumb\//i.test(href)) continue;
    urls.push(upgradeF95Url(href));
  }

  const imgRe = /<img[^>]+(?:data-src|src)="([^"]+)"[^>]*>/gi;
  while ((m = imgRe.exec(opHtml))) {
    const img = cleanupUrl(m[1]);
    if (!img || /\/thumb\//i.test(img)) continue;
    urls.push(upgradeF95Url(img));
  }

  const gallery = dedupKeepOrder(urls).filter((u) => /^https?:\/\//i.test(u)).slice(0, 25);
  return {
    main: gallery[0] || "",
    gallery,
    count: gallery.length,
  };
}

function extractFirstPostHtml(html) {
  const s = String(html || "");
  const r1 = s.match(/<article[^>]*class="[^"]*message--post[^"]*"[\s\S]*?<div[^>]*class="[^"]*bbWrapper[^"]*"[^>]*>([\s\S]*?)<\/div>[\s\S]*?<\/article>/i);
  if (r1?.[1]) return r1[1];
  const r2 = s.match(/<div[^>]*class="[^"]*message--post[^"]*"[\s\S]*?<div[^>]*class="[^"]*bbWrapper[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  if (r2?.[1]) return r2[1];
  const r3 = s.match(/<div[^>]*class="[^"]*bbWrapper[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  return r3?.[1] || s;
}

function cleanupUrl(s) {
  let out = decodeHtml(String(s || "").trim());
  if (!out) return "";
  if (out.startsWith("//")) out = "https:" + out;
  return out;
}

function upgradeF95Url(url) {
  let out = String(url || "").trim();
  if (!out) return "";
  out = out.replace(/^https:\/\/preview\.f95zone\.to\//i, "https://attachments.f95zone.to/");
  out = out.replace(/^http:\/\/preview\.f95zone\.to\//i, "https://attachments.f95zone.to/");
  return out;
}

function dedupKeepOrder(arr) {
  const seen = new Set();
  const out = [];
  for (const raw of arr || []) {
    const u = String(raw || "").trim();
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

function decodeHtml(s) {
  let out = String(s || "");
  out = out
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/gi, " ");

  out = out.replace(/&#(\d+);/g, (_, n) => {
    const code = Number(n);
    return Number.isFinite(code) ? String.fromCodePoint(code) : _;
  });

  out = out.replace(/&#x([0-9a-f]+);/gi, (_, hx) => {
    const code = parseInt(hx, 16);
    return Number.isFinite(code) ? String.fromCodePoint(code) : _;
  });

  return out;
}
