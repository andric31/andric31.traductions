import {admin,validKey,fail,category} from './_r2.js';
import {json} from './_auth.js';
export async function onRequest(context) {
 const {request,env}=context;const a=await admin(context);if(a.response)return a.response;
 const url=new URL(request.url);const key=url.searchParams.get('key')||'';
 try {
  if(request.method==='GET') {const prefix=url.searchParams.get('prefix')||'';if(prefix && (!validKey(prefix.slice(0,-1)) || !prefix.endsWith('/')))return fail('Dossier invalide');const result=await env.MEDIA_R2.list({prefix,delimiter:'/',limit:500,cursor:url.searchParams.get('cursor')||undefined});return json({ok:true,objects:result.objects.map(o=>({key:o.key,size:o.size,uploaded:o.uploaded,kind:category(o.key)})),folders:result.delimitedPrefixes||[],cursor:result.truncated?result.cursor:null});}
  if(request.method==='PUT') {if(!validKey(key))return fail('Nom de fichier invalide');const type=request.headers.get('content-type')||'application/octet-stream';if(!/^(image\/|video\/|application\/|text\/)/i.test(type))return fail('Type non pris en charge');const size=Number(request.headers.get('content-length')||0);if(size>100*1024*1024)return fail('Limite de 100 Mo par import. Prévoir multipart pour les gros fichiers.',413);await env.MEDIA_R2.put(key,request.body,{httpMetadata:{contentType:type}});return json({ok:true,key});}
  if(request.method==='DELETE'){if(!validKey(key))return fail('Clé invalide');await env.MEDIA_R2.delete(key);return json({ok:true});}
  return fail('Méthode non autorisée',405);
 }catch(e){return fail('Opération R2 impossible : '+e.message,500)}
}
