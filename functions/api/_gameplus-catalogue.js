import {normalize,validate} from './_gameplus-model.js';
export const GAMEPLUS_CATALOGUE_KEY='private-library/gameplus/catalogue.json';
export async function readGamePlusCatalogue(env){
  if(!env.MEDIA_BUCKET)throw Error('La liaison MEDIA_BUCKET est absente.');
  const object=await env.MEDIA_BUCKET.get(GAMEPLUS_CATALOGUE_KEY);
  if(!object)return {doc:normalize({version:1,items:{}}),etag:''};
  if(object.size>2*1024*1024)throw Error('Catalogue trop volumineux (2 Mo).');
  return {doc:validate(JSON.parse(await object.text())),etag:object.etag};
}
