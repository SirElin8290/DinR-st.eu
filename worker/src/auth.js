import {randomToken,hash,keyedHash,encrypt,decrypt,constantTimeEqual} from './auth-crypto.js';
import {parsePersonalNumber,todayInStockholm} from './personal-number.js';
import {MUNICIPALITIES} from './geography.js';

const FLOW_COOKIE='__Host-dr_flow',SESSION_COOKIE='__Host-dr_session';
const FLOW_TTL=20*60,SESSION_TTL=12*60*60;
const cookie=(req,key)=>(req.headers.get('cookie')||'').split(';').map(c=>c.trim()).find(c=>c.startsWith(key+'='))?.slice(key.length+1)||'';
const setCookie=(name,value,seconds)=>`${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`;
const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer',...headers}});
const generic={ok:true,message:'Om uppgifterna kan användas får du ett mejl med nästa steg. Kontrollera även skräpposten. Har du redan ett konto kan du välja Logga in.'};
const genericResponse=()=>json(generic,202,{'set-cookie':setCookie(FLOW_COOKIE,randomToken(),FLOW_TTL)});
const htmlEscape=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function authReadiness(env){
 const keys=['DATA_ENCRYPTION_KEY','EMAIL_HMAC_KEY','SUBJECT_HMAC_KEY','CSRF_HMAC_KEY','RATE_HMAC_KEY'].every(k=>/^[a-f0-9]{64}$/.test(env[k]||''));
 const mailReady=env.MAIL_PROVIDER==='resend'&&Boolean(env.RESEND_API_KEY&&env.MAIL_FROM);
 const privacyReady=env.PRIVACY_REVIEWED==='true'&&/^account-v\d+$/.test(env.PRIVACY_VERSION||'');
 return {enabled:env.AUTH_ENABLED==='true'&&privacyReady&&keys&&mailReady,mail_ready:mailReady,privacy_ready:privacyReady,privacy_version:env.PRIVACY_VERSION||'account-v1-draft'};
}
export function createAuthService({now=()=>Math.floor(Date.now()/1000),deliver}={}){
 const stmt=(env,sql,...values)=>env.AUTH_DB.prepare(sql).bind(...values);
 async function limit(env,label,value,maximum,seconds=900){
  const at=now(),key=await keyedHash(env.RATE_HMAC_KEY,label+':'+value),bucket=Math.floor(at/seconds);
  const row=await stmt(env,'INSERT INTO auth_rate_limits(key_hash,bucket,attempts,expires_at) VALUES(?,?,1,?) ON CONFLICT(key_hash,bucket) DO UPDATE SET attempts=attempts+1 RETURNING attempts',key,bucket,at+seconds*2).first();
  return row.attempts<=maximum;
 }
 async function csrf(req,env){const raw=cookie(req,SESSION_COOKIE);return raw?keyedHash(env.CSRF_HMAC_KEY,'csrf:'+raw):'';}
 async function validCSRF(req,env){const expected=await csrf(req,env);return expected.length===64&&constantTimeEqual(req.headers.get('x-csrf-token')||'',expected);}
 async function getSession(req,env){
  if(env.AUTH_ENABLED!=='true')return null;
  const raw=cookie(req,SESSION_COOKIE);if(!/^[a-f0-9]{64}$/.test(raw))return null;
  const row=await stmt(env,"SELECT a.*,s.token_hash session_hash FROM auth_sessions s JOIN auth_accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.expires_at>? AND s.security_version=a.security_version AND a.status='active'",await hash(raw),now()).first();
  if(!row)return null;
  const profile=await decrypt(env.DATA_ENCRYPTION_KEY,'account:'+row.id,row.profile_ciphertext);
  const birth=profile.birth_date,asOf=todayInStockholm(new Date(now()*1000));
  const age=Number(asOf.slice(0,4))-Number(birth.slice(0,4))-(asOf.slice(5)<birth.slice(5)?1:0);
  if(age<16)return null;
  return {user_id:row.id,profile,age,age_band:age<18?'16-17':age<30?'18-29':age<50?'30-49':age<65?'50-64':'65+',verification:'email_verified',session_hash:row.session_hash};
 }
 async function sendMail(env,id,payload){
  if(deliver){if(env.ENVIRONMENT!=='test')throw Error('Test transport forbidden');return deliver(payload,id);}
  const response=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(10000),headers:{authorization:'Bearer '+env.RESEND_API_KEY,'content-type':'application/json','Idempotency-Key':'dinrost/'+id},body:JSON.stringify({from:env.MAIL_FROM,to:[payload.to],subject:payload.subject,html:payload.html,text:payload.text})});
  if(!response.ok)throw Error('Mail provider unavailable');
 }
 async function dispatch(env){
  if(!authReadiness(env).enabled)return;
  for(let i=0;i<5;i++){
   const at=now();
   const row=await stmt(env,"UPDATE auth_outbox SET status='sending',lease_until=?,attempts=attempts+1 WHERE id=(SELECT o.id FROM auth_outbox o JOIN auth_flows f ON f.token_hash=o.flow_hash WHERE (o.status='pending' OR (o.status='sending' AND o.lease_until<?)) AND o.available_at<=? AND o.expires_at>? AND o.attempts<3 AND f.revoked_at IS NULL AND f.consumed_at IS NULL ORDER BY o.created_at LIMIT 1) RETURNING *",at+60,at,at,at).first();
   if(!row)return;
   try{
    const payload=await decrypt(env.DATA_ENCRYPTION_KEY,'outbox:'+row.id,row.payload_ciphertext);
    await sendMail(env,row.id,payload);
    await stmt(env,"UPDATE auth_outbox SET status='sent',payload_ciphertext=NULL,sent_at=?,lease_until=NULL WHERE id=?",now(),row.id).run();
   }catch{
    const final=row.attempts>=3||row.expires_at<=now()+60;
    await stmt(env,"UPDATE auth_outbox SET status=?,payload_ciphertext=CASE WHEN ? THEN NULL ELSE payload_ciphertext END,available_at=?,lease_until=NULL WHERE id=?",final?'failed':'pending',final?1:0,now()+60*row.attempts,row.id).run();
   }
  }
 }
 async function issue(env,{purpose,email,emailHash,subjectHash=null,accountId,profile,privacyVersion},req,ctx){
  const token=randomToken(),tokenHash=await hash(token),browser=randomToken(),browserHash=await hash(browser),at=now(),outboxId=crypto.randomUUID();
  const link=new URL('/complete.html',env.APP_ORIGIN);link.hash='token='+token;
  const isRegistration=purpose==='register',subject=isRegistration?'Bekräfta din e-post för DinRöst':'Din inloggningslänk till DinRöst';
  const text=(isRegistration?'Bekräfta din e-post och skapa ditt konto.':'Logga in på DinRöst.')+'\n\n'+link.href+'\n\nLänken gäller i 20 minuter, en gång och i samma webbläsare där du begärde den. Om du inte begärde länken kan du ignorera mejlet.';
  const payload={to:email,subject,text,html:`<h1>${htmlEscape(subject)}</h1><p>${isRegistration?'Bekräfta din e-post och skapa ditt konto.':'Logga in på DinRöst.'}</p><p><a href="${htmlEscape(link.href)}">${isRegistration?'Bekräfta e-post och fortsätt':'Logga in'}</a></p><p>Länken gäller i 20 minuter och kan användas en gång, i samma webbläsare där du begärde den. Om du inte begärde länken kan du ignorera mejlet.</p>`};
  await env.AUTH_DB.batch([
   stmt(env,'UPDATE auth_flows SET revoked_at=?,profile_ciphertext=NULL WHERE email_hash=? AND purpose=? AND consumed_at IS NULL',at,emailHash,purpose),
   stmt(env,"UPDATE auth_outbox SET status='failed',payload_ciphertext=NULL WHERE flow_hash IN (SELECT token_hash FROM auth_flows WHERE email_hash=? AND purpose=? AND revoked_at IS NOT NULL) AND status!='sent'",emailHash,purpose),
   stmt(env,'INSERT INTO auth_flows(token_hash,purpose,target_account_id,email_hash,subject_hash,profile_ciphertext,privacy_version,browser_hash,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)',tokenHash,purpose,accountId,emailHash,subjectHash,profile?await encrypt(env.DATA_ENCRYPTION_KEY,'account:'+accountId,profile):null,privacyVersion||null,browserHash,at,at+FLOW_TTL),
   stmt(env,"INSERT INTO auth_outbox(id,flow_hash,payload_ciphertext,status,available_at,expires_at,created_at) VALUES(?,?,?,'pending',?,?,?)",outboxId,tokenHash,await encrypt(env.DATA_ENCRYPTION_KEY,'outbox:'+outboxId,payload),at,at+FLOW_TTL,at)
  ]);
  const work=dispatch(env);if(ctx?.waitUntil)ctx.waitUntil(work);else await work;
  return json(generic,202,{'set-cookie':setCookie(FLOW_COOKIE,browser,FLOW_TTL)});
 }
 async function complete(req,env,data){
  if(typeof data.token!=='string'||!/^[a-f0-9]{64}$/.test(data.token))return json({error:'Länken är ogiltig eller har gått ut.'},400);
  const tokenHash=await hash(data.token),at=now(),flow=await stmt(env,'SELECT * FROM auth_flows WHERE token_hash=?',tokenHash).first();
  if(!flow||flow.consumed_at!==null||flow.revoked_at!==null||flow.expires_at<=at)return json({error:'Länken är ogiltig, redan använd eller har gått ut. Begär en ny länk.'},400);
  const browser=cookie(req,FLOW_COOKIE);
  if(!browser||!constantTimeEqual(await hash(browser),flow.browser_hash))return json({error:'Öppna länken i samma webbläsare där du begärde den. Du kan också begära en ny länk.'},403);
  const claim=crypto.randomUUID(),sessionToken=randomToken(),sessionHash=await hash(sessionToken);
  const claimed='EXISTS(SELECT 1 FROM auth_flows WHERE token_hash=? AND consumed_by=?)';
  const statements=[stmt(env,'UPDATE auth_flows SET consumed_at=?,consumed_by=? WHERE token_hash=? AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at>? AND browser_hash=?',at,claim,tokenHash,at,flow.browser_hash)];
  if(flow.purpose==='register'){
   statements.push(stmt(env,`INSERT OR IGNORE INTO auth_accounts(id,email_hash,subject_hash,profile_ciphertext,status,email_verified_at,privacy_version,created_at,last_login_at) SELECT ?,?,?,?,'active',?,?,?,? WHERE ${claimed}`,flow.target_account_id,flow.email_hash,flow.subject_hash,flow.profile_ciphertext,at,flow.privacy_version,at,at,tokenHash,claim));
  }
  statements.push(
   stmt(env,`INSERT INTO auth_sessions(token_hash,account_id,security_version,created_at,expires_at) SELECT ?,id,security_version,?,? FROM auth_accounts WHERE id=? AND status='active' AND ${claimed}`,sessionHash,at,at+SESSION_TTL,flow.target_account_id,tokenHash,claim),
   stmt(env,`UPDATE auth_accounts SET last_login_at=? WHERE id=? AND ${claimed}`,at,flow.target_account_id,tokenHash,claim),
   stmt(env,`UPDATE auth_flows SET profile_ciphertext=NULL WHERE token_hash=? AND consumed_by=?`,tokenHash,claim),
   stmt(env,"UPDATE auth_outbox SET payload_ciphertext=NULL,status='sent' WHERE flow_hash=? AND EXISTS(SELECT 1 FROM auth_flows WHERE token_hash=? AND consumed_by=?)",tokenHash,tokenHash,claim),
   stmt(env,`INSERT INTO auth_events(id,account_id,event,created_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM auth_sessions WHERE token_hash=?)`,crypto.randomUUID(),flow.target_account_id,flow.purpose==='register'?'registered':'login',at,sessionHash)
  );
  await env.AUTH_DB.batch(statements);
  const created=await stmt(env,'SELECT account_id FROM auth_sessions WHERE token_hash=?',sessionHash).first();
  if(!created)return json({error:'Länken kunde inte användas. Begär en ny inloggningslänk.'},409);
  const previous=cookie(req,SESSION_COOKIE);if(previous)await stmt(env,'DELETE FROM auth_sessions WHERE token_hash=? AND account_id=?',await hash(previous),created.account_id).run();
  const response=json({ok:true,next:'/dashboard.html'},200,{'set-cookie':setCookie(SESSION_COOKIE,sessionToken,SESSION_TTL)});
  response.headers.append('set-cookie',setCookie(FLOW_COOKIE,'',0));return response;
 }
 async function handle(req,env,ctx){
  const url=new URL(req.url),path=url.pathname;
  if(path==='/api/auth/status'&&req.method==='GET')return json({...authReadiness(env),registration_enabled:env.REGISTRATION_ENABLED==='true',research_enabled:env.RESEARCH_COLLECTION_ENABLED==='true'});
  if(path==='/api/auth/me'&&req.method==='GET'){
   const s=await getSession(req,env);if(!s)return json({error:'Du behöver logga in.'},401);
   return json({user:{first_name:s.profile.first_name,last_name:s.profile.last_name,email:s.profile.email,age:s.age,legal_gender:s.profile.legal_gender,municipality_code:s.profile.municipality_code,municipality_name:MUNICIPALITIES[s.profile.municipality_code]?.name,verification:'email_verified',identity_verified:false},csrf_token:await csrf(req,env)});
  }
  if(req.method!=='POST')return json({error:'Not found'},404);
  if(req.headers.get('origin')!==new URL(env.APP_ORIGIN).origin||!req.headers.get('content-type')?.startsWith('application/json'))return json({error:'Otillåten begäran.'},403);
  if(path==='/api/auth/logout'||path==='/api/auth/logout-all'){
   const raw=cookie(req,SESSION_COOKIE);if(!raw)return json({ok:true},200,{'set-cookie':setCookie(SESSION_COOKIE,'',0)});
   if(!await validCSRF(req,env))return json({error:'Ladda om sidan och försök igen.'},403);
   const s=await getSession(req,env);
   if(s&&path.endsWith('logout-all'))await env.AUTH_DB.batch([
    stmt(env,'UPDATE auth_accounts SET security_version=security_version+1 WHERE id=?',s.user_id),
    stmt(env,'UPDATE auth_flows SET revoked_at=?,profile_ciphertext=NULL WHERE target_account_id=? AND consumed_at IS NULL',now(),s.user_id),
    stmt(env,"UPDATE auth_outbox SET status='failed',payload_ciphertext=NULL WHERE flow_hash IN (SELECT token_hash FROM auth_flows WHERE target_account_id=?) AND status!='sent'",s.user_id),
    stmt(env,'DELETE FROM auth_sessions WHERE account_id=?',s.user_id),
    stmt(env,"INSERT INTO auth_events VALUES(?,?,'logout_all',?)",crypto.randomUUID(),s.user_id,now())
   ]);
   else await stmt(env,'DELETE FROM auth_sessions WHERE token_hash=?',await hash(raw)).run();
   return json({ok:true},200,{'set-cookie':setCookie(SESSION_COOKIE,'',0)});
  }
  if(!authReadiness(env).enabled)return json({error:'Registrering och inloggning är inte öppna ännu.'},503);
  const ip=req.headers.get('cf-connecting-ip');if(!ip&&env.ENVIRONMENT!=='test')return json({error:'Tjänsten är tillfälligt otillgänglig.'},503);
  if(!await limit(env,'ip',ip||'test',30))return json({error:'För många försök. Vänta en stund och försök igen.'},429,{'retry-after':'900'});
  let data;try{
   if(Number(req.headers.get('content-length'))>8192)return json({error:'För stor begäran.'},413);
   const reader=req.body?.getReader();if(!reader)throw Error();let size=0,parts=[];
   while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8192){await reader.cancel();return json({error:'För stor begäran.'},413);}parts.push(value);}
   const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}data=JSON.parse(new TextDecoder().decode(bytes));
   if(!data||typeof data!=='object'||Array.isArray(data))throw Error();
  }catch{return json({error:'Ogiltiga uppgifter.'},400);}
  if(path==='/api/auth/complete')return complete(req,env,data);
  if(!['/api/auth/register','/api/auth/request-link'].includes(path))return json({error:'Not found'},404);
  const email=typeof data.email==='string'?data.email.trim().toLowerCase():'';
  if(email.length>254||!/^([^\s@]+)@([^\s@]+)\.[^\s@]+$/.test(email)||/[\x00-\x1f\x7f]/.test(email))return json({error:'Ange en giltig e-postadress.'},400);
  const emailHash=await keyedHash(env.EMAIL_HMAC_KEY,email);
  if(!await limit(env,'email',emailHash,5))return genericResponse();
  if(path==='/api/auth/request-link'){
   const account=await stmt(env,"SELECT id,profile_ciphertext FROM auth_accounts WHERE email_hash=? AND status='active'",emailHash).first();
   if(!account)return genericResponse();
   return issue(env,{purpose:'login',email,emailHash,accountId:account.id},req,ctx);
  }
  if(env.REGISTRATION_ENABLED!=='true')return json({error:'Nyregistreringen är inte öppen.'},503);
  const first=typeof data.first_name==='string'?data.first_name.trim().normalize('NFC'):'',last=typeof data.last_name==='string'?data.last_name.trim().normalize('NFC'):'';
  if(!first||!last||first.length>80||last.length>100||/[\x00-\x1f\x7f]/.test(first+last))return json({error:'Kontrollera för- och efternamn.'},400);
  const parsed=parsePersonalNumber(data.personal_number,todayInStockholm(new Date(now()*1000)));
  if(!parsed.valid||!parsed.eligible)return json({error:'Ange ett giltigt personnummer. Du behöver vara minst 16 år.'},400);
  if(!MUNICIPALITIES[data.municipality_code])return json({error:'Välj en giltig hemkommun.'},400);
  if(data.accepted_privacy!==true||data.privacy_version!==env.PRIVACY_VERSION)return json({error:'Läs den aktuella informationen om kontouppgifter.'},400);
  const number=data.personal_number.trim().replace(/[- ]/g,''),subjectHash=await keyedHash(env.SUBJECT_HMAC_KEY,number);
  const exists=await stmt(env,'SELECT 1 found FROM auth_accounts WHERE email_hash=? OR subject_hash=?',emailHash,subjectHash).first();if(exists)return genericResponse();
  const profile={first_name:first,last_name:last,email,birth_date:number.slice(0,4)+'-'+number.slice(4,6)+'-'+number.slice(6,8),legal_gender:parsed.legalGender,municipality_code:data.municipality_code,geography_source:'self_reported'};
  return issue(env,{purpose:'register',email,emailHash,subjectHash,accountId:crypto.randomUUID(),profile,privacyVersion:env.PRIVACY_VERSION},req,ctx);
 }
 async function maintain(env){
  const at=now();
  await env.AUTH_DB.batch([
   stmt(env,'DELETE FROM auth_sessions WHERE expires_at<=?',at),
   stmt(env,'UPDATE auth_flows SET profile_ciphertext=NULL WHERE expires_at<=? OR revoked_at IS NOT NULL OR consumed_at IS NOT NULL',at),
   stmt(env,"UPDATE auth_outbox SET payload_ciphertext=NULL,status='failed' WHERE expires_at<=? AND status!='sent'",at),
   stmt(env,'DELETE FROM auth_flows WHERE expires_at<?',at-86400),
   stmt(env,'DELETE FROM auth_rate_limits WHERE expires_at<=?',at),
   stmt(env,'DELETE FROM auth_events WHERE created_at<?',at-30*86400)
  ]);await dispatch(env);
 }
 return {handle,getSession,validCSRF,dispatch,maintain};
}
export const auth=createAuthService();
