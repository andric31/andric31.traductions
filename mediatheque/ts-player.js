// MPEG-TS privé : remuxage par morceaux, sans réencodage ni service externe.
// Les mêmes URL authentifiées et requêtes Range que le lecteur natif sont utilisées.
const CHUNK=12, AHEAD=18, BEHIND=24;
const playbackError=message=>Object.assign(new Error(message),{userFacing:true});
const readableError=error=>error?.userFacing||error?.name==='AbortError'?error:playbackError('Ce fichier TS ne peut pas être lu. Vérifie que le fichier est complet ou utilise une version MP4 H.264/AAC.');
const abortError=()=>new DOMException('Lecture interrompue.','AbortError');
export function bufferedEnd(ranges,time){
  for(let i=0;i<ranges.length;i++)if(ranges.start(i)<=time+.12&&ranges.end(i)>time+.04)return ranges.end(i);
  return time;
}
export function createTsPlayer(video,rawURL,{onError=()=>{}}={}){
  const url=new URL(rawURL,location.href);
  if(url.origin!==location.origin||url.pathname!=='/api/library-media')throw playbackError('Adresse vidéo non autorisée.');
  let stopped=false,input,mediaSource,buffer,objectURL,conversion,active=false,revision=0;
  let duration=0,origin=0,sink,api,pendingStart=0,pendingEnd=0,resetNeeded=false;
  const lifecycle=new AbortController();
  const alive=()=>{if(stopped)throw abortError();};
  const fail=error=>{if(stopped||error?.name==='AbortError')return;onError(readableError(error));destroy();};
  function destroy(){
    if(stopped)return;stopped=true;revision++;lifecycle.abort();
    video.removeEventListener('timeupdate',request);video.removeEventListener('seeking',seek);
    video.removeEventListener('waiting',request);video.removeEventListener('error',decodeError);
    conversion?.cancel().catch(()=>{});input?.dispose();
    if(objectURL)URL.revokeObjectURL(objectURL);
  }
  function event(target,name,action){
    return new Promise((resolve,reject)=>{
      const finish=error=>{target.removeEventListener(name,ok);target.removeEventListener('error',bad);lifecycle.signal.removeEventListener('abort',cancel);error?reject(error):resolve();};
      const ok=()=>finish(),bad=()=>finish(playbackError('Le navigateur ne peut pas décoder cette vidéo TS. Essaie une version MP4 H.264/AAC.')),cancel=()=>finish(abortError());
      if(stopped)return cancel();
      target.addEventListener(name,ok,{once:true});target.addEventListener('error',bad,{once:true});lifecycle.signal.addEventListener('abort',cancel,{once:true});
      try{action?.();}catch(error){finish(error);}
    });
  }
  async function append(data,start){
    alive();if(buffer.updating)await event(buffer,'updateend');alive();
    // Remove distant ranges before appending to keep long episodes bounded in memory.
    const time=video.currentTime;
    if(mediaSource.readyState==='open'){
      if(time>BEHIND&&buffer.buffered.length&&buffer.buffered.start(0)<time-BEHIND)
        await event(buffer,'updateend',()=>buffer.remove(0,time-BEHIND));
      alive();
      if(buffer.buffered.length&&buffer.buffered.end(buffer.buffered.length-1)>time+60)
        await event(buffer,'updateend',()=>buffer.remove(time+60,duration+1));
    }
    alive();buffer.timestampOffset=start-origin;
    await event(buffer,'updateend',()=>buffer.appendBuffer(data));
  }
  async function fill(){
    if(active||stopped||!buffer)return;active=true;
    try{
      while(!stopped){
        const time=Math.min(video.currentTime,Math.max(0,duration-.15));
        const end=bufferedEnd(buffer.buffered,time);
        if(end>time+.04&&end>=duration-.08){
          if(mediaSource.readyState==='open'&&!buffer.updating)mediaSource.endOfStream();
          break;
        }
        if(end-time>=AHEAD)break;
        const stamp=revision,target=end>time+.1?end-.04:time;
        if(resetNeeded){
          resetNeeded=false;input.dispose();input=makeInput();
          const track=await input.getPrimaryVideoTrack();alive();
          if(stamp!==revision)continue;
          if(!track)throw playbackError('Ce fichier TS ne contient pas de piste vidéo compatible.');
          sink=new api.EncodedPacketSink(track);
        }
        const key=await sink.getKeyPacket(origin+target,{verifyKeyPackets:true})||await sink.getFirstKeyPacket({verifyKeyPackets:true});
        alive();if(stamp!==revision)continue;
        if(!key)throw playbackError('Ce fichier TS ne contient pas de vidéo lisible.');
        const start=key.timestamp,until=Math.min(origin+duration,Math.max(start+CHUNK,origin+target+CHUNK));
        pendingStart=start-origin;pendingEnd=until-origin;
        const output=new api.Output({format:new api.Mp4OutputFormat({fastStart:'fragmented',minimumFragmentDuration:1}),target:new api.BufferTarget()});
        conversion=await api.Conversion.init({input,output,tracks:'primary',trim:{start,end:until},copy:{mode:'forced',shiftTolerance:0,boundaryPolicy:'expand'},showWarnings:false});
        if(stopped){await conversion.cancel();throw abortError();}
        if(stamp!==revision){await conversion.cancel();conversion=null;continue;}
        if(!conversion.isValid||conversion.discardedTracks.length)throw playbackError('Les codecs de ce fichier TS ne sont pas compatibles. Utilise une vidéo MP4 H.264/AAC.');
        try{await conversion.execute();}catch(error){if(stamp!==revision)continue;throw error;}finally{conversion=null;}
        alive();if(stamp!==revision)continue;
        await append(output.target.buffer,start);alive();
        if(stamp===revision&&bufferedEnd(buffer.buffered,time)<=end+.01)throw playbackError('Le fichier TS est incomplet ou ses horodatages sont irréguliers.');
      }
    }finally{active=false;}
  }
  function decodeError(){fail(playbackError('Le navigateur ne peut pas décoder cette vidéo TS. Essaie une version MP4 H.264/AAC.'));}
  function request(){fill().catch(fail);}
  function seek(){
    const time=video.currentTime;
    if(bufferedEnd(buffer.buffered,time)===time&&(!active||time<pendingStart-.1||time>pendingEnd)){
      revision++;resetNeeded=true;conversion?.cancel().catch(()=>{});
    }
    request();
  }
  function makeInput(){
    return new api.Input({formats:[api.MPEG_TS],source:new api.UrlSource(url.href,{
      requestInit:{credentials:'same-origin',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer'},
      maxCacheSize:16*1024*1024,parallelism:2,getRetryDelay:()=>null,handleUnhandledError:fail,
      fetchFn:async(address,options)=>{
        const response=await fetch(address,options);
        if(response.status===401||response.status===403)throw playbackError('Ta session ne permet plus de lire cet épisode. Reconnecte-toi puis rouvre la fiche.');
        if(!response.ok)throw playbackError('La vidéo TS est indisponible. Vérifie ta connexion et réessaie.');
        return response;
      }
    })});
  }
  const ready=(async()=>{
    const MSE=window.MediaSource||window.ManagedMediaSource;
    if(!MSE){
      if(video.canPlayType('video/mp2t')){video.src=url.href;video.load();return;}
      throw playbackError('Ce navigateur ne permet pas la lecture TS. Essaie un navigateur récent ou une version MP4 H.264/AAC.');
    }
    api=await import('./vendor/mediabunny-1.63.0.min.mjs');alive();
    input=makeInput();
    const videoTrack=await input.getPrimaryVideoTrack(),audioTrack=await input.getPrimaryAudioTrack();alive();
    if(!videoTrack)throw playbackError('Ce fichier TS ne contient pas de piste vidéo compatible.');
    const tracks=[videoTrack,...(audioTrack?[audioTrack]:[])];
    const codecs=await Promise.all(tracks.map(track=>track.getCodecParameterString()));alive();
    const mime='video/mp4; codecs="'+codecs.join(',')+'"';
    if(codecs.some(codec=>!codec)||!MSE.isTypeSupported(mime))throw playbackError('Les codecs de ce fichier TS ne sont pas pris en charge par ton navigateur. Utilise une version MP4 H.264/AAC.');
    origin=await input.getFirstTimestamp(tracks);duration=(await input.computeDuration(tracks))-origin;alive();
    if(!Number.isFinite(duration)||duration<=0)throw playbackError('La durée de cette vidéo TS ne peut pas être lue. Le fichier doit être complet.');
    sink=new api.EncodedPacketSink(videoTrack);mediaSource=new MSE();
    const opened=event(mediaSource,'sourceopen');objectURL=URL.createObjectURL(mediaSource);video.src=objectURL;
    // ManagedMediaSource needs a local playback target on Safari.
    if(!window.MediaSource)video.disableRemotePlayback=true;
    video.load();await opened;alive();
    buffer=mediaSource.addSourceBuffer(mime);mediaSource.duration=duration;
    video.addEventListener('error',decodeError);video.addEventListener('timeupdate',request);video.addEventListener('seeking',seek);video.addEventListener('waiting',request);
    await fill();alive();
  })();
  return {ready:ready.catch(error=>{destroy();throw readableError(error);}),destroy};
}
