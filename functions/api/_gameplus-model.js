// Même modèle que gameplus/model.js dans le manager.

  const str=v=>String(v??'').trim();
  const copy=v=>JSON.parse(JSON.stringify(v));
  const reserved=new Set(['__proto__','constructor','prototype']);
  function section(raw){const s=str(raw).toLowerCase();if(['trad','translation','patch_fr','fr','traduction'].includes(s))return 'traduction';if(['download','game','jeu','windows','win','linux','win_linux','mac','macos','android'].includes(s))return 'download';if(['source','patreon','official','site','discord','itch','steam'].includes(s))return 'source';return 'other';}
  function links(raw){
    const entries=Array.isArray(raw)?raw.map((v,i)=>[typeof v==='object'&&v?.key||'link_'+i,v]):raw&&typeof raw==='object'?Object.entries(raw):[];
    return entries.map(([key,value])=>{
      const l=typeof value==='string'?{url:value}:value||{};
      return {...l,key:str(l.key||key),section:section(l.section||l.category||l.type||key),label:str(l.label??l.name??l.title??key),url:str(l.r2Key||l.url||l.href||l.link)};
    });
  }
  function normalize(raw){
    if(!raw||typeof raw!=='object')throw Error('Catalogue Game+ invalide.');
    const doc=Array.isArray(raw)?{version:1,items:raw}:copy(raw);
    const input=doc.items??{};
    if(typeof input!=='object'||input===null)throw Error('La liste des jeux est invalide.');
    const entries=Array.isArray(input)?input.map(g=>[g?.id||g?.uid||g?.key,g]):Object.entries(input);
    const items={};
    for(const [key,g] of entries){
      if(!g||typeof g!=='object'||Array.isArray(g))throw Error('Fiche de jeu invalide.');
      const id=str(g.id||g.uid||g.key||key);
      if(!id||reserved.has(id)||Object.hasOwn(items,id))throw Error('Identifiant manquant, réservé ou en double : '+id);
      const normalized={...copy(g),id,title:str(g.title||g.cleanTitle||g.name),developer:str(g.developer||g.author||g.creator),description:str(g.description||g.desc),information:str(g.information||g.informations||g.info||g.notes),tags:Array.isArray(g.tags)?g.tags.map(str):str(g.tags).split(',').map(str).filter(Boolean),visible:g.visible!==false&&g.visible!==0&&g.hidden!==true,links:links(g.links)};
      if(g.source?.url&&!normalized.links.some(l=>l.url===g.source.url))normalized.links.push({key:'source_legacy',section:'source',label:str(g.source.name||g.source.type||'Source'),url:g.source.url});
      if(g.source)normalized.legacySource??=copy(g.source);
      delete normalized.source;
      items[id]=normalized;
    }
    return {...doc,version:doc.version||1,updatedAt:doc.updatedAt||'',items};
  }
  function checkSource(raw,id,image=false){
    const input=str(raw);if(!input)return;
    const key=input.replace(/^r2:\/\//i,'');
    if(key.startsWith('private-library/')){
      if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(id)||!key.startsWith('private-library/gameplus/'+id+'/')||key.length>800||new TextEncoder().encode(key).length>1024||/[\\\u0000-\u001f\u007f]/.test(key)||key.split('/').some(p=>!p||p==='.'||p==='..'||p==='.r2-folder'))throw Error('Le fichier R2 doit rester dans private-library/gameplus/'+id+'/');
      if(image&&!/\.(png|jpe?g|webp|gif|avif)$/i.test(key))throw Error('Image R2 : JPG, PNG, WebP, GIF ou AVIF attendu.');
      return;
    }
    try{const u=new URL(input);if(['https:','http:'].includes(u.protocol)&&!u.username&&!u.password)return;}catch{}
    throw Error('Utilise une URL HTTP(S) ou un chemin R2 privé.');
  }
  function validate(raw){
    const doc=normalize(raw);if(Object.keys(doc.items).length>1000)throw Error('1 000 jeux maximum.');
    for(const g of Object.values(doc.items)){
      if(!g.title)throw Error('Le titre est obligatoire pour '+g.id+'.');
      for(const image of [g.coverKey||g.cover||g.cover_url||g.image||g.img,g.bannerKey||g.banner||g.banner_url,...(g.galleryKeys||g.gallery||[])])checkSource(image,g.id,true);
      const keys=new Set();for(const l of g.links){if(!l.url)throw Error('Renseigne ou retire le lien vide de '+g.title+'.');checkSource(l.url,g.id);if(keys.has(l.key))throw Error('Identifiant de lien en double dans '+g.title+'.');keys.add(l.key);}
    }
    if(new TextEncoder().encode(JSON.stringify(doc)).length>2*1024*1024)throw Error('Catalogue trop volumineux (2 Mo).');
    return doc;
  }

export {normalize,validate};
