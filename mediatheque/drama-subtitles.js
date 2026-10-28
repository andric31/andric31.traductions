// Préférences d’affichage locales : aucun envoi au serveur ou au manager.
export const STORAGE_KEY='dramaSubtitleAppearance.v1';
export const DEFAULTS=Object.freeze({size:100,color:'#ffffff',background:'#000000',opacity:80,y:80,width:88,bold:true,mask:false,maskY:80,maskWidth:100,maskHeight:16});
const limits={size:[70,170],opacity:[0,100],y:[10,92],width:[40,96],maskY:[5,95],maskWidth:[40,100],maskHeight:[5,40]};
export function normalize(raw){
  const result={...DEFAULTS};
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return result;
  for(const [key,[min,max]] of Object.entries(limits))if(typeof raw[key]==='number'&&Number.isFinite(raw[key]))result[key]=Math.max(min,Math.min(max,raw[key]));
  for(const key of ['color','background'])if(typeof raw[key]==='string'&&/^#[0-9a-f]{6}$/i.test(raw[key]))result[key]=raw[key].toLowerCase();
  for(const key of ['bold','mask'])if(typeof raw[key]==='boolean')result[key]=raw[key];
  return result;
}
export function readPreferences(storage){
  try{return normalize(JSON.parse(storage.getItem(STORAGE_KEY)));}catch{return {...DEFAULTS};}
}
export function savePreferences(storage,value){
  try{storage.setItem(STORAGE_KEY,JSON.stringify(normalize(value)));return true;}catch{return false;}
}
export function containedVideo(width,height,naturalWidth,naturalHeight){
  if(!(width>0&&height>0&&naturalWidth>0&&naturalHeight>0))return {left:0,top:0,width:0,height:0};
  const scale=Math.min(width/naturalWidth,height/naturalHeight),w=naturalWidth*scale,h=naturalHeight*scale;
  return {left:(width-w)/2,top:(height-h)/2,width:w,height:h};
}
export function topForBox(height,boxHeight,position){
  return Math.max(0,Math.min(height-boxHeight,height*position/100-boxHeight/2));
}
const rgba=(hex,opacity)=>`rgba(${[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)).join(',')},${opacity/100})`;

function init(){
  const video=document.getElementById('video'),button=document.getElementById('subtitleOptions');
  if(!video||!button)return;
  const player=video.closest('.ml-player'),reader=document.getElementById('detailDialog');
  let storage;try{storage=window.localStorage;}catch{}
  let saved=readPreferences(storage),draft={...saved},nativeVideo=false,frame=0;
  const panel=document.createElement('dialog');panel.className='ml-subtitle-dialog';panel.id='subtitleOptionsDialog';panel.setAttribute('aria-labelledby','subtitleOptionsTitle');
  panel.innerHTML=`<form id="subtitleOptionsForm">
    <header class="ml-subtitle-head"><div><h2 id="subtitleOptionsTitle">Options des sous-titres</h2><p>Ton affichage, pour tous les dramas sur ce navigateur.</p></div><button class="ml-btn ml-close" type="button" id="subtitleOptionsClose" aria-label="Fermer les options">×</button></header>
    <div class="ml-subtitle-body"><section class="ml-subtitle-preview-column" aria-label="Aperçu des sous-titres"><div class="ml-subtitle-preview-toolbar"><span>Aperçu</span><select id="subtitlePreviewFormat" aria-label="Format de l’aperçu"><option value="portrait">Vertical</option><option value="landscape">Horizontal</option></select></div><div class="ml-subtitle-preview" id="subtitlePreview"><span class="ml-subtitle-preview-original" hidden>Texte déjà incrusté dans la vidéo</span></div><p class="ml-subtitle-hint">Le fond suit le texte. Le bandeau opaque couvre une zone fixe de l’image.</p></section>
    <div class="ml-subtitle-fields"><fieldset><legend>Texte</legend>
      <label class="ml-subtitle-range" for="subtitleSize">Taille <output for="subtitleSize"></output><input id="subtitleSize" data-setting="size" type="range" min="70" max="170" step="5"></label>
      <div class="ml-subtitle-inline"><label class="ml-subtitle-color" for="subtitleColor">Couleur <input id="subtitleColor" data-setting="color" type="color"></label><label class="ml-subtitle-check"><input data-setting="bold" type="checkbox"> Texte en gras</label></div>
      <label class="ml-subtitle-range" for="subtitleY">Position verticale <output for="subtitleY"></output><input id="subtitleY" data-setting="y" type="range" min="10" max="92" step="1"></label>
      <label class="ml-subtitle-range" for="subtitleWidth">Largeur maximale <output for="subtitleWidth"></output><input id="subtitleWidth" data-setting="width" type="range" min="40" max="96" step="1"></label>
    </fieldset><fieldset><legend>Fond du texte</legend>
      <label class="ml-subtitle-color" for="subtitleBackground">Couleur du fond <input id="subtitleBackground" data-setting="background" type="color"></label>
      <label class="ml-subtitle-range" for="subtitleOpacity">Opacité <output for="subtitleOpacity"></output><input id="subtitleOpacity" data-setting="opacity" type="range" min="0" max="100" step="5"></label>
    </fieldset><fieldset><legend>Masquer le texte incrusté</legend>
      <label class="ml-subtitle-check"><input id="subtitleMask" data-setting="mask" type="checkbox"> Ajouter un bandeau noir opaque</label>
      <div id="subtitleMaskFields" hidden><p class="ml-subtitle-hint">Il reste visible entre les répliques tant qu’une piste de sous-titres est activée. Ajuste-le selon la vidéo.</p>
      <label class="ml-subtitle-range" for="subtitleMaskY">Position du bandeau <output for="subtitleMaskY"></output><input id="subtitleMaskY" data-setting="maskY" type="range" min="5" max="95" step="1"></label>
      <label class="ml-subtitle-range" for="subtitleMaskWidth">Largeur du bandeau <output for="subtitleMaskWidth"></output><input id="subtitleMaskWidth" data-setting="maskWidth" type="range" min="40" max="100" step="1"></label>
      <label class="ml-subtitle-range" for="subtitleMaskHeight">Hauteur du bandeau <output for="subtitleMaskHeight"></output><input id="subtitleMaskHeight" data-setting="maskHeight" type="range" min="5" max="40" step="1"></label></div>
    </fieldset></div></div>
    <footer class="ml-subtitle-footer"><p id="subtitleSaveMessage" role="status">Enregistré sur cet appareil, sans modifier les vidéos. En PiP ou dans le lecteur natif du téléphone, l’affichage dépend du navigateur.</p><div class="ml-subtitle-actions"><button class="ml-btn" type="button" id="subtitleReset">Réinitialiser</button><span></span><button class="ml-btn" type="button" id="subtitleCancel">Annuler</button><button class="ml-btn primary" type="submit">Enregistrer</button></div></footer>
  </form>`;
  document.body.append(panel);
  const $=id=>panel.querySelector('#'+id),form=$('subtitleOptionsForm'),preview=$('subtitlePreview');
  function makeLayer(parent){
    const layer=document.createElement('div');layer.className='ml-caption-layer';
    const mask=document.createElement('div');mask.className='ml-caption-mask';mask.hidden=true;
    const caption=document.createElement('div');caption.className='ml-caption-text';caption.hidden=true;
    layer.append(mask,caption);parent.append(layer);return {layer,mask,caption};
  }
  const live=makeLayer(player),example=makeLayer(preview);live.layer.hidden=true;
  // La piste native reste disponible pour les lecteurs externes et l’accessibilité.
  live.layer.setAttribute('aria-hidden','true');
  const demoText='Chaque histoire mérite\nd’être comprise.';
  function paint(target,settings,width,height,text,active){
    target.layer.style.width=width+'px';target.layer.style.height=height+'px';
    const font=Math.max(10,Math.min(28,height*.045,width*.052))*settings.size/100;
    Object.assign(target.caption.style,{fontSize:font+'px',fontWeight:settings.bold?'700':'400',color:settings.color,background:rgba(settings.background,settings.opacity),maxWidth:settings.width+'%',padding:'.28em .55em'});
    if(target.caption.textContent!==text)target.caption.textContent=text;
    target.caption.hidden=!text;
    target.caption.style.top=topForBox(height,target.caption.offsetHeight,settings.y)+'px';
    target.mask.hidden=!settings.mask||!active;
    Object.assign(target.mask.style,{width:settings.maskWidth+'%',height:settings.maskHeight+'%',top:topForBox(height,height*settings.maskHeight/100,settings.maskY)+'px'});
  }
  function drawPreview(){
    if(!panel.open)return;
    const {width,height}=preview.getBoundingClientRect();
    paint(example,draft,width,height,demoText,true);
    preview.querySelector('.ml-subtitle-preview-original').hidden=!draft.mask;
  }
  function cueText(track){
    return Array.from(track.activeCues||[]).map(cue=>{
      try{return cue.getCueAsHTML().textContent||'';}catch{return '';}
    }).filter(Boolean).join('\n');
  }
  function render(){
    frame=0;
    const external=nativeVideo||document.pictureInPictureElement===video||document.fullscreenElement===video;
    const visible=reader.open&&!video.hidden&&!video.error&&!!video.getAttribute('src')&&video.readyState>=2;
    player.classList.toggle('ml-caption-custom',visible&&!external);
    live.layer.hidden=!visible||external;
    if(!visible||external){live.caption.textContent='';live.mask.hidden=true;return;}
    const v=video.getBoundingClientRect(),p=player.getBoundingClientRect(),box=containedVideo(v.width,v.height,video.videoWidth,video.videoHeight);
    Object.assign(live.layer.style,{left:(v.left-p.left+box.left)+'px',top:(v.top-p.top+box.top)+'px'});
    const track=Array.from(video.textTracks).find(t=>(t.kind==='subtitles'||t.kind==='captions')&&t.mode==='showing');
    paint(live,saved,box.width,box.height,track?cueText(track):'',!!track?.cues?.length);
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(render);}
  const bound=new Set();
  function tracksChanged(){
    const tracks=Array.from(video.textTracks);
    for(const track of bound)if(!tracks.includes(track)){track.removeEventListener('cuechange',schedule);bound.delete(track);}
    for(const track of tracks)if(!bound.has(track)){track.addEventListener('cuechange',schedule);bound.add(track);}
    schedule();
  }
  function syncFields(){
    for(const input of form.querySelectorAll('[data-setting]')){
      const value=draft[input.dataset.setting];
      if(input.type==='checkbox')input.checked=value;else input.value=String(value);
      if(input.type==='range'){
        const text=value+' %'+(input.dataset.setting==='opacity'&&value===0?' · sans fond':'');
        form.querySelector(`output[for="${input.id}"]`).textContent=text;input.setAttribute('aria-valuetext',text);
      }
    }
    $('subtitleMaskFields').hidden=!draft.mask;drawPreview();
  }
  let bodyOverflow='',toastTimer;
  const toast=document.createElement('p');toast.className='ml-subtitle-toast';toast.setAttribute('role','status');toast.hidden=true;document.body.append(toast);
  button.addEventListener('click',()=>{
    draft={...saved};$('subtitleSaveMessage').textContent='Enregistré sur cet appareil, sans modifier les vidéos. En PiP ou dans le lecteur natif du téléphone, l’affichage dépend du navigateur.';
    bodyOverflow=document.body.style.overflow;panel.showModal();document.body.style.overflow='hidden';syncFields();panel.querySelector('.ml-subtitle-body').scrollTop=0;
  });
  panel.addEventListener('close',()=>{document.body.style.overflow=bodyOverflow;button.focus();});
  $('subtitleOptionsClose').addEventListener('click',()=>panel.close());$('subtitleCancel').addEventListener('click',()=>panel.close());
  panel.addEventListener('click',event=>{if(event.target!==panel)return;const r=panel.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)panel.close();});
  form.addEventListener('input',event=>{
    const input=event.target,key=input.dataset.setting;if(!key)return;
    draft=normalize({...draft,[key]:input.type==='checkbox'?input.checked:input.type==='range'?Number(input.value):input.value});syncFields();
  });
  $('subtitlePreviewFormat').addEventListener('change',()=>{preview.classList.toggle('is-landscape',$('subtitlePreviewFormat').value==='landscape');drawPreview();});
  $('subtitleReset').addEventListener('click',()=>{draft={...DEFAULTS};syncFields();});
  form.addEventListener('submit',event=>{
    event.preventDefault();saved=normalize(draft);schedule();
    if(!savePreferences(storage,saved)){$('subtitleSaveMessage').textContent='Réglages appliqués pour cette visite. Le navigateur bloque leur enregistrement : ils seront perdus après rechargement.';return;}
    panel.close();clearTimeout(toastTimer);toast.textContent='Préférences des sous-titres enregistrées sur cet appareil.';toast.hidden=false;toastTimer=setTimeout(()=>{toast.hidden=true;},4000);
  });
  window.addEventListener('storage',event=>{if(event.storageArea!==storage||(event.key!==STORAGE_KEY&&event.key!==null))return;saved=readPreferences(storage);schedule();});
  new ResizeObserver(drawPreview).observe(preview);
  const observer=new ResizeObserver(schedule);observer.observe(player);observer.observe(video);
  for(const event of ['loadedmetadata','loadeddata','loadstart','timeupdate','seeking','seeked','emptied','resize','error','enterpictureinpicture','leavepictureinpicture'])video.addEventListener(event,schedule);
  video.addEventListener('webkitbeginfullscreen',()=>{nativeVideo=true;schedule();});video.addEventListener('webkitendfullscreen',()=>{nativeVideo=false;schedule();});
  document.addEventListener('fullscreenchange',schedule);reader.addEventListener('close',schedule);
  new MutationObserver(schedule).observe(reader,{attributes:true,attributeFilter:['open']});
  for(const event of ['addtrack','removetrack','change'])video.textTracks.addEventListener(event,tracksChanged);
  video.addEventListener('load',tracksChanged,true);tracksChanged();
}
if(typeof document!=='undefined')init();
