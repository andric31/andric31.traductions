// URL publiques sans slash final. Les index restent à leur emplacement actuel.
// next(request) conserve la chaîne de middleware, notamment la protection admin-r2.
const DIRECTORY_PAGES = new Set([
  "/_Redirection",
  "/admin-r2",
  "/blog",
  "/compte",
  "/connexion",
  "/confidentialite",
  "/mentions-legales",
  "/regles-communaute",
  "/creator",
  "/evenements",
  "/game",
  "/game+",
  "/comics",
  "/dramas",
  "/labo",
  "/messages",
  "/notifications",
  "/stats",
  "/ticket",
  "/top-jeux",
  "/wiki"
]);
const FILE_PAGES = new Set([
  "/+annonce maintenance/annonce",
  "/annonce",
  "/annonce(extentions-relecteur)",
  "/annonce(vierge)",
  "/blog/_fin-des-tests-en-vue",
  "/blog/_index - original",
  "/blog/_news-de-fevrier",
  "/blog/bienvenue-sur-andric31",
  "/blog/capsule-01-on-fait-le-point",
  "/ticket/suivi",
  "/compte/admin",
  "/compte/blog-admin",
  "/compte/discord-diagnostic",
  "/compte/evenement-admin",
  "/compte/mes-jeux",
  "/compte/ticket-admin",
  "/game/viewer",
  "/labo/verifier_traduction_renpy",
  "/wiki/difficulte-traduction-moteurs",
  "/wiki/droits-traduction",
  "/wiki/editeur-traduction-renpy-relecture",
  "/wiki/enregistrer-images-vrai-format",
  "/wiki/enregistrer-images-vrai-format_new",
  "/wiki/extension-f95list",
  "/wiki/extraire-traduction-renpy",
  "/wiki/joiplay_renpy_android",
  "/wiki/joiplay_rpgm_android",
  "/wiki/locale-emulator",
  "/wiki/moteurs-jeux-traduits",
  "/wiki/outils-logiciels-utilises",
  "/wiki/petit-larousse-jeu-adulte",
  "/wiki/renpy_android_traduction_pc",
  "/wiki/traduction-godot-pck",
  "/wiki/traduction-others-asar"
]);

export async function onRequest(context) {
  const { request } = context;
  if (request.method !== "GET" && request.method !== "HEAD") return context.next();
  const url = new URL(request.url);
  const path = url.pathname;
  if (path === '/ticket/suivi.html') {
    url.pathname = '/ticket/suivi';
    return Response.redirect(url.href, 308);
  }
  // Les anciens liens du viewer à la racine restent valables après l’arrivée de l’accueil.
  if (path === "/" || path === "/index.html") {
    const viewerParams = ["id", "uid", "src", "f95France", "f95FranceTranslation"];
    if (viewerParams.some(key => url.searchParams.has(key))) {
      url.pathname = "/game";
      return Response.redirect(url.href, 308);
    }
    if (path === "/index.html") {
      url.pathname = "/";
      return Response.redirect(url.href, 308);
    }
    return context.next();
  }
  let canonical = path.replace(/\/+$/, "") || "/";
  if (canonical.endsWith("/index.html") && DIRECTORY_PAGES.has(canonical.slice(0, -11))) {
    canonical = canonical.slice(0, -11);
  }
  if (!DIRECTORY_PAGES.has(canonical) && !FILE_PAGES.has(canonical)) return context.next();
  if (path !== canonical) {
    url.pathname = canonical;
    // Les paramètres restent intacts (id, uid, src, filtres…).
    return Response.redirect(url.href, 308);
  }
  if (DIRECTORY_PAGES.has(canonical)) {
    // Réécriture interne vers le chemin d’asset attendu par Cloudflare Pages.
    // Ne pas rediriger ce chemin dans _redirects : cela créerait une boucle.
    url.pathname = canonical + "/";
    return context.next(new Request(url, request));
  }
  if (canonical === '/ticket/suivi') {
    const response = new Response(await context.next());
    response.headers.set('Referrer-Policy', 'no-referrer');
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    return response;
  }
  return context.next();
}
