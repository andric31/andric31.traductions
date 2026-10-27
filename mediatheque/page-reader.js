const PAGE_LIMIT=20*1024*1024;
const aborted=()=>new DOMException('Lecture fermée.','AbortError');
const uncachedPage=url=>Object.assign(Error('Image trop volumineuse pour le préchargement.'),{name:'UncachedPageError',pageUrl:url});

// Trois pages au maximum, uniquement en mémoire et pendant cette lecture.
export function createPageCache(load){
  const entries=new Map();let generation=0,closed=false;
  function remove(index,entry){
    entry.controller.abort();if(entry.url)URL.revokeObjectURL(entry.url);
    if(entries.get(index)===entry)entries.delete(index);
  }
  function get(index){
    if(closed)return Promise.reject(aborted());
    const existing=entries.get(index);if(existing)return existing.promise;
    const entry={controller:new AbortController(),url:''};entries.set(index,entry);
    entry.promise=Promise.resolve().then(()=>{
      entry.controller.signal.throwIfAborted();
      return load(index,{signal:entry.controller.signal});
    }).then(blob=>{
      entry.controller.signal.throwIfAborted();
      if(closed||entries.get(index)!==entry)throw aborted();
      if(!blob.size||blob.size>PAGE_LIMIT)throw Error('Cette page est vide ou dépasse 20 Mo.');
      entry.url=URL.createObjectURL(blob);return entry.url;
    }).catch(error=>{remove(index,entry);throw error;});
    return entry.promise;
  }
  return {
    focus(index,count){
      if(closed)return Promise.reject(aborted());
      if(!Number.isInteger(index)||index<0||index>=count)return Promise.reject(Error('Page inconnue.'));
      const token=++generation,nearby=[index,index+1,index-1].filter(n=>n>=0&&n<count);
      for(const [n,entry] of entries)if(!nearby.includes(n))remove(n,entry);
      const current=get(index);
      // La page demandée passe avant les préchargements, qui restent séquentiels.
      current.then(async()=>{
        for(const n of nearby.slice(1)){
          if(closed||token!==generation)return;
          try{await get(n);}catch{/* Une page voisine sera réessayée à son ouverture. */}
        }
      }).catch(()=>{});
      return current;
    },
    dispose(){closed=true;generation++;for(const [n,entry] of entries)remove(n,entry);}
  };
}

export async function loadPrivatePage(raw,{signal,fetcher=fetch,origin=location.origin}={}){
  const url=new URL(raw,origin);
  if(url.origin!==origin||url.pathname!=='/api/library-media'||url.searchParams.get('type')!=='page')throw Error('Adresse de page invalide.');
  const response=await fetcher(url.href,{signal,credentials:'same-origin',cache:'no-store'});
  if(!response.ok){await response.body?.cancel();throw Error(response.status===401?'Reconnecte-toi pour continuer la lecture.':'Cette page ne peut pas être chargée. Réessaie dans un instant.');}
  const type=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  if(!/^image\/(png|jpeg|webp|gif|avif)$/.test(type)){await response.body?.cancel();throw Error('Image non reconnue.');}
  if(Number(response.headers.get('content-length'))>PAGE_LIMIT){await response.body?.cancel();throw uncachedPage(url.href);}
  const reader=response.body.getReader(),chunks=[];let size=0,complete=false;
  try{
    while(true){signal?.throwIfAborted();const {done,value}=await reader.read();signal?.throwIfAborted();if(done)break;size+=value.length;if(size>PAGE_LIMIT)throw uncachedPage(url.href);chunks.push(value);}
    complete=true;
  }finally{if(!complete)try{await reader.cancel();}catch{}reader.releaseLock();}
  return new Blob(chunks,{type});
}

// Un mouvement continu du pavé tactile ne doit pas sauter plusieurs pages.
export function bindPageWheel(stage,{enabled,turn,clock=()=>performance.now()}){
  let last=-Infinity,direction=0,total=0,used=false;
  const wheel=event=>{
    if(!enabled()||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey||event.target.closest?.('button,a,input,select,textarea'))return;
    if(!Number.isFinite(event.deltaY)||!event.deltaY||Math.abs(event.deltaX)>Math.abs(event.deltaY))return;
    // Une image agrandie conserve son défilement normal, jusqu’au retour à Ajuster.
    if(stage.scrollHeight>stage.clientHeight+2||stage.scrollWidth>stage.clientWidth+2)return;
    event.preventDefault();
    const now=clock(),nextDirection=Math.sign(event.deltaY);
    if(now-last>180||nextDirection!==direction){total=0;used=false;}
    last=now;direction=nextDirection;
    if(used)return;
    total+=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?stage.clientHeight:1);
    if(Math.abs(total)<32)return;
    used=true;turn(direction);
  };
  stage.addEventListener('wheel',wheel,{passive:false});
  return ()=>stage.removeEventListener('wheel',wheel);
}
