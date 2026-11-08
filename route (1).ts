import { env } from 'cloudflare:workers';
import { getWebsiteUser } from '../../site-auth';
import { isOfficial } from '../../official';
import { richPlain,decodeRich } from '../../rich-format';
const json=(v:any,s=200)=>Response.json(v,{status:s,headers:{'Cache-Control':'no-store'}});
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const norm=(s:string)=>richPlain(s).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}+\-−*/^=<>]/gu,'');
function week(){let d=new Date();d.setUTCHours(0,0,0,0);d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.getTime();}
export async function GET(req:Request){try{
 const u=await getWebsiteUser(req);if(!u)return json({authenticated:false});const db=env.DB!;
 const me=await db.prepare('SELECT id,name,school,role FROM profiles WHERE id=?').bind(u.userId).first();
 const cfg=await db.prepare('SELECT owner FROM config WHERE id=1').first();
 if(!me)return json({authenticated:true,needsProfile:true,first:!cfg&&isOfficial(u),official:isOfficial(u),displayName:u.displayName});
 if((me as any).role==='owner'&&!isOfficial(u))return json({error:'Ресми әкімші аккаунты қажет'},403);
 const members=(await db.prepare('SELECT id,name,school,role FROM profiles ORDER BY created').all()).results;
 const count:any=await db.prepare("SELECT COUNT(*) n FROM problems WHERE author=? AND created>=? AND status!='rejected'").bind(u.userId,week()).first();
 const allowed=Number(count.n)>=5;
 const all=(await db.prepare("SELECT p.*, a.name authorName FROM problems p LEFT JOIN profiles a ON a.id=p.author WHERE p.author=? OR (? IN ('owner','reviewer') AND p.status='pending') OR (?=1 AND p.status='approved') ORDER BY p.created DESC LIMIT 500").bind(u.userId,(me as any).role,allowed?1:0).all()).results;
 const msgs=(await db.prepare('SELECT m.*,p.name senderName FROM messages m LEFT JOIN profiles p ON p.id=m.sender WHERE recipient IS NULL OR recipient=? OR sender=? ORDER BY created DESC LIMIT 100').bind(u.userId,u.userId).all()).results.reverse();
 const vs=(await db.prepare('SELECT v.* FROM votes v JOIN profiles p ON p.id=v.reviewer WHERE p.role=\'reviewer\'').all()).results;
 return json({authenticated:true,me,members,problems:all,messages:msgs,votes:vs,weekly:Number(count.n),allowed,invites:(me as any).role==='owner'?(await db.prepare('SELECT code,used_by FROM invites ORDER BY created DESC LIMIT 20').all()).results:[]});
 }catch(e){return json({error:'Базаға қосылу мүмкін болмады. Қайта көріңіз.'},503)}}
export async function POST(req:Request){try{
 const origin=req.headers.get('origin');if(origin!==new URL(req.url).origin)return json({error:'Сұрау рұқсат етілмеген'},403);
 const u=await getWebsiteUser(req);if(!u)return json({error:'Алдымен кіріңіз'},401);
 const b:any=await req.json();const db=env.DB!;const now=Date.now();const id=crypto.randomUUID();
 const me:any=await db.prepare('SELECT * FROM profiles WHERE id=?').bind(u.userId).first();
 if(!me)return json({error:'Профильді тіркеңіз'},403);
 if(me.role==='owner'&&!isOfficial(u))return json({error:'Ресми әкімші аккаунты қажет'},403);
 if(b.action==='invite'){if(me.role!=='owner'||!isOfficial(u))return json({error:'Құқық жоқ'},403);const code=crypto.randomUUID().replaceAll('-','').slice(0,16).toUpperCase();await db.prepare('INSERT INTO invites(code,created) VALUES(?,?)').bind(code,now).run();return json({ok:true,code});}
 if(b.action==='role'){if(me.role!=='owner'||!isOfficial(u)||b.member===me.id)return json({error:'Құқық жоқ'},403);if(b.role==='reviewer'){const n:any=await db.prepare("SELECT COUNT(*) n FROM profiles WHERE role='reviewer'").first();if(n.n>=5)return json({error:'Ең көбі 5 тексеруші. Алдымен біреуінің құқығын алыңыз.'},400);}
 await db.prepare('UPDATE profiles SET role=? WHERE id=? AND role!=\'owner\'').bind(b.role==='reviewer'?'reviewer':'teacher',b.member).run();return json({ok:true});}
 if(b.action==='submit'){
 if(typeof b.body!=='string'||richPlain(b.body).trim().length<15||b.body.length>40000||!Array.isArray(b.options)||b.options.length!==5||b.options.some((x:any)=>typeof x!=='string'||!richPlain(x).trim()||x.length>12000)||!['A','B','C','D','S'].includes(b.level)||!Number.isInteger(b.answer)||b.answer<0||b.answer>4||!Array.isArray(b.tags)||!b.tags.length||b.tags.some((x:any)=>typeof x!=='string'||x.length>100))return json({error:'Есепті, бес нұсқаны, деңгейді, тақырыптарды және жауапты толық толтырыңыз'},400);
 if([b.body,...b.options,String(b.solution||'')].some((v:string)=>(v.startsWith('MATHDOC1:')&&!decodeRich(v))||v.includes('\\placeholder')))return json({error:'Формуладағы бос ұяшықтарды толтырыңыз'},400);
 const fingerprint=await hash(norm(b.body));const dup:any=await db.prepare('SELECT id FROM problems WHERE fingerprint=? AND id!=?').bind(fingerprint,b.id||'').first();if(dup)return json({error:'Бұл есеп бар. Басқа есеп жазыңыз.'},409);
 if(b.id){const old:any=await db.prepare('SELECT * FROM problems WHERE id=? AND author=?').bind(b.id,u.userId).first();if(!old||old.status==='approved')return json({error:'Бұл есепті өзгертуге болмайды'},403);
 await db.batch([db.prepare('DELETE FROM votes WHERE problem=?').bind(b.id),db.prepare("UPDATE problems SET body=?,fingerprint=?,options=?,answer=?,solution=?,level=?,tags=?,status='pending' WHERE id=?").bind(b.body.trim(),fingerprint,JSON.stringify(b.options),b.answer,String(b.solution||'').slice(0,40000),b.level,JSON.stringify(b.tags.slice(0,12)),b.id)]);
 }else await db.prepare('INSERT INTO problems(id,author,body,fingerprint,options,answer,solution,level,tags,status,created) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id,u.userId,b.body.trim(),fingerprint,JSON.stringify(b.options),b.answer,String(b.solution||'').slice(0,40000),b.level,JSON.stringify(b.tags.slice(0,12)),'pending',now).run();return json({ok:true});}
 if(b.action==='vote'){
 if(me.role!=='reviewer')return json({error:'Тек тексеруші дауыс береді'},403);
 const p:any=await db.prepare("SELECT * FROM problems WHERE id=? AND status='pending'").bind(b.problem).first();if(!p)return json({error:'Есеп тексеруге ашық емес'},400);
 if(!b.approved&&!b.comment?.trim())return json({error:'Қатені түсіндіріңіз'},400);
 await db.prepare('INSERT OR REPLACE INTO votes(id,problem,reviewer,approved,comment) VALUES(?,?,?,?,?)').bind(b.problem+':'+me.id,b.problem,me.id,b.approved?1:0,String(b.comment||'').slice(0,2000)).run();
 if(!b.approved){await db.batch([db.prepare("UPDATE problems SET status='rejected' WHERE id=?").bind(p.id),db.prepare('INSERT INTO messages(id,sender,recipient,body,created) VALUES(?,?,?,?,?)').bind(id,me.id,p.author,'Түзету қажет • '+richPlain(p.body).slice(0,65)+'\n'+b.comment,now)]);}else{
 const n:any=await db.prepare("SELECT COUNT(DISTINCT v.reviewer) n FROM votes v JOIN profiles p ON p.id=v.reviewer WHERE v.problem=? AND v.approved=1 AND p.role='reviewer'").bind(p.id).first();if(n.n===5){await db.batch([db.prepare("UPDATE problems SET status='approved' WHERE id=?").bind(p.id),db.prepare('INSERT INTO messages(id,sender,recipient,body,created) VALUES(?,?,?,?,?)').bind(id,me.id,p.author,'Есебіңізді 5 тексеруші мақұлдады. Ортақ базаға қосылды: '+richPlain(p.body).slice(0,100),now)]);}}
 return json({ok:true});}
 if(b.action==='message'){if(!b.body?.trim()||b.body.length>3000)return json({error:'Хабарлама 1–3000 таңба болсын'},400);if(b.recipient){const exists=await db.prepare('SELECT id FROM profiles WHERE id=?').bind(b.recipient).first();if(!exists)return json({error:'Алушы табылмады'},404);}await db.prepare('INSERT INTO messages(id,sender,recipient,body,created) VALUES(?,?,?,?,?)').bind(id,me.id,b.recipient||null,b.body.trim(),now).run();return json({ok:true});}
 return json({error:'Белгісіз әрекет'},400);
 }catch(e){return json({error:'Әрекет орындалмады. Қайта көріңіз.'},500)}}
