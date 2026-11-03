import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {calendarWeek,isOpen,comparisonKey,OPTIONS,aggregate,selectCells,researchAPI} from '../src/research.js';
test('Stockholm calendar weeks include DST and exclusive closing instant',()=>{
 const spring=calendarWeek(new Date('2026-03-25T12:00:00Z'));
 assert.equal((Date.parse(spring.closes_at)-Date.parse(spring.opens_at))/3600000,167);
 const fall=calendarWeek(new Date('2026-10-21T12:00:00Z'));
 assert.equal((Date.parse(fall.closes_at)-Date.parse(fall.opens_at))/3600000,169);
 const w={...fall,status:'open'};
 assert.equal(isOpen(w,new Date(Date.parse(w.closes_at)-1)),true);
 assert.equal(isOpen(w,new Date(w.closes_at)),false);
 assert.equal(calendarWeek(new Date(w.closes_at)).opens_at,w.closes_at);
});
test('changed wording, context, options or method breaks comparison key',async()=>{
 const base=await comparisonKey('A','B',OPTIONS,'v1');
 for(const args of [['C','B',OPTIONS,'v1'],['A','C',OPTIONS,'v1'],['A','B',[...OPTIONS].reverse(),'v1'],['A','B',OPTIONS,'v2']]) assert.notEqual(await comparisonKey(...args),base);
});
function rows(){return OPTIONS.flatMap(o=>Array.from({length:50},()=>({option_id:o.id,age_band:'18-29',gender:'woman',region_code:'17',quality:'accepted',verification:'email_verified'})));}
test('whole-question suppression prevents totals and partial cube recovery',()=>{
 const r=rows(); assert.equal(aggregate(r).suppressed,false);
 r.pop();const hidden=aggregate(r);assert.equal(hidden.suppressed,true);assert.deepEqual(hidden.cells,[]);
 assert.equal(selectCells(hidden).count,null);
 assert.equal(aggregate(rows().filter(r=>r.option_id!=='yes')).suppressed,true);
 assert.equal(aggregate([...rows(),{...rows()[0],region_code:'01'}]).suppressed,true);
 assert.throws(()=>aggregate(rows(),{minimum:1}));
});
test('public counts derive exclusively from same fixed cube',()=>{
 const r=aggregate(rows());assert.equal(selectCells(r).count,150);
 assert.equal(selectCells(r,{geography:'17'}).results[0].n,50);
 assert.equal(selectCells(r,{geography:'01'}).count,null);
 assert.throws(()=>selectCells(r,{recruitment:'political_group'}));
 assert.equal(aggregate(rows().map(r=>({...r,verification:'mock'}))).suppressed,true);
});
function fixture(){
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../migrations/0001_research.sql',import.meta.url),'utf8'));
 db.prepare('INSERT INTO research_methods VALUES(?,?,?)').run('m','{}','2026');
 db.prepare('INSERT INTO research_questions VALUES(?,?,?)').run('q','cat','2026');
 db.prepare('INSERT INTO research_versions VALUES(?,?,?,?,?,?,?,?)').run('v','q',1,'Question','Context',JSON.stringify(OPTIONS),'key','2026');
 db.prepare('INSERT INTO research_waves VALUES(?,?,?,?,?,?)').run('w','2026-01-04T23:00:00.000Z','2026-01-11T23:00:00.000Z','Europe/Stockholm','m','draft');
 return db;
}
test('database rejects incomplete weeks and modification of historical versions',()=>{
 const db=fixture();assert.throws(()=>db.exec("UPDATE research_versions SET wording='Changed'"),/immutable/);
 assert.throws(()=>db.exec("DELETE FROM research_methods"),/immutable/);
 assert.throws(()=>db.exec("UPDATE research_waves SET status='open'"),/eight/);db.close();
});
test('invalid option and duplicate participation are database constraints',()=>{
 const db=fixture();db.exec("INSERT INTO research_items VALUES('i','w','v',1,'cat',NULL,'approved')");
 db.exec("INSERT INTO research_receipts VALUES('u','i')");assert.throws(()=>db.exec("INSERT INTO research_receipts VALUES('u','i')"),/UNIQUE/);
 assert.throws(()=>db.exec("INSERT INTO research_answers VALUES('a','i','bad','w','18-29','woman',NULL,'17','self_reported','email_verified','direct','v1','accepted')"),/invalid option/);db.close();
});
test('API blocks ingestion by default and rejects foreign origins',async()=>{
 let called=false;const auth=async()=>{called=true;};
 const req=origin=>new Request('https://api.example/api/research/items/i/answers',{method:'POST',headers:{origin,'content-type':'application/json'},body:'{"option_id":"yes"}'});
 assert.equal((await researchAPI(req('https://example'),{APP_ORIGIN:'https://example'},auth)).status,503);
 assert.equal((await researchAPI(req('https://evil'),{APP_ORIGIN:'https://example'},auth)).status,403);
 assert.equal(called,false);
});
test('archive and frozen release are public without login; raw routes are absent',async()=>{
 const env={DB:{prepare:sql=>({all:async()=>({results:[]}),bind:()=>({first:async()=>null})})}};
 const auth=()=>{throw Error('public route asked for authentication');};
 assert.equal((await researchAPI(new Request('https://a/api/research/archive'),env,auth)).status,200);
 assert.equal((await researchAPI(new Request('https://a/api/research/answers'),env,auth)).status,404);
 assert.equal((await researchAPI(new Request('https://a/api/research/releases/x?age=18'),env,auth)).status,400);
});
