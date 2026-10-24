// Les téléchargements R2 sont transmis après contrôle de la session, sans URL publique.
import {member} from './_library.js';
import {json} from './_auth.js';
import {fetchGamePlusDoc,getItem,resolveLink,gameplusKey,httpTarget,serveGameplusMedia} from './_gameplus.js';
export async function onRequest(context){
  const {request}=context;
  if(!['GET','HEAD'].includes(request.method))return json({ok:false,error:'Méthode non autorisée.'},405);
  const auth=await member(context);if(auth.response)return auth.response;
  if(request.headers.get('sec-fetch-site')==='cross-site')return json({ok:false,error:'Origine invalide.'},403);
  try{
    const p=new URL(request.url).searchParams,id=String(p.get('id')||'').trim(),type=String(p.get('type')||'').trim();
    if(!id||!type)return json({ok:false,error:'Paramètres manquants.'},400);
    const item=getItem(await fetchGamePlusDoc(context),id);
    if(!item)return json({ok:false,error:'Jeu Game+ introuvable.'},404);
    const target=resolveLink(item,type);
    if(!target)return json({ok:false,error:'Lien Game+ introuvable.'},404);
    const key=gameplusKey(target,id);
    if(key)return await serveGameplusMedia(context,key,true);
    const url=httpTarget(target);
    if(!url)return json({ok:false,error:'Lien invalide.'},400);
    return new Response(null,{status:302,headers:{Location:url,'Cache-Control':'private, no-store',Vary:'Cookie','Referrer-Policy':'no-referrer'}});
  }catch(e){return json({ok:false,error:'Téléchargement Game+ indisponible.'},e.status===404?404:502);}
}
