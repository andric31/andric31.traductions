// Commandes locales : le menu reste lisible, quelle que soit la langue du navigateur.
const video=document.getElementById('video');
if(video){
  const player=video.closest('.ml-player'),dialog=document.getElementById('detailDialog');
  const controls=document.createElement('div');
  controls.className='ml-video-controls';controls.hidden=true;
  controls.innerHTML=`<div class="ml-video-settings" id="videoSettings" aria-label="Options de lecture" hidden>
    <label for="videoSubtitles">Sous-titres</label><select id="videoSubtitles" aria-label="Sous-titres"></select>
    <label for="videoSpeed">Vitesse de lecture</label><select id="videoSpeed" aria-label="Vitesse de lecture">
      <option value="0.5">0,5 ×</option><option value="0.75">0,75 ×</option><option value="1" selected>Normale</option><option value="1.25">1,25 ×</option><option value="1.5">1,5 ×</option><option value="2">2 ×</option>
    </select>
    <label for="videoVolume">Volume</label><input id="videoVolume" type="range" min="0" max="1" step="0.05" value="1" aria-label="Volume">
    <button type="button" id="videoPip">Mode PiP <span aria-hidden="true">▣</span></button>
    <p id="videoControlMessage" role="status" hidden></p>
  </div>
  <div class="ml-video-bar">
    <button type="button" class="ml-video-toggle" id="videoToggle" aria-label="Lire" title="Lire"></button>
    <span class="ml-video-time" id="videoTime">0:00 / 0:00</span>
    <span class="ml-video-spacer"></span>
    <button type="button" id="videoMute" aria-label="Couper le son" title="Couper le son"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4Z"/><path class="ml-sound-waves" d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/><path class="ml-sound-muted" d="m15 9 6 6m0-6-6 6"/></svg></button>
    <button type="button" id="videoFullscreen" aria-label="Vidéo en plein écran" title="Vidéo en plein écran"><svg class="ml-fullscreen-enter" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4H4V9M15 4H20V9M4 15V20H9M15 20H20V15"/></svg><svg class="ml-fullscreen-exit" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8h5V3m13 5h-5V3M3 16h5v5m13-5h-5v5"/></svg></button>
    <button type="button" class="ml-video-more" id="videoMore" aria-label="Options de lecture" title="Options de lecture" aria-expanded="false" aria-controls="videoSettings"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg></button>
  </div>
  <input class="ml-video-seek" id="videoSeek" type="range" min="0" max="100" value="0" step="0.1" aria-label="Position dans l’épisode">`;
  player.append(controls);
  const $=id=>controls.querySelector('#'+id),menu=$('videoSettings'),more=$('videoMore');
  const seek=$('videoSeek'),subtitles=$('videoSubtitles'),speed=$('videoSpeed'),volume=$('videoVolume');
  const choices=[];
  function inlineChoice(select){
    const label=select.getAttribute('aria-label'),box=document.createElement('div');box.className='ml-video-choice';
    const trigger=document.createElement('button');trigger.type='button';trigger.id=select.id+'Toggle';trigger.className='ml-video-choice-toggle';
    const list=document.createElement('div');list.id=select.id+'Choices';list.className='ml-video-choice-list';list.hidden=true;list.setAttribute('role','group');list.setAttribute('aria-label',label);
    trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-controls',list.id);
    controls.querySelector(`label[for="${select.id}"]`).htmlFor=trigger.id;
    select.hidden=true;select.after(box);box.append(trigger,list);
    let signature='';
    const close=(focus=false)=>{list.hidden=true;trigger.setAttribute('aria-expanded','false');if(focus)trigger.focus();};
    const refresh=()=>{
      const options=Array.from(select.options),next=JSON.stringify(options.map(o=>[o.value,o.textContent,o.disabled]));
      if(next!==signature){
        signature=next;list.replaceChildren();
        options.forEach(option=>{
          const button=document.createElement('button');button.type='button';button.textContent=option.textContent;button.dataset.value=option.value;button.disabled=option.disabled;
          button.addEventListener('click',()=>{select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));refresh();close(true);});list.append(button);
        });
      }
      trigger.textContent=select.selectedOptions[0]?.textContent||'Aucun';trigger.setAttribute('aria-label',label+' : '+trigger.textContent);trigger.disabled=select.disabled;
      for(const button of list.children)button.setAttribute('aria-pressed',String(button.dataset.value===select.value));
      if(select.disabled)close();
    };
    trigger.addEventListener('click',()=>{
      const open=list.hidden;choices.forEach(choice=>choice.close());
      if(open){refresh();list.hidden=false;trigger.setAttribute('aria-expanded','true');}
    });
    list.addEventListener('keydown',event=>{
      if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
      const buttons=Array.from(list.children).filter(button=>!button.disabled),index=buttons.indexOf(document.activeElement);
      if(!buttons.length)return;event.preventDefault();
      const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next].focus();
    });
    const choice={close,refresh,isOpen:()=>!list.hidden};choices.push(choice);refresh();return choice;
  }
  const subtitleChoice=inlineChoice(subtitles),speedChoice=inlineChoice(speed);
  let idleTimer,tracks=[],source='';
  const time=seconds=>{const n=Math.max(0,Math.floor(Number.isFinite(seconds)?seconds:0));return (n>=3600?Math.floor(n/3600)+':':'')+String(Math.floor(n/60)%60).padStart(n>=3600?2:1,'0')+':'+String(n%60).padStart(2,'0');};
  const hideWhenIdle=()=>{
    clearTimeout(idleTimer);
    if(!video.paused&&!video.ended&&menu.hidden&&!controls.querySelector(':focus-visible'))idleTimer=setTimeout(()=>player.classList.add('ml-controls-idle'),2600);
  };
  const reveal=()=>{player.classList.remove('ml-controls-idle');hideWhenIdle();};
  const closeMenu=(focus=false)=>{choices.forEach(choice=>choice.close());menu.hidden=true;more.setAttribute('aria-expanded','false');if(focus)more.focus();reveal();};
  const message=text=>{$('videoControlMessage').textContent=text;$('videoControlMessage').hidden=!text;};
  const togglePlay=()=>{if(video.paused)document.getElementById('videoPlay').click();else video.pause();};
  const syncTime=()=>{
    const duration=Number.isFinite(video.duration)?video.duration:0;
    seek.disabled=duration<=0;seek.max=String(duration||100);seek.value=String(video.currentTime||0);
    seek.setAttribute('aria-valuetext',time(video.currentTime)+' sur '+time(duration));
    $('videoTime').textContent=time(video.currentTime)+' / '+time(duration);
  };
  const syncPlayback=()=>{
    const label=video.paused?(video.ended?'Relire':'Lire'):'Pause';
    $('videoToggle').setAttribute('aria-label',label);$('videoToggle').title=label;
    $('videoToggle').classList.toggle('is-playing',!video.paused);reveal();
  };
  const syncVolume=()=>{
    const muted=video.muted||video.volume===0,label=muted?'Activer le son':'Couper le son';
    $('videoMute').setAttribute('aria-label',label);$('videoMute').title=label;$('videoMute').classList.toggle('is-muted',muted);
    volume.value=String(video.muted?0:video.volume);volume.setAttribute('aria-valuetext',Math.round(Number(volume.value)*100)+' %');
  };
  const syncTracks=()=>{
    const next=Array.from(video.textTracks).filter(t=>t.kind==='subtitles'||t.kind==='captions');
    if(next.length!==tracks.length||next.some((t,i)=>t!==tracks[i])){
      tracks=next;subtitles.replaceChildren(new Option('Désactivés','off'));
      tracks.forEach((track,i)=>subtitles.add(new Option(track.label||track.language||'Piste '+(i+1),String(i))));
    }
    const active=tracks.findIndex(t=>t.mode==='showing');subtitles.value=active<0?'off':String(active);
    subtitles.disabled=!tracks.length;
    if(!tracks.length)subtitles.replaceChildren(new Option('Aucun sous-titre','off'));
    subtitleChoice.refresh();
  };
  const expanded=()=>document.fullscreenElement===player||player.classList.contains('ml-video-expanded');
  const syncFullscreen=()=>{
    const active=expanded(),label=active?'Quitter le plein écran de la vidéo':'Vidéo en plein écran';
    $('videoFullscreen').title=label;$('videoFullscreen').setAttribute('aria-label',label);$('videoFullscreen').setAttribute('aria-pressed',String(active));reveal();
  };
  const syncAvailability=()=>{
    const next=video.getAttribute('src')||'';
    controls.hidden=!next||video.hidden||!!video.error;
    if(next!==source){source=next;closeMenu();message('');}
    $('videoPip').disabled=video.readyState===0||video.disablePictureInPicture;
    syncTime();syncPlayback();syncTracks();
  };
  $('videoToggle').addEventListener('click',togglePlay);
  video.addEventListener('click',()=>{if(menu.hidden)togglePlay();else closeMenu();});
  seek.addEventListener('input',()=>{if(Number.isFinite(video.duration)&&video.duration>0)video.currentTime=Number(seek.value);syncTime();reveal();});
  $('videoMute').addEventListener('click',()=>{const wasSilent=video.muted||video.volume===0;if(video.volume===0)video.volume=1;video.muted=!wasSilent;});
  volume.addEventListener('input',()=>{video.volume=Number(volume.value);video.muted=video.volume===0;});
  speed.addEventListener('change',()=>{video.playbackRate=Number(speed.value);});
  subtitles.addEventListener('change',()=>{const selected=subtitles.value;tracks.forEach((track,i)=>{track.mode=String(i)===selected?'showing':'disabled';});});
  more.addEventListener('click',()=>{if(menu.hidden){syncTracks();message('');menu.hidden=false;more.setAttribute('aria-expanded','true');reveal();}else closeMenu();});
  document.addEventListener('pointerdown',event=>{if(!menu.hidden&&!controls.contains(event.target))closeMenu();});
  controls.addEventListener('keydown',event=>{if(event.key==='Escape'&&!menu.hidden){event.preventDefault();event.stopPropagation();const choice=choices.find(choice=>choice.isOpen());if(choice)choice.close(true);else closeMenu(true);}});
  player.addEventListener('keydown',event=>{
    if(event.defaultPrevented||event.altKey||event.ctrlKey||event.metaKey)return;
    if(event.key==='Escape'&&player.classList.contains('ml-video-expanded')){event.preventDefault();event.stopPropagation();player.classList.remove('ml-video-expanded');syncFullscreen();return;}
    if(event.target!==video&&event.target!==player)return;
    if(event.key===' '||event.key==='k'){event.preventDefault();togglePlay();}
    else if((event.key==='ArrowLeft'||event.key==='ArrowRight')&&Number.isFinite(video.duration)){event.preventDefault();video.currentTime=Math.max(0,Math.min(video.duration,video.currentTime+(event.key==='ArrowRight'?5:-5)));reveal();}
  });
  $('videoPip').hidden=!document.pictureInPictureEnabled||typeof video.requestPictureInPicture!=='function';
  $('videoPip').addEventListener('click',async()=>{
    try{if(document.pictureInPictureElement===video)await document.exitPictureInPicture();else await video.requestPictureInPicture();closeMenu();}
    catch{message('Le mode PiP n’est pas disponible pour cette vidéo.');}
  });
  const syncPip=()=>{$('videoPip').firstChild.textContent=document.pictureInPictureElement===video?'Quitter le mode PiP ':'Mode PiP ';};
  video.addEventListener('enterpictureinpicture',syncPip);video.addEventListener('leavepictureinpicture',syncPip);
  $('videoFullscreen').addEventListener('click',async()=>{
    closeMenu();
    if(player.classList.contains('ml-video-expanded'))player.classList.remove('ml-video-expanded');
    else if(document.fullscreenElement===player)await document.exitFullscreen().catch(()=>{});
    else {try{await player.requestFullscreen();}catch{if(typeof video.webkitEnterFullscreen==='function')video.webkitEnterFullscreen();else player.classList.add('ml-video-expanded');}}
    syncFullscreen();
  });
  document.addEventListener('fullscreenchange',syncFullscreen);
  new ResizeObserver(()=>{player.style.setProperty('--video-menu-height',Math.max(80,player.clientHeight-94)+'px');}).observe(player);
  player.addEventListener('pointermove',reveal);player.addEventListener('pointerdown',reveal);
  controls.addEventListener('focusin',reveal);controls.addEventListener('focusout',()=>queueMicrotask(hideWhenIdle));
  for(const event of ['loadstart','emptied','loadedmetadata','error'])video.addEventListener(event,syncAvailability);
  for(const event of ['play','pause','ended'])video.addEventListener(event,syncPlayback);
  for(const event of ['timeupdate','durationchange','seeked'])video.addEventListener(event,syncTime);
  video.addEventListener('volumechange',syncVolume);video.addEventListener('ratechange',()=>{speed.value=String(video.playbackRate);speedChoice.refresh();});
  for(const event of ['addtrack','removetrack','change'])video.textTracks.addEventListener(event,syncTracks);
  dialog.addEventListener('close',()=>{clearTimeout(idleTimer);closeMenu();player.classList.remove('ml-video-expanded','ml-controls-idle');syncFullscreen();});
  // Le lecteur natif reste le repli si ce module ne peut pas être chargé.
  video.controls=false;video.tabIndex=0;player.classList.add('ml-custom-controls');
  syncVolume();syncFullscreen();syncAvailability();
}
