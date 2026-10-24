// Catalogue privé R2 et résolution des médias Game+ déclarés dans ses fiches.
import {objectKey,preview} from './_r2_explorer.js';
import {readGamePlusCatalogue} from './_gameplus-catalogue.js';
export const GAMEPLUS_PREFIX='private-library/gameplus/';
const value=v=>String(v??'').trim();
export function asItems(doc){
  if(Array.isArray(doc))return doc;
  if(Array.isArray(doc?.items))return doc.items;
  if(doc?.items&&typeof doc.items==='object')return Object.values(doc.items);
  if(doc&&typeof doc==='object')return Object.values(doc);
  return [];
}
export function visibleGame(item){return !!item&&typeof item==='object'&&item.visible!==false&&item.visible!==0&&item.hidden!==true;}
export function gameId(item){return value(item?.id||item?.uid||item?.key);}
export function getItem(doc,id){return asItems(doc).find(item=>visibleGame(item)&&gameId(item)===id)||null;}
export function httpTarget(raw){
  try{const u=new URL(value(raw));return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}
}
export async function fetchGamePlusDoc(context){return (await readGamePlusCatalogue(context.env)).doc;}

// Aucun chemin R2 libre ne vient de la requête : il doit figurer dans la fiche.
export function gameplusKey(raw,id,type='download'){
  const path=value(raw).replace(/^r2:\/\//i,'');
  if(!path.startsWith('private-library/'))return '';
  if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(id)||!path.startsWith(GAMEPLUS_PREFIX+id+'/'))throw Error('Dossier Game+ invalide.');
  const key=objectKey(path);
  if(type==='image'&&!/\.(png|jpe?g|webp|gif|avif)$/i.test(key))throw Error('Format image invalide.');
  return key;
}
export function imageSource(item,type,index=0){
  if(type==='cover')return value(item.coverKey||item.cover||item.cover_url||item.image||item.img);
  if(type==='banner')return value(item.bannerKey||item.banner||item.banner_url);
  if(type==='gallery')return value((item.galleryKeys||item.gallery||[])[index]);
  return '';
}
export function publicImage(item,type,index=0){
  const raw=imageSource(item,type,index),id=gameId(item);
  try{
    if(gameplusKey(raw,id,'image'))return '/api/gameplus-media?'+new URLSearchParams({id,type,...(type==='gallery'?{index:String(index)}:{})});
    return httpTarget(raw);
  }catch{return '';}
}
export function resolveLink(item,type){
  const links=item?.links;
  const source=entry=>typeof entry==='string'?entry:value(entry?.r2Key||entry?.url||entry?.href||entry?.link);
  if(Array.isArray(links)){
    for(let i=0;i<links.length;i++){
      const link=links[i];if(!link)continue;
      const key=value(link.key||`link_${i}`);
      if(type===key||type===String(i)||type===`link_${i}`)return source(link);
    }
  }else if(links&&typeof links==='object'&&Object.hasOwn(links,type))return source(links[type]);
  return '';
}
export async function serveGameplusMedia(context,key,attachment=false){
  if(!context.env.MEDIA_BUCKET)return new Response(null,{status:503,headers:{'Cache-Control':'private, no-store'}});
  const original=await preview(context.request,context.env.MEDIA_BUCKET,key,attachment);
  const response=new Response(original.body,original);
  response.headers.set('Cache-Control','private, no-store');
  response.headers.set('X-Robots-Tag','noindex, nofollow, noarchive');
  response.headers.set('Cross-Origin-Resource-Policy','same-origin');
  if(response.status!==416){
    const ext=key.split('.').pop().toLowerCase();
    const imageTypes={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',avif:'image/avif'};
    response.headers.set('Content-Type',attachment?'application/octet-stream':imageTypes[ext]||'application/octet-stream');
  }
  return response;
}
