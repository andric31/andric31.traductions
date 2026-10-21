// Utilitaires de l'explorateur. Aucune route publique ni nouvelle authentification.
import { validKey, category } from './_r2.js';

export const MARKER = '.r2-folder';
export const PART_SIZE = 32 * 1024 * 1024;
export const MAX_PARTS = 10000;
const encoder = new TextEncoder();

export class ExplorerError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function check(condition, message, status = 400) {
  if (!condition) throw new ExplorerError(message, status);
}
export function objectKey(value, { marker = false } = {}) {
  const key = typeof value === 'string' ? value : '';
  const base = key.endsWith('/') ? key.slice(0, -1) : key;
  check(validKey(base) && encoder.encode(key).length <= 1024 && !/[\u007f]/.test(key), 'Chemin de fichier invalide.');
  check(marker || (!key.endsWith('/') && !key.split('/').includes(MARKER)), 'Ce nom est réservé aux dossiers.');
  return key;
}
export function folderKey(value, allowRoot = false) {
  if (allowRoot && value === '') return '';
  check(typeof value === 'string' && value.endsWith('/'), 'Chemin de dossier invalide.');
  const base = objectKey(value.slice(0, -1));
  check(encoder.encode(base + '/' + MARKER).length <= 1024 && (base + '/' + MARKER).length <= 800, 'Chemin de dossier trop long.');
  return base + '/';
}
export function isMarker(key) { return key.endsWith('/') || key.split('/').pop() === MARKER; }
export function contentType(key, supplied = '') {
  const known = {png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',avif:'image/avif',gif:'image/gif',svg:'image/svg+xml',bmp:'image/bmp',ico:'image/x-icon',mp4:'video/mp4',webm:'video/webm',mov:'video/quicktime',m4v:'video/mp4',ogv:'video/ogg',mp3:'audio/mpeg',ogg:'audio/ogg',wav:'audio/wav',pdf:'application/pdf',txt:'text/plain',srt:'text/plain',vtt:'text/vtt',json:'application/json',zip:'application/zip',rar:'application/vnd.rar','7z':'application/x-7z-compressed',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'};
  const type = String(supplied || '').split(';')[0].trim();
  return (/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(type) && type !== 'application/octet-stream') ? type : known[key.split('.').pop().toLowerCase()] || 'application/octet-stream';
}
export function describe(obj) {
  return { key:obj.key, size:obj.size, uploaded:obj.uploaded, etag:obj.etag, version:obj.version,
    kind:isMarker(obj.key)?'folder-marker':category(obj.key), contentType:contentType(obj.key,obj.httpMetadata?.contentType) };
}
export async function mustExist(bucket, key, version) {
  const obj = await bucket.head(key);
  check(obj, 'Fichier introuvable : ' + key, 404);
  check(!version || obj.version === version, 'Le fichier a changé. Actualisez avant de recommencer : ' + key, 409);
  return obj;
}
export async function exists(bucket, key, folder = false) {
  if (folder) {
    const prefix = folderKey(key);
    if (await bucket.head(prefix.slice(0,-1))) return true;
    const result = await bucket.list({prefix, limit:1});
    return result.objects.length > 0 || (result.delimitedPrefixes || []).length > 0;
  }
  if (await bucket.head(key)) return true;
  const result = await bucket.list({prefix:key+'/', limit:1});
  return result.objects.length > 0;
}
export async function parentsFree(bucket, key) {
  const parts=key.replace(/\/$/,'').split('/');
  for(let i=1;i<parts.length;i++) check(!(await bucket.head(parts.slice(0,i).join('/'))), 'Un fichier occupe un dossier parent : '+parts.slice(0,i).join('/'),409);
}
export async function destinationFree(bucket, key) {
  check(!(await bucket.head(key)), 'La destination existe déjà ; aucun fichier n’a été remplacé : ' + key, 409);
  const children=await bucket.list({prefix:key.replace(/\/$/,'')+'/',limit:1});
  check(children.objects.length===0,'Un dossier porte déjà ce nom : '+key,409);
  await parentsFree(bucket,key);
}
export function metadata(obj) {
  return {httpMetadata:{...obj.httpMetadata},customMetadata:{...obj.customMetadata}};
}
export function uploadId(value) {
  check(typeof value === 'string' && value.length > 0 && value.length <= 2048 && !/[\r\n\u0000]/.test(value), 'Identifiant de transfert invalide.');
  return value;
}
export function partNumber(value) {
  const n = Number(value);
  check(Number.isInteger(n) && n >= 1 && n <= MAX_PARTS, 'Numéro de morceau invalide.');
  return n;
}
export function fileSize(value) {
  const size = Number(value);
  check(Number.isSafeInteger(size) && size >= 0 && size <= PART_SIZE * MAX_PARTS, 'Taille de fichier non prise en charge.');
  return size;
}
export function uploadedParts(value, size) {
  check(Array.isArray(value) && value.length > 0 && value.length <= MAX_PARTS, 'Liste des morceaux invalide.');
  const parts = value.map((p,i) => {
    check(p && p.partNumber === i+1 && typeof p.etag === 'string' && p.etag.length <= 256 && p.etag.length > 0, 'Morceaux incomplets ou dans le désordre.');
    return {partNumber:p.partNumber, etag:p.etag};
  });
  if (size != null) check(parts.length === Math.ceil(size/PART_SIZE), 'Le transfert est incomplet.');
  return parts;
}
function disposition(key, attachment) {
  const name = key.split('/').pop() || 'fichier';
  const fallback = name.replace(/[^a-zA-Z0-9._ -]/g,'_').replace(/["\\]/g,'_');
  return `${attachment?'attachment':'inline'}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase())}`;
}
function rangeOf(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1]&&!match[2]) || size === 0) return false;
  let start, end;
  if (!match[1]) { const tail=Number(match[2]); if(!Number.isSafeInteger(tail)||tail<1)return false; start=Math.max(0,size-tail); end=size-1; }
  else { start=Number(match[1]); end=match[2]?Number(match[2]):size-1; }
  if (!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start)return false;
  end=Math.min(end,size-1);
  return {offset:start,length:end-start+1};
}
export async function preview(request, bucket, key, attachment) {
  const obj = await mustExist(bucket,key);
  const range = rangeOf(request.headers.get('range'),obj.size);
  if (range === false) return new Response(null,{status:416,headers:{'Content-Range':`bytes */${obj.size}`,'Cache-Control':'private, no-store'}});
  const type = contentType(key,obj.httpMetadata?.contentType);
  const inline = /^(image\/|video\/|audio\/|text\/plain$|application\/pdf$)/.test(type);
  const headers = new Headers({
    'Content-Type':type,'Content-Length':String(range?range.length:obj.size),'Accept-Ranges':'bytes',
    'Content-Disposition':disposition(key,attachment||!inline), 'ETag':obj.httpEtag || '"'+obj.etag+'"',
    'Cache-Control':'private, no-store', 'Vary':'Cookie', 'X-Content-Type-Options':'nosniff',
    'Cross-Origin-Resource-Policy':'same-origin', 'Referrer-Policy':'no-referrer',
    'Content-Security-Policy':"default-src 'none'; sandbox; frame-ancestors 'self'"
  });
  if(range) headers.set('Content-Range',`bytes ${range.offset}-${range.offset+range.length-1}/${obj.size}`);
  if(request.method==='HEAD') return new Response(null,{status:range?206:200,headers});
  const result = await bucket.get(key,{...(range?{range}:{}),onlyIf:{etagMatches:obj.etag}});
  check(result && result.body,'Le fichier a changé pendant son ouverture. Actualisez.',409);
  return new Response(result.body,{status:range?206:200,headers});
}
