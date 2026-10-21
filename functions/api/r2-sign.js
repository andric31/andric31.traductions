import {validKey,sign,fail,category} from './_r2.js';
import {json} from './_auth.js';
export async function onRequestGet({request,env}) {
 if(!env.MEDIA_R2 || !env.MEDIA_SIGNING_SECRET)return fail('R2 non configuré',503);
 const url=new URL(request.url),key=url.searchParams.get('key')||'';
 if(!validKey(key))return fail('Fichier invalide');
 // Anti-hotlink: only issue public media tokens for page navigations originating from this site.
 // Referer/Origin are not authentication. This endpoint does not secure confidential media.
 const ref=request.headers.get('referer')||'';let allowed=false;
 try {allowed=new URL(ref).origin===url.origin}catch{}
 if(!allowed)return fail('Accès depuis le site requis',403);
 const kind=category(key);if(kind==='archive'||kind==='document')return fail('Les documents et archives nécessitent un accès contrôlé',403);
 const token=await sign(env,key,kind==='video'?3600:900);
 return json({ok:true,url:`/api/r2-file?key=${encodeURIComponent(key)}&exp=${token.exp}&sig=${token.sig}`,expires:token.exp});
}
