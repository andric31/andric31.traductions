// /game et /game/ : viewer sans identifiant, fiche existante avec id ou uid.
export function onRequest(context) {
  const { request, env } = context;
  if (request.method !== "GET" && request.method !== "HEAD") return context.next();

  const url = new URL(request.url);
  const id = (url.searchParams.get("id") || "").trim();
  const uid = (url.searchParams.get("uid") || "").trim();
  if (id || uid) return context.next();

  // Chemin sans .html pour éviter la redirection automatique des assets Pages.
  // Le navigateur garde /game et les paramètres de liste/filtre dans son adresse.
  url.pathname = "/game/viewer";
  url.search = "";
  return env.ASSETS.fetch(new Request(url, request));
}
