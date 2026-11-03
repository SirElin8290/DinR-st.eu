import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {researchAPI,calendarWeek,digest,OPTIONS} from '../src/research.js';
import {GEOGRAPHY_VERSION} from '../src/geography.js';
function d1(db){return {prepare(sql){return {bind(...values){return {sql,values,async first(){return db.prepare(sql).get(...values)||null;},async all(){return {results:db.prepare(sql).all(...values)};},async run(){return db.prepare(sql).run(...values);}};},async all(){return {results:db.prepare(sql).all()};}};},async batch(statements){db.exec('BEGIN');try{const results=statements.map(s=>db.prepare(s.sql).run(...s.values));db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}}};}
const script=fileURLToPath(new URL('../scripts/research.mjs',import.meta.url));
const exporter=fileURLToPath(new URL('../scripts/export-public.mjs',import.meta.url));
test('draft, trusted claims, atomic answer, erasure, release and public archive',async()=>{
 const folder=mkdtempSync(join(tmpdir(),'dinrost-test-')),file=join(folder,'research.sqlite'),releaseFile=join(folder,'release.json');
 execFileSync(process.execPath,[script,'init',file]);execFileSync(process.execPath,[script,'draft',file]);
 const week=calendarWeek(),item=`${week.id}-1`;
 for(let i=1;i<=8;i++)execFileSync(process.execPath,[script,'review',file,`${week.id}-${i}`,'approved','QA reviewer']);
 execFileSync(process.execPath,[script,'open',file,week.id]);
 const db=new DatabaseSync(file);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM research_reviews').get().n,8);
 db.prepare('INSERT INTO research_participants VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('u','email_verified','18-29','woman','1780','17','self_reported','direct','consent-v1',new Date().toISOString(),null);
 const env={DB:d1(db),APP_ORIGIN:'https://example',RESEARCH_COLLECTION_ENABLED:'true',ENVIRONMENT:'production'},session=async()=>({user_id:'u'});
 const request=(path,data)=>new Request('https://example/api/research/'+path,{method:'POST',headers:{origin:'https://example','content-type':'application/json'},body:JSON.stringify(data)});
 const first=await researchAPI(request(`items/${item}/answers`,{option_id:'yes'}),env,session);assert.equal(first.status,201);
 const receipt=await first.json();assert.ok(receipt.removal_key);
 assert.equal((await researchAPI(request(`items/${item}/answers`,{option_id:'no'}),env,session)).status,409);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM research_answers').get().n,1);
 // No plaintext capability and no stable account identifier in answers.
 assert.notEqual(db.prepare('SELECT token_hash FROM research_erasures').get().token_hash,receipt.removal_key);
 assert.equal(db.prepare('PRAGMA table_info(research_answers)').all().some(c=>c.name==='user_id'),false);
 env.RESEARCH_COLLECTION_ENABLED='false';
 assert.equal((await researchAPI(request('erase',{removal_key:receipt.removal_key}),env,session)).status,200);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM research_answers').get().n,0);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM research_erasures').get().n,0);
 // Erasure does not create an opportunity to vote a second time.
 env.RESEARCH_COLLECTION_ENABLED='true';assert.equal((await researchAPI(request(`items/${item}/answers`,{option_id:'no'}),env,session)).status,409);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM research_answers').get().n,0);
 assert.equal((await researchAPI(request('withdraw',{}),env,session)).status,200);
 assert.equal((await researchAPI(request(`items/${week.id}-2/answers`,{option_id:'yes'}),env,session)).status,403);
 assert.throws(()=>db.exec("UPDATE research_waves SET closes_at='2099-01-01T00:00:00.000Z'"),/locked/);
 // A future-closing week cannot be released, even if marked closed.
 db.exec("UPDATE research_waves SET status='closed'");db.close();
 assert.throws(()=>execFileSync(process.execPath,[script,'release',file,week.id,'QA reviewer',releaseFile],{stdio:'pipe'}));
 // Use a separate historical week for a full frozen publication lifecycle.
 execFileSync(process.execPath,[script,'draft',file,'2026-10-12T12:00:00Z']);
 const historic=new DatabaseSync(file);historic.exec("UPDATE research_items SET editorial_review='approved' WHERE wave_id='2026-10-12';UPDATE research_waves SET status='open' WHERE id='2026-10-12';UPDATE research_waves SET status='closed' WHERE id='2026-10-12'");
 for(const option of OPTIONS)for(let n=0;n<50;n++)historic.prepare('INSERT INTO research_answers VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),'2026-10-12-1',option.id,'2026-10-12','18-29','woman','1780','17','self_reported','email_verified','direct','consent-v1','accepted',GEOGRAPHY_VERSION);
 historic.close();
 execFileSync(process.execPath,[script,'release',file,'2026-10-12','QA reviewer',releaseFile]);
 const published=JSON.parse(readFileSync(releaseFile,'utf8'));assert.equal(await digest(JSON.stringify(published.release)),published.sha256);
 assert.equal(published.release.items.length,8);assert.equal(published.release.items[0].result.suppressed,false);assert.equal(published.release.items.slice(1).every(i=>i.result.suppressed),true);
 const publicDir=join(folder,'public');execFileSync(process.execPath,[exporter,file,publicDir]);
 assert.equal(JSON.parse(readFileSync(join(publicDir,'index.json'),'utf8')).releases.length,1);
 const staticRelease=JSON.parse(readFileSync(join(publicDir,'release-2026-10-12.json'),'utf8'));
 assert.equal(staticRelease.release.items[0].result.cells[0].municipality,'1780');
 assert.equal(staticRelease.release.items[0].result.cells[0].counts.yes,50);
 assert.equal(JSON.stringify(staticRelease).includes('user_id'),false);
 // Even a correctly checksummed payload must not export unexpected raw fields.
 const invalidFile=join(folder,'unsafe.sqlite'),invalidDB=new DatabaseSync(invalidFile);
 invalidDB.exec('CREATE TABLE research_releases(id TEXT,wave_id TEXT,payload_json TEXT,sha256 TEXT);CREATE TABLE research_release_notices(release_id TEXT,kind TEXT,note TEXT,created_at TEXT)');
 const unsafeJSON=JSON.stringify({...published.release,answers:[{user_id:'forbidden',choice:'yes'}]});
 invalidDB.prepare('INSERT INTO research_releases VALUES(?,?,?,?)').run(published.release.id,published.release.wave.id,unsafeJSON,await digest(unsafeJSON));invalidDB.close();
 const before=readFileSync(join(publicDir,'index.json'),'utf8');
 assert.throws(()=>execFileSync(process.execPath,[exporter,invalidFile,publicDir],{stdio:'pipe'}),/Unexpected public export field/);
 assert.equal(readFileSync(join(publicDir,'index.json'),'utf8'),before);
 const finalDB=new DatabaseSync(file),pubEnv={DB:d1(finalDB)};
 const archive=await researchAPI(new Request('https://example/api/research/archive'),pubEnv,()=>{throw Error('Login required');});assert.equal((await archive.json()).releases.length,1);
 const get=()=>researchAPI(new Request('https://example/api/research/releases/release-2026-10-12'),pubEnv,()=>null);
 assert.equal((await get()).status,200);
 assert.throws(()=>finalDB.exec("UPDATE research_releases SET sha256='bad'"),/immutable/);
 finalDB.prepare('INSERT INTO research_release_notices VALUES(?,?,?,?,?,?)').run('n','release-2026-10-12','withdrawal','QA withdrawal','reviewer',new Date().toISOString());
 assert.equal((await get()).status,410);finalDB.close();
 execFileSync(process.execPath,[exporter,file,publicDir]);
 assert.equal(JSON.parse(readFileSync(join(publicDir,'index.json'),'utf8')).releases.length,0);
 const withdrawal=JSON.parse(readFileSync(join(publicDir,'release-2026-10-12.json'),'utf8'));
 assert.equal(withdrawal.withdrawn,true);assert.equal(withdrawal.release,undefined);
});
