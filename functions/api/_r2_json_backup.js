import {json} from './_auth.js';
import {check} from './_r2_explorer.js';
const MAX=20*1024*1024;
export async function backupJson(bucket,body){
  const name=body.name;
  check(typeof name==='string'&&/^(?:creators|f95list(?:[_-][a-z0-9_-]+)?)\.json$/i.test(name),'Nom de fichier JSON non autorisé.');
  check(typeof body.content==='string'&&new TextEncoder().encode(body.content).length<=MAX,'JSON trop volumineux (20 Mo maximum).',413);
  let parsed;try{parsed=JSON.parse(body.content);}catch{}check(parsed&&typeof parsed==='object','Le fichier JSON est invalide.');
  const key='json/'+name,history='json/sauvegardes/'+name+'/';
  const old=await bucket.get(key);check(!old||old.size<=MAX,'La version distante est trop volumineuse.',413);
  const oldText=old?await new Response(old.body).text():'';
  const unchanged=!!old&&oldText===body.content;
  if(!unchanged){
    const revision=Number(old?.customMetadata?.backupRevision)||0;
    if(old){
      const backupKey=history+String(revision).padStart(12,'0')+'_'+old.etag.replace(/[^a-z0-9-]/gi,'')+'.json';
      // Finish the previous-version copy before replacing the current file.
      await bucket.put(backupKey,oldText,{httpMetadata:{contentType:'application/json'},customMetadata:{backupFor:name},onlyIf:new Headers({'If-None-Match':'*'})});
      check(await bucket.head(backupKey),'Sauvegarde précédente impossible : remplacement annulé.',503);
    }
    const saved=await bucket.put(key,body.content,{httpMetadata:{contentType:'application/json'},customMetadata:{backupRevision:String(revision+1)},onlyIf:old?{etagMatches:old.etag}:new Headers({'If-None-Match':'*'})});
    check(saved,'Le JSON distant a changé pendant l’envoi. Réessaie.',409);
  }
  const backups=[];let cursor;
  do{const page=await bucket.list({prefix:history,limit:1000,cursor,include:['customMetadata']});backups.push(...page.objects.filter(o=>o.customMetadata?.backupFor===name).map(o=>o.key));cursor=page.truncated?page.cursor:undefined;}while(cursor);
  backups.sort().reverse();let cleanupPending=false;
  try{for(let i=5;i<backups.length;i+=1000)await bucket.delete(backups.slice(i,i+1000));}catch{cleanupPending=true;}
  return json({ok:true,key,unchanged,backups:Math.min(backups.length,5),cleanupPending});
}
