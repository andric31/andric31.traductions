import { requireUser, json } from './_auth.js';
const enc = new TextEncoder();
export const bucket = env => env.MEDIA_BUCKET;
export function validKey(key) {
  return typeof key === 'string' && key.length > 0 && key.length <= 800 && enc.encode(key).length <= 1024
    && !key.startsWith('/') && !key.includes('\\') && !key.split('/').some(s => !s || s === '.' || s === '..')
    && !/[\u0000-\u001f\u007f]/.test(key);
}
export function category(key) {
  return /\.(png|jpe?g|webp|gif|avif|svg|bmp|ico)$/i.test(key) ? 'image'
    : /\.(mp4|webm|mov|m4v|ogv)$/i.test(key) ? 'video'
    : /\.(zip|rar|7z|tar|gz)$/i.test(key) ? 'archive'
    : /\.(mp3|ogg|wav|flac|m4a)$/i.test(key) ? 'audio' : 'document';
}
// Les refus d'accès ne dévoilent ni la configuration ni les règles internes.
export function silent(status = 403, extra = {}) {
  return new Response(null, { status, headers: {
    'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'private, no-store',
    'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer',
    'Cross-Origin-Resource-Policy':'same-origin', ...extra
  }});
}
function hex(bytes) { return Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join(''); }
async function mac(secret, msg) {
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('Secret de signature absent ou trop court.');
  const key = await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return hex(await crypto.subtle.sign('HMAC',key,enc.encode(msg)));
}
function equal(a,b) {
  if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;
  let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;
}
function validToken(exp,sig) {
  const now=Math.floor(Date.now()/1000);
  return /^\d{10,11}$/.test(String(exp||'')) && +exp > now && +exp <= now+86400 && /^[a-f0-9]{64}$/.test(sig||'');
}
function ttlValue(ttl) { return Math.min(86400,Math.max(60,Math.floor(Number(ttl)||900))); }
// Compatibilité des anciens liens /api/r2-file jusqu'à leur expiration.
export async function sign(env,key,ttl=900) {
  const exp=Math.floor(Date.now()/1000)+ttlValue(ttl);
  return {exp,sig:await mac(env.R2_SIGNING_SECRET,`${key}\n${exp}`)};
}
export async function verify(env,key,exp,sig) {
  if(!env.R2_SIGNING_SECRET||!validToken(exp,sig))return false;
  return equal(await mac(env.R2_SIGNING_SECRET,`${key}\n${exp}`),sig);
}
export function mediaPath(key) { return '/medias/'+key.split('/').map(encodeURIComponent).join('/'); }
export async function signedMedia(env,key,{ttl=900,access='site',download=false}={}) {
  if(!['site','share'].includes(access))throw new Error('Type de lien invalide.');
  const exp=Math.floor(Date.now()/1000)+ttlValue(ttl),dl=download?'1':'0';
  const sig=await mac(env.R2_SIGNING_SECRET,`r2-v2\n${key}\n${exp}\n${access}\n${dl}`);
  const params=new URLSearchParams({exp:String(exp),sig,access});
  if(download)params.set('dl','1');
  return {url:mediaPath(key)+'?'+params,expires:exp};
}
export async function verifyMedia(env,key,params) {
  const exp=params.get('exp'),sig=params.get('sig'),access=params.get('access'),dl=params.get('dl')||'0';
  if(!env.R2_SIGNING_SECRET||!validToken(exp,sig)||!['site','share'].includes(access)||!['0','1'].includes(dl))return false;
  if(['exp','sig','access','dl'].some(p=>params.getAll(p).length>1))return false;
  return equal(await mac(env.R2_SIGNING_SECRET,`r2-v2\n${key}\n${exp}\n${access}\n${dl}`),sig);
}
// Anti-hotlink uniquement : ce contrôle ne remplace pas une session pour des fichiers privés.
export function fromSite(request) {
  if(request.headers.get('sec-fetch-site')==='cross-site')return false;
  try { return new URL(request.headers.get('referer')||'').origin===new URL(request.url).origin; } catch { return false; }
}
export async function admin(context) {
  const {env,request}=context;
  if(!env.DB)return {response:silent(503)};
  let auth;
  try { auth=await requireUser(env.DB,env,request); } catch { return {response:silent(503)}; }
  if(!auth.ok)return {response:silent(401)};
  if(auth.user.role!=='admin')return {response:silent(403)};
  if(request.headers.get('sec-fetch-site')==='cross-site')return {response:silent(403)};
  if(!['GET','HEAD'].includes(request.method) && request.headers.get('origin')!==new URL(request.url).origin)return {response:silent(403)};
  if(!env.MEDIA_BUCKET)return {response:json({ok:false,error:'La liaison MEDIA_BUCKET est absente.'},503)};
  return {user:auth.user};
}
export function fail(error,status=400) { return json({ok:false,error},status); }
