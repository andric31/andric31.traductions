// Conversion locale/serveur vers WebVTT UTF-8. Aucun service externe.
const MAX=2*1024*1024;
export function decodeSubtitles(input){
  if(typeof input==='string'){if(new TextEncoder().encode(input).length>MAX)throw Error('Sous-titres trop volumineux (2 Mo).');return input.replace(/^\ufeff/,'');}
  const b=input instanceof Uint8Array?input:new Uint8Array(input);if(b.length>MAX)throw Error('Sous-titres trop volumineux (2 Mo).');
  let encoding='utf-8';
  if(b[0]===255&&b[1]===254)encoding='utf-16le';else if(b[0]===254&&b[1]===255)encoding='utf-16be';
  else if(b.length>4&&b[1]===0&&b[3]===0)encoding='utf-16le';else if(b.length>4&&b[0]===0&&b[2]===0)encoding='utf-16be';
  try{return new TextDecoder(encoding,{fatal:true}).decode(b).replace(/^\ufeff/,'');}
  catch{if(encoding!=='utf-8')throw Error('Encodage des sous-titres invalide.');return new TextDecoder('windows-1252').decode(b);}
}
function time(value){const m=/^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/.exec(value.trim());if(!m||+m[2]>=60||+m[3]>=60)throw Error('Minutage invalide : '+value);return ((+(m[1]||0)*3600)+(+m[2]*60)+(+m[3]))*1000+Number(m[4].padEnd(3,'0'));}
function stamp(ms){const h=Math.floor(ms/3600000),m=Math.floor(ms/60000)%60,s=Math.floor(ms/1000)%60;return [h,m,s].map(n=>String(n).padStart(2,'0')).join(':')+'.'+String(ms%1000).padStart(3,'0');}
function safeText(value){return value.replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&nbsp;/gi,' ').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&amp;/gi,'&').replace(/\u0000/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').trim();}
export function toWebVTT(input,filename=''){
  const source=decodeSubtitles(input).replace(/\r\n?/g,'\n').trim(),cues=[],warnings=[];
  if(!source)throw Error('Le fichier de sous-titres est vide.');
  function push(start,end,text){const a=time(start),b=time(end);if(b<=a)throw Error('La fin d’un sous-titre doit suivre son début.');const clean=safeText(text);if(clean)cues.push({start:a,end:b,text:clean});}
  const ass=/\.(ass|ssa)$/i.test(filename)||/^\[Events\]$/mi.test(source);
  if(ass){
    let inEvents=false,format=null;warnings.push('ASS/SSA : texte et minutages conservés ; styles, positions, dessins et effets ignorés.');
    for(const line of source.split('\n')){
      if(/^\[/.test(line)){inEvents=/^\[Events\]$/i.test(line.trim());continue;}if(!inEvents)continue;
      if(/^Format:/i.test(line)){format=line.slice(line.indexOf(':')+1).split(',').map(x=>x.trim().toLowerCase());continue;}
      if(!/^Dialogue:/i.test(line))continue;
      const fields=format||['layer','start','end','style','name','marginl','marginr','marginv','effect','text'];
      if(fields.at(-1)!=='text'||!fields.includes('start')||!fields.includes('end'))throw Error('Format ASS/SSA non pris en charge : colonne Text attendue en dernier.');
      let rest=line.slice(line.indexOf(':')+1).trim(),values=[];
      for(let i=0;i<fields.length-1;i++){const comma=rest.indexOf(',');if(comma<0)throw Error('Dialogue ASS/SSA incomplet.');values.push(rest.slice(0,comma));rest=rest.slice(comma+1);}values.push(rest);
      const raw=values.at(-1);if(/\{[^}]*\\p[1-9]/.test(raw))continue;
      const clean=raw.replace(/\{[^}]*\}/g,'').replace(/\\[Nn]/g,'\n').replace(/\\h/g,' ');
      push(values[fields.indexOf('start')],values[fields.indexOf('end')],clean);
    }
  }else{
    const blocks=source.split(/\n[\t ]*\n/);
    for(let block of blocks){
      if(/^WEBVTT(?:\s|$)/.test(block)){block=block.split('\n').slice(1).join('\n');if(!block.includes('-->'))continue;}
      if(/^(NOTE(?:\s|$)|STYLE(?:\s|$)|REGION(?:\s|$))/.test(block))continue;
      const lines=block.split('\n'),idx=lines.findIndex(x=>x.includes('-->'));
      if(idx<0)throw Error('Bloc de sous-titres sans minutage. Utilise SRT, VTT, ASS ou SSA.');
      const match=/^\s*([^\s]+)\s*-->\s*([^\s]+)(.*)$/.exec(lines[idx]);
      if(!match)throw Error('Minutage de sous-titre illisible.');
      if(match[3].trim()&&!warnings.length)warnings.push('Les réglages de position sont remplacés par l’affichage standard du lecteur.');
      push(match[1],match[2],lines.slice(idx+1).join('\n'));
    }
  }
  if(!cues.length)throw Error('Aucun sous-titre textuel compatible trouvé.');
  if(cues.length>20000)throw Error('Trop de sous-titres (20 000 maximum).');
  cues.sort((a,b)=>a.start-b.start||a.end-b.end);
  return {text:'WEBVTT\n\n'+cues.map((c,i)=>`${i+1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}`).join('\n\n')+'\n',count:cues.length,warnings};
}
