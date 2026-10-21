import {validKey,verify,fail} from './_r2.js';
export async function onRequest({request,env}) {
 if(!['GET','HEAD'].includes(request.method))return fail('Méthode refusée',405);
 if(!env.MEDIA_BUCKET)return fail('R2 non configuré',503);
 const u=new URL(request.url),key=u.searchParams.get('key')||'';
 if(!validKey(key)||!await verify(env,key,u.searchParams.get('exp'),u.searchParams.get('sig')))return fail('Lien expiré ou invalide',403);
 const headers=new Headers({'cache-control':'private, no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':"default-src 'none'; sandbox"});
 const range=request.headers.get('range');const obj=await env.MEDIA_BUCKET.get(key,range?{range:request.headers}:{});
 if(!obj)return fail('Fichier introuvable',404);
 obj.writeHttpMetadata(headers);
 if(!headers.has('content-type'))headers.set('content-type','application/octet-stream');
 headers.set('accept-ranges','bytes');
 if(obj.range && range){headers.set('content-range',`bytes ${obj.range.offset}-${obj.range.offset+obj.range.length-1}/${obj.size}`);headers.set('content-length',String(obj.range.length));}
 else headers.set('content-length',String(obj.size));
 return new Response(request.method==='HEAD'?null:obj.body,{status:range&&obj.range?206:200,headers});
}
