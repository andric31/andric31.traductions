// Fixed, read-only sources. Backup/history objects and arbitrary R2 keys are never public routes.
export const MAIN_URL='https://raw.githubusercontent.com/andric31/f95list/main/f95list.json';
export const VOFR_URL='https://raw.githubusercontent.com/andric31/traductions/refs/heads/main/f95list_vofr.json';
const MAX=20*1024*1024;
const PRIVATE_FIELDS=['cloudflareTranslation','discordlink','translationType','translationsExtra','translationsArchive','description','notes','f95Info'];
const translationField=k=>/^translation(?:\d+)?(?:Title|Name)?$|^translationTitle\d+$/.test(k);
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const has=v=>Array.isArray(v)?v.length>0:object(v)?Object.keys(v).length>0:String(v??'').trim()!=='';
export function listEntries(doc,kind='games'){
  if(doc?.ok===false||doc?.error)throw Error('Liste invalide.');
  const rows=Array.isArray(doc)?doc:(kind==='creators'?['creators']:['games','list','items','data','rows','results']).map(k=>doc?.[k]).find(Array.isArray);
  if(!rows||!rows.every(object))throw Error('Liste invalide.');
  return rows;
}
function privateKey(g){const id=String(g.id||'').trim(),uid=String(g.uid??'').trim(),collection=String(g.collection||'').trim();return id||(collection&&uid?collection+'__'+uid:uid?'uid__'+uid:'title__'+String(g.cleanTitle||g.title||'').trim());}
function publicEntry(entry){
  const out={...entry};
  const flags={hasDiscord:has(entry.discordlink),hasTranslation:Object.keys(entry).some(k=>/^translation\d*$/.test(k)&&has(entry[k])),hasCloudflareTranslation:has(entry.cloudflareTranslation),hasTranslationsExtra:has(entry.translationsExtra),hasTranslationsArchive:has(entry.translationsArchive),hasDescription:has(entry.description),hasNotes:has(entry.notes),hasF95Info:has(entry.f95Info)};
  for(const k of Object.keys(out))if(PRIVATE_FIELDS.includes(k)||translationField(k))delete out[k];
  for(const [k,v] of Object.entries(flags))out[k]=entry[k]===true||v;
  // Collection display data is also stripped of any misplaced private fields.
  if(object(entry.gameData))out.gameData=publicEntry(entry.gameData);
  return out;
}
function privateDoc(doc){
  const items=object(doc?.items)?doc.items:doc;
  if(!object(items)||!Object.entries(items).every(([key,value])=>/^(?:\d+(?:__\d+)?|uid__.+|title__.+)$/.test(key)&&object(value)))throw Error('Liens privés invalides.');
  return doc;
}
async function r2Json(env,name){
  if(!env?.MEDIA_BUCKET)throw Error('R2 indisponible.');
  const file=await env.MEDIA_BUCKET.get('f95list/'+name);
  if(!file||file.size>MAX)throw Error('Copie R2 absente ou trop volumineuse.');
  return file.json();
}
export async function readR2List(env,list='main'){
  if(list==='vofr')return listEntries(await r2Json(env,'f95list_vofr.json'));
  for(const name of ['f95list_public.json','f95list.json']){
    try{return listEntries(await r2Json(env,name)).map(publicEntry);}catch{}
  }
  throw Error('Aucune copie R2 valide de la liste.');
}
export async function readR2Creators(env){return listEntries(await r2Json(env,'creators.json'),'creators');}
async function readR2Private(env){
  try{return privateDoc(await r2Json(env,'f95list_links.json'));}catch{}
  const rows=listEntries(await r2Json(env,'f95list.json')),items={};
  for(const entry of rows){const value={};for(const k of Object.keys(entry))if(PRIVATE_FIELDS.includes(k)||translationField(k)||k==='discordExclusive')value[k]=entry[k];items[privateKey(entry)]=value;}
  return {items};
}
export async function remoteJson(url,options={},validate=doc=>doc){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4000);
  try{
    const response=await fetch(url,{...options,signal:controller.signal});
    if(!response.ok)throw Error('Source HTTP '+response.status);
    const doc=await response.json();validate(doc);return doc;
  }finally{clearTimeout(timer);}
}
export async function loadPublicList(context,{list='main',preferR2=false}={}){
  if(!['main','vofr'].includes(list))throw Error('Liste non autorisée.');
  if(preferR2)try{return {doc:await readR2List(context.env,list),source:'r2'};}catch{}
  const cache=globalThis.caches?.default;
  const cacheKey=new Request('https://cache.local/f95list-v1/'+(list==='main'?'f95list.json':'f95list_vofr.json'));
  try{
    const doc=await remoteJson(list==='main'?MAIN_URL:VOFR_URL,{headers:{accept:'application/json','user-agent':'andric31-traductions-pages'},cf:{cacheTtl:300,cacheEverything:true}},listEntries);
    // A cache failure must not discard a working primary response.
    try{await cache?.put(cacheKey,new Response(JSON.stringify(doc),{headers:{'content-type':'application/json','cache-control':'public, max-age=86400'}}));}catch{}
    return {doc,source:'github'};
  }catch{}
  if(!preferR2)try{return {doc:await readR2List(context.env,list),source:'r2'};}catch{}
  try{const cached=await cache?.match(cacheKey);if(cached){const rows=listEntries(await cached.json());return {doc:list==='main'?rows.map(publicEntry):rows,source:'cloudflare-cache'};}}catch{}
  throw Error('Liste indisponible sur GitHub, R2 et le cache.');
}
export async function fetchPrivateLinksDoc(context){
  const env=context.env||{},get=(key,fallback='')=>String(env[key]||fallback).trim();
  try{
    const token=get('GITHUB_PRIVATE_TOKEN')||get('GITHUB_TOKEN')||get('GH_TOKEN');
    if(!token)throw Error('Source privée indisponible.');
    const owner=get('PRIVATE_LINKS_OWNER','andric31'),repo=get('PRIVATE_LINKS_REPO','f95list_private_links'),branch=get('PRIVATE_LINKS_BRANCH','main'),path=get('PRIVATE_LINKS_PATH','f95list_links.json').replace(/^\/+/, '');
    const url=`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`;
    return await remoteJson(url,{headers:{accept:'application/vnd.github.raw+json',authorization:`Bearer ${token}`,'user-agent':'andric31-traductions-pages','x-github-api-version':'2022-11-28'},cf:{cacheTtl:60,cacheEverything:true}},privateDoc);
  }catch{}
  return readR2Private(env);
}
