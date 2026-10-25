import {comicFormatOf,readingDirectionOf} from './catalogue.js?v=20261025-420';
import {openPrivateCbz,renderCbzPages} from './cbz-reader.js?v=20261025-422';
const $=id=>document.getElementById(id);
const kind=document.body.dataset.kind, comic=kind==='bibliotheque', title=comic?'Bibliothèque':'Dramas';
const preview=document.documentElement.dataset.preview==='local';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={items:[],format:'all',q:'',sort:'recent',item:null,unit:0,page:0,mode:'page',direction:'ltr',zoom:100};
let pageSize={width:3,height:4};
let archive=null,archiveController=null,archiveLoading=false,archiveError='',archiveGeneration=0,releasePages=()=>{};
function resetArchive(){archiveGeneration++;archiveController?.abort();archiveController=null;releasePages();releasePages=()=>{};archive=null;archiveLoading=false;archiveError='';}
const originalTitle=item=>!comic&&item.originalTitle?.trim()!==item.title?.trim()?item.originalTitle?.trim()||'':'';
const formatLabel=item=>comicFormatOf(item)==='manga'?'Manga':'Comic';
const demoWords=comic?['Des histoires\nà découvrir','Une nouvelle\npage','À suivre…','Un autre\nunivers','Bientôt\nà lire','La suite\narrive']:
  ['De nouvelles\nhistoires','Le prochain\népisode','À découvrir\nbientôt','Un autre\nregard','La suite\narrive','Rendez-vous\nbientôt'];
function demos(){return demoWords.map((word,i)=>({id:'preview-'+i,title:(comic?(i%2?'Comic':'Manga'):'Drama')+' à venir'+(i?' · '+(i+1):''),word,
  ...(comic?{format:i%2?'comic':'manga',readingDirection:'auto'}:{}),
  demo:true,status:'soon',tags:[],description:comic?'Les premiers mangas et comics arrivent bientôt. Découvre la lecture page par page, de gauche à droite ou de droite à gauche, et le défilement vertical.':'Les premières séries arrivent bientôt. Retrouve ici leur présentation et leurs épisodes, à regarder directement sur le site.',
  units:Array.from({length:3},(_,n)=>({id:'preview-'+n,title:(comic?'Lecture ':'Épisode ')+(n+1),status:'soon',pages:[]}))}));}
function safeMedia(raw){try{const u=new URL(raw,location.href);return u.origin===location.origin&&u.pathname==='/api/library-media'?u.href:'';}catch{return '';}}
function poster(item,i=0){const cover=safeMedia(item.cover);return `<div class="ml-poster" style="--hue:${[217,276,169,30,333,195][i%6]}">
  ${cover?`<div class="ml-poster-image-fallback">${esc(item.title)}</div><img src="${esc(cover)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:
  `<div class="ml-poster-art"></div><span class="ml-poster-type">${comic?'Histoires illustrées':'Séries & épisodes'}</span><div class="ml-poster-word">${esc(item.word||item.title).replace(/\n/g,'<br>')}<small>${item.demo?(comic?'Bientôt dans la bibliothèque':'Bientôt sur '+title):'andric31 · '+title}</small></div>`}
  <span class="ml-play" aria-hidden="true">${comic?'▤':'▶'}</span></div>`;}
function render(){
  const all=state.items.length?state.items:demos();
  const q=state.q.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  let rows=all.filter(r=>(!comic||state.format==='all'||comicFormatOf(r)===state.format)&&[r.title,r.originalTitle,r.author,...r.tags].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(q));
  if(state.sort==='title')rows.sort((a,b)=>a.title.localeCompare(b.title,'fr'));
  if(state.sort==='recent')rows.sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''));
  $('count').textContent=state.items.length?rows.length+' '+(comic?'titre':'série')+(rows.length>1?'s':''):comic?'Aperçu · aucun contenu publié':'Aperçu';
  $('grid').innerHTML=rows.map((r,i)=>`<article class="ml-card"><button type="button" data-open="${esc(r.id)}" aria-label="${esc((r.demo?'Découvrir l’aperçu : ':'Ouvrir : ')+r.title)}">${poster(r,i)}<div class="ml-card-info"><h3>${esc(r.title)}</h3>${originalTitle(r)?`<p class="ml-original-title">${esc(originalTitle(r))}</p>`:''}<p>${comic?formatLabel(r)+' · ':''}${r.demo?'Découvrir le lecteur':r.units.filter(u=>u.status==='available').length+' '+(comic?'lecture(s)':'épisode(s)')}</p></div></button></article>`).join('');
  $('empty').hidden=rows.length>0;
  $('grid').querySelectorAll('img').forEach(img=>{
    const fallback=img.previousElementSibling;
    const loaded=()=>{if(fallback)fallback.hidden=true;};
    const failed=()=>{if(fallback)fallback.hidden=false;img.remove();};
    img.addEventListener('load',loaded,{once:true});img.addEventListener('error',failed,{once:true});
    if(img.complete){if(img.naturalWidth)loaded();else failed();}
  });
}
function demoPage(n){return `<article class="ml-demo-page" aria-label="Page d’aperçu ${n+1}"><header><span>${formatLabel(state.item).toUpperCase()} · APERÇU DU LECTEUR</span><span>0${n+1}</span></header><div class="ml-demo-panels"><div class="ml-demo-panel"></div><div class="ml-demo-panel"></div></div><div class="ml-demo-wide"><p>${['Une nouvelle histoire commence ici…','Une page après l’autre.','À bientôt pour la suite.'][n%3]}</p></div><footer>Visuel de démonstration · aucun titre publié pour le moment</footer></article>`;}
function currentUnit(){return state.item?.units[state.unit];}
function pageCount(){return state.item?.demo?3:currentUnit()?.source==='cbz'?(archive?.pages.length||0):(currentUnit()?.pages?.length||0);}
function updateReadingDirection(){
  const rtl=state.mode==='page'&&state.direction==='rtl';
  $('pageControls').classList.toggle('is-rtl',rtl);
  $('pagePrev').textContent=rtl?'→':'←';$('pageNext').textContent=rtl?'←':'→';
  $('readingDirection').value=state.direction;$('readingDirection').disabled=state.mode==='scroll';
}
function fitComicPage(){
  const stage=$('comicStage'),inner=$('comicInner');
  inner.style.setProperty('--reader-width',state.zoom+'%');
  $('zoomValue').textContent=state.zoom+' %';
  if(state.mode!=='page'||!stage.clientWidth||!stage.clientHeight)return;
  const scale=Math.min(stage.clientWidth/pageSize.width,stage.clientHeight/pageSize.height)*state.zoom/100;
  inner.style.setProperty('--page-width',pageSize.width*scale+'px');
  inner.style.setProperty('--page-height',pageSize.height*scale+'px');
}
function comicPageLoaded(image){
  if(state.mode!=='page'||!image.naturalWidth||!image.naturalHeight)return;
  pageSize={width:image.naturalWidth,height:image.naturalHeight};
  $('detailDialog').style.setProperty('--comic-ratio',String(pageSize.width/pageSize.height));
  fitComicPage();
}
function updatePages(){
  updateReadingDirection();
  const count=pageCount();state.page=Math.max(0,Math.min(state.page,count-1));
  const pages=state.mode==='scroll'?Array.from({length:count},(_,i)=>i):count?[state.page]:[];
  $('detailDialog').classList.toggle('is-scroll',state.mode==='scroll');
  $('reader').classList.toggle('is-page',state.mode==='page');
  pageSize={width:3,height:4};
  $('detailDialog').style.removeProperty('--comic-ratio');
  fitComicPage();
  releasePages();releasePages=()=>{};
  if(!state.item.demo&&currentUnit()?.source==='cbz'){
    $('comicInner').replaceChildren();
    if(archive)releasePages=renderCbzPages({archive,container:$('comicInner'),stage:$('comicStage'),indices:pages,vertical:state.mode==='scroll',onImageLoad:comicPageLoaded});
    else {
      const message=document.createElement('p');message.className='ml-page-error';message.setAttribute('role','status');message.textContent=archiveLoading?'Ouverture du CBZ…':archiveError||'Cette lecture sera disponible prochainement.';
      if(archiveError){const retry=document.createElement('button');retry.type='button';retry.className='ml-btn';retry.textContent='Réessayer';retry.onclick=()=>selectUnit(state.unit);message.append(document.createElement('br'),retry);}
      $('comicInner').append(message);
    }
  }else $('comicInner').innerHTML=pages.map(i=>state.item.demo?demoPage(i):`<img src="${esc(safeMedia(currentUnit().pages[i]))}" alt="Page ${i+1}" loading="${state.mode==='scroll'?'lazy':'eager'}" referrerpolicy="no-referrer" data-page="${i}">`).join('')||'<p class="ml-page-error">Cette lecture sera disponible prochainement.</p>';
  $('comicInner').querySelectorAll('img[data-page]').forEach(img=>{
    img.addEventListener('load',()=>comicPageLoaded(img),{once:true});
    img.addEventListener('error',()=>{const p=document.createElement('p');p.className='ml-page-error';p.textContent=img.alt+' indisponible. Réessaie après avoir vérifié ta connexion.';img.replaceWith(p);},{once:true});
    if(img.complete&&img.naturalWidth)comicPageLoaded(img);
  });
  $('pageLabel').textContent=count?(state.mode==='scroll'?count+' pages · défilement':'Page '+(state.page+1)+' / '+count):archiveLoading?'Chargement…':archiveError?'Indisponible':'Prochainement';
  $('pageRange').max=String(Math.max(1,count));$('pageRange').value=String(state.page+1);$('pageRange').disabled=!count||state.mode==='scroll';
  $('pagePrev').disabled=!count||state.page===0||state.mode==='scroll';$('pageNext').disabled=!count||state.page===count-1||state.mode==='scroll';
  $('comicStage').scrollTop=0;$('comicStage').scrollLeft=0;
}
function videoMessage(message){$('videoMessage').textContent=message;$('videoPlaceholder').hidden=false;$('video').hidden=true;}
function positionSubtitles(track){
  // Garder une marge sous les sous-titres, même lorsque les commandes disparaissent.
  for(const cue of track.cues||[]){
    cue.snapToLines=true;cue.line=-4;cue.lineAlign='start';
    cue.position=50;cue.positionAlign='center';cue.size=92;cue.align='center';
  }
}
function selectUnit(index){
  state.unit=index;state.page=0;
  document.querySelectorAll('[data-unit]').forEach(b=>b.setAttribute('aria-current',String(Number(b.dataset.unit)===index)));
  if(comic){
    resetArchive();const unit=currentUnit(),src=safeMedia(unit?.archive);
    if(unit?.source==='cbz'&&src){
      archiveLoading=true;archiveController=new AbortController();const generation=archiveGeneration;
      openPrivateCbz(src,{signal:archiveController.signal}).then(value=>{if(generation!==archiveGeneration)return;archive=value;archiveLoading=false;updatePages();}).catch(e=>{if(generation!==archiveGeneration||e.name==='AbortError')return;archiveError=e.message||'Lecture du CBZ impossible.';archiveLoading=false;updatePages();});
    }
    updatePages();return;
  }
  const video=$('video');video.pause();video.removeAttribute('src');video.replaceChildren();video.load();
  $('detailDialog').style.removeProperty('--video-ratio');
  const u=currentUnit(),src=safeMedia(u?.src);
  $('videoPlaceholder').hidden=!!src;video.hidden=!src;
  $('subtitleMessage').textContent='';
  if(src){
    video.src=src;
    for(const sub of u.subtitles||[]){const url=safeMedia(sub.src);if(!url)continue;const track=document.createElement('track');track.kind='subtitles';track.srclang=sub.lang;track.label=sub.label;track.src=url;track.default=sub.default===true;track.addEventListener('load',()=>positionSubtitles(track.track));track.addEventListener('error',()=>{$('subtitleMessage').textContent='Une piste de sous-titres est indisponible. La vidéo reste accessible.';});video.append(track);}
    video.load();
  }else videoMessage('Les premiers épisodes arrivent bientôt. Le lecteur sera disponible ici, dès leur publication.');
}
function openItem(id){
  const item=[...state.items,...demos()].find(r=>r.id===id);if(!item)return;
  state.item=item;state.unit=0;state.page=0;
  if($('detailTitle'))$('detailTitle').textContent=item.title;
  $('detailName').textContent=item.title;
  if($('detailOriginalTitle')){$('detailOriginalTitle').textContent=originalTitle(item);$('detailOriginalTitle').hidden=!originalTitle(item);}
  $('detailDesc').textContent=item.description||'La présentation sera ajoutée prochainement.';
  $('detailTags').innerHTML=[...(comic?[formatLabel(item)]:[]),item.author,...item.tags].filter(Boolean).map(t=>`<span class="ml-tag">${esc(t)}</span>`).join('');
  $('unitHeading').textContent=comic?'Contenu à lire':'Épisodes';
  $('units').innerHTML=item.units.map((u,i)=>`<button class="ml-unit" data-unit="${i}" type="button" aria-current="${i===0}" ${(item.demo&&i===0)||u.status==='available'?'':'disabled'}><span>${esc(u.title)}</span><small>${item.demo?'Prochainement':u.status==='available'?(comic?(u.source==='cbz'?'Lire CBZ':u.pages.length+' pages'):'Lire ▶'):'Prochainement'}</small></button>`).join('')||'<p class="ml-description">'+(comic?'Les lectures':'Les épisodes')+' arrivent bientôt.</p>';
  $('previewNote').hidden=!item.demo;$('previewNote').textContent=comic?'Ces trois pages neutres servent uniquement à découvrir le lecteur.':'Présentation du futur lecteur. Aucun épisode n’est encore publié.';
  if(comic){state.zoom=100;state.direction=readingDirectionOf(item);$('readingMode').value=state.mode;$('zoom').value=state.zoom;}
  const available=item.units.findIndex(u=>u.status==='available');
  selectUnit(available>=0?available:0);
  $('detailDialog').showModal();document.body.style.overflow='hidden';if(comic)fitComicPage();
}
function showGate(message,login=false){
  if($('detailDialog').open)$('detailDialog').close();
  state.items=[];$('grid').replaceChildren();$('app').hidden=true;$('gate').hidden=false;
  $('gateTitle').textContent=login?'🔒 '+title:'Chargement de '+title;
  $('gateText').textContent=message;$('loginLink').hidden=!login;$('retry').hidden=login;
}
let requestNumber=0;
async function load(){
  const n=++requestNumber;
  try{
    let data;
    if(preview)data={ok:true,items:[]};
    else {
      const response=await fetch('/api/library?kind='+kind,{cache:'no-store',credentials:'same-origin'});
      if(n!==requestNumber)return;
      if(response.status===401){showGate('Connecte-toi pour accéder à cette section privée et à ses lecteurs.',true);return;}
      data=await response.json();if(!response.ok||!data.ok)throw Error(data.error||'Chargement impossible.');
    }
    if(n!==requestNumber)return;
    state.items=Array.isArray(data.items)?data.items:[];$('gate').hidden=true;$('app').hidden=false;render();
    if(preview)$('privateLabel').textContent='Aperçu local';
  }catch{if(n===requestNumber)showGate('Le catalogue ne répond pas pour le moment. Réessaie dans un instant.');}
}
$('search').addEventListener('input',e=>{state.q=e.target.value;render();});
$('sort').addEventListener('change',e=>{state.sort=e.target.value;render();});
$('grid').addEventListener('click',e=>{const b=e.target.closest('[data-open]');if(b)openItem(b.dataset.open);});
$('units').addEventListener('click',e=>{const b=e.target.closest('[data-unit]');if(b&&!b.disabled)selectUnit(Number(b.dataset.unit));});
$('closeDetail').addEventListener('click',async()=>{if(comic&&document.fullscreenElement){try{await document.exitFullscreen();}catch{}}$('detailDialog').close();});
$('detailDialog').addEventListener('close',()=>{if(!comic){$('video').pause();$('video').removeAttribute('src');$('video').replaceChildren();$('video').load();}else {resetArchive();$('comicInner').replaceChildren();}document.body.style.overflow='';});
$('detailDialog').addEventListener('click',e=>{if(e.target===$('detailDialog')){const b=e.target.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)e.target.close();}});
if(comic){
  $('formatFilter').addEventListener('change',e=>{state.format=e.target.value;render();});
  $('readingDirection').addEventListener('change',e=>{state.direction=e.target.value;updateReadingDirection();});
  $('readingMode').addEventListener('change',e=>{state.mode=e.target.value;updatePages();});
  $('zoom').addEventListener('input',e=>{state.zoom=Number(e.target.value);fitComicPage();});
  $('fitPage').addEventListener('click',()=>{state.zoom=100;$('zoom').value='100';fitComicPage();$('comicStage').scrollTop=0;$('comicStage').scrollLeft=0;});
  new ResizeObserver(fitComicPage).observe($('comicStage'));
  $('pagePrev').addEventListener('click',()=>{state.page--;updatePages();});$('pageNext').addEventListener('click',()=>{state.page++;updatePages();});
  $('pageRange').addEventListener('input',e=>{state.page=Number(e.target.value)-1;updatePages();});
  const fullscreenLabel=()=>{$('fullscreen').textContent=document.fullscreenElement?'⛶ Quitter le plein écran':$('detailDialog').classList.contains('is-expanded')?'⛶ Réduire':'⛶ Plein écran';};
  $('fullscreen').addEventListener('click',async()=>{
    const dialog=$('detailDialog');
    if(dialog.classList.contains('is-expanded'))dialog.classList.remove('is-expanded');
    else {try{if(document.fullscreenElement)await document.exitFullscreen();else await $('reader').parentElement.requestFullscreen();}catch{dialog.classList.add('is-expanded');}}
    fullscreenLabel();fitComicPage();
  });
  document.addEventListener('fullscreenchange',()=>{fullscreenLabel();fitComicPage();});
  $('detailDialog').addEventListener('cancel',e=>{if($('detailDialog').classList.contains('is-expanded')){e.preventDefault();$('detailDialog').classList.remove('is-expanded');fullscreenLabel();fitComicPage();}});
  $('detailDialog').addEventListener('close',()=>{$('detailDialog').classList.remove('is-expanded');fullscreenLabel();});
  document.addEventListener('keydown',e=>{if(!$('detailDialog').open||state.mode!=='page'||e.altKey||e.ctrlKey||e.metaKey||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)||e.target.isContentEditable)return;const rtl=state.direction==='rtl',id=e.key==='ArrowLeft'?(rtl?'pageNext':'pagePrev'):e.key==='ArrowRight'?(rtl?'pagePrev':'pageNext'):'';if(id&&!$(id).disabled){e.preventDefault();$(id).click();}});
}else {
  const video=$('video');
  video.addEventListener('error',()=>videoMessage('Cet épisode ne peut pas être lu. Vérifie ta connexion ou réessaie plus tard.'));
  const updateVideoRatio=()=>{
    if(!video.videoWidth||!video.videoHeight)return;
    $('detailDialog').style.setProperty('--video-ratio',String(video.videoWidth/video.videoHeight));
  };
  video.addEventListener('loadedmetadata',updateVideoRatio);
  video.addEventListener('resize',updateVideoRatio);
  const updateSubtitles=()=>{for(const track of video.textTracks)positionSubtitles(track);};
  video.textTracks.addEventListener('change',updateSubtitles);
}
$('retry').addEventListener('click',load);
const theme=$('theme');try{theme.value=localStorage.getItem('viewerTheme')||'auto';}catch{}
if(!theme.value)theme.value='auto';
theme.addEventListener('change',()=>{if(theme.value==='auto')document.documentElement.removeAttribute('data-theme');else document.documentElement.dataset.theme=theme.value;try{localStorage.setItem('viewerTheme',theme.value);}catch{}});
window.addEventListener('pageshow',e=>{if(e.persisted)load();});
window.addEventListener('focus',()=>{if(!preview)load();});
load();
