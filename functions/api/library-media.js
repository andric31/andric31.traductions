import {member,readCatalogue} from './_library.js';
import {preview} from './_r2_explorer.js';
import {silent} from './_r2.js';
import {toWebVTT} from '../../mediatheque/subtitles.js';
export async function onRequest(context) {
  const {request,env}=context;
  if(!['GET','HEAD'].includes(request.method))return silent(405);
  const auth=await member(context);if(auth.response)return silent(auth.response.status);
  if(request.headers.get('sec-fetch-site')==='cross-site')return silent(403);
  try {
    const p=new URL(request.url).searchParams,{doc}=await readCatalogue(env,p.get('kind'));
    const item=doc.items.find(r=>r.visible&&r.id===p.get('id'));if(!item)return silent(404);
    let key='';
    if(p.get('type')==='cover')key=item.coverKey;
    else if(item.status==='available'){
      const unit=item.units.find(u=>u.id===p.get('unit')&&u.status==='available');
      if(unit && doc.kind==='dramas' && p.get('type')==='video')key=unit.mediaKey;
      if(unit && doc.kind==='dramas' && p.get('type')==='subtitle' && /^\d+$/.test(p.get('track')||''))key=unit.subtitles[Number(p.get('track'))]?.key;
      if(unit && doc.kind==='comics' && unit.source!=='cbz' && p.get('type')==='page' && /^\d+$/.test(p.get('page')||''))key=unit.pages[Number(p.get('page'))];
      if(unit && doc.kind==='comics' && unit.source==='cbz' && p.get('type')==='archive')key=unit.archiveKey;
    }
    if(!key||!env.MEDIA_BUCKET)return silent(404);
    if(p.get('type')==='subtitle'){
      const obj=await env.MEDIA_BUCKET.get(key);if(!obj)return silent(404);if(obj.size>2*1024*1024)return silent(413);
      const converted=toWebVTT(new Uint8Array(await obj.arrayBuffer()),key);
      return new Response(request.method==='HEAD'?null:converted.text,{headers:{'Content-Type':'text/vtt; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin','X-Robots-Tag':'noindex','Vary':'Cookie'}});
    }
    const source=await preview(request,env.MEDIA_BUCKET,key,false);
    const response=new Response(source.body,source);
    response.headers.set('Cache-Control','private, no-store');
    response.headers.set('X-Robots-Tag','noindex, nofollow, noarchive');
    return response;
  } catch {return silent(404);}
}
