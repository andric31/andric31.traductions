// /functions/api/f95list.js
// Proxy/cache Cloudflare pour f95list.json.
// Le site garde GitHub en source principale côté navigateur, mais peut appeler cette route en secours.

const GITHUB_F95LIST_URL = 'https://raw.githubusercontent.com/andric31/f95list/main/f95list.json';
const CACHE_VERSION = 'f95list-v1';

export async function onRequest(context) {
  const { request } = context;
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,OPTIONS',
    'access-control-allow-headers': 'content-type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ ok: false, error: 'Méthode non autorisée' }), { status: 405, headers });
  }

  const cache = caches.default;
  const cacheKey = new Request(`https://cache.local/${CACHE_VERSION}/f95list.json`, request);

  try {
    const resp = await fetch(GITHUB_F95LIST_URL, {
      headers: {
        'accept': 'application/json,text/plain,*/*',
        'user-agent': 'Mozilla/5.0 (compatible; andric31-trad/1.0)',
      },
      cf: { cacheTtl: 300, cacheEverything: true },
    });

    if (resp.ok) {
      const text = await resp.text();
      // Vérification minimale : si GitHub renvoie une erreur HTML, on ne la met pas en cache.
      JSON.parse(text);

      await cache.put(
        cacheKey,
        new Response(text, {
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'public, max-age=86400',
          },
        })
      );

      return new Response(text, { headers });
    }

    throw new Error(`GitHub HTTP ${resp.status}`);
  } catch (err) {
    const cached = await cache.match(cacheKey);
    if (cached) {
      const text = await cached.text();
      return new Response(text, {
        headers: {
          ...headers,
          'x-andric31-f95list-source': 'cloudflare-cache',
        },
      });
    }

    return new Response(
      JSON.stringify({ ok: false, error: 'f95list indisponible sur GitHub et aucun cache Cloudflare disponible', detail: String(err?.message || err) }),
      { status: 502, headers }
    );
  }
}
