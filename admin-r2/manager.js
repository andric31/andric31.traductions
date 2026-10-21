(() => {
  'use strict';
  const API='/api/r2-admin', PART=32*1024*1024, MARKER='.r2-folder';
  const $=id=>document.getElementById(id);
  const icons={
    cloud:'M6 18a4 4 0 0 1-.6-8A6.5 6.5 0 0 1 18 8a5 5 0 1 1 0 10Z',
    folder:'M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z',
    folderOpen:'M3 8V6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v1M3 9h16l-3 11H3Z',
    folderPlus:'M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v10H3ZM12 11v6m-3-3h6',
    folderUpload:'M3 7V5h7l2 3h9v12H3Zm9 10v-7m-3 3 3-3 3 3',
    upload:'M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5',download:'M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4',
    arrowLeft:'M20 12H4m6-6-6 6 6 6',arrowUp:'M12 20V4m-6 6 6-6 6 6',
    external:'M14 3h7v7M21 3l-9 9M10 4H4v16h16v-6',
    hardDrive:'M5 5h14l3 12H2Zm-3 12v3h20v-3M5 17h.01M9 17h.01',
    shield:'M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7Zm-5 9 3 3 7-7',
    scissors:'M14 14 21 4M4 4l17 17M8 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm0 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm1-1 2-3',
    copy:'M9 8h12v13H9ZM5 16H3V3h12v2',clipboard:'M9 4H5v17h14V4h-4M9 2h6v4H9Z',
    edit:'m4 17-1 4 4-1L20 7l-3-3Zm10-10 3 3M11 21h10',trash:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
    grid:'M3 3h7v7H3Zm11 0h7v7h-7ZM3 14h7v7H3Zm11 0h7v7h-7Z',list:'M3 5h2m4 0h12M3 12h2m4 0h12M3 19h2m4 0h12',
    search:'M15 15l6 6M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z',refresh:'M20 10a8 8 0 0 0-14-5L3 8m0-5v5h5M4 14a8 8 0 0 0 14 5l3-3m0 5v-5h-5',
    lock:'M6 11h12v10H6Zm2 0V7a4 4 0 0 1 8 0v4m-4 4v2',close:'m5 5 14 14M19 5 5 19',
    image:'M3 3h18v18H3Zm0 14 6-6 5 5 3-3 4 4M16 7h.01',video:'M3 5h18v14H3Zm7 4v6l5-3ZM7 5v14m10-14v14',
    archive:'M5 3h14v18H5Zm6 0v3h2v3h-2v3h2v3h-2m-1 2h4v4h-4Z',document:'M5 3h9l5 5v13H5Zm9 0v6h5M8 13h8m-8 4h6',
    audio:'M9 18V5l11-2v13M9 8l11-2M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm11-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
    chevronRight:'m9 5 7 7-7 7',more:'M5 12h.01M12 12h.01M19 12h.01',link:'m9 15 6-6M8 16l-2 2a3 3 0 0 1-4-4l5-5a3 3 0 0 1 4 0m2 6a3 3 0 0 0 4 0l5-5a3 3 0 0 0-4-4l-2 2',home:'M3 10 12 3l9 7M5 9v12h14V9m-10 12v-8h6v8'
  };
  function icon(name) { const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.classList.add('icon');const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',icons[name]||icons.document);svg.append(p);return svg; }
  document.querySelectorAll('[data-icon]').forEach(node=>node.append(icon(node.dataset.icon)));
  function node(tag,cls,text) {const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;}
  const collator=new Intl.Collator('fr',{numeric:true,sensitivity:'base'});
  function saved(k,fallback) {try{return localStorage.getItem(k)||fallback;}catch{return fallback;}}
  function save(k,v) {try{localStorage.setItem(k,v);}catch{}}
  function prefixFromHash(){try{return new URLSearchParams(location.hash.slice(1)).get('d')||'';}catch{return '';}}
  const state={prefix:'',entries:[],selected:new Set(),clipboard:null,cursor:null,history:[],busy:false,cancel:false,loading:false,loadId:0,view:saved('r2.explorer.view','grid'),preview:null,anchor:null,xhr:null,phase:'',copies:0};
  if(!['grid','list'].includes(state.view))state.view='grid';
  // Une recharge ne doit pas restaurer la position de défilement de l'ancien dossier.
  try{history.scrollRestoration='manual';}catch{}
  // Les dossiers sont chargés branche par branche, pas par inventaire complet du bucket.
  // Une nouvelle visite repart toujours avec une arborescence repliée.
  // L'ouverture des branches est conservée uniquement en mémoire, dans cette page.
  try{localStorage.removeItem('r2.explorer.expanded');}catch{}
  const tree={nodes:new Map(),expanded:new Set(),syncId:0};
  function treeNode(prefix){if(!tree.nodes.has(prefix))tree.nodes.set(prefix,{children:[],loaded:false,loading:null,error:''});return tree.nodes.get(prefix);}
  function ancestors(prefix){const result=[''];let path='';for(const part of prefix.split('/').filter(Boolean)){path+=part+'/';result.push(path);}return result;}
  function expandPath(prefix){ancestors(prefix).filter(Boolean).forEach(key=>tree.expanded.add(key));}
  function invalidateTree(){tree.nodes.clear();tree.syncId++;}

  const fmtSize=n=>{if(!n)return '0 o';const u=['o','Ko','Mo','Go','To'],i=Math.min(4,Math.floor(Math.log(n)/Math.log(1024)));return (n/1024**i).toLocaleString('fr-FR',{maximumFractionDigits:i?1:0})+' '+u[i];};
  const fmtDate=d=>{const date=new Date(d);return Number.isFinite(+date)?date.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'}):'—';};
  const shortDate=d=>{const date=new Date(d);return Number.isFinite(+date)?date.toLocaleDateString('fr-FR',{day:'2-digit',month:'short'}):'';};
  const nameOf=e=>e.key.replace(/\/$/,'').split('/').pop();
  const parentOf=k=>k.replace(/\/$/,'').replace(/[^/]+$/,'');
  const kindName=k=>({folder:'Dossier',image:'Image',video:'Vidéo',archive:'Archive',document:'Document',audio:'Audio'}[k]||'Fichier');
  const folderLabel=entry=>entry.empty===true?'Dossier vide':'Dossier';
  const mediaPath=key=>'/medias/'+key.split('/').map(encodeURIComponent).join('/');
  const previewURL=(key,download=false)=>API+'?action=preview&key='+encodeURIComponent(key)+(download?'&download=1':'');
  function notice(message,type='info') {$('notice').textContent=message;$('notice').className='notice '+type;$('notice').hidden=!message;}
  let toastTimer;
  function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3400);}
  function status(message){$('status').textContent=message;}
  class RequestError extends Error {constructor(message,status){super(message);this.status=status;}}
  function responseError(status,data){return new RequestError(data?.error||(status===401?'Session expirée. Reconnectez-vous depuis Mon compte.':status===403?'Accès refusé. Votre compte administrateur est nécessaire.':'L’opération a échoué ('+status+'). Réessayez.'),status);}
  async function api(url=API,options={}) {
    const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...options,headers:{Accept:'application/json',...options.headers}});
    const text=await response.text();let data;try{data=JSON.parse(text);}catch{}
    if(!response.ok||!data?.ok)throw responseError(response.status,data);
    return data;
  }
  const post=body=>api(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const abortCheck=()=>{if(state.cancel){const e=new Error('Opération arrêtée.');e.name='AbortError';throw e;}};
  function selectedEntries(){return state.entries.filter(e=>state.selected.has(e.key));}
  function visibleEntries(){
    const search=$('search').value.trim().toLocaleLowerCase('fr'),kind=$('filter').value,sort=$('sort').value;
    return state.entries.filter(e=>(kind==='all'||e.kind===kind)&&(!search||nameOf(e).toLocaleLowerCase('fr').includes(search))).sort((a,b)=>{
      if(a.folder!==b.folder)return a.folder?-1:1;
      if(sort==='date'&&!a.folder)return (+new Date(b.uploaded)||0)-(+new Date(a.uploaded)||0)||collator.compare(nameOf(a),nameOf(b));
      if(sort==='size'&&!a.folder)return b.size-a.size||collator.compare(nameOf(a),nameOf(b));
      return collator.compare(nameOf(a),nameOf(b))*(sort==='name-desc'?-1:1);
    });
  }
  function updateControls(){
    const n=state.selected.size,busy=state.busy||state.loading;
    $('root').disabled=state.busy;$('rootFolders').classList.toggle('tree-busy',state.busy);
    $('cut').disabled=busy||!n;$('copy').disabled=busy||!n;$('rename').disabled=busy||n!==1;$('delete').disabled=busy||!n;
    $('paste').disabled=busy||!state.clipboard?.entries.length;$('up').disabled=busy||!state.prefix;$('back').disabled=busy||!state.history.length;
    ['newFolder','import','importFolder','refresh','loadMore','selectAll'].forEach(id=>$(id).disabled=busy);
    $('selectionLabel').textContent=n?n+' sélectionné'+(n>1?'s':''):'Tout sélectionner';
    const visible=visibleEntries(),count=visible.filter(e=>state.selected.has(e.key)).length;
    $('selectAll').checked=visible.length>0&&count===visible.length;$('selectAll').indeterminate=count>0&&count<visible.length;
    const clip=state.clipboard;$('clipboardInfo').hidden=!clip;$('clipCount').hidden=!clip;
    if(clip){$('clipCount').textContent=clip.entries.length;$('clipboardText').textContent=clip.entries.length+' élément'+(clip.entries.length>1?'s':'')+' à '+(clip.mode==='cut'?'déplacer':'copier')+' · Ouvrez le dossier de destination puis cliquez sur Coller.';}
    $('gridView').setAttribute('aria-pressed',String(state.view==='grid'));$('listView').setAttribute('aria-pressed',String(state.view==='list'));
    document.body.classList.toggle('busy',state.busy);
  }
  function syncSelection(){
    $('items').querySelectorAll('.entry').forEach(e=>{const yes=state.selected.has(e.dataset.key);e.classList.toggle('selected',yes);e.setAttribute('aria-selected',String(yes));e.querySelector('input[type=checkbox]').checked=yes;});updateControls();
  }
  function select(entry,event={}) {
    if(state.busy)return;
    const entries=visibleEntries();
    if(event.shiftKey&&state.anchor){const a=entries.findIndex(e=>e.key===state.anchor),b=entries.findIndex(e=>e.key===entry.key);if(a>=0&&b>=0){if(!event.ctrlKey&&!event.metaKey)state.selected.clear();entries.slice(Math.min(a,b),Math.max(a,b)+1).forEach(e=>state.selected.add(e.key));}}
    else if(event.ctrlKey||event.metaKey||event.toggle){state.selected.has(entry.key)?state.selected.delete(entry.key):state.selected.add(entry.key);state.anchor=entry.key;}
    else{state.selected=new Set([entry.key]);state.anchor=entry.key;}
    syncSelection();
  }
  function treeFocus(key,control='link'){
    const row=[...$('rootFolders').querySelectorAll('.tree-row')].find(e=>e.dataset.key===key);
    (row?.querySelector('[data-tree-control="'+control+'"]')||row?.querySelector('.tree-link'))?.focus({preventScroll:true});
  }
  function revealCurrentFolder(){
    const host=$('rootFolders'),active=host.querySelector('.tree-row.active');
    if(!active)return;const h=host.getBoundingClientRect(),r=active.getBoundingClientRect();
    if(r.top<h.top)host.scrollTop-=h.top-r.top+6;
    else if(r.bottom>h.bottom)host.scrollTop+=r.bottom-h.bottom+6;
  }
  function renderSidebar(){
    const host=$('rootFolders'),focused=document.activeElement?.closest('.tree-row');
    const focusedKey=focused?.dataset.key,control=document.activeElement?.dataset.treeControl,scroll=host.scrollTop;
    $('root').classList.toggle('active',!state.prefix);$('root').setAttribute('aria-current',!state.prefix?'location':'false');
    host.replaceChildren();
    function appendNode(key,parent,depth){
      const record=treeNode(key),expanded=tree.expanded.has(key),current=state.prefix===key;
      const expandable=!record.loaded||record.children.length>0||!!record.error;
      const item=node('div','tree-node'),row=node('div','tree-row'+(current?' active':state.prefix.startsWith(key)?' ancestor':''));
      item.setAttribute('role','treeitem');item.setAttribute('aria-level',String(depth+1));item.setAttribute('aria-selected',String(current));
      if(expandable)item.setAttribute('aria-expanded',String(expanded));
      row.dataset.key=key;row.style.setProperty('--tree-depth',Math.min(depth,9));
      const toggle=node('button','tree-toggle'+(expanded?' expanded':''));toggle.type='button';toggle.dataset.treeControl='toggle';
      toggle.title=(expanded?'Replier':'Déplier')+' '+nameOf({key});toggle.setAttribute('aria-label',toggle.title);toggle.setAttribute('aria-expanded',String(expanded));
      toggle.disabled=state.busy||!expandable;toggle.classList.toggle('leaf',!expandable);toggle.append(icon(record.loading?'refresh':'chevronRight'));
      if(record.loading){toggle.classList.add('loading');item.setAttribute('aria-busy','true');}
      toggle.onclick=event=>{event.stopPropagation();toggleFolder(key);};
      const link=node('button','tree-link');link.type='button';link.dataset.treeControl='link';link.disabled=state.busy;
      link.title='/'+key;link.setAttribute('aria-label','Ouvrir le dossier '+nameOf({key}));
      if(current)link.setAttribute('aria-current','location');
      link.append(icon(expanded&&expandable?'folderOpen':'folder'),node('span','tree-name',nameOf({key})));
      link.onclick=()=>navigate(key);row.append(toggle,link);item.append(row);parent.append(item);
      row.addEventListener('keydown',event=>treeKeyboard(event,key));
      if(expanded){
        const group=node('div','tree-children');group.setAttribute('role','group');item.append(group);
        record.children.forEach(child=>appendNode(child,group,depth+1));
        if(record.loading&&!record.children.length){const text=node('div','tree-message','Chargement…');text.style.setProperty('--tree-depth',Math.min(depth+1,9));group.append(text);}
        if(record.error){const retry=node('button','tree-retry','Réessayer');retry.title=record.error;retry.onclick=()=>readTree(key,true);group.append(retry);}
      }
    }
    const root=treeNode('');root.children.forEach(key=>appendNode(key,host,0));
    if(root.error){const retry=node('button','tree-retry','Recharger les dossiers');retry.title=root.error;retry.onclick=()=>refreshRoots(true);host.append(retry);}
    else if(!root.children.length)host.append(node('p','tree-empty',root.loaded?'Aucun dossier':'Chargement des dossiers…'));
    host.scrollTop=scroll;if(focusedKey)treeFocus(focusedKey,control);
  }
  async function readTree(prefix,force=false){
    const record=treeNode(prefix);
    if(record.loading)return record.loading;
    if(record.loaded&&!force)return true;
    record.error='';
    // Ne jamais déduire « pas de sous-dossier » d'une seule page de résultats.
    const task=(async()=>{
      let cursor='';const folders=new Set(),seen=new Set();
      try{
        do{
          const data=await api(listingURL(prefix,cursor));
          if(tree.nodes.get(prefix)!==record)return false;
          for(const key of data.folders||[])if(key.startsWith(prefix)&&key!==prefix)folders.add(key);
          cursor=data.cursor||'';
          if(cursor&&seen.has(cursor))throw Error('Pagination des dossiers incohérente. Réessayez.');
          seen.add(cursor);
        }while(cursor);
        record.children=[...folders].sort(collator.compare);record.loaded=true;return true;
      }catch(error){if(tree.nodes.get(prefix)===record)record.error=error.message;return false;}
      finally{if(tree.nodes.get(prefix)===record){record.loading=null;renderSidebar();}}
    })();
    record.loading=task;renderSidebar();return task;
  }
  async function toggleFolder(key){
    if(state.busy)return;
    if(tree.expanded.has(key)){tree.expanded.delete(key);renderSidebar();return;}
    tree.expanded.add(key);renderSidebar();await readTree(key);
    if(tree.expanded.has(key))await refreshRoots();
  }
  function treeKeyboard(event,key){
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();if(state.busy)return;
    const record=treeNode(key),links=[...$('rootFolders').querySelectorAll('.tree-link')],index=links.findIndex(e=>e.closest('.tree-row').dataset.key===key);
    if(event.key==='ArrowRight'){
      if(!tree.expanded.has(key)){toggleFolder(key);}
      else if(record.children.length)treeFocus(record.children[0]);
    }else if(event.key==='ArrowLeft'){
      if(tree.expanded.has(key))toggleFolder(key);else{const parent=parentOf(key);if(parent)treeFocus(parent);else $('root').focus();}
    }else if(event.key==='ArrowUp')links[Math.max(0,index-1)]?.focus();
    else if(event.key==='ArrowDown')links[Math.min(links.length-1,index+1)]?.focus();
    else if(event.key==='Home')links[0]?.focus();
    else if(event.key==='End')links.at(-1)?.focus();
  }
  function renderBreadcrumbs(){
    $('breadcrumbs').replaceChildren();const root=node('button','');root.title='Racine';root.append(icon('home'));root.onclick=()=>navigate('');$('breadcrumbs').append(root);let path='';
    state.prefix.split('/').filter(Boolean).forEach(part=>{path+=part+'/';const target=path,b=node('button','',part);b.onclick=()=>navigate(target);$('breadcrumbs').append(node('span','chevron','›'),b);});
    renderSidebar();
  }
  let videoObserver;
  function makeThumb(entry){
    const thumb=node('div','thumb '+entry.kind);thumb.append(icon(entry.kind));
    if(entry.kind==='image' && entry.size > 0){
      const img=node('img');img.loading='lazy';img.decoding='async';img.alt='';img.src=previewURL(entry.key);img.onerror=()=>{img.remove();};thumb.append(img);
    } else if(entry.kind==='video' && entry.size > 0){
      const video=node('video');video.muted=true;video.playsInline=true;video.preload='metadata';video.dataset.src=previewURL(entry.key)+'#t=0.1';video.onerror=()=>video.remove();videoObserver?.observe(video);thumb.append(video);
    }
    if(!entry.folder){const ext=entry.key.split('.').pop();if(entry.size===0)thumb.append(node('span','filetype','VIDE'));else if(ext&&ext.length<=6)thumb.append(node('span','filetype',ext.toUpperCase()));}
    return thumb;
  }
  function render(){
    if(videoObserver)videoObserver.disconnect();
    videoObserver='IntersectionObserver' in window?new IntersectionObserver(entries=>entries.forEach(({isIntersecting,target})=>{if(isIntersecting&&target.dataset.src){target.src=target.dataset.src;delete target.dataset.src;videoObserver.unobserve(target);}}),{rootMargin:'100px'}):null;
    $('items').replaceChildren();$('items').className='items '+state.view;
    const visible=visibleEntries();
    if(state.view==='list'&&visible.length){const head=node('div','list-head');head.append(node('span'),node('span','','Nom'),node('span','','Taille'),node('span','date','Modifié le'),node('span','type','Type'),node('span'));$('items').append(head);}
    visible.forEach(entry=>{
      const row=node('div','entry'+(state.selected.has(entry.key)?' selected':'')+(state.clipboard?.mode==='cut'&&state.clipboard.entries.some(x=>x.key===entry.key)?' cut':''));
      row.tabIndex=0;row.dataset.key=entry.key;row.setAttribute('role','option');row.setAttribute('aria-selected',String(state.selected.has(entry.key)));row.setAttribute('aria-label',nameOf(entry)+', '+(entry.folder?folderLabel(entry):kindName(entry.kind)));row.title=nameOf(entry);
      const label=node('label','check'),check=node('input');check.type='checkbox';check.checked=state.selected.has(entry.key);check.setAttribute('aria-label','Sélectionner '+nameOf(entry));label.append(check);label.addEventListener('click',event=>{event.stopPropagation();});check.addEventListener('change',()=>select(entry,{toggle:true}));
      const more=node('button','icon-button more-button');more.title='Actions';more.setAttribute('aria-label','Actions pour '+nameOf(entry));more.append(icon('more'));more.onclick=event=>{event.stopPropagation();if(!state.selected.has(entry.key))select(entry);const rect=more.getBoundingClientRect();contextMenu(rect.right,rect.bottom,entry);};
      const name=node('span','entry-name',nameOf(entry));row.append(label);
      if(state.view==='grid'){const info=node('div','entry-info'),meta=node('div','entry-meta');meta.append(node('span',entry.folder?'folder-status':'',entry.folder?folderLabel(entry):fmtSize(entry.size)),node('span','',entry.folder?'':shortDate(entry.uploaded)));info.append(name,meta);row.append(makeThumb(entry),info,more);}
      else{const cell=node('div','list-name');cell.append(makeThumb(entry),name);row.append(cell,node('span','cell',entry.folder?'—':fmtSize(entry.size)),node('span','cell date',entry.folder?'—':fmtDate(entry.uploaded)),node('span','cell type'+(entry.folder?' folder-status':''),entry.folder?folderLabel(entry):kindName(entry.kind)),more);}
      row.addEventListener('click',event=>select(entry,event));row.addEventListener('dblclick',event=>{if(!event.target.closest('button,input,label'))openEntry(entry);});row.addEventListener('contextmenu',event=>{event.preventDefault();if(!state.selected.has(entry.key))select(entry);contextMenu(event.clientX,event.clientY,entry);});row.addEventListener('keydown',event=>{if(event.key===' '&&event.target===row){event.preventDefault();select(entry,{toggle:true});}});
      $('items').append(row);
    });
    $('empty').hidden=!!visible.length||state.loading;$('items').hidden=!visible.length&&!state.loading;
    const filtered=$('search').value||$('filter').value!=='all';$('emptyTitle').textContent=filtered?'Aucun résultat':'Ce dossier est vide';$('emptyText').textContent=filtered?'Modifiez la recherche ou le filtre.':'Glissez vos fichiers ici ou utilisez le bouton Importer.';
    const folders=state.entries.filter(e=>e.folder).length,files=state.entries.length-folders,bytes=state.entries.reduce((n,e)=>n+(e.size||0),0);
    $('folderSummary').textContent=folders+' dossier'+(folders>1?'s':'')+' · '+files+' fichier'+(files>1?'s':'');
    $('loadMoreWrap').hidden=!state.cursor;
    if(!state.loading&&!state.busy)status((filtered?visible.length+' résultat(s) · ':'')+fmtSize(bytes)+' dans les fichiers chargés');
    renderBreadcrumbs();updateControls();
  }
  function updateFolderLabels(){
    const folders=new Map(state.entries.filter(entry=>entry.folder).map(entry=>[entry.key,entry]));
    $('items').querySelectorAll('.entry').forEach(row=>{
      const entry=folders.get(row.dataset.key);if(!entry)return;
      const label=folderLabel(entry),target=row.querySelector('.folder-status');
      if(target)target.textContent=label;
      row.setAttribute('aria-label',nameOf(entry)+', '+label);
    });
  }
  async function refreshFolderStatuses(id,prefix){
    // Vérification légère, par petits lots. Pas de téléchargement des fichiers
    // et pas de parcours récursif complet du compartiment.
    const keys=state.entries.filter(entry=>entry.folder&&typeof entry.empty!=='boolean').map(entry=>entry.key);
    for(let offset=0;offset<keys.length;offset+=12){
      if(id!==state.loadId||prefix!==state.prefix||state.busy)return;
      const prefixes=keys.slice(offset,offset+12);let data;
      try{data=await post({action:'folder-status',prefixes});}
      catch{return;} // En cas d'échec, conserver « Dossier », jamais un faux « vide ».
      if(id!==state.loadId||prefix!==state.prefix||state.busy)return;
      const requested=new Set(prefixes),values=new Map();
      for(const folder of data.folders||[]){
        if(requested.has(folder.key)&&typeof folder.empty==='boolean')values.set(folder.key,folder.empty);
      }
      for(const entry of state.entries){if(entry.folder&&values.has(entry.key))entry.empty=values.get(entry.key);}
      updateFolderLabels();
    }
  }
  function listingURL(prefix,cursor='',recursive=false){const p=new URLSearchParams({prefix});if(cursor)p.set('cursor',cursor);if(recursive)p.set('recursive','1');return API+'?'+p;}
  async function load(append=false){
    const id=++state.loadId,prefix=state.prefix;state.loading=true;updateControls();$('items').setAttribute('aria-busy','true');status('Chargement du dossier…');
    try{
      const data=await api(listingURL(prefix,append?state.cursor:''));if(id!==state.loadId)return;
      const entries=[...data.folders.map(key=>({key,folder:true,kind:'folder',size:0})),...data.objects.filter(o=>!o.key.endsWith('/')&&o.key.split('/').pop()!==MARKER).map(o=>({...o,folder:false}))];
      state.entries=Array.from(new Map([...(append?state.entries:[]),...entries].map(e=>[e.key,e])).values());state.cursor=data.cursor;
      if(!append)state.selected.clear();
      const record=treeNode(prefix);
      if(!record.loading && (!record.loaded || !data.cursor)){record.children=state.entries.filter(e=>e.folder).map(e=>e.key).sort(collator.compare);record.loaded=!data.cursor;record.error='';}
    }catch(error){if(id!==state.loadId)return;state.entries=[];state.cursor=null;notice(error.message,'error');status('Chargement impossible.');}
    finally{if(id===state.loadId){state.loading=false;$('items').setAttribute('aria-busy','false');render();void refreshFolderStatuses(id,prefix);}}
  }
  async function refreshRoots(force=false){
    if(force)invalidateTree();
    const id=++tree.syncId;
    // Ne charger que la racine et les branches ouvertes pendant cette visite.
    // La racine est imposée au démarrage ; les branches ne s'ouvrent qu'en naviguant.
    await readTree('');if(id!==tree.syncId)return;
    const queue=[...treeNode('').children],seen=new Set();
    while(queue.length){
      const key=queue.shift();if(seen.has(key))continue;seen.add(key);
      if(!tree.expanded.has(key))continue;
      await readTree(key);if(id!==tree.syncId)return;
      queue.push(...treeNode(key).children);
    }
    renderSidebar();revealCurrentFolder();
  }
  function updateFolderAddress(prefix=''){
    // Le fragment sert seulement à la navigation dans la visite en cours.
    // replaceState ne déclenche pas hashchange et ne recharge pas le document.
    try{history.replaceState(history.state,'',location.pathname+location.search+(prefix?'#d='+encodeURIComponent(prefix):''));}catch{}
  }
  function resetVisitScroll(){
    $('rootFolders').scrollTop=0;
    window.scrollTo({top:0,left:0,behavior:'instant'});
  }
  async function startAtRoot(){
    // Aucune reprise du dernier dossier, même si l'URL contient encore #d=….
    // Invalider les chargements en cours pour qu'une ancienne réponse ne
    // réaffiche pas le sous-dossier après un retour via le cache du navigateur.
    state.loadId++;
    state.prefix='';state.entries=[];state.cursor=null;state.history=[];
    state.selected.clear();state.anchor=null;state.clipboard=null;
    tree.expanded.clear();invalidateTree();
    clearTimeout(searchTimer);$('search').value='';$('filter').value='all';
    hideMenu();closePreview();
    if($('promptDialog').open)finishPrompt(null);
    notice('');$('toast').hidden=true;
    updateFolderAddress();render();resetVisitScroll();
    await load();await refreshRoots();
  }
  async function navigate(prefix,remember=true){
    if(state.busy)return;
    if(prefix===state.prefix&&!state.loading){expandPath(prefix);await refreshRoots();return;}
    if(remember)state.history.push(state.prefix);state.prefix=prefix;state.cursor=null;state.anchor=null;state.selected.clear();$('search').value='';notice('');hideMenu();
    expandPath(prefix);renderBreadcrumbs();
    updateFolderAddress(prefix);await load();await refreshRoots();
  }
  function setClipboard(mode){if(!state.selected.size||state.busy)return;state.clipboard={mode,entries:selectedEntries().map(e=>({...e}))};render();toast(state.selected.size+' élément(s) '+(mode==='cut'?'coupé(s)':'copié(s)')+'. Ouvrez le dossier de destination.');}
  function validName(value){if(!value||value==='.'||value==='..'||value===MARKER||/[\/\\\u0000-\u001f\u007f]/.test(value))return 'Choisissez un nom sans / ni \\, et non réservé.';if(value.length>250)return 'Ce nom est trop long.';return '';}
  let promptResolve=null;
  function ask({title,text='',value=null,label='Nom',confirm='Valider',danger=false}){
    return new Promise(resolve=>{
      promptResolve=resolve;$('promptTitle').textContent=title;$('promptText').textContent=text;$('promptField').hidden=value===null;$('promptLabel').textContent=label;$('promptInput').value=value??'';$('promptError').textContent='';$('promptConfirm').textContent=confirm;$('promptConfirm').className='button '+(danger?'danger':'primary');$('promptDialog').showModal();
      if(value!==null){$('promptInput').focus();const dot=value.lastIndexOf('.');$('promptInput').setSelectionRange(0,dot>0?dot:value.length);}else $('promptCancel').focus();
    });
  }
  function finishPrompt(result){$('promptDialog').close();const resolve=promptResolve;promptResolve=null;resolve?.(result);}
  $('promptCancel').onclick=() => finishPrompt(null);$('promptClose').onclick=() => finishPrompt(null);$('promptDialog').addEventListener('cancel',event=>{event.preventDefault();finishPrompt(null);});
  $('promptForm').addEventListener('submit',event=>{event.preventDefault();if($('promptField').hidden){finishPrompt(true);return;}const value=$('promptInput').value.trim(),error=validName(value);if(error){$('promptError').textContent=error;return;}finishPrompt(value);});
  function progress(title,done,total,detail=''){if(title)$('progressTitle').textContent=title;$('progress').value=total?Math.min(100,done/total*100):0;$('progressDetail').textContent=detail;}
  async function job(title,fn){
    if(state.busy)return;state.busy=true;state.cancel=false;state.phase='';state.copies=0;notice('');hideMenu();$('progressPanel').hidden=false;$('cancelJob').disabled=false;progress(title,0,1);updateControls();
    try{await fn();}catch(error){
      let message=error.name==='AbortError'?'Opération arrêtée.':error.message;
      if(state.phase==='copying'&&state.copies)message+=' Les sources sont conservées. '+state.copies+' copie(s) déjà créée(s) restent dans la destination.';
      if(state.phase==='cleaning')message+=' Les copies sont terminées et vérifiées ; certaines sources peuvent rester à supprimer.';
      if(state.phase==='deleting')message+=' Les fichiers déjà supprimés ne sont pas restaurés.';
      notice(message,'error');
    }finally{state.busy=false;state.xhr=null;$('progressPanel').hidden=true;invalidateTree();await load();await refreshRoots();updateControls();}
  }
  $('cancelJob').onclick=()=>{state.cancel=true;state.xhr?.abort();$('cancelJob').disabled=true;$('progressDetail').textContent='Arrêt demandé après la requête en cours…';};
  async function listAll(prefix,recursive=true){const result=[],seen=new Set();let cursor='';do{abortCheck();const data=await api(listingURL(prefix,cursor,recursive));result.push(...data.objects);cursor=data.cursor||'';if(cursor&&seen.has(cursor))throw Error('Pagination incohérente. Actualisez le dossier.');seen.add(cursor);}while(cursor);return result;}
  function roots(entries){return entries.filter(e=>!entries.some(p=>p!==e&&p.folder&&e.key.startsWith(p.key)));}
  async function collect(entries){const objects=new Map();for(const e of roots(entries)){abortCheck();if(e.folder){const all=await listAll(e.key);if(!all.length)throw Error('Le dossier n’existe plus : '+e.key);all.forEach(o=>objects.set(o.key,o));}else objects.set(e.key,e);}return [...objects.values()];}
  async function preserveParents(entries){
    const parents=new Set(roots(entries).map(e=>parentOf(e.key)).filter(Boolean));
    for(const prefix of parents){abortCheck();await post({action:'ensure-folder',prefix});}
  }
  async function verifyObjects(objects){for(let i=0;i<objects.length;i+=20){abortCheck();await post({action:'verify',entries:objects.slice(i,i+20).map(o=>({key:o.key,version:o.version,etag:o.etag,size:o.size}))});}}
  async function deleteObjects(objects,title='Suppression'){for(let i=0;i<objects.length;i+=20){abortCheck();progress(title,i,objects.length,`${i} / ${objects.length} fichiers`);await post({action:'delete-batch',entries:objects.slice(i,i+20).map(o=>({key:o.key,version:o.version}))});}progress(title,1,1);}
  async function destinationExists(key,folder){return (await post({action:'probe',entries:[{key,folder}]})).entries[0].exists;}
  async function unusedName(key,folder){
    if(!await destinationExists(key,folder))return key;
    const base=key.replace(/\/$/,''),slash=base.lastIndexOf('/'),name=base.slice(slash+1),dir=base.slice(0,slash+1),dot=!folder?name.lastIndexOf('.'):-1;
    const stem=dot>0?name.slice(0,dot):name,ext=dot>0?name.slice(dot):'';
    for(let n=1;n<=10000;n++){abortCheck();const candidate=dir+stem+' (copie'+(n===1?'':' '+n)+')'+ext+(folder?'/':'');if(!await destinationExists(candidate,folder))return candidate;}
    throw Error('Trop de copies portent déjà ce nom.');
  }
  async function copyObject(source,to){
    abortCheck();const data=await post({action:'copy-file',from:source.key,to,version:source.version});
    if(data.complete){state.copies++;return data.object;}
    const parts=[];let complete=false;
    try{
      const count=Math.ceil(source.size/data.partSize);
      for(let n=1;n<=count;n++){abortCheck();$('progressDetail').textContent=`${source.key} · morceau ${n}/${count}`;const part=await post({action:'copy-part',from:source.key,to,version:data.source.version,uploadId:data.uploadId,partNumber:n});parts.push(part.part);}
      abortCheck();const result=await post({action:'copy-complete',key:to,from:source.key,version:data.source.version,uploadId:data.uploadId,size:source.size,parts});complete=true;state.copies++;return result.object;
    }finally{if(!complete)await post({action:'upload-abort',key:to,uploadId:data.uploadId}).catch(()=>{});}
  }
  async function transfer(mapping,move){
    const plan=[];
    for(const {source,to} of mapping){
      abortCheck();if(source.folder&&to.startsWith(source.key))throw Error('Impossible de placer un dossier dans lui-même.');
      if(await destinationExists(to,source.folder))throw Error('La destination existe déjà : '+to);
      const files=source.folder?await listAll(source.key):[source];if(!files.length)throw Error('La source n’existe plus : '+source.key);
      files.forEach(file=>plan.push({source:file,to:source.folder?to+file.key.slice(source.key.length):to}));
    }
    state.phase='copying';const copies=[];
    for(let i=0;i<plan.length;i++){abortCheck();const p=plan[i];progress(move?'Déplacement · copie sécurisée':'Copie des fichiers',i,plan.length,p.source.key);copies.push(await copyObject(p.source,p.to));}
    abortCheck();progress('Vérification des copies',0,1,plan.length+' fichier(s)');await verifyObjects(copies);
    if(move){await verifyObjects(plan.map(p=>p.source));await preserveParents(mapping.map(m=>m.source));state.phase='cleaning';await deleteObjects(plan.map(p=>p.source),'Déplacement · suppression des anciennes sources');}
    state.phase='';notice((move?'Déplacement terminé. ':'Copie terminée. ')+plan.length+' fichier(s) traité(s).'+(move?' Pensez à mettre à jour les anciens liens.':''),'success');
  }
  async function paste(){
    if(state.busy||!state.clipboard)return;const clip=state.clipboard,entries=roots(clip.entries),destination=state.prefix;
    if(clip.mode==='cut'&&entries.every(e=>parentOf(e.key)===destination)){toast('Ces éléments sont déjà dans ce dossier.');return;}
    if(entries.some(e=>e.folder&&destination.startsWith(e.key))){notice('Impossible de coller un dossier dans lui-même ou dans l’un de ses sous-dossiers.','error');return;}
    if(clip.mode==='cut'&&!await ask({title:'Déplacer la sélection ?',text:entries.length+' élément(s) vers /'+destination+'\n\nLe chemin change : les liens existants devront être mis à jour. Les fichiers sont copiés et vérifiés avant la suppression des sources.',confirm:'Déplacer'}))return;
    await job(clip.mode==='cut'?'Préparation du déplacement':'Préparation de la copie',async()=>{
      const mapping=[];
      for(const source of entries){abortCheck();let to=destination+nameOf(source)+(source.folder?'/':'');if(clip.mode==='cut'&&source.key===to)continue;if(clip.mode==='copy')to=await unusedName(to,source.folder);mapping.push({source,to});}
      if(mapping.length)await transfer(mapping,clip.mode==='cut');if(clip.mode==='cut')state.clipboard=null;
    });
  }
  async function rename(entry=selectedEntries()[0]){
    if(state.busy||!entry)return;
    const value=await ask({title:entry.folder?'Renommer le dossier':'Renommer le fichier',text:'Le chemin change : les liens déjà utilisés devront être mis à jour. Aucun fichier portant le nouveau nom ne sera remplacé.',value:nameOf(entry),label:'Nouveau nom',confirm:'Renommer'});
    if(value===null||value===nameOf(entry))return;closePreview();
    await job('Renommage',async()=>{await transfer([{source:entry,to:parentOf(entry.key)+value+(entry.folder?'/':'')}],true);notice('« '+nameOf(entry)+' » a été renommé en « '+value+' ». Les anciens liens doivent être mis à jour.','success');});
  }
  async function remove(entries=selectedEntries()){
    if(state.busy||!entries.length)return;closePreview();
    await job('Analyse de la sélection',async()=>{
      const files=await collect(entries),size=files.reduce((n,f)=>n+f.size,0);
      const ok=await ask({title:'Supprimer définitivement ?',text:entries.map(nameOf).slice(0,8).join('\n')+(entries.length>8?'\n…':'')+'\n\n'+files.filter(f=>!f.key.endsWith('/')&&f.key.split('/').pop()!==MARKER).length+' fichier(s) · '+fmtSize(size)+'\nLe contenu des dossiers sélectionnés sera supprimé. Cette action est irréversible.',confirm:'Supprimer définitivement',danger:true});
      if(!ok)return;abortCheck();await verifyObjects(files);await preserveParents(entries);state.phase='deleting';await deleteObjects(files);state.phase='';state.clipboard=null;notice('Sélection supprimée.','success');
    });
  }
  async function mkdir(){
    if(state.busy)return;const name=await ask({title:'Nouveau dossier',text:'Emplacement : /'+state.prefix,value:'',label:'Nom du dossier',confirm:'Créer le dossier'});if(!name)return;
    await job('Création du dossier',async()=>{await post({action:'mkdir',prefix:state.prefix+name+'/'});notice('Dossier « '+name+' » créé.','success');});
  }
  function xhrUpload(url,blob,onProgress){
    return new Promise((resolve,reject)=>{
      const xhr=new XMLHttpRequest();state.xhr=xhr;xhr.open('PUT',url);xhr.withCredentials=true;xhr.setRequestHeader('Content-Type',blob.type||'application/octet-stream');xhr.setRequestHeader('Accept','application/json');
      xhr.upload.onprogress=e=>{if(e.lengthComputable)onProgress(e.loaded,e.total);};
      xhr.onload=()=>{state.xhr=null;let data;try{data=JSON.parse(xhr.responseText);}catch{}if(xhr.status>=200&&xhr.status<300&&data?.ok)resolve(data);else reject(responseError(xhr.status,data));};
      xhr.onerror=()=>{state.xhr=null;reject(Error('Connexion interrompue pendant l’envoi.'));};xhr.onabort=()=>{state.xhr=null;const e=Error('Envoi arrêté.');e.name='AbortError';reject(e);};xhr.send(blob);
    });
  }
  async function uploadOne(file,key,onProgress){
    abortCheck();
    // Le chemin dédié aux fichiers vides ne dépend pas d’un Content-Length ajouté par le navigateur.
    if(file.size===0){const result=await post({action:'create-empty',key});onProgress(0,0);return result;}
    if(file.size<=PART)return xhrUpload(API+'?key='+encodeURIComponent(key),file,onProgress);
    const data=await post({action:'upload-start',key,size:file.size,contentType:file.type}),parts=[];let complete=false;
    try{
      for(let offset=0,n=1;offset<file.size;offset+=data.partSize,n++){
        abortCheck();const blob=file.slice(offset,Math.min(file.size,offset+data.partSize),file.type),params=new URLSearchParams({action:'upload-part',key,uploadId:data.uploadId,partNumber:String(n)});
        const result=await xhrUpload(API+'?'+params,blob,(loaded)=>onProgress(offset+loaded,file.size));parts.push(result.part);
      }
      abortCheck();const result=await post({action:'upload-complete',key,uploadId:data.uploadId,size:file.size,parts});complete=true;return result;
    }finally{if(!complete)await post({action:'upload-abort',key,uploadId:data.uploadId}).catch(()=>{});}
  }
  async function importFiles(items,folders=[]){
    if(state.busy||(!items.length&&!folders.length))return;
    const prefix=state.prefix;
    await job('Importation',async()=>{
      const errors=[];let done=0,total=items.reduce((n,i)=>n+i.file.size,0),sent=0;
      const dirs=new Set(folders);
      for(const item of items){const path=item.path||item.file.name,parts=path.split('/');for(let i=1;i<parts.length;i++)dirs.add(parts.slice(0,i).join('/')+'/');}
      for(const dir of [...dirs].sort((a,b)=>a.length-b.length)){abortCheck();if(!await destinationExists(prefix+dir,true))await post({action:'mkdir',prefix:prefix+dir});}
      for(let i=0;i<items.length;i++){
        abortCheck();const {file,path}=items[i],key=prefix+(path||file.name);
        try{await uploadOne(file,key,(loaded)=>progress('Importation · '+(i+1)+' / '+items.length,sent+loaded,total,key+' · '+fmtSize(loaded)+' / '+fmtSize(file.size)));done++;}
        catch(error){if(error.name==='AbortError'||error.status===401||error.status===403)throw error;errors.push((path||file.name)+' : '+error.message);}
        sent+=file.size;progress('Importation',total?sent:i+1,total||items.length,key);
      }
      notice(done+' fichier(s) importé(s).'+(errors.length?'\n'+errors.slice(0,12).join('\n')+(errors.length>12?'\n…':''):'')+(items.length===0?' Dossier(s) créé(s).':''),errors.length?'error':'success');
    });
  }
  async function droppedItems(dataTransfer){
    const items=[],folders=[];
    async function walk(entry,path=''){
      if(entry.isFile){const file=await new Promise((res,rej)=>entry.file(res,rej));items.push({file,path:path+entry.name});}
      else if(entry.isDirectory){const dir=path+entry.name+'/';folders.push(dir);const reader=entry.createReader();let batch;do{batch=await new Promise((res,rej)=>reader.readEntries(res,rej));for(const child of batch)await walk(child,dir);}while(batch.length);}
    }
    const entries=[...(dataTransfer.items||[])].map(i=>i.webkitGetAsEntry?.()).filter(Boolean);
    if(entries.length){for(const entry of entries)await walk(entry);}else for(const file of dataTransfer.files)items.push({file,path:file.name});
    return {items,folders};
  }
  async function clipboardWrite(text){try{await navigator.clipboard.writeText(text);toast('Lien copié.');}catch{const field=!$('tempResult').hidden&&$('tempLink').value===text?$('tempLink'):$('permalink');field.focus();field.select();toast('Copie indisponible : le lien est sélectionné, utilisez Ctrl+C.');}}
  function closePreview(){if($('previewDialog').open)$('previewDialog').close();$('previewBody').querySelectorAll('video,audio').forEach(e=>e.pause());$('previewBody').replaceChildren();state.preview=null;}
  function openEntry(entry){if(state.busy)return;if(entry.folder){navigate(entry.key);return;}showPreview(entry);}
  function showPreview(entry){
    state.preview=entry;$('previewTitle').textContent=nameOf(entry);$('previewKind').textContent=kindName(entry.kind).toUpperCase();$('previewMeta').textContent=fmtSize(entry.size)+' · '+fmtDate(entry.uploaded)+' · /'+parentOf(entry.key);$('previewBody').replaceChildren();$('permalink').value=location.origin+mediaPath(entry.key);$('tempResult').hidden=true;$('temporaryOptions').open=false;$('access').value='site';$('ttl').value='3600';updateAccessNote();
    const kind=entry.kind;let media;
    if(entry.size===0){/* Un fichier vide n’est pas une image ou vidéo corrompue. */}
    else if(kind==='image'){media=node('img');media.alt=nameOf(entry);}
    else if(kind==='video'){media=node('video');media.controls=true;media.preload='metadata';}
    else if(kind==='audio'){media=node('audio');media.controls=true;media.preload='metadata';}
    else if(/\.pdf$/i.test(entry.key)){media=node('iframe');media.title='Aperçu du PDF';media.setAttribute('sandbox','allow-same-origin');}
    if(media){media.src=previewURL(entry.key);media.onerror=()=>{media.replaceWith(node('p','muted','Aperçu indisponible pour ce format. Le téléchargement reste disponible.'));};$('previewBody').append(media);}
    else{const box=node('div','placeholder');box.append(icon(kind),node('p','',entry.size===0?'Fichier vide · 0 octet. Aucun contenu à afficher pour le moment.':'Aperçu non disponible pour ce format.'));$('previewBody').append(box);}
    $('permanentNote').textContent=['image','video'].includes(kind)?'À copier dans ton site : cette adresse reste fixe. Une autorisation temporaire est créée à chaque chargement, puis renouvelée à la demande si nécessaire (par exemple après une pause vidéo). Aucun lien à remplacer à la main. L’accès reste soumis à la protection du site.':'Pour les documents et archives, cette adresse seule n’ouvre pas un accès public : elle reste réservée à l’administrateur. La distribution aux visiteurs doit passer par les règles de téléchargement du site ou par un partage temporaire explicite.';
    $('previewDialog').showModal();
  }
  $('previewDialog').addEventListener('close',()=>{$('previewBody').querySelectorAll('video,audio').forEach(e=>e.pause());$('previewBody').replaceChildren();state.preview=null;});
  async function createTemporary(){
    if(!state.preview)return;const entry=state.preview;$('createTemp').disabled=true;
    try{const data=await api('/api/r2-download',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:entry.key,ttl:Number($('ttl').value),access:$('access').value,download:entry.kind==='archive'})});if(state.preview?.key!==entry.key)return;$('tempLink').value=new URL(data.url,location.origin).href;$('expiry').textContent='Expire le '+new Date(data.expires*1000).toLocaleString('fr-FR')+' · Aucun renouvellement automatique de ce lien ponctuel.';$('tempResult').hidden=false;}
    catch(e){toast(e.message);}finally{$('createTemp').disabled=false;}
  }
  function updateAccessNote(){
    $('accessNote').textContent=$('access').value==='share'
      ?'Partage extérieur : toute personne qui reçoit ce lien peut l’utiliser jusqu’à son expiration. Il ne se renouvelle pas chez le destinataire. Générer un nouveau lien ne prolonge ni ne révoque l’ancien.'
      :'Lien ponctuel réservé aux appels depuis le site. Il expire à la durée choisie, sans renouvellement. Pour un affichage durable avec renouvellement automatique, copie l’adresse permanente ci-dessus.';
  }
  $('access').onchange=()=>{updateAccessNote();$('tempResult').hidden=true;};
  $('ttl').onchange=()=>{$('tempResult').hidden=true;};
  function download(entry){const a=node('a');a.href=previewURL(entry.key,true);a.download=nameOf(entry);document.body.append(a);a.click();a.remove();}
  function hideMenu(){$('contextMenu').hidden=true;}
  function contextMenu(x,y,entry){
    if(state.busy)return;const menu=$('contextMenu');menu.replaceChildren();
    function action(title,ico,callback,disabled=false,shortcut='',danger=false){const b=node('button',danger?'danger':'');b.setAttribute('role','menuitem');b.disabled=disabled;b.append(icon(ico),node('span','',title));if(shortcut)b.append(node('small','',shortcut));b.onclick=()=>{hideMenu();callback();};menu.append(b);}
    if(entry){action(entry.folder?'Ouvrir le dossier':'Voir / liens',entry.folder?'folderOpen':'image',()=>openEntry(entry),state.selected.size!==1,'Entrée');if(!entry.folder)action('Télécharger','download',()=>download(entry),state.selected.size!==1);menu.append(node('hr'));}
    action('Couper','scissors',()=>setClipboard('cut'),!state.selected.size,'Ctrl+X');action('Copier','copy',()=>setClipboard('copy'),!state.selected.size,'Ctrl+C');action('Coller ici','clipboard',paste,!state.clipboard,'Ctrl+V');menu.append(node('hr'));action('Renommer','edit',()=>rename(),state.selected.size!==1,'F2');action('Supprimer','trash',()=>remove(),!state.selected.size,'Suppr',true);menu.append(node('hr'));action('Nouveau dossier','folderPlus',mkdir);
    menu.hidden=false;const rect=menu.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(x,window.innerWidth-rect.width-8))+'px';menu.style.top=Math.max(8,Math.min(y,window.innerHeight-rect.height-8))+'px';
  }
  $('root').onclick=()=>navigate('');$('up').onclick=()=>navigate(parentOf(state.prefix));$('back').onclick=()=>{const previous=state.history.pop();if(previous!==undefined)navigate(previous,false);};$('refresh').onclick=async()=>{invalidateTree();await load();await refreshRoots();};$('loadMore').onclick=()=>load(true);
  $('gridView').onclick=()=>{state.view='grid';save('r2.explorer.view','grid');render();};$('listView').onclick=()=>{state.view='list';save('r2.explorer.view','list');render();};
  let searchTimer;$('search').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{state.selected.clear();render();},130);};$('filter').onchange=()=>{state.selected.clear();render();};$('sort').onchange=()=>render();
  $('selectAll').onchange=()=>{const checked=$('selectAll').checked;visibleEntries().forEach(e=>checked?state.selected.add(e.key):state.selected.delete(e.key));syncSelection();};
  $('cut').onclick=()=>setClipboard('cut');$('copy').onclick=()=>setClipboard('copy');$('paste').onclick=paste;$('rename').onclick=()=>rename();$('delete').onclick=()=>remove();$('newFolder').onclick=mkdir;$('clearClipboard').onclick=()=>{state.clipboard=null;render();};
  $('import').onclick=()=>$('files').click();$('importFolder').onclick=()=>$('folderFiles').click();
  $('files').onchange=e=>{const files=[...e.target.files];e.target.value='';importFiles(files.map(file=>({file,path:file.name})));};
  $('folderFiles').onchange=e=>{const files=[...e.target.files];e.target.value='';importFiles(files.map(file=>({file,path:file.webkitRelativePath||file.name})));};
  $('closePreview').onclick=closePreview;$('copyLink').onclick=()=>clipboardWrite($('permalink').value);$('copyTemp').onclick=()=>clipboardWrite($('tempLink').value);$('createTemp').onclick=createTemporary;$('downloadFile').onclick=()=>{if(state.preview)download(state.preview);};$('renamePreview').onclick=()=>rename(state.preview);$('deletePreview').onclick=()=>{if(state.preview)remove([state.preview]);};
  $('items').addEventListener('click',e=>{if(e.target===$('items')){state.selected.clear();syncSelection();}});$('items').addEventListener('contextmenu',e=>{if(e.target===$('items')){e.preventDefault();contextMenu(e.clientX,e.clientY,null);}});
  document.addEventListener('pointerdown',e=>{if(!$('contextMenu').contains(e.target))hideMenu();});document.addEventListener('scroll',hideMenu,true);window.addEventListener('resize',hideMenu);
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){hideMenu();if(!$('previewDialog').open&&!$('promptDialog').open){state.selected.clear();syncSelection();}return;}
    if(state.busy||$('previewDialog').open||$('promptDialog').open||e.target.closest('input,textarea,select,[contenteditable=true],#rootFolders'))return;
    const mod=e.ctrlKey||e.metaKey,key=e.key.toLowerCase();
    if(mod&&key==='a'){e.preventDefault();visibleEntries().forEach(x=>state.selected.add(x.key));syncSelection();}
    if(mod&&key==='c'&&state.selected.size){e.preventDefault();setClipboard('copy');}if(mod&&key==='x'&&state.selected.size){e.preventDefault();setClipboard('cut');}if(mod&&key==='v'&&state.clipboard){e.preventDefault();paste();}
    if(e.key==='F2'&&state.selected.size===1){e.preventDefault();rename();}if(e.key==='Delete'&&state.selected.size){e.preventDefault();remove();}if(e.key==='Enter'&&state.selected.size===1&&!e.target.closest('button,a')){e.preventDefault();openEntry(selectedEntries()[0]);}
  });
  document.addEventListener('paste',e=>{if(state.busy||e.target.closest('input,textarea')||$('previewDialog').open||$('promptDialog').open)return;const files=[...(e.clipboardData?.files||[])];if(files.length){e.preventDefault();importFiles(files.map(file=>({file,path:file.name})));}});
  let dragDepth=0;
  const isFileDrag=e=>[...(e.dataTransfer?.types||[])].includes('Files');
  window.addEventListener('dragenter',e=>{if(!isFileDrag(e))return;e.preventDefault();dragDepth++;if(!state.busy){$('dropPath').textContent='Destination : /'+state.prefix;$('dropOverlay').hidden=false;}});
  window.addEventListener('dragover',e=>{if(isFileDrag(e)){e.preventDefault();e.dataTransfer.dropEffect=state.busy?'none':'copy';}});
  window.addEventListener('dragleave',e=>{if(!isFileDrag(e))return;dragDepth=Math.max(0,dragDepth-1);if(!dragDepth)$('dropOverlay').hidden=true;});
  window.addEventListener('drop',async e=>{if(!isFileDrag(e))return;e.preventDefault();dragDepth=0;$('dropOverlay').hidden=true;if(state.busy)return;try{const result=await droppedItems(e.dataTransfer);await importFiles(result.items,result.folders);}catch(error){notice(error.message,'error');}});
  window.addEventListener('beforeunload',e=>{if(state.busy){e.preventDefault();e.returnValue='';}});
  window.addEventListener('hashchange',()=>navigate(prefixFromHash()));
  window.addEventListener('pageshow',event=>{
    // Nouvelle visite depuis le cache : remettre les deux panneaux à la racine.
    // Ne pas perturber un transfert que le navigateur aurait conservé en cours.
    if(event.persisted){if(!state.busy)void startAtRoot();}
    else resetVisitScroll();
  });
  void startAtRoot();
})();
