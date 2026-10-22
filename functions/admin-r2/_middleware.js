import {requireUser} from '../api/_auth.js';
import {silent} from '../api/_r2.js';
// La même session administrateur protège la page ET tous ses fichiers statiques.
export async function onRequest(context) {
  try {
    if(!context.env.DB)return silent(503);
    const auth=await requireUser(context.env.DB,context.env,context.request);
    if(!auth.ok)return silent(401);
    if(auth.user.role!=='admin')return silent(403);
    // Opening the admin page from F95 is a navigation, not an API request.
    // Keep the admin session check above and reject cross-site embeds/fetches.
    const request=context.request;
    const navigation=request.method==='GET'
      && request.headers.get('sec-fetch-mode')==='navigate'
      && request.headers.get('sec-fetch-dest')==='document';
    if(request.headers.get('sec-fetch-site')==='cross-site'&&!navigation)return silent(403);
    const response=await context.next(),headers=new Headers(response.headers);
    headers.set('Cache-Control','private, no-store');
    headers.set('X-Content-Type-Options','nosniff');
    headers.set('Cross-Origin-Resource-Policy','same-origin');
    headers.set('Referrer-Policy','same-origin');
    headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; font-src 'self'; object-src 'none'; frame-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  } catch { return silent(503); }
}
