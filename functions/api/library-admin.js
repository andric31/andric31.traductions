import {member,readCatalogue} from './_library.js';
import {json} from './_auth.js';
import {catalogueKey,kindOf,validateCatalogue} from '../../mediatheque/catalogue.js';
import {toWebVTT} from '../../mediatheque/subtitles.js';
import {readGamePlusCatalogue,GAMEPLUS_CATALOGUE_KEY} from './_gameplus-catalogue.js';
import {validate as validateGamePlus} from './_gameplus-model.js';
export async function onRequest(context) {
  const {request,env}=context;
  if(!['GET','POST'].includes(request.method))return json({ok:false,error:'Méthode invalide.'},405);
  const auth=await member(context,true);if(auth.response)return auth.response;
  if(request.headers.get('sec-fetch-site')==='cross-site'||(request.method==='POST'&&request.headers.get('origin')!==new URL(request.url).origin))return json({ok:false,error:'Origine invalide.'},403);
  try {
    const rawKind=new URL(request.url).searchParams.get('kind'),kind=rawKind==='gameplus'?rawKind:kindOf(rawKind);
    const gameplus=kind==='gameplus',key=gameplus?GAMEPLUS_CATALOGUE_KEY:catalogueKey(kind);
    if(!env.MEDIA_BUCKET)return json({ok:false,error:'La liaison MEDIA_BUCKET est absente.'},503);
    if(request.method==='GET'){const {doc,etag}=gameplus?await readGamePlusCatalogue(env):await readCatalogue(env,kind);return json({ok:true,storage:'r2',kind,doc,etag});}
    if(!(request.headers.get('content-type')||'').includes('application/json'))return json({ok:false,error:'JSON requis.'},415);
    // Limite avant analyse et écriture, même sans Content-Length.
    const chunks=[];let size=0;const reader=request.body?.getReader();
    if(!reader)return json({ok:false,error:'Catalogue absent.'},400);
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2*1024*1024){await reader.cancel();return json({ok:false,error:'Catalogue trop volumineux (2 Mo).'},413);}chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    const body=JSON.parse(new TextDecoder().decode(bytes));
    if(body.action==='subtitle'){
      if(kind!=='dramas'||!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(String(body.itemId||''))||typeof body.text!=='string')return json({ok:false,error:'Sous-titre invalide.'},400);
      const converted=toWebVTT(body.text,'converted.vtt');
      const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(converted.text)));
      const hash=Array.from(digest,n=>n.toString(16).padStart(2,'0')).join('');
      const key='private-library/dramas/'+body.itemId+'/subtitles/'+hash+'.vtt';
      await env.MEDIA_BUCKET.put(key,converted.text,{httpMetadata:{contentType:'text/vtt; charset=utf-8'},onlyIf:new Headers({'If-None-Match':'*'})});
      return json({ok:true,key,count:converted.count,warnings:converted.warnings});
    }
    const doc=gameplus?validateGamePlus(body.doc):validateCatalogue(body.doc,kind);
    if(typeof body.etag!=='string'||body.etag.length>200)return json({ok:false,error:'Recharge la version R2 avant de publier.'},400);
    doc.updatedAt=new Date().toISOString();
    const saved=await env.MEDIA_BUCKET.put(key,JSON.stringify(doc,null,2),{
      httpMetadata:{contentType:'application/json'},onlyIf:body.etag?{etagMatches:body.etag}:new Headers({'If-None-Match':'*'})
    });
    if(!saved)return json({ok:false,error:'Le catalogue R2 a changé. Sauvegarde ton fichier local puis recharge R2 avant de republier.'},409);
    return json({ok:true,storage:'r2',kind,doc,etag:saved.etag});
  }catch(e){return json({ok:false,error:e.message||'Catalogue invalide.'},400);}
}
