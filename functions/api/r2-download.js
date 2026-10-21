import {admin,validKey,sign,fail} from './_r2.js';
import {json} from './_auth.js';
export async function onRequestPost(context) {
 const a=await admin(context);if(a.response)return a.response;
 const {env,request}=context;const body=await request.json().catch(()=>({}));const key=body.key;
 if(!validKey(key)||!env.R2_SIGNING_SECRET)return fail('Clé ou signature invalide');
 const token=await sign(env,key,Math.min(86400,Math.max(60,Number(body.ttl)||3600)));
 return json({ok:true,url:`/api/r2-file?key=${encodeURIComponent(key)}&exp=${token.exp}&sig=${token.sig}`,expires:token.exp});
}
