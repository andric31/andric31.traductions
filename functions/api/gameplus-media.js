import {member} from './_library.js';
import {silent} from './_r2.js';
import {fetchGamePlusDoc,getItem,gameplusKey,imageSource,serveGameplusMedia} from './_gameplus.js';
export async function onRequest(context){
  const {request}=context;
  if(!['GET','HEAD'].includes(request.method))return silent(405);
  const auth=await member(context);if(auth.response)return silent(auth.response.status);
  if(request.headers.get('sec-fetch-site')==='cross-site')return silent(403);
  try{
    const p=new URL(request.url).searchParams,id=String(p.get('id')||'').trim(),type=p.get('type');
    if(!id||!['cover','banner','gallery'].includes(type))return silent(400);
    if(type==='gallery'&&!/^\d{1,4}$/.test(p.get('index')||''))return silent(400);
    const item=getItem(await fetchGamePlusDoc(context),id);if(!item)return silent(404);
    const key=gameplusKey(imageSource(item,type,Number(p.get('index')||0)),id,'image');
    if(!key)return silent(404);
    return await serveGameplusMedia(context,key);
  }catch(e){return silent(e.status===416?416:e.status===503?503:404);}
}
