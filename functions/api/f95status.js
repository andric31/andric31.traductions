// /functions/api/f95status.js  (Cloudflare Pages Function)
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

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    const f95Url = (url.searchParams.get("url") || "").trim();
    const storedTitle = (url.searchParams.get("storedTitle") || "").trim();

    if (!f95Url || f95Url.length > 1000) {
      return new Response(JSON.stringify({ ok: false, error: "url invalide" }), { status: 400, headers });
    }
    if (!storedTitle || storedTitle.length > 600) {
      return new Response(JSON.stringify({ ok: false, error: "storedTitle invalide" }), { status: 400, headers });
    }

    // sécurité minimale : on ne fetch que f95zone
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

    // Petit cache Cloudflare (30 min) pour éviter de refetch à chaque visite
    // Le cache contient { currentTitle } uniquement (sans storedTitle)
    const cacheKey = new Request("https://cache.local/f95status?u=" + encodeURIComponent(f95Url), request);
    const cache = caches.default;

    const cached = await cache.match(cacheKey);
    if (cached) {
      const data = await cached.json();

      const currentTitle = String(data?.currentTitle || "");
      const isUpToDate = clean(currentTitle) === clean(storedTitle);

      return new Response(
        JSON.stringify({
          ok: true,
          currentTitle,
          isUpToDate,
        }),
        { headers }
      );
    }

    // Fetch page F95
    const resp = await fetch(f95Url, {
      headers: {
        // UA simple (évite certains blocages)
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

    // Extraction simple H1 (comme extension : h1.p-title-value)
    // On prend le premier match.
    const m = html.match(/<h1[^>]*class="[^"]*\bp-title-value\b[^"]*"[^>]*>([\s\S]*?)<\/h1>/i);
    const raw = m ? m[1] : "";
    const currentTitle = clean(decodeHtml(stripTags(raw)));

    const payloadToCache = { currentTitle };

    // Met en cache la valeur actuelle 30 minutes
    await cache.put(
      cacheKey,
      new Response(JSON.stringify(payloadToCache), {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "public, max-age=1800",
        },
      })
    );

    const isUpToDate = clean(currentTitle) === clean(storedTitle);

    return new Response(
      JSON.stringify({
        ok: true,
        currentTitle,
        isUpToDate,
      }),
      { headers }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Exception Worker",
        detail: String(err?.message || err),
      }),
      { status: 500, headers }
    );
  }
}

// -------- helpers ----------

function stripTags(s) {
  return String(s || "").replace(/<[^>]+>/g, " ");
}

function decodeHtml(s) {
  // Décode entités nommées + numériques (&#...; et &#x...;)
  let out = String(s || "");

  // entités nommées courantes
  out = out
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/gi, " "); // IMPORTANT

  // entités numériques décimales
  out = out.replace(/&#(\d+);/g, (_, n) => {
    const code = Number(n);
    return Number.isFinite(code) ? String.fromCodePoint(code) : _;
  });

  // entités numériques hex
  out = out.replace(/&#x([0-9a-f]+);/gi, (_, hx) => {
    const code = parseInt(hx, 16);
    return Number.isFinite(code) ? String.fromCodePoint(code) : _;
  });

  return out;
}

function clean(str) {
  return String(str || "")
    .normalize("NFKC") // uniformise Unicode
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // vire les invisibles (ZW*, BOM)
    .replace(/[\u00A0\u202F\u2009]/g, " ") // espaces spéciaux -> espace
    .replace(/[‐-‒–—−]/g, "-") // tous les tirets -> "-"
    .replace(/\s+/g, " ")
    .trim();
}
