import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {calendarWeek,CATEGORIES,OPTIONS,WORDINGS,METHOD,comparisonKey,aggregateMunicipal,digest,POLICY} from '../src/research.js';
import {GEOGRAPHY_VERSION,GEOGRAPHY_SOURCE} from '../src/geography.js';

// Offline tooling only. Never opens production remotely or publishes automatically.
const [command,file,...args]=process.argv.slice(2);
if(!['init','draft','review','open','close','notice','release'].includes(command)||!file)throw Error('Usage: node scripts/research.mjs init|draft|review|open|close|notice|release local.sqlite [...]');
const db=new DatabaseSync(file);db.exec('PRAGMA foreign_keys=ON');
if(command==='review') {
 const [itemId,decision,reviewer]=args;
 if(!itemId||!['approved','rejected'].includes(decision)||!reviewer)throw Error('review requires item ID, approved|rejected and named reviewer');
 db.exec('BEGIN IMMEDIATE');try{
  const result=db.prepare("UPDATE research_items SET editorial_review=? WHERE id=? AND wave_id IN (SELECT id FROM research_waves WHERE status='draft')").run(decision,itemId);
  if(result.changes!==1)throw Error('Draft item not found');
  db.prepare('INSERT INTO research_reviews VALUES(?,?,?,?,?)').run(crypto.randomUUID(),itemId,decision,reviewer,new Date().toISOString());db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}
}
if(command==='open'||command==='close') {
 const [waveId]=args, wave=db.prepare('SELECT * FROM research_waves WHERE id=?').get(waveId);
 if(!wave)throw Error('Wave not found');
 if(command==='open'){
  if(wave.status!=='draft'||Date.now()>=Date.parse(wave.closes_at))throw Error('Only unexpired draft weeks can open');
  const items=db.prepare('SELECT category FROM research_items WHERE wave_id=?').all(waveId);
  if(items.length!==8||items.some(i=>!CATEGORIES.includes(i.category)))throw Error('All eight declared categories required');
 }else if(wave.status!=='open'||Date.now()<Date.parse(wave.closes_at))throw Error('Close only after the response window ends');
 db.prepare('UPDATE research_waves SET status=? WHERE id=?').run(command==='open'?'open':'closed',waveId);
}
if(command==='notice') {
 const [releaseId,kind,reviewer,note]=args;
 if(!['correction','withdrawal'].includes(kind)||!reviewer||!note)throw Error('notice requires release ID, correction|withdrawal, reviewer and note');
 db.prepare('INSERT INTO research_release_notices VALUES(?,?,?,?,?,?)').run(crypto.randomUUID(),releaseId,kind,note,reviewer,new Date().toISOString());
}
if(command==='init') {
 for(const name of readdirSync(new URL('../migrations/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())db.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
 console.log('Local research schema initialized');
}
if(command==='draft') {
 const wave=calendarWeek(args[0]?new Date(args[0]):new Date()),now=new Date().toISOString();
 db.exec('BEGIN IMMEDIATE');
 try {
  db.prepare('INSERT OR IGNORE INTO research_methods VALUES(?,?,?)').run(METHOD.id,JSON.stringify(METHOD),now);
  db.prepare('INSERT INTO research_waves VALUES(?,?,?,?,?,?)').run(wave.id,wave.opens_at,wave.closes_at,wave.timezone,METHOD.id,'draft');
  for(let i=0;i<8;i++){
   const q=`topic-${i+1}`,v=`${q}-v1`,context='Ja innebär stöd för förslaget. Nej innebär att du inte stöder förslaget. Vet inte / ingen uppfattning är ett eget svarsalternativ. Inget svar är obligatoriskt.';
   db.prepare('INSERT OR IGNORE INTO research_questions VALUES(?,?,?)').run(q,CATEGORIES[i],now);
   const key=await comparisonKey(WORDINGS[i],context,OPTIONS,METHOD.id);
   const existing=db.prepare('SELECT comparison_key FROM research_versions WHERE id=?').get(v);
   if(existing&&existing.comparison_key!==key)throw Error('Wording changed: create a new version ID');
   db.prepare('INSERT OR IGNORE INTO research_versions VALUES(?,?,?,?,?,?,?,?)').run(v,q,1,WORDINGS[i],context,JSON.stringify(OPTIONS),key,now);
   db.prepare('INSERT INTO research_items VALUES(?,?,?,?,?,?,?)').run(`${wave.id}-${i+1}`,wave.id,v,i+1,CATEGORIES[i],null,'pending');
  }
  db.exec('COMMIT');console.log(JSON.stringify(wave));
 }catch(e){db.exec('ROLLBACK');throw e;}
}
if(command==='release') {
 const [waveId,reviewer,output]=args;if(!waveId||!reviewer||!output)throw Error('wave, named reviewer and output path required');
 db.exec('BEGIN IMMEDIATE');
 try {
  const wave=db.prepare('SELECT * FROM research_waves WHERE id=?').get(waveId);
  if(!wave||wave.status!=='closed'||Date.parse(wave.closes_at)>Date.now())throw Error('Only closed, completed weeks');
  const items=db.prepare('SELECT i.*,v.wording,v.context,v.options_json,v.comparison_key FROM research_items i JOIN research_versions v ON v.id=i.version_id WHERE wave_id=? ORDER BY position').all(waveId);
  if(items.length!==8||items.some(i=>i.editorial_review!=='approved'))throw Error('Eight approved items required');
  if(new Set(items.map(i=>i.category)).size!==8||items.some(i=>!CATEGORIES.includes(i.category)))throw Error('All eight declared categories required');
  for(const i of items)if(i.comparison_key!==await comparisonKey(i.wording,i.context,JSON.parse(i.options_json),wave.method_id))throw Error('Invalid comparison fingerprint');
  const payload={id:`release-${waveId}`,wave,method:JSON.parse(db.prepare('SELECT metadata_json FROM research_methods WHERE id=?').get(wave.method_id).metadata_json),policy:{version:POLICY,minimum_option_cell:50,geography:'municipality',geography_version:GEOGRAPHY_VERSION,geography_source:GEOGRAPHY_SOURCE,dimensions:['age','gender','municipality'],derived_dimensions:['region'],coverage:'published_municipalities_only',suppression_scope:'whole_municipality',revisions:'none',weighting:'none'},reviewer,created_at:new Date().toISOString(),items:items.map(i=>({id:i.id,version_id:i.version_id,position:i.position,category:i.category,wording:i.wording,context:i.context,options:JSON.parse(i.options_json),comparison_key:i.comparison_key,sponsor:i.sponsor,result:aggregateMunicipal(db.prepare('SELECT * FROM research_answers WHERE item_id=?').all(i.id))}))};
  const json=JSON.stringify(payload),hash=await digest(json);
  db.prepare('INSERT INTO research_releases VALUES(?,?,?,?,?,?,?)').run(payload.id,waveId,payload.created_at,reviewer,POLICY,json,hash);
  db.exec('COMMIT');writeFileSync(output,JSON.stringify({release:payload,sha256:hash},null,2)+'\n');console.log('Frozen local release written. No upload or deployment performed.');
 }catch(e){if(db.isTransaction)db.exec('ROLLBACK');throw e;}
}
db.close();
