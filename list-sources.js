/* Shared list loading; ordinary sources stay first, R2 is a fallback only. */
(function(g){
  'use strict';
  const MAIN='https://raw.githubusercontent.com/andric31/f95list/main/f95list.json';
  function kind(url){
    try{
      const u=new URL(url,location.href);if(u.username||u.password)return '';
      if(u.origin===location.origin){if(u.pathname==='/data/f95list.json')return 'main';if(u.pathname==='/api/f95list')return u.searchParams.get('list')==='vofr'?'vofr':'main';}
      if(u.origin!=='https://raw.githubusercontent.com')return '';
      if(/^\/andric31\/f95list\/(?:refs\/heads\/)?main\/f95list\.json$/.test(u.pathname))return 'main';
      if(/^\/andric31\/traductions\/(?:refs\/heads\/)?main\/f95list_vofr\.json$/.test(u.pathname))return 'vofr';
    }catch{}
    return '';
  }
  function valid(doc,creators=false){
    if(doc?.ok===false||doc?.error)return false;
    const rows=Array.isArray(doc)?doc:(creators?['creators']:['games','list','items','data','rows','results']).map(k=>doc?.[k]).find(Array.isArray);
    return !!rows&&rows.every(v=>v&&typeof v==='object'&&!Array.isArray(v));
  }
  async function read(url,creators=false){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6000);
    try{
      const response=await fetch(url,{cache:'no-store',signal:controller.signal});
      if(!response.ok)throw Error('Source HTTP '+response.status);
      const doc=await response.json();if(!valid(doc,creators))throw Error('Liste invalide.');return doc;
    }finally{clearTimeout(timer);}
  }
  async function first(urls,creators=false){let error;for(const url of new Set(urls))try{return await read(url,creators);}catch(e){error=e;}throw error||Error('Liste indisponible.');}
  function loadList(url=MAIN){
    const primary=String(url||MAIN).trim()||MAIN,type=kind(primary),urls=[primary];
    if(type){urls.push('/api/f95list?source=r2'+(type==='vofr'?'&list=vofr':''));if(type==='main')urls.push('/data/f95list.json');}
    return first(urls);
  }
  function loadCreators(){return first(['/data/creators.json','/api/creators'],true);}
  g.SiteDataSources=Object.freeze({loadList,loadCreators});
})(globalThis);
