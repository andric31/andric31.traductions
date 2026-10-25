import {openCbz,CBZ_LIMITS} from './cbz.js?v=20261025-galerie-v403';

function check(ok,message){if(!ok)throw Error(message);}
function failure(response){return Error(response.status===401?'Reconnecte-toi pour lire ce chapitre.':response.status===404?'Ce CBZ est indisponible.':'Le CBZ ne peut pas être chargé. Réessaie dans un instant.');}
async function limitedBytes(response,length){
  const reader=response.body.getReader(),chunks=[];let total=0,done=false;
  try{
    while(true){const next=await reader.read();if(next.done)break;total+=next.value.length;check(total<=length,'Réponse CBZ trop volumineuse.');chunks.push(next.value);}
    check(total===length,'Lecture du CBZ incomplète.');done=true;
  }finally{if(!done)try{await reader.cancel();}catch{}reader.releaseLock();}
  const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}

// Chaque plage repasse par l’API privée ; aucune URL publique ni stockage hors ligne.
export async function openPrivateCbz(raw,{signal,fetcher=fetch,origin=location.origin}={}){
  const url=new URL(raw,origin);
  check(url.origin===origin&&url.pathname==='/api/library-media'&&url.searchParams.get('type')==='archive','Adresse du CBZ invalide.');
  const options={credentials:'same-origin',cache:'no-store',signal};
  const head=await fetcher(url.href,{...options,method:'HEAD'});
  if(!head.ok)throw failure(head);
  const size=Number(head.headers.get('content-length')),etag=head.headers.get('etag');
  check(Number.isSafeInteger(size)&&size>=22&&size<=CBZ_LIMITS.archive,'Taille du CBZ invalide (512 Mo maximum).');
  check(etag,'Le CBZ ne fournit pas de version de fichier.');
  const cache=[];let cachedBytes=0;
  async function range(start,end,localSignal){
    const requestSignal=localSignal&&signal?AbortSignal.any([signal,localSignal]):localSignal||signal;
    requestSignal?.throwIfAborted();
    check(Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start>=0&&end>start&&end<=size,'Plage du CBZ invalide.');
    const cached=cache.find(c=>c.start<=start&&c.end>=end);if(cached)return cached.bytes.slice(start-cached.start,end-cached.start);
    const response=await fetcher(url.href,{...options,signal:requestSignal,headers:{Range:`bytes=${start}-${end-1}`}});
    if(!response.ok){await response.body?.cancel();throw failure(response);}
    if(response.status!==206||response.headers.get('content-range')!==`bytes ${start}-${end-1}/${size}`||response.headers.get('etag')!==etag){
      await response.body?.cancel();throw Error('Le CBZ a changé ou sa lecture partielle est indisponible. Ferme et rouvre le chapitre.');
    }
    const bytes=await limitedBytes(response,end-start);
    // Petit cache d’index/en-têtes uniquement, libéré avec le lecteur.
    if(bytes.length<=262144){cache.push({start,end,bytes});cachedBytes+=bytes.length;while(cachedBytes>524288)cachedBytes-=cache.shift().bytes.length;}
    return bytes;
  }
  const file={name:'chapitre.cbz',size,slice(start,end){return {
    async arrayBuffer({signal}={}){return (await range(start,end,signal)).buffer;},
    stream({signal}={}){return new ReadableStream({async start(controller){try{controller.enqueue(await range(start,end,signal));controller.close();}catch(e){controller.error(e);}}});}
  };}};
  return openCbz(file,{isCancelled:()=>signal?.aborted});
}

// En mode vertical seules les pages proches de l’écran sont extraites.
export function renderCbzPages({archive,container,stage,indices,vertical=false}){
  let stopped=false,running=0;const pending=[],slots=[];
  function release(slot){slot.controller?.abort();slot.controller=null;if(slot.url){URL.revokeObjectURL(slot.url);slot.url='';}slot.image.removeAttribute('src');slot.image.hidden=true;slot.text.hidden=false;}
  function enqueue(slot){if(stopped||!slot.visible||slot.busy||slot.url)return;slot.busy=true;pending.push(slot);pump();}
  async function pump(){
    if(stopped||running>=2)return;const slot=pending.shift();if(!slot)return;
    if(!slot.visible){slot.busy=false;pump();return;}running++;
    const controller=new AbortController();slot.controller=controller;slot.text.textContent='Chargement de la page '+(slot.index+1)+'…';
    try{
      const file=await archive.extract(archive.pages[slot.index],{signal:controller.signal});
      if(stopped||!slot.visible||controller.signal.aborted)return;
      slot.url=URL.createObjectURL(file);slot.image.src=slot.url;
    }catch(e){
      if(stopped||controller.signal.aborted||e.name==='AbortError')return;
      slot.text.textContent=e.message||'Page indisponible.';const retry=document.createElement('button');retry.className='ml-btn';retry.type='button';retry.textContent='Réessayer';retry.onclick=()=>enqueue(slot);slot.text.append(document.createElement('br'),retry);
    }finally{slot.busy=false;running--;if(slot.visible&&controller.signal.aborted&&!stopped)enqueue(slot);pump();}
  }
  const observer=vertical?new IntersectionObserver(entries=>{
    for(const entry of entries){const slot=slots.find(s=>s.box===entry.target);slot.visible=entry.isIntersecting;if(slot.visible)enqueue(slot);else release(slot);}
  },{root:stage,rootMargin:'300px 0px'}):null;
  for(const index of indices){
    const box=document.createElement('div'),image=document.createElement('img'),text=document.createElement('p');
    box.className='ml-cbz-sheet';text.className='ml-cbz-placeholder';text.textContent='Page '+(index+1);image.alt='Page '+(index+1);image.hidden=true;
    const slot={index,box,image,text,visible:!vertical,busy:false,url:'',controller:null};slots.push(slot);
    image.onload=()=>{if(stopped||!slot.visible)return;box.style.aspectRatio=image.naturalWidth+' / '+image.naturalHeight;image.hidden=false;text.hidden=true;};
    image.onerror=()=>{release(slot);text.textContent='Page illisible.';};
    box.append(text,image);container.append(box);if(observer)observer.observe(box);else enqueue(slot);
  }
  return ()=>{stopped=true;observer?.disconnect();pending.length=0;for(const slot of slots)release(slot);};
}
