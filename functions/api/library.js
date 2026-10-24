import {member,readCatalogue} from './_library.js';
import {json} from './_auth.js';
import {kindOf,publicCatalogue} from '../../mediatheque/catalogue.js';
export async function onRequest(context) {
  if(context.request.method!=='GET')return json({ok:false,error:'Méthode invalide.'},405);
  const auth=await member(context);if(auth.response)return auth.response;
  let kind;try{kind=kindOf(new URL(context.request.url).searchParams.get('kind'));}catch{return json({ok:false,error:'Section invalide.'},400);}
  try {const {doc}=await readCatalogue(context.env,kind);return json(publicCatalogue(doc));}
  catch {return json({ok:false,error:'Le catalogue est momentanément indisponible.'},503);}
}
