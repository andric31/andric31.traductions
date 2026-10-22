// Public creator data only, used when /data/creators.json cannot be loaded.
import {readR2Creators} from './_list_sources.js';
export async function onRequest({request,env}){
  const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store'};
  if(request.method!=='GET')return new Response(JSON.stringify({ok:false,error:'Méthode non autorisée'}),{status:405,headers});
  try{return new Response(JSON.stringify(await readR2Creators(env)),{headers});}
  catch{return new Response(JSON.stringify({ok:false,error:'Copie des créateurs indisponible.'}),{status:503,headers});}
}
