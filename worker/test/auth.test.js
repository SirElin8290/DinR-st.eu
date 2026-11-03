import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createAuthService,authReadiness} from '../src/auth.js';
import {randomToken,encrypt,decrypt,keyedHash} from '../src/auth-crypto.js';
import {d1} from './helpers/d1.mjs';

const origin='https://accounts.example';
function setup({deliveryFailure=false}={}){
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../auth-migrations/0001_accounts.sql',import.meta.url),'utf8'));
 let at=Date.parse('2026-11-03T12:00:00Z')/1000,fail=deliveryFailure;
 const sent=[];
 const env={AUTH_DB:d1(db),APP_ORIGIN:origin,ENVIRONMENT:'test',AUTH_ENABLED:'true',REGISTRATION_ENABLED:'true',PRIVACY_REVIEWED:'true',PRIVACY_VERSION:'account-v1',MAIL_PROVIDER:'resend',MAIL_FROM:'DinRöst <sender@example.invalid>',RESEND_API_KEY:'test-only'};
 for(const k of ['DATA_ENCRYPTION_KEY','EMAIL_HMAC_KEY','SUBJECT_HMAC_KEY','CSRF_HMAC_KEY','RATE_HMAC_KEY'])env[k]=randomToken();
 const service=createAuthService({now:()=>at,deliver:async(payload,id)=>{if(fail)throw Error('Synthetic mail outage');sent.push({...payload,id});}});
 const request=(path,data,cookies='',extra={})=>new Request(origin+'/api/auth/'+path,{method:'POST',headers:{origin,'content-type':'application/json','cf-connecting-ip':'192.0.2.1',...(cookies?{cookie:cookies}:{}),...extra},body:JSON.stringify(data)});
 const post=(path,data,cookies='',extra={})=>service.handle(request(path,data,cookies,extra),env);
 const read=(path,cookies='')=>service.handle(new Request(origin+'/api/auth/'+path,{headers:{cookie:cookies}}),env);
 const registration={first_name:'OnlySyntheticFirstName',last_name:'OnlySyntheticLastName',email:'person@example.invalid',personal_number:'20000229-0013',municipality_code:'1780',accepted_privacy:true,privacy_version:'account-v1'};
 const cookie=(response,name)=>response.headers.getSetCookie().find(c=>c.startsWith(name+'='))?.split(';')[0];
 const link=()=>sent.at(-1).text.match(/#token=([a-f0-9]{64})/)[1];
 async function register(overrides={}){return post('register',{...registration,...overrides});}
 async function account(){const pending=await register();const response=await post('complete',{token:link()},cookie(pending,'__Host-dr_flow'));assert.equal(response.status,200);return cookie(response,'__Host-dr_session');}
 return {db,env,service,sent,request,post,read,registration,cookie,link,register,account,advance:seconds=>{at+=seconds;},setFailure:value=>{fail=value;}};
}
test('registration verifies email before creating an account, stores encrypted profile and hash-only tokens',async()=>{
 const t=setup(),pending=await t.register();assert.equal(pending.status,202);
 assert.equal(t.db.prepare('SELECT COUNT(*) n FROM auth_accounts').get().n,0);
 assert.equal(t.sent.length,1);const token=t.link();
 const tables=['auth_flows','auth_outbox','auth_rate_limits'];
 const dump=JSON.stringify(tables.map(table=>t.db.prepare('SELECT * FROM '+table).all()));
 for(const sensitive of [t.registration.personal_number,'20000229',t.registration.email,t.registration.first_name,token])assert.equal(dump.includes(sensitive),false);
 assert.equal((await pending.clone().json()).token,undefined);
 const result=await t.post('complete',{token},t.cookie(pending,'__Host-dr_flow'));assert.equal(result.status,200);
 const cookies=result.headers.getSetCookie();assert.ok(cookies.some(c=>c.startsWith('__Host-dr_session=')&&c.includes('HttpOnly; Secure; SameSite=Lax')));
 const session=t.cookie(result,'__Host-dr_session'),me=await t.read('me',session),data=await me.json();
 assert.equal(data.user.first_name,t.registration.first_name);assert.equal(data.user.age,26);assert.equal(data.user.verification,'email_verified');assert.equal(data.user.identity_verified,false);assert.equal(data.user.personal_number,undefined);
 assert.match(data.csrf_token,/^[a-f0-9]{64}$/);assert.equal(me.headers.get('cache-control'),'no-store');
 assert.equal((await t.post('complete',{token},t.cookie(pending,'__Host-dr_flow'))).status,400);
 assert.equal(t.db.prepare('SELECT profile_ciphertext FROM auth_flows').get().profile_ciphertext,null);t.db.close();
});
test('confirmation is browser-bound and GET requests never consume links',async()=>{
 const t=setup(),pending=await t.register(),token=t.link();
 const get=await t.service.handle(new Request(origin+'/api/auth/complete?token='+token),t.env);assert.equal(get.status,404);
 assert.equal(t.db.prepare('SELECT consumed_at FROM auth_flows').get().consumed_at,null);
 assert.equal((await t.post('complete',{token})).status,403);
 assert.equal((await t.post('complete',{token},'__Host-dr_flow='+randomToken())).status,403);
 assert.equal((await t.post('complete',{token},t.cookie(pending,'__Host-dr_flow'))).status,200);t.db.close();
});
test('concurrent confirmation consumes one token and issues exactly one session',async()=>{
 const t=setup(),pending=await t.register(),token=t.link(),cookie=t.cookie(pending,'__Host-dr_flow');
 const result=await Promise.all([t.post('complete',{token},cookie),t.post('complete',{token},cookie)]);
 assert.equal(result.filter(r=>r.status===200).length,1);
 assert.equal(t.db.prepare('SELECT COUNT(*) n FROM auth_sessions').get().n,1);
 assert.equal(t.db.prepare('SELECT COUNT(*) n FROM auth_accounts').get().n,1);t.db.close();
});
test('expired links fail and cleanup removes pending profile and mail data',async()=>{
 const t=setup({deliveryFailure:true}),pending=await t.register(),flow=t.db.prepare('SELECT token_hash FROM auth_flows').get();
 assert.equal(pending.status,202);assert.ok(flow.token_hash);t.advance(1201);await t.service.maintain(t.env);
 assert.equal(t.db.prepare('SELECT profile_ciphertext FROM auth_flows').get().profile_ciphertext,null);
 assert.equal(t.db.prepare('SELECT payload_ciphertext FROM auth_outbox').get().payload_ciphertext,null);
 assert.equal(t.db.prepare('SELECT COUNT(*) n FROM auth_accounts').get().n,0);t.db.close();
});
test('known and unknown accounts receive the same public response and cookie shape',async()=>{
 const t=setup();await t.account();
 const known=await t.post('request-link',{email:t.registration.email}),unknown=await t.post('request-link',{email:'absent@example.invalid'});
 assert.equal(known.status,202);assert.equal(unknown.status,202);assert.deepEqual(await known.clone().json(),await unknown.clone().json());
 assert.ok(t.cookie(known,'__Host-dr_flow'));assert.ok(t.cookie(unknown,'__Host-dr_flow'));
 const before=t.sent.length;assert.equal((await t.register()).status,202);assert.equal(t.sent.length,before);t.db.close();
});
test('pending emails do not reserve personal identifiers or create duplicate accounts',async()=>{
 const t=setup(),first=await t.register(),firstToken=t.link(),second=await t.register({email:'other@example.invalid'}),secondToken=t.link();
 assert.equal((await t.post('complete',{token:secondToken},t.cookie(second,'__Host-dr_flow'))).status,200);
 assert.equal((await t.post('complete',{token:firstToken},t.cookie(first,'__Host-dr_flow'))).status,409);
 assert.equal(t.db.prepare('SELECT COUNT(*) n FROM auth_accounts').get().n,1);assert.equal(t.db.prepare('SELECT COUNT(*) n FROM auth_sessions').get().n,1);t.db.close();
});
test('new link revokes old links; login works with no password and rotates sessions',async()=>{
 const t=setup(),oldSession=await t.account();
 const old=await t.post('request-link',{email:t.registration.email}),oldToken=t.link();
 const current=await t.post('request-link',{email:t.registration.email}),currentToken=t.link();
 assert.equal((await t.post('complete',{token:oldToken},t.cookie(old,'__Host-dr_flow'))).status,400);
 const login=await t.post('complete',{token:currentToken},t.cookie(current,'__Host-dr_flow')+'; '+oldSession);assert.equal(login.status,200);
 const newSession=t.cookie(login,'__Host-dr_session');assert.notEqual(newSession,oldSession);assert.equal((await t.read('me',oldSession)).status,401);assert.equal((await t.read('me',newSession)).status,200);t.db.close();
});
test('logout requires CSRF protection and logout-all revokes every device',async()=>{
 const t=setup(),one=await t.account(),pending=await t.post('request-link',{email:t.registration.email}),token=t.link();
 const two=t.cookie(await t.post('complete',{token},t.cookie(pending,'__Host-dr_flow')),'__Host-dr_session');
 const outstanding=await t.post('request-link',{email:t.registration.email}),outstandingToken=t.link();
 assert.equal((await t.post('logout',{},one)).status,403);
 const me=await (await t.read('me',one)).json();assert.equal((await t.post('logout-all',{},one,{'x-csrf-token':me.csrf_token})).status,200);
 assert.equal((await t.read('me',one)).status,401);assert.equal((await t.read('me',two)).status,401);
 assert.equal((await t.post('complete',{token:outstandingToken},t.cookie(outstanding,'__Host-dr_flow'))).status,400);t.db.close();
});
test('delivery failure is retried without duplicate sends or exposed links',async()=>{
 const t=setup({deliveryFailure:true}),response=await t.register();assert.equal(response.status,202);
 assert.equal(t.db.prepare('SELECT status FROM auth_outbox').get().status,'pending');
 t.setFailure(false);t.advance(61);await t.service.dispatch(t.env);await t.service.dispatch(t.env);
 assert.equal(t.sent.length,1);assert.equal(t.db.prepare('SELECT status FROM auth_outbox').get().status,'sent');assert.equal(t.db.prepare('SELECT payload_ciphertext FROM auth_outbox').get().payload_ciphertext,null);t.db.close();
});
test('readiness, origin, data validation and rate limits fail closed',async()=>{
 const t=setup();t.env.MAIL_PROVIDER='disabled';assert.equal(authReadiness(t.env).enabled,false);assert.equal((await t.register()).status,503);assert.equal(t.db.prepare('SELECT COUNT(*) n FROM auth_flows').get().n,0);t.env.MAIL_PROVIDER='resend';
 assert.equal((await t.post('register',t.registration,'',{origin:'https://evil.example'})).status,403);
 assert.equal((await t.register({personal_number:'20151103-1234',age:99})).status,400);
 assert.equal((await t.register({municipality_code:'9999'})).status,400);
 assert.equal((await t.register({accepted_privacy:false})).status,400);
 assert.equal((await t.register({privacy_version:'outdated'})).status,400);
 for(let i=0;i<26;i++)await t.post('request-link',{email:`absent${i}@example.invalid`});
 const limited=await t.post('request-link',{email:'absent@example.invalid'});assert.equal(limited.status,429);t.db.close();
});
test('encryption authenticates account purpose and uses a fresh IV',async()=>{
 const key=randomToken(),value={email:'private@example.invalid'};
 const a=await encrypt(key,'account:a',value),b=await encrypt(key,'account:a',value);assert.notEqual(a,b);assert.deepEqual(await decrypt(key,'account:a',a),value);
 await assert.rejects(()=>decrypt(key,'account:b',a));await assert.rejects(()=>decrypt(randomToken(),'account:a',a));
 assert.notEqual(await keyedHash(randomToken(),'subject'),await keyedHash(randomToken(),'subject'));
});
