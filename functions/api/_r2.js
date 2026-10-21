import { requireUser, json } from './_auth.js';
const enc = new TextEncoder();
export const bucket = env => env.MEDIA_R2;
export function validKey(key) { return typeof key === 'string' && key.length > 0 && key.length <= 800 && !key.startsWith('/') && !key.includes('\\') && !key.split('/').some(s => !s || s === '.' || s === '..') && !/[\u0000-\u001f]/.test(key); }
export function category(key) { return /\.(?:png|jpg|jpeg|webp|gif|avif|svg)$/i.test(key)?'image':/\.(?:mp4|webm|mov)$/i.test(key)?'video':/\.(?:zip|rar|7z)$/i.test(key)?'archive':'document'; }
function hex(bytes) { return Array.from(new Uint8Array(bytes)).map(x=>x.toString(16).padStart(2,'0')).join(''); }
async function mac(secret, msg) { const k=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',k,enc.encode(msg))); }
export async function sign(env,key,ttl=900) {const exp=Math.floor(Date.now()/1000)+ttl;return {exp,sig:await mac(env.MEDIA_SIGNING_SECRET,`${key}\n${exp}`)};}
export async function verify(env,key,exp,sig) {if(!env.MEDIA_SIGNING_SECRET || !/^\d{10,11}$/.test(exp||'') || +exp < Date.now()/1000 || +exp>Date.now()/1000+86400 || !/^[a-f0-9]{64}$/.test(sig||''))return false;const expected=await mac(env.MEDIA_SIGNING_SECRET,`${key}\n${exp}`);let diff=0;for(let i=0;i<64;i++)diff|=expected.charCodeAt(i)^sig.charCodeAt(i);return diff===0;}
export async function admin(context) {const {env,request}=context;if(!env.MEDIA_R2)return {response:json({error:'Binding MEDIA_R2 manquant.'},503)};if(!env.DB)return {response:json({error:'Binding DB manquant.'},503)};const auth=await requireUser(env.DB,env,request);if(!auth.ok)return {response:auth.response};if(auth.user.role!=='admin')return {response:json({error:'Administrateur requis.'},403)};if(!['GET','HEAD'].includes(request.method)){const origin=request.headers.get('origin');if(origin!==new URL(request.url).origin)return {response:json({error:'Origine refusée.'},403)};}return {user:auth.user};}
export function fail(error,status=400){return json({ok:false,error},status)}
