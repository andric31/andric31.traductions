// Private extension endpoint. Reuses the site's admin session and R2 binding.
import {admin,fail,validKey,mediaPath} from './_r2.js';
import {json} from './_auth.js';
import {backupJson} from './_r2_json_backup.js';
import {check,parentsFree,contentType} from './_r2_explorer.js';
const PART=8*1024*1024,enc=new TextEncoder();
function prefix(value){check(typeof value==='string'&&/^traductions\/[^/]+\/[^/]+\/$/.test(value)&&validKey(value.slice(0,-1)),'Dossier de traduction invalide.');return value;}
function fileKey(key,p){check(validKey(key)&&key.startsWith(p),'Fichier hors du dossier du jeu.');const tail=key.slice(p.length);check(/^[^/]+\.(zip|rar)$/i.test(tail)||/^images\/[^/]+\.(png|jpe?g|webp|gif|avif|bmp)$/i.test(tail),'Type de fichier non autorisé.');return key;}
async function signature(env,text){const key=await crypto.subtle.importKey('raw',enc.encode(env.R2_SIGNING_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(text))),x=>x.toString(16).padStart(2,'0')).join('');}
async function ticket(env,data,user){const text=btoa(unescape(encodeURIComponent(JSON.stringify({...data,user:user.id,expires:Date.now()+8*3600000}))));return text+'.'+await signature(env,text);}
async function readTicket(env,raw,user){check(typeof raw==='string'&&raw.length<12000,'Transfert invalide.');const [text,sig,...extra]=raw.split('.');check(!extra.length&&sig===await signature(env,text),'Transfert invalide.',403);let d;try{d=JSON.parse(decodeURIComponent(escape(atob(text))));}catch{throw Error('Transfert invalide.');}check(d.expires>Date.now()&&d.user===user.id,'Transfert expiré. Recommence l’envoi.',403);prefix(d.prefix);if(d.key)fileKey(d.key,d.prefix);return d;}
const documentKey=p=>p+'f95-manager.json';
async function readDocument(bucket,p){const o=await bucket.get(documentKey(p));return{o,data:o?await o.json():null};}
export async function onRequest(context){
  let authorized=false;
  try{
    const auth=await admin(context);if(auth.response)return auth.response;authorized=true;
    const {env,request}=context,bucket=env.MEDIA_BUCKET,user=auth.user;
    check(typeof env.R2_SIGNING_SECRET==='string'&&env.R2_SIGNING_SECRET.length>=32,'Configuration R2 incomplète.',503);
    if(request.method==='GET')return json({ok:true,protocol:1,partSize:PART});
    if(request.method==='PUT'){
      const u=new URL(request.url),t=await readTicket(env,u.searchParams.get('ticket'),user);
      if(t.image){
        check(Number(request.headers.get('content-length'))===t.size,'Taille de l’image incorrecte.',411);
        const result=await bucket.put(t.key,request.body,{httpMetadata:{contentType:t.contentType},customMetadata:{f95ThreadId:t.threadId},onlyIf:new Headers({'If-None-Match':'*'})});
        return json({ok:true,key:t.key,url:mediaPath(t.key),reused:!result});
      }
      check(t.uploadId&&t.key,'Transfert invalide.');
      const n=Number(u.searchParams.get('partNumber')),count=Math.ceil(t.size/PART);
      check(Number.isInteger(n)&&n>0&&n<=count,'Numéro de morceau invalide.');
      const length=Number(request.headers.get('content-length'));
      check(length===Math.min(PART,t.size-(n-1)*PART),'Taille du morceau incorrecte.',411);
      const part=await bucket.resumeMultipartUpload(t.key,t.uploadId).uploadPart(n,request.body);
      return json({ok:true,part});
    }
    check(request.method==='POST','Méthode non autorisée.',405);
    check((request.headers.get('content-type')||'').includes('application/json'),'JSON requis.',415);
    const text=await request.text();check(text.length<30*1024*1024,'Requête trop volumineuse.',413);
    const b=JSON.parse(text);
    if(b.action==='json-backup')return await backupJson(bucket,b);
    check(text.length<2000000,'Requête trop volumineuse.',413);
    if(b.action==='begin'){
      const p=prefix(b.prefix);check(/^\d+$/.test(String(b.threadId)),'Sujet F95 invalide.');
      await parentsFree(bucket,p+'f95-manager.json');
      const previous=await readDocument(bucket,p);
      check(!previous.data||previous.data.threadId===String(b.threadId),'Ce dossier appartient à un autre sujet F95.',409);
      return json({ok:true,ticket:await ticket(env,{prefix:p,threadId:String(b.threadId),documentEtag:previous.o?.etag||null},user)});
    }
    const t=await readTicket(env,b.ticket,user);
    if(b.action==='image-status'){
      const key=fileKey(b.key,t.prefix);check(key.startsWith(t.prefix+'images/'),'Image invalide.');
      return json({ok:true,exists:!!await bucket.head(key)});
    }
    if(b.action==='start'){
      check(!t.uploadId,'Transfert invalide.');const key=fileKey(b.key,t.prefix);
      const size=b.size;check(Number.isSafeInteger(size)&&size>0&&size<=PART*10000,'Taille du fichier invalide.');
      await parentsFree(bucket,key);
      const previous=await bucket.head(key),children=await bucket.list({prefix:key+'/',limit:1});
      check(!children.objects.length,'Un dossier porte déjà ce nom.',409);
      if(key.startsWith(t.prefix+'images/')){
        if(previous)return json({ok:true,reused:true,key,url:mediaPath(key)});
        check(size<=20*1024*1024,'Image trop volumineuse.',413);
        const mime=contentType(key,b.contentType);check(/^image\/(png|jpeg|webp|gif|avif|bmp)$/.test(mime),'Type d’image invalide.');
        return json({ok:true,single:true,ticket:await ticket(env,{...t,key,size,image:true,contentType:mime},user)});
      }
      const upload=await bucket.createMultipartUpload(key,{httpMetadata:{contentType:contentType(key)},customMetadata:{f95ThreadId:t.threadId}});
      return json({ok:true,ticket:await ticket(env,{...t,key,size,uploadId:upload.uploadId,previousEtag:previous?.etag||null},user)});
    }
    if(b.action==='abort'){check(t.uploadId&&t.key,'Transfert invalide.');await bucket.resumeMultipartUpload(t.key,t.uploadId).abort();return json({ok:true});}
    if(b.action==='complete'){
      check(t.uploadId&&t.key,'Transfert invalide.');
      check(Array.isArray(b.parts)&&b.parts.length===Math.ceil(t.size/PART)&&b.parts.every((p,i)=>p.partNumber===i+1&&typeof p.etag==='string'&&p.etag.length>0&&p.etag.length<256),'Transfert incomplet.');
      const now=await bucket.head(t.key);check((now?.etag||null)===t.previousEtag,'Le fichier a été modifié pendant l’envoi. Recommence.',409);
      const result=await bucket.resumeMultipartUpload(t.key,t.uploadId).complete(b.parts);
      check(result.size===t.size,'La taille reçue est incorrecte.',409);
      return json({ok:true,key:t.key,url:mediaPath(t.key),size:result.size});
    }
    if(b.action==='commit'){
      check(!t.uploadId,'Transfert invalide.');const previous=await readDocument(bucket,t.prefix);
      check((previous.o?.etag||null)===t.documentEtag,'Un autre envoi a modifié cette fiche. Recommence.',409);
      const archive=b.archive?fileKey(b.archive,t.prefix):'';
      check(!archive||/\.(zip|rar)$/i.test(archive),'Archive invalide.');
      let images=null;
      if(b.images){
        const cover=fileKey(b.images.cover,t.prefix),gallery=b.images.gallery;
        check(cover.startsWith(t.prefix+'images/')&&Array.isArray(gallery)&&gallery.length<=200,'Images invalides.');
        const all=[cover,...gallery.map(k=>fileKey(k,t.prefix))];
        check(all.every(k=>k.startsWith(t.prefix+'images/'))&&new Set(all).size===all.length,'Images invalides.');
        images={folder:t.prefix+'images/',cover,gallery:all.slice(1)};
      }
      const keys=[...(archive?[archive]:[]),...(images?[images.cover,...images.gallery]:[])];
      check(keys.length>0,'Aucun fichier envoyé.');
      for(const key of keys){const o=await bucket.head(key);check(o&&o.size>0&&(key.startsWith(t.prefix+'images/')||o.customMetadata?.f95ThreadId===t.threadId),'Fichier manquant ou incorrect : '+key,409);}
      const doc={...previous.data,threadId:t.threadId,updatedAt:new Date().toISOString(),...(archive?{archive}:{}),...(images?{images}:{})};
      const saved=await bucket.put(documentKey(t.prefix),JSON.stringify(doc),{httpMetadata:{contentType:'application/json'},onlyIf:previous.o?{etagMatches:previous.o.etag}:new Headers({'If-None-Match':'*'})});
      check(saved,'Un autre envoi a modifié cette fiche. Recommence.',409);
      const origin=new URL(request.url).origin;
      return json({ok:true,...(archive?{cloudflareTranslation:origin+mediaPath(archive)}:{}),...(images?{cloudflareImages:{folder:images.folder,cover:origin+mediaPath(images.cover),gallery:images.gallery.map(k=>origin+mediaPath(k))}}:{})});
    }
    return fail('Action inconnue.');
  }catch(e){if(!authorized)return new Response(null,{status:403});return fail(e.status?e.message:'Opération R2 impossible. Vérifie la connexion puis réessaie.',e.status||500);}
}
