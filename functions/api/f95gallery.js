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
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });

    const f95Url = String(url.searchParams.get("url") || "").trim();
    if (!f95Url || f95Url.length > 1000) {
      return new Response(JSON.stringify({ ok:false, error:"url invalide" }), { status:400, headers });
    }

    let u;
    try { u = new URL(f95Url); } catch {
      return new Response(JSON.stringify({ ok:false, error:"url invalide" }), { status:400, headers });
    }
    const host = String(u.hostname || "").toLowerCase();
    if (!host.endsWith("f95zone.to")) {
      return new Response(JSON.stringify({ ok:false, error:"host non autorisé" }), { status:400, headers });
    }

    const cacheKey = new Request("https://cache.local/f95gallery?u=" + encodeURIComponent(f95Url), request);
    const cache = caches.default;
    const cached = await cache.match(cacheKey);
    if (cached) return new Response(await cached.text(), { headers });

    const resp = await fetch(f95Url, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; andric31-trad/1.0)",
        accept: "text/html,*/*",
      },
    });

    if (!resp.ok) {
      return new Response(JSON.stringify({ ok:false, error:"fetch F95 failed", status:resp.status }), { status:502, headers });
    }

    const html = await resp.text();
    const opHtml = extractOpHtml(html);
    const gallery = dedupKeepOrder(extractGalleryUrls(opHtml));
    const payload = JSON.stringify({ ok:true, gallery });

    await cache.put(cacheKey, new Response(payload, {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=1800",
      },
    }));

    return new Response(payload, { headers });
  } catch (err) {
    return new Response(JSON.stringify({ ok:false, error:"Exception Worker", detail:String(err?.message || err) }), { status:500, headers });
  }
}

function extractOpHtml(html) {
  const s = String(html || "");
  const m = s.match(/<article[^>]*class="[^"]*message--post[^"]*"[\s\S]*?<div[^>]*class="[^"]*bbWrapper[^"]*"[^>]*>([\s\S]*?)<\/div>[\s\S]*?<\/article>/i);
  if (m && m[1]) return m[1];
  const m2 = s.match(/<div[^>]*class="[^"]*bbWrapper[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  return m2 && m2[1] ? m2[1] : s;
}

function upgradeF95Url(url){
  try{
    url = String(url||"").trim();
    if(!url) return "";
    url = url.replace(/^https:\/\/preview\.f95zone\.to\//i, "https://attachments.f95zone.to/");
    url = url.replace(/\/thumb\//i, "/");
    url = url.replace(/_300x169\./i, "_800x450.").replace(/_460x259\./i, "_800x450.").replace(/_600x338\./i, "_800x450.");
    return url;
  }catch{ return String(url||"").trim(); }
}

function dedupKeepOrder(arr){
  const seen = new Set();
  return (arr||[]).map(u=>String(u||"").trim()).filter(u=>{
    if(!u) return false;
    if(seen.has(u)) return false;
    seen.add(u);
    return true;
  });
}

function extractGalleryUrls(opHtml){
  const s = String(opHtml || "");
  const urls = [];
  const reLinks = /<a[^>]*class="[^"]*js-lbImage[^"]*"[^>]*href="([^"]+)"[^>]*>/gi;
  let m;
  while ((m = reLinks.exec(s))) {
    const href = String(m[1] || "").trim();
    if (!href || /\/thumb\//i.test(href)) continue;
    urls.push(upgradeF95Url(decodeHtml(href)));
  }
  const reImgs = /<img[^>]+(?:data-src|src)="([^"]+)"[^>]*>/gi;
  while ((m = reImgs.exec(s))) {
    const u = String(m[1] || "").trim();
    if (!u || /\/thumb\//i.test(u)) continue;
    urls.push(upgradeF95Url(decodeHtml(u)));
  }
  return urls;
}

function decodeHtml(s) {
  let out = String(s || "");
  out = out.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/gi, " ");
  out = out.replace(/&#(\d+);/g, (_, n) => { const code = Number(n); return Number.isFinite(code) ? String.fromCodePoint(code) : _; });
  out = out.replace(/&#x([0-9a-f]+);/gi, (_, hx) => { const code = parseInt(hx, 16); return Number.isFinite(code) ? String.fromCodePoint(code) : _; });
  return out;
}
