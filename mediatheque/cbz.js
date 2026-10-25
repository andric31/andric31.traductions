// CBZ : index ZIP classique, puis extraction d’une seule page à la fois.
// ZIP Store/Deflate : https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT
// Décompression native : https://compression.spec.whatwg.org/
export const CBZ_LIMITS = Object.freeze({archive:512*1024*1024,page:20*1024*1024,total:1024*1024*1024,pages:500,entries:5000,directory:8*1024*1024});
const imageExtension=/\.(png|jpe?g|webp|gif|avif)$/i;
const check=(ok,message)=>{if(!ok)throw Error(message);};
const aborted=()=>Object.assign(Error('Import CBZ annulé.'),{name:'AbortError'});
function checkCancel(isCancelled){if(isCancelled())throw aborted();}
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
const cp437='ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';
function decodeName(bytes,utf8){
  if(utf8){try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw Error('Nom de page CBZ mal encodé.');}}
  return Array.from(bytes,b=>b<128?String.fromCharCode(b):cp437[b-128]).join('');
}
async function read(file,start,length,signal){
  check(Number.isSafeInteger(start)&&start>=0&&length>=0&&start+length<=file.size,'Archive CBZ tronquée.');
  const bytes=new Uint8Array(await file.slice(start,start+length).arrayBuffer({signal}));
  check(bytes.length===length,'Archive CBZ tronquée.');return bytes;
}
const view=bytes=>new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
function safeName(name){
  check(name&&name.length<=1024&&!/[\\\x00-\x1f\x7f]/.test(name)&&!name.startsWith('/')&&!/^[a-z]:/i.test(name),'Chemin de page CBZ invalide.');
  const parts=name.replace(/\/$/,'').split('/');
  check(parts.every(p=>p&&p!=='.'&&p!=='..'),'Chemin de page CBZ invalide.');
  return parts;
}

export async function openCbz(file,{maxPages=CBZ_LIMITS.pages,startPage=1,isCancelled=()=>false}={}){
  check(file&&/\.cbz$/i.test(file.name||''),'Choisis un fichier .cbz.');
  check(file.size>=22,'Archive CBZ vide ou invalide.');
  check(file.size<=CBZ_LIMITS.archive,'CBZ trop volumineux (512 Mo maximum).');
  checkCancel(isCancelled);
  const tailStart=Math.max(0,file.size-65557),tail=await read(file,tailStart,file.size-tailStart),end=view(tail);
  let at=-1;
  for(let i=tail.length-22;i>=0;i--){if(end.getUint32(i,true)===0x06054b50&&i+22+end.getUint16(i+20,true)===tail.length){at=i;break;}}
  check(at>=0,'Ce fichier n’est pas un CBZ valide, ou son archive est tronquée.');
  check(end.getUint16(at+4,true)===0&&end.getUint16(at+6,true)===0,'Les CBZ répartis en plusieurs archives ne sont pas pris en charge.');
  const count=end.getUint16(at+10,true),directorySize=end.getUint32(at+12,true),directoryOffset=end.getUint32(at+16,true);
  check(count!==65535&&directorySize!==0xffffffff&&directoryOffset!==0xffffffff,'CBZ ZIP64 non pris en charge : réenregistre-le en ZIP classique.');
  check(end.getUint16(at+8,true)===count,'Index CBZ incohérent.');
  check(count<=CBZ_LIMITS.entries&&directorySize<=CBZ_LIMITS.directory,'Le CBZ contient trop de fichiers.');
  check(directoryOffset+directorySize===tailStart+at,'Index CBZ invalide ou format ZIP non pris en charge.');
  const directory=await read(file,directoryOffset,directorySize),index=view(directory),pages=[],names=new Set();
  let offset=0,total=0;
  for(let n=0;n<count;n++){
    checkCancel(isCancelled);
    check(offset+46<=directory.length&&index.getUint32(offset,true)===0x02014b50,'Index CBZ endommagé.');
    const flags=index.getUint16(offset+8,true),method=index.getUint16(offset+10,true),crc=index.getUint32(offset+16,true),compressedSize=index.getUint32(offset+20,true),size=index.getUint32(offset+24,true);
    const nameLength=index.getUint16(offset+28,true),extraLength=index.getUint16(offset+30,true),commentLength=index.getUint16(offset+32,true),localOffset=index.getUint32(offset+42,true);
    const next=offset+46+nameLength+extraLength+commentLength;
    check(next<=directory.length,'Index CBZ tronqué.');
    check(!(flags&0x2041),'Les CBZ protégés par mot de passe ne sont pas pris en charge.');
    check(index.getUint16(offset+34,true)===0,'CBZ en plusieurs parties non pris en charge.');
    check(![compressedSize,size,localOffset].includes(0xffffffff),'CBZ ZIP64 non pris en charge : réenregistre-le en ZIP classique.');
    const nameBytes=directory.slice(offset+46,offset+46+nameLength),name=decodeName(nameBytes,!!(flags&0x800)),parts=safeName(name);
    const unixType=(index.getUint32(offset+38,true)>>>16)&0xf000;
    check(unixType!==0xa000,'Le CBZ contient un lien de fichier non pris en charge.');
    // Les métadonnées, ressources macOS et fichiers cachés ne sont pas des pages.
    if(!name.endsWith('/')&&!parts.some(p=>p.startsWith('.')||p==='__MACOSX')&&imageExtension.test(name)){
      check(method===0||method===8,'Compression CBZ non prise en charge : utilise ZIP Store ou Deflate.');
      check(size>0&&size<=CBZ_LIMITS.page,'Une page du CBZ est vide ou dépasse 20 Mo.');
      check(compressedSize>0&&compressedSize<=CBZ_LIMITS.page+1024*1024&&localOffset+30+compressedSize<=directoryOffset,'Données de page CBZ invalides.');
      check(method!==0||compressedSize===size,'Taille de page CBZ incohérente.');
      check(!names.has(name.normalize('NFC')),'Le CBZ contient deux pages portant le même chemin.');names.add(name.normalize('NFC'));
      total+=size;check(total<=CBZ_LIMITS.total,'Les pages décompressées du CBZ dépassent 1 Go.');
      pages.push({path:name,size,compressedSize,localOffset,crc,method,flags,nameBytes});
      check(pages.length<=Math.min(CBZ_LIMITS.pages,maxPages),'500 pages maximum par chapitre, pages déjà présentes comprises.');
    }
    offset=next;
  }
  check(offset===directory.length,'Index CBZ incohérent.');
  check(pages.length,'Ce CBZ ne contient aucune image JPG, PNG, WebP, GIF ou AVIF.');
  pages.sort((a,b)=>a.path.localeCompare(b.path,'fr',{numeric:true,sensitivity:'base'})||a.path.localeCompare(b.path,'fr'));
  // Les noms sont numérotés : un tri ultérieur dans le manager garde cet ordre.
  for(let i=0;i<pages.length;i++){
    const entry=pages[i],base=entry.path.split('/').pop();
    entry.name=String(i+startPage).padStart(4,'0')+'-'+base;
  }
  const byOffset=[...pages].sort((a,b)=>a.localOffset-b.localOffset);
  for(let i=1;i<byOffset.length;i++)check(byOffset[i-1].localOffset+30+byOffset[i-1].nameBytes.length+byOffset[i-1].compressedSize<=byOffset[i].localOffset,'Les pages du CBZ se chevauchent.');
  async function extract(entry,{isCancelled=()=>false,signal}={}){
    check(pages.includes(entry),'Page CBZ inconnue.');
    const cancelled=()=>isCancelled()||signal?.aborted;
    checkCancel(cancelled);
    // Les en-têtes locaux se lisent à la demande pour ne pas télécharger toutes les pages.
    const header=await read(file,entry.localOffset,30,signal),local=view(header);
    check(local.getUint32(0,true)===0x04034b50&&local.getUint16(6,true)===entry.flags&&local.getUint16(8,true)===entry.method,'En-tête de page CBZ incohérent.');
    const nameLength=local.getUint16(26,true),extraLength=local.getUint16(28,true);
    check(nameLength===entry.nameBytes.length,'Nom de page CBZ incohérent.');
    const localName=await read(file,entry.localOffset+30,nameLength,signal);
    check(localName.every((b,j)=>b===entry.nameBytes[j]),'Nom de page CBZ incohérent.');
    if(!(entry.flags&8))check(local.getUint32(14,true)===entry.crc&&local.getUint32(18,true)===entry.compressedSize&&local.getUint32(22,true)===entry.size,'Taille ou intégrité de page CBZ incohérente.');
    const dataOffset=entry.localOffset+30+nameLength+extraLength;
    check(dataOffset+entry.compressedSize<=directoryOffset,'Page CBZ tronquée.');
    checkCancel(cancelled);
    let stream=file.slice(dataOffset,dataOffset+entry.compressedSize).stream({signal});
    if(entry.method===8){
      let decompressor;try{decompressor=new DecompressionStream('deflate-raw');}catch{throw Error('Mets ton navigateur à jour pour lire ce CBZ.');}
      stream=stream.pipeThrough(decompressor);
    }
    const reader=stream.getReader(),chunks=[];let size=0,finished=false;
    try{
      while(true){
        checkCancel(cancelled);const {done,value}=await reader.read();checkCancel(cancelled);if(done)break;
        size+=value.length;check(size<=entry.size&&size<=CBZ_LIMITS.page,'Page CBZ trop volumineuse ou archive endommagée.');chunks.push(value);
      }
      finished=true;
    }finally{if(!finished)try{await reader.cancel();}catch{}reader.releaseLock();}
    check(size===entry.size,'Page CBZ tronquée : '+entry.path);
    const bytes=new Uint8Array(size);let pos=0;for(const chunk of chunks){bytes.set(chunk,pos);pos+=chunk.length;}
    check(crc32(bytes)===entry.crc,'Page CBZ endommagée : '+entry.path);checkCancel(cancelled);
    return new File([bytes],entry.name,{type:cbzImageType(bytes)});
  }
  return {pages,total,extract};
}

export function cbzImageType(bytes){
  const ascii=(n,len)=>String.fromCharCode(...bytes.subarray(n,n+len));
  if(bytes.length>=8&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))return 'image/png';
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
  if(/^GIF8[79]a$/.test(ascii(0,6)))return 'image/gif';
  if(ascii(0,4)==='RIFF'&&ascii(8,4)==='WEBP')return 'image/webp';
  if(ascii(4,4)==='ftyp'&&/(?:avif|avis)/.test(ascii(8,56)))return 'image/avif';
  throw Error('Une page du CBZ ne contient pas une image reconnue.');
}
