// GitHub stays primary. The browser asks for R2 first only after its primary request fails.
import {loadPublicList} from './_list_sources.js';
export async function onRequest(context){
  const {request}=context;
  const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*','access-control-allow-methods':'GET,OPTIONS','access-control-allow-headers':'content-type'};
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='GET')return new Response(JSON.stringify({ok:false,error:'Méthode non autorisée'}),{status:405,headers});
  const params=new URL(request.url).searchParams,list=params.get('list')||'main';
  if(!['main','vofr'].includes(list))return new Response(JSON.stringify({ok:false,error:'Liste non autorisée'}),{status:400,headers});
  try{
    const {doc,source}=await loadPublicList(context,{list,preferR2:params.get('source')==='r2'});
    return new Response(JSON.stringify(doc),{headers:{...headers,'x-andric31-f95list-source':source}});
  }catch{return new Response(JSON.stringify({ok:false,error:'Liste temporairement indisponible.'}),{status:503,headers});}
}
