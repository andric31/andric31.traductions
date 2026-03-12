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
    const firstPostHtml = extractFirstPostHtml(html);
    const gallery = dedupKeepOrder(extractGalleryUrls(firstPostHtml));
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

function extractFirstPostHtml(html) {
  const s = String(html || "");
  const m = s.match(/<article[^>]*class="[^"]*message--post[^"]*"[\s\S]*?<\/article>/i);
  if (m && m[0]) return m[0];
  const m2 = s.match(/<div[^>]*class="[^"]*message--post[^"]*"[\s\S]*?<\/article>/i);
  return m2 && m2[0] ? m2[0] : s;
}

function upgradeF95Url(url){
  try{
    url = decodeHtml(String(url||"").trim());
    if(!url) return "";
    if (url.startsWith('//')) url = 'https:' + url;
    url = url.replace(/^https:\/\/preview\.f95zone\.to\//i, "https://attachments.f95zone.to/");
    url = url.replace(/\/thumb\//i, "/");
    url = url
      .replace(/_300x169\./i, "_800x450.")
      .replace(/_460x259\./i, "_800x450.")
      .replace(/_600x338\./i, "_800x450.");
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

function isLikelyGalleryAsset(url){
  try{
    const u = new URL(url);
    const h = String(u.hostname || '').toLowerCase();
    if (!(h.endsWith('attachments.f95zone.to') || h.endsWith('preview.f95zone.to') || h.endsWith('f95zone.to'))) return false;
    const path = String(u.pathname || '').toLowerCase();
    if (path.includes('/smilies/')) return false;
    if (path.includes('/avatars/')) return false;
    if (path.includes('/icons/')) return false;
    if (!/(\.jpg|\.jpeg|\.png|\.webp|\.gif)(?:$|\?)/i.test(path) && !path.includes('/attachments/')) return false;
    return true;
  } catch {
    return false;
  }
}

function extractGalleryUrls(firstPostHtml){
  const s = String(firstPostHtml || '');
  const urls = [];
  const push = (raw) => {
    const u = upgradeF95Url(raw);
    if (!u || !isLikelyGalleryAsset(u)) return;
    urls.push(u);
  };

  // 1) URLs full des liens lightbox de l'OP
  for (const m of s.matchAll(/<a[^>]*class="[^"]*js-lbImage[^"]*"[^>]*href="([^"]+)"[^>]*>/gi)) {
    push(m[1]);
  }

  // 2) Data-src / src des images de l'OP
  for (const m of s.matchAll(/<img[^>]+(?:data-src|src)="([^"]+)"[^>]*>/gi)) {
    push(m[1]);
  }

  // 3) Fallback large : toute URL attachments/preview présente dans l'OP
  for (const m of s.matchAll(/https?:\/\/(?:attachments|preview)\.f95zone\.to\/[^"'\s<>]+/gi)) {
    push(m[0]);
  }

  return dedupKeepOrder(urls);
}

function decodeHtml(s) {
  let out = String(s || "");
  out = out.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/gi, " ");
  out = out.replace(/&#(\d+);/g, (_, n) => { const code = Number(n); return Number.isFinite(code) ? String.fromCodePoint(code) : _; });
  out = out.replace(/&#x([0-9a-f]+);/gi, (_, hx) => { const code = parseInt(hx, 16); return Number.isFinite(code) ? String.fromCodePoint(code) : _; });
  return out;
}
