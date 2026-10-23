// URL publiques sans slash final. Les index restent à leur emplacement actuel.
// next(request) conserve la chaîne de middleware, notamment la protection admin-r2.
const DIRECTORY_PAGES = new Set([
  "/_Redirection",
  "/admin-r2",
  "/blog",
  "/compte",
  "/connexion",
  "/creator",
  "/evenements",
  "/game",
  "/game+",
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

export function onRequest(context) {
  const { request } = context;
  if (request.method !== "GET" && request.method !== "HEAD") return context.next();
  const url = new URL(request.url);
  const path = url.pathname;
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
  return context.next();
}
