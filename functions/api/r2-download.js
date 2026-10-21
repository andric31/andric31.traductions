import {admin,validKey,signedMedia,fail,silent} from './_r2.js';
import {json} from './_auth.js';
import {MARKER} from './_r2_explorer.js';
export async function onRequest(context) {
  const a=await admin(context); if(a.response)return a.response;
  if(context.request.method!=='POST')return silent(405);
  try {
    const body=await context.request.json();
    const key=body.key;
    if(!validKey(key)||key.split('/').includes(MARKER))return fail('Fichier invalide.');
    if(!await context.env.MEDIA_BUCKET.head(key))return fail('Fichier introuvable.',404);
    const token=await signedMedia(context.env,key,{ttl:body.ttl||3600,access:body.access==='share'?'share':'site',download:body.download===true});
    return json({ok:true,...token});
  } catch { return fail('Création du lien impossible. Vérifiez le secret R2_SIGNING_SECRET et réessayez.',400); }
}
