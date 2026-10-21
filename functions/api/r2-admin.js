// API privée de l'explorateur R2. Chaque requête reprend la session admin du site.
import { admin, fail, silent } from './_r2.js';
import { json } from './_auth.js';
import { MARKER, PART_SIZE, check, objectKey, folderKey, isMarker, contentType, describe,
  mustExist, exists, destinationFree, parentsFree, metadata, uploadId, partNumber, fileSize,
  uploadedParts, preview } from './_r2_explorer.js';

export async function onRequest(context) {
  let authorized=false;
  try {
    const a = await admin(context);
    if (a.response) return a.response;
    authorized=true;
    const {request,env} = context, bucket = env.MEDIA_BUCKET;
    const url = new URL(request.url), action = url.searchParams.get('action') || '';
    const rawKey = url.searchParams.get('key') || '';

    if (['GET','HEAD'].includes(request.method) && action === 'preview') {
      return await preview(request,bucket,objectKey(rawKey),url.searchParams.get('download')==='1');
    }
    if (request.method === 'GET') {
      const prefix = folderKey(url.searchParams.get('prefix') || '',true);
      const recursive = url.searchParams.get('recursive') === '1';
      const result = await bucket.list({prefix, ...(recursive?{}:{delimiter:'/'}), limit:200,
        cursor:url.searchParams.get('cursor') || undefined, include:['httpMetadata','customMetadata']});
      return json({ok:true,objects:result.objects.filter(o=>recursive||!isMarker(o.key)).map(describe),
        folders:result.delimitedPrefixes||[],cursor:result.truncated?result.cursor:null});
    }
    if (request.method === 'PUT') {
      const key = objectKey(rawKey);
      const length = request.headers.get('content-length');
      // Une requête PUT réellement sans corps représente bien un fichier de 0 octet.
      const size = length === null && request.body === null ? 0 : Number(length);
      check((length !== null || request.body === null) && Number.isSafeInteger(size) && size >= 0,'Taille de transfert manquante.',411);
      check(size <= PART_SIZE,'Utilisez l’envoi par morceaux pour ce fichier.',413);
      if(action==='upload-part') {
        const id=uploadId(url.searchParams.get('uploadId')),number=partNumber(url.searchParams.get('partNumber'));
        const result=await bucket.resumeMultipartUpload(key,id).uploadPart(number,request.body);
        return json({ok:true,part:result});
      }
      check(!action,'Action invalide.');
      await destinationFree(bucket,key);
      const result=await bucket.put(key,request.body||new Uint8Array(),{
        httpMetadata:{contentType:contentType(key,request.headers.get('content-type'))},
        onlyIf:new Headers({'If-None-Match':'*'})
      });
      check(result,'Ce fichier existe déjà. Renommez-le avant de l’importer.',409);
      return json({ok:true,object:describe(result)});
    }
    // Compatibilité avec l'ancienne interface : suppression d'un fichier unique, jamais d'un préfixe.
    if(request.method==='DELETE') {
      const key=objectKey(rawKey);
      await bucket.delete(key);
      return json({ok:true});
    }
    if(request.method!=='POST') return fail('Méthode non autorisée.',405);
    check((request.headers.get('content-type')||'').includes('application/json'),'Corps JSON requis.',415);
    check(Number(request.headers.get('content-length')||0)<=2*1024*1024,'Requête trop volumineuse.',413);
    const body=await request.json().catch(()=>null);
    check(body && typeof body==='object' && !Array.isArray(body),'Requête invalide.');

    if(body.action==='create-empty') {
      const key=objectKey(body.key);
      await destinationFree(bucket,key);
      const result=await bucket.put(key,new Uint8Array(0),{
        httpMetadata:{contentType:contentType(key)},
        onlyIf:new Headers({'If-None-Match':'*'})
      });
      check(result,'Ce fichier existe déjà ; aucun contenu n’a été remplacé.',409);
      return json({ok:true,object:describe(result)});
    }
    if(body.action==='ensure-folder') {
      const prefix=folderKey(body.prefix);
      await parentsFree(bucket,prefix+MARKER);
      // Maintient un dossier implicite quand on supprime ou déplace son dernier fichier.
      if(!(await bucket.head(prefix+MARKER))) {
        await bucket.put(prefix+MARKER,new Uint8Array(0),{
          httpMetadata:{contentType:'application/octet-stream'},customMetadata:{r2FolderMarker:'1'},
          onlyIf:new Headers({'If-None-Match':'*'})
        });
      }
      return json({ok:true,prefix});
    }
    if(body.action==='mkdir') {
      const prefix=folderKey(body.prefix);
      await parentsFree(bucket,prefix+MARKER);
      check(!(await exists(bucket,prefix,true)),'Un dossier ou un fichier porte déjà ce nom.',409);
      const obj=await bucket.put(prefix+MARKER,new Uint8Array(),{
        httpMetadata:{contentType:'application/octet-stream'},customMetadata:{r2FolderMarker:'1'},
        onlyIf:new Headers({'If-None-Match':'*'})
      });
      check(obj,'Le dossier existe déjà.',409);
      return json({ok:true,prefix});
    }
    if(body.action==='probe') {
      check(Array.isArray(body.entries)&&body.entries.length<=20,'Vérification limitée à 20 éléments par requête.');
      const entries=[];
      for(const entry of body.entries) {
        const key=entry.folder?folderKey(entry.key):objectKey(entry.key);
        entries.push({key,exists:await exists(bucket,key,!!entry.folder)});
      }
      return json({ok:true,entries});
    }
    if(body.action==='verify') {
      check(Array.isArray(body.entries)&&body.entries.length<=20,'Vérification limitée à 20 fichiers.');
      for(const entry of body.entries) {
        const obj=await mustExist(bucket,objectKey(entry.key,{marker:true}),entry.version);
        check(!entry.etag || obj.etag===entry.etag,'Un fichier a changé : '+entry.key,409);
        check(entry.size==null || obj.size===entry.size,'La taille d’un fichier a changé : '+entry.key,409);
      }
      return json({ok:true});
    }
    if(body.action==='delete-batch') {
      check(Array.isArray(body.entries)&&body.entries.length>0&&body.entries.length<=20,'Suppression limitée à 20 fichiers par requête.');
      const keys=[];
      // Vérifier toute la tranche avant la suppression. Jamais de suppression par préfixe aveugle.
      for(const entry of body.entries) {
        const key=objectKey(entry.key,{marker:true});
        check(typeof entry.version==='string'&&entry.version.length>0,'Actualisez la sélection avant la suppression.');
        await mustExist(bucket,key,entry.version); keys.push(key);
      }
      await bucket.delete(keys);
      return json({ok:true,deleted:keys.length});
    }
    if(body.action==='copy-file') {
      const from=objectKey(body.from,{marker:true}),to=objectKey(body.to,{marker:true});
      check(from!==to,'La source et la destination sont identiques.');
      const source=await mustExist(bucket,from,body.version);
      await destinationFree(bucket,to);
      if(source.size>PART_SIZE) {
        fileSize(source.size);
        const upload=await bucket.createMultipartUpload(to,metadata(source));
        return json({ok:true,complete:false,key:to,uploadId:upload.uploadId,source:describe(source),partSize:PART_SIZE});
      }
      const data=await bucket.get(from,{onlyIf:{etagMatches:source.etag}});
      check(data && data.body,'La source a changé pendant la copie.',409);
      const result=await bucket.put(to,data.body,{...metadata(source),onlyIf:new Headers({'If-None-Match':'*'})});
      check(result,'La destination existe déjà. Copie interrompue sans remplacement.',409);
      return json({ok:true,complete:true,object:describe(result),source:describe(source)});
    }
    if(body.action==='copy-part') {
      const from=objectKey(body.from,{marker:true}),to=objectKey(body.to,{marker:true});
      check(from!==to,'Source et destination identiques.');
      const source=await mustExist(bucket,from,body.version),number=partNumber(body.partNumber);
      const offset=(number-1)*PART_SIZE;
      check(offset<source.size,'Morceau hors limites.');
      const data=await bucket.get(from,{range:{offset,length:Math.min(PART_SIZE,source.size-offset)},onlyIf:{etagMatches:source.etag}});
      check(data && data.body,'La source a changé pendant la copie.',409);
      const part=await bucket.resumeMultipartUpload(to,uploadId(body.uploadId)).uploadPart(number,data.body);
      return json({ok:true,part});
    }
    if(body.action==='upload-start') {
      const key=objectKey(body.key),size=fileSize(body.size);
      check(size>PART_SIZE,'Ce fichier ne nécessite pas d’envoi par morceaux.');
      await destinationFree(bucket,key);
      const upload=await bucket.createMultipartUpload(key,{httpMetadata:{contentType:contentType(key,body.contentType)}});
      return json({ok:true,key,uploadId:upload.uploadId,partSize:PART_SIZE});
    }
    if(body.action==='upload-complete' || body.action==='copy-complete') {
      const key=objectKey(body.key,{marker:body.action==='copy-complete'}),id=uploadId(body.uploadId);
      const size=fileSize(body.size),parts=uploadedParts(body.parts,size);
      await destinationFree(bucket,key);
      if(body.action==='copy-complete') {
        const source=await mustExist(bucket,objectKey(body.from,{marker:true}),body.version);
        check(source.size===size,'La source a changé pendant la copie.',409);
      }
      const result=await bucket.resumeMultipartUpload(key,id).complete(parts);
      check(result.size===size,'Taille inattendue après transfert : vérifiez le fichier avant de l’utiliser.',409);
      return json({ok:true,object:describe(result)});
    }
    if(body.action==='upload-abort') {
      const key=objectKey(body.key,{marker:true});
      await bucket.resumeMultipartUpload(key,uploadId(body.uploadId)).abort();
      return json({ok:true});
    }
    return fail('Action inconnue.',400);
  } catch(error) {
    if(!authorized)return silent(403);
    if(!error.status)console.error('[R2 explorer]',error.name||'Error',error.message||'Operation failed');
    return fail(error.status?error.message:'Opération R2 impossible. Actualisez puis réessayez ; les détails sont disponibles dans les journaux Cloudflare.',error.status||500);
  }
}
