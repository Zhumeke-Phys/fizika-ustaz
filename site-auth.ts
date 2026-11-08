import {env} from 'cloudflare:workers';
import {cookies} from 'next/headers';
export const COOKIE='__Host-fizika-session';
export const TTL=7*24*60*60*1000;
export const digest=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(v=>v.toString(16).padStart(2,'0')).join('');
export function randomToken(){return Array.from(crypto.getRandomValues(new Uint8Array(32))).map(v=>v.toString(16).padStart(2,'0')).join('')}
export function equal(a:string,b:string){if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0}
export async function passwordHash(password:string,salt:string){if(!env.AUTH_PEPPER)throw Error('AUTH_NOT_CONFIGURED');const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password+'\0'+env.AUTH_PEPPER),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode(salt),iterations:100000},key,256);return Array.from(new Uint8Array(bits)).map(v=>v.toString(16).padStart(2,'0')).join('')}
export function sessionCookie(token:string,remove=false){return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${remove?0:TTL/1000}`}
export async function readToken(req?:Request){if(req){return (req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||''}return (await cookies()).get(COOKIE)?.value||''}
export async function getWebsiteUser(req?:Request){const token=await readToken(req);if(!/^[a-f0-9]{64}$/.test(token))return null;const p:any=await env.DB!.prepare('SELECT a.id,a.username,p.name,p.role,c.user_id official_id FROM sessions s JOIN accounts a ON a.id=s.user_id JOIN profiles p ON p.id=a.id LEFT JOIN admin_claim c ON c.id=1 WHERE s.token_hash=? AND s.expires>?').bind(await digest(token),Date.now()).first();if(!p)return null;return {userId:p.id,displayName:p.name,username:p.username,role:p.role,official:p.role==='owner'&&p.official_id===p.id}}
export async function newSession(userId:string){const token=randomToken();await env.DB!.prepare('INSERT INTO sessions(token_hash,user_id,expires) VALUES(?,?,?)').bind(await digest(token),userId,Date.now()+TTL).run();return token}
