import {validKey,category,fromSite,silent,signedMedia,mediaTokenState,verify,admin} from './_r2.js';
import {preview,MARKER} from './_r2_explorer.js';
import {json} from './_auth.js';
const isPublicMedia = key => ['image','video'].includes(category(key));
// Comics/Dramas passent exclusivement par leur route authentifiée ; aucun
// ancien lien signé ou lien de partage ne doit contourner leurs publications.
function accepted(key) { return validKey(key) && !key.startsWith('private-library/') && !key.split('/').includes(MARKER); }
function redirectMedia(token) {
  // Ne pas mettre la redirection en cache. GET/HEAD et Range sont conservés
  // lors d'une nouvelle requête : la vidéo peut demander la suite du même fichier.
  return new Response(null,{status:302,headers:{
    Location:token.url,'Cache-Control':'private, no-store','Referrer-Policy':'same-origin',
    'Cross-Origin-Resource-Policy':'same-origin','X-Content-Type-Options':'nosniff',
    'Vary':'Cookie, Referer, Sec-Fetch-Site'
  }});
}
export async function serveMedia(context, key, legacy=false) {
  const {env,request}=context;
  try {
    if(!['GET','HEAD'].includes(request.method))return silent(405);
    if(!accepted(key))return silent(404);
    const url=new URL(request.url);
    if(!env.MEDIA_BUCKET || !env.R2_SIGNING_SECRET)return silent(503);
    if(legacy) {
      if(!await verify(env,key,url.searchParams.get('exp'),url.searchParams.get('sig')))return silent();
      return await preview(request,env.MEDIA_BUCKET,key,false);
    }
    const hasToken=['sig','exp','access','dl','renew'].some(p=>url.searchParams.has(p));
    if(hasToken) {
      const status=await mediaTokenState(env,key,url.searchParams);
      if(status==='invalid')return silent();
      if(url.searchParams.get('access')==='site' && !fromSite(request))return silent();
      if(status==='expired') {
        // Aucun renouvellement des liens temporaires ponctuels / partages externes.
        if(url.searchParams.get('access')!=='site' || url.searchParams.get('renew')!=='1')return silent();
        // Rejouer l'autorisation actuelle, pas seulement la validité d'un ancien ticket.
        if(!isPublicMedia(key)) {
          const a=await admin(context);if(a.response)return silent(a.response.status);
        }
        // L’existence sera vérifiée par GET après validation du nouveau ticket.
        return redirectMedia(await signedMedia(env,key,{
          ttl:category(key)==='video'?3600:900,access:'site',
          download:url.searchParams.get('dl')==='1',renew:true
        }));
      }
      return await preview(request,env.MEDIA_BUCKET,key,url.searchParams.get('dl')==='1');
    }
    // Une adresse permanente ne devient pas une URL publique de contournement.
    if(!fromSite(request))return silent();
    if(!isPublicMedia(key)) {
      // Les téléchargements visiteurs ne sont PAS ouverts sans les règles métier du site.
      const a=await admin(context); if(a.response)return silent(a.response.status);
    }
    // Pas de HEAD redondant : la réponse signée vérifiera l’existence en lisant le fichier.
    const token=await signedMedia(env,key,{ttl:category(key)==='video'?3600:900,access:'site',download:category(key)==='archive',renew:true});
    return redirectMedia(token);
  } catch { return silent(404); }
}
// Ancienne API conservée pour les clients qui lisent encore son résultat JSON.
export async function issueMedia(context) {
  try {
    const {request,env}=context;
    if(request.method!=='GET')return silent(405);
    const key=new URL(request.url).searchParams.get('key')||'';
    if(!accepted(key)||!fromSite(request)||!isPublicMedia(key))return silent();
    if(!env.MEDIA_BUCKET||!env.R2_SIGNING_SECRET)return silent(503);
    if(!await env.MEDIA_BUCKET.head(key))return silent(404);
    return json({ok:true,...await signedMedia(env,key,{ttl:category(key)==='video'?3600:900})});
  } catch { return silent(); }
}
