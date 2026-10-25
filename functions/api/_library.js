import {ensureAuthTables,requireUser,json} from './_auth.js';
import {kindOf,emptyCatalogue,catalogueKey,legacyCatalogueKey,validateCatalogue} from '../../mediatheque/catalogue.js';
export async function member(context, admin=false) {
  const {env,request}=context;
  if (!env.DB) return {response:json({ok:false,error:'Service de connexion indisponible.'},503)};
  try {
    await ensureAuthTables(env.DB);
    const auth=await requireUser(env.DB,env,request);
    if(!auth.ok)return {response:auth.response};
    if(admin && auth.user.role!=='admin')return {response:json({ok:false,error:'Compte administrateur requis.'},403)};
    return {user:auth.user};
  } catch { return {response:json({ok:false,error:'Service de connexion indisponible.'},503)}; }
}
export async function readCatalogue(env,kind) {
  kindOf(kind);
  if(!env.MEDIA_BUCKET)return {doc:emptyCatalogue(kind),etag:''};
  let obj=await env.MEDIA_BUCKET.get(catalogueKey(kind)),legacy=false;
  const oldKey=legacyCatalogueKey(kind);
  if(!obj&&oldKey){obj=await env.MEDIA_BUCKET.get(oldKey);legacy=!!obj;}
  if(!obj)return {doc:emptyCatalogue(kind),etag:''};
  if(obj.size>2*1024*1024)throw Error('Catalogue trop volumineux.');
  return {doc:validateCatalogue(JSON.parse(await obj.text()),kind),etag:legacy?'legacy:'+obj.etag:obj.etag};
}
