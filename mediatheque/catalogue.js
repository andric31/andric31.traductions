// Format commun au site et aux managers. Aucun accès réseau ou stockage ici.
export const KINDS = ['bibliotheque', 'dramas'];
export const PREFIX = 'private-library/';
export function assert(value, message) { if (!value) throw new Error(message); }
export function kindOf(value) { assert(KINDS.includes(value), 'Section invalide.'); return value; }
export function emptyCatalogue(kind) { return {version:1, kind:kindOf(kind), updatedAt:'', items:[]}; }
export function storageKind(kind) { return kindOf(kind); }
export function catalogueKey(kind) { return PREFIX + storageKind(kind) + '/catalogue.json'; }
export function mediaKey(key, kind, id, type='image') {
  let value=String(key || '').trim();
  if (!value) return '';
  const folder=storageKind(kind);
  assert(value.startsWith(`${PREFIX}${folder}/${id}/`) && value.length<=800 && !/[\\\u0000-\u001f\u007f]/.test(value)
    && value.split('/').every(x=>x && x!=='.' && x!=='..'), 'Le média doit être dans private-library/'+folder+'/'+id+'/');
  assert((type==='archive'?/\.cbz$/i:type==='subtitle'?/\.(srt|vtt|ass|ssa)$/i:type==='video'?/\.(mp4|webm|m4v)$/i:/\.(png|jpe?g|webp|avif|gif)$/i).test(value), type==='archive'?'Archive CBZ attendue.':type==='subtitle'?'Sous-titre SRT, VTT, ASS ou SSA attendu.':type==='video'?'Vidéo MP4, WebM ou M4V attendue.':'Image JPG, PNG, WebP, AVIF ou GIF attendue.');
  return value;
}
function text(value, max, label) { const v=String(value??'').trim();assert(v.length<=max, label+' trop long.');return v; }
function id(value) { const v=String(value||'');assert(/^[a-z0-9][a-z0-9_-]{0,79}$/.test(v),'Identifiant : lettres minuscules, chiffres, tirets (80 caractères max).');return v; }
function status(value) { assert(['soon','available'].includes(value),'Statut invalide.');return value; }
export function comicFormatOf(record) { return record?.format==='manga'?'manga':'comic'; }
export function readingDirectionOf(record) {
  return ['ltr','rtl'].includes(record?.readingDirection)?record.readingDirection:comicFormatOf(record)==='manga'?'rtl':'ltr';
}
export function validateCatalogue(raw, kind) {
  kindOf(kind);
  assert(raw && raw.version===1 && raw.kind===kind && Array.isArray(raw.items),'Ce fichier doit être un catalogue '+kind+' de version 1.');
  assert(raw.items.length<=500,'500 fiches maximum par catalogue.');
  const ids=new Set();let total=0;
  const items=raw.items.map(r=>{
    const key=id(r?.id);assert(!ids.has(key),'Identifiant de fiche en double : '+key);ids.add(key);
    const title=text(r.title,180,'Titre');assert(title,'Le titre est obligatoire.');
    const comicSettings={};
    if(kind==='bibliotheque') {
      comicSettings.format=r.format??'comic';
      comicSettings.readingDirection=r.readingDirection??'auto';
      assert(['comic','manga'].includes(comicSettings.format),'Type de lecture invalide : Manga ou Comic attendu.');
      assert(['auto','ltr','rtl'].includes(comicSettings.readingDirection),'Sens de lecture invalide.');
    }
    assert(Array.isArray(r.units) && r.units.length<=200,'Liste de lectures/épisodes invalide (200 maximum).');
    const unitIds=new Set();
    const units=r.units.map(u=>{
      const uid=id(u?.id);assert(!unitIds.has(uid),'Identifiant de contenu/épisode en double : '+uid);unitIds.add(uid);
      const result={id:uid,title:text(u.title,180,'Titre') || uid,status:status(u.status||'soon')};
      if(kind==='dramas') {
        result.mediaKey=mediaKey(u.mediaKey,kind,key,'video');
        assert(u.subtitles==null||Array.isArray(u.subtitles),'Liste de sous-titres invalide.');
        assert((u.subtitles||[]).length<=20,'20 pistes de sous-titres maximum par épisode.');
        let defaults=0;
        result.subtitles=(u.subtitles||[]).map(t=>{
          const lang=String(t.lang||'fr').trim();assert(/^[a-z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/.test(lang),'Langue de sous-titre invalide (ex. fr, en, fr-FR).');
          const path=mediaKey(t.key,kind,key,'subtitle');assert(path,'Chemin du sous-titre obligatoire.');
          if(t.default)defaults++;return {lang,label:text(t.label,80,'Nom de la piste')||lang,key:path,default:t.default===true};
        });
        assert(defaults<=1,'Choisis une seule piste de sous-titres par défaut.');
      }
      else {
        result.source=u.source??'pages';
        assert(['pages','cbz'].includes(result.source),'Source de la lecture invalide : pages ou CBZ attendu.');
        result.archiveKey=mediaKey(u.archiveKey,kind,key,'archive');
        assert(Array.isArray(u.pages) && u.pages.length<=500,'Pages invalides (500 maximum par lecture).');
        result.pages=u.pages.map(p=>{const k=mediaKey(p,kind,key);assert(k,'Une page ne peut pas être vide.');return k;});
        total+=result.pages.length;
      }
      assert(result.status!=='available' || (kind==='dramas'?result.mediaKey:result.source==='cbz'?result.archiveKey:result.pages.length),'Ajoute les médias avant de rendre ce contenu/épisode disponible.');
      return result;
    });
    const s=status(r.status||'soon');
    assert(s!=='available'||units.some(u=>u.status==='available'),'Une fiche disponible doit avoir au moins un contenu/épisode disponible.');
    assert(r.tags==null||Array.isArray(r.tags),'Les tags doivent être une liste.');
    return {id:key,title,...comicSettings,...(kind==='dramas'?{originalTitle:text(r.originalTitle,180,'Titre original')}:{}),description:text(r.description,5000,'Résumé'),author:text(r.author,160,'Auteur'),
      tags:(r.tags||[]).slice(0,12).map(t=>text(t,60,'Tag')).filter(Boolean),status:s,visible:r.visible!==false,
      coverKey:mediaKey(r.coverKey,kind,key),units,updatedAt:text(r.updatedAt,40,'Date')};
  });
  assert(total<=10000,'10 000 pages maximum par catalogue.');
  return {version:1,kind,updatedAt:text(raw.updatedAt,40,'Date'),items};
}
export function mediaURL(kind,id,type,unit='',page=0) {
  return '/api/library-media?'+new URLSearchParams({kind,id,type,...(unit?{unit}:{}),...(type==='page'?{page:String(page)}:{})});
}
export function publicCatalogue(doc) {
  return {ok:true,kind:doc.kind,updatedAt:doc.updatedAt,items:doc.items.filter(r=>r.visible).map(r=>({
    id:r.id,title:r.title,description:r.description,author:r.author,tags:r.tags,status:r.status,updatedAt:r.updatedAt,
    ...(doc.kind==='bibliotheque'?{format:comicFormatOf(r),readingDirection:readingDirectionOf(r)}:{originalTitle:r.originalTitle||''}),
    cover:r.coverKey?mediaURL(doc.kind,r.id,'cover'):'',
    units:r.units.map(u=>({id:u.id,title:u.title,status:r.status==='available'?u.status:'soon',
      ...(doc.kind==='dramas'?{src:r.status==='available'&&u.status==='available'?mediaURL(doc.kind,r.id,'video',u.id):'',
        subtitles:r.status==='available'&&u.status==='available'?u.subtitles.map((t,i)=>({lang:t.lang,label:t.label,default:t.default,src:mediaURL(doc.kind,r.id,'subtitle',u.id)+'&track='+i})):[]}
        :{source:u.source||'pages',archive:r.status==='available'&&u.status==='available'&&u.source==='cbz'?mediaURL(doc.kind,r.id,'archive',u.id):'',pages:r.status==='available'&&u.status==='available'&&u.source!=='cbz'?u.pages.map((_,i)=>mediaURL(doc.kind,r.id,'page',u.id,i)):[]})}))
  }))};
}
