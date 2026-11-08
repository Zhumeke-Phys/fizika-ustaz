import {env} from 'cloudflare:workers';
import {digest,equal,passwordHash,randomToken,newSession,readToken,sessionCookie,getWebsiteUser} from '../../site-auth';
const reply=(v:any,status=200,cookie?:string)=>Response.json(v,{status,headers:{'Cache-Control':'no-store',...(cookie?{'Set-Cookie':cookie}:{})}});
const usernameOf=(v:any)=>typeof v==='string'?v.trim().toLowerCase():'';
const validPassword=(v:any)=>typeof v==='string'&&v.length>=12&&v.length<=128;
export async function GET(req:Request){try{const me=await getWebsiteUser(req);return reply({authenticated:!!me,me})}catch{return reply({error:'Қызмет уақытша қолжетімсіз'},503)}}
export async function POST(req:Request){try{
 if(req.headers.get('origin')!==new URL(req.url).origin)return reply({error:'Рұқсат етілмеген сұрау'},403);
 if(Number(req.headers.get('content-length')||0)>20000)return reply({error:'Сұрау тым үлкен'},413);
 const raw=await req.text();if(raw.length>20000)return reply({error:'Сұрау тым үлкен'},413);
 let b:any;try{b=JSON.parse(raw)}catch{return reply({error:'Сұрау дұрыс емес'},400)}
 const db=env.DB!;const now=Date.now();
 if(b.action==='logout'){const token=await readToken(req);if(token)await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest(token)).run();return reply({ok:true},200,sessionCookie('',true))}
 if(!['login','register','setup','recover'].includes(b.action))return reply({error:'Белгісіз әрекет'},400);
 if(!env.AUTH_PEPPER)return reply({error:'Кіру қызметі әлі бапталмаған'},503);
 const username=usernameOf(b.username);
 if(!/^[a-z0-9][a-z0-9@._-]{2,79}$/.test(username))return reply({error:'Логин: 3–80 таңба, латын әрпі, сан, @ . _ -'},400);
 if(typeof b.password!=='string'||b.password.length>128)return reply({error:'Логин немесе пароль қате'},400);
 // Persisted per-IP and per-IP+account windows. Atomically increment before expensive hashing.
 const ip=req.headers.get('cf-connecting-ip')||'local';
 for(const [name,limit] of [[ip,80],[ip+'|'+username,12]] as const){const key=await digest('auth|'+name);await db.prepare('INSERT INTO auth_attempts(key,attempts,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN expires<? THEN 1 ELSE attempts+1 END,expires=CASE WHEN expires<? THEN ? ELSE expires END').bind(key,now+900000,now,now,now+900000).run();const row:any=await db.prepare('SELECT attempts FROM auth_attempts WHERE key=?').bind(key).first();if(row.attempts>limit)return reply({error:'Әрекет тым көп. 15 минуттан кейін қайталаңыз.'},429)}
 if(b.action==='login'){
 const account:any=await db.prepare('SELECT * FROM accounts WHERE username=?').bind(username).first();
 const h=await passwordHash(b.password,account?.salt||'unregistered-account-salt');
 if(!account||!equal(h,account.password_hash))return reply({error:'Логин немесе пароль қате'},401);
 const token=await newSession(account.id);return reply({ok:true},200,sessionCookie(token));
 }
 if(!validPassword(b.password))return reply({error:'Пароль ұзындығы 12–128 таңба болуы керек'},400);
 if(b.action==='recover'){
 const account:any=await db.prepare('SELECT * FROM accounts WHERE username=?').bind(username).first();
 const recovery=typeof b.recovery==='string'?b.recovery.trim():'';
 if(!account||!equal(await digest(recovery),account.recovery_hash))return reply({error:'Логин немесе қалпына келтіру коды қате'},401);
 const salt=randomToken(),nextRecovery=randomToken();
 await db.batch([db.prepare('UPDATE accounts SET password_hash=?,salt=?,recovery_hash=? WHERE id=? AND recovery_hash=?').bind(await passwordHash(b.password,salt),salt,await digest(nextRecovery),account.id,account.recovery_hash),db.prepare('DELETE FROM sessions WHERE user_id=?').bind(account.id)]);
 return reply({ok:true,recoveryCode:nextRecovery},200,sessionCookie('',true));
 }
 if(typeof b.name!=='string'||!b.name.trim()||b.name.length>100||typeof b.school!=='string'||!b.school.trim()||b.school.length>200||typeof b.iin!=='string'||!/^\d{12}$/.test(b.iin)||b.teacher!==true)return reply({error:'Аты-жөні, мектеп, 12 таңбалы ЖСН және пәнді растау қажет'},400);
 const existing=await db.prepare('SELECT id FROM accounts WHERE username=?').bind(username).first();if(existing)return reply({error:'Бұл логин бос емес'},409);
 const setup=b.action==='setup';const cfg:any=await db.prepare('SELECT owner FROM config WHERE id=1').first();
 let inv:any=null;
 if(setup){
 if(!env.ADMIN_SETUP_CODE||typeof b.code!=='string'||!equal(await digest(b.code.trim()),await digest(env.ADMIN_SETUP_CODE)))return reply({error:'Әкімшіні баптау коды жарамсыз'},403);
 if(await db.prepare('SELECT id FROM admin_claim WHERE id=1').first())return reply({error:'Әкімші аккаунты бұрын бапталған'},409);
 }else{inv=await db.prepare('SELECT code FROM invites WHERE code=? AND used_by IS NULL').bind(typeof b.code==='string'?b.code.trim():'').first();if(!inv)return reply({error:'Ішкі код жарамсыз немесе қолданылған'},403)}
 const id=setup&&cfg?.owner?cfg.owner:crypto.randomUUID();const salt=randomToken(),recovery=randomToken(),token=randomToken();
 const password=await passwordHash(b.password,salt);
 const queries:any[]=[];
 if(setup){queries.push(db.prepare('INSERT INTO admin_claim(id,user_id) VALUES(1,?)').bind(id));}
 // Invite code is UNIQUE in accounts; concurrent claims roll the whole batch back.
 queries.push(db.prepare('INSERT INTO accounts(id,username,password_hash,salt,recovery_hash,created,invite_code) VALUES(?,?,?,?,?,?,?)').bind(id,username,password,salt,await digest(recovery),now,setup?null:inv.code));
 queries.push(db.prepare('INSERT INTO profiles(id,name,school,iin_hash,role,created) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,school=excluded.school,iin_hash=excluded.iin_hash').bind(id,b.name.trim(),b.school.trim(),await digest(b.iin),setup?'owner':'teacher',now));
 if(setup)queries.push(db.prepare('INSERT INTO config(id,owner) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner').bind(id));
 else queries.push(db.prepare('UPDATE invites SET used_by=? WHERE code=? AND used_by IS NULL').bind(id,inv.code));
 queries.push(db.prepare('INSERT INTO sessions(token_hash,user_id,expires) VALUES(?,?,?)').bind(await digest(token),id,now+604800000));
 try{await db.batch(queries)}catch{return reply({error:'Логин немесе код қолданылған. Қайта тексеріңіз.'},409)}
 return reply({ok:true,recoveryCode:recovery},200,sessionCookie(token));
 }catch{return reply({error:'Кіру қызметінде қате. Қайта көріңіз.'},503)}}
