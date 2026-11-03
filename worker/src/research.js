import {MUNICIPALITIES,GEOGRAPHY_VERSION} from './geography.js';
export const POLICY = 'fixed-municipality-cube-v2';
export const CATEGORIES = ['Energi & klimat','Skola & utbildning','Vård & omsorg','Lag & trygghet','Ekonomi & arbete','Demokrati & samhälle','Bostäder & infrastruktur','Sverige & omvärlden'];
export const OPTIONS = [{id:'yes',label:'Ja'},{id:'no',label:'Nej'},{id:'unsure',label:'Vet inte / ingen uppfattning'}];
export const WORDINGS = [
 'Bör Sverige bygga nya kärnkraftsreaktorer?',
 'Bör användning av mobiltelefoner vara förbjuden för elever under hela skoldagen i grundskolan, med undantag för undervisning och särskilda behov?',
 'Bör staten ta över regionernas ansvar för att finansiera hälso- och sjukvården?',
 'Bör antalet bemannade polisstationer i Sverige öka?',
 'Bör det statliga stödet till arbetsmarknadsutbildning öka?',
 'Bör Sverige genomföra fler nationella rådgivande folkomröstningar?',
 'Bör staten öka stödet till byggande av hyresbostäder?',
 'Bör EU:s medlemsländer fatta fler utrikespolitiska beslut med kvalificerad majoritet i stället för enhällighet?'
];
export const METHOD = {
 id:'self-recruited-v1', sampling:'self_recruited_non_probability', mode:'web',
 population:'Deltagare från 16 år som själva väljer att delta; ingen befolkningsrepresentativitet utlovas.',
 recruitment_channels:['dinpuls','political_group','university','public_event','direct','unknown'],
 verification:'Per svar: självrapporterad, e-postverifierad, identitetsverifierad eller mock. E-post bevisar inte identitet.',
 demographics:'Ögonblicksbild vid svar. Ålder och kön enligt dokumenterad källa; kommun är självrapporterad om inget annat styrkts.',
 weighting:'none', uncertainty:'Ingen konventionell felmarginal för sannolikhetsurval redovisas.',
 nonresponse:'Inbjudna och exponerade är okända; svarsfrekvens kan inte beräknas. Vet inte är ett svar; obesvarat är inte nej.',
 comparison:'Upprepade tvärsnitt av deltagare; ingen individpanel och inga belagda befolkningsförändringar.',
 option_order:'fixed', question_order:'fixed', language:'sv-SE', collection_timezone:'Europe/Stockholm'
};
function localParts(date) {
 return Object.fromEntries(new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date).filter(x=>x.type!=='literal').map(x=>[x.type,Number(x.value)]));
}
function stockholmMidnight(y,m,d) {
 const target=Date.UTC(y,m-1,d); let t=target;
 for(let i=0;i<3;i++){const p=localParts(new Date(t)); t+=target-Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);}
 return new Date(t).toISOString();
}
export function calendarWeek(at=new Date()) {
 const p=localParts(at), day=new Date(Date.UTC(p.year,p.month-1,p.day));
 day.setUTCDate(day.getUTCDate()-((day.getUTCDay()+6)%7));
 const end=new Date(day); end.setUTCDate(end.getUTCDate()+7);
 const monday=day.toISOString().slice(0,10);
 return {id:monday,opens_at:stockholmMidnight(day.getUTCFullYear(),day.getUTCMonth()+1,day.getUTCDate()),closes_at:stockholmMidnight(end.getUTCFullYear(),end.getUTCMonth()+1,end.getUTCDate()),timezone:'Europe/Stockholm'};
}
export function isOpen(wave,now=new Date()) {return wave.status==='open' && +now>=Date.parse(wave.opens_at) && +now<Date.parse(wave.closes_at);}
export async function digest(value) {
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
 return Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');
}
export async function comparisonKey(wording,context,options,methodId) {
 return digest(JSON.stringify({wording,context,options,methodId}));
}
// One frozen, disjoint cube. No live aggregates, free-form filters, alternative
// partitions, release revisions or microdata endpoint. Fail closed per question.
export function aggregate(rows,{geography='region',minimum=50}={}) {
 if(!['region','municipality'].includes(geography)||!Number.isInteger(minimum)||minimum<50) throw Error('Invalid disclosure policy');
 if(rows.some(r=>r.verification==='mock')) return {suppressed:true,reason:'test_data',cells:[]};
 const map=new Map();
 for(const r of rows){
  if(r.quality!=='accepted')continue;
  if(!OPTIONS.some(o=>o.id===r.option_id))throw Error('Unsupported options');
  const geo=r[geography+'_code']||'unknown', key=JSON.stringify([r.age_band,r.gender,geo]);
  if(!map.has(key))map.set(key,{age:r.age_band,gender:r.gender,geography:geo,counts:Object.fromEntries(OPTIONS.map(o=>[o.id,0]))});
  map.get(key).counts[r.option_id]++;
 }
 const cells=[...map.values()].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 // Includes zero cells: entire question withheld, with no total or partial cells.
 if(!cells.length||cells.some(c=>Object.values(c.counts).some(n=>n<minimum)))return {suppressed:true,reason:'disclosure_control',cells:[]};
 return {suppressed:false,cells};
}
// Publish only complete municipal cubes. National and regional views are sums
// of these exact cells, never separate totals including withheld municipalities.
export function aggregateMunicipal(rows,{minimum=50}={}) {
 if(!Number.isInteger(minimum)||minimum<50)throw Error('Invalid disclosure policy');
 const base={partition:'municipality',geography_version:GEOGRAPHY_VERSION,coverage:'published_municipalities_only'};
 if(rows.some(r=>r.verification==='mock'))return {...base,suppressed:true,reason:'test_data',cells:[]};
 const municipalities=new Map();
 for(const r of rows){
  if(r.quality!=='accepted')continue;
  if(!OPTIONS.some(o=>o.id===r.option_id))throw Error('Unsupported options');
  const code=r.municipality_code,geo=MUNICIPALITIES[code];
  if(!geo||r.region_code!==geo.region||r.geography_version!==GEOGRAPHY_VERSION)throw Error('Invalid or unversioned geography');
  if(!municipalities.has(code))municipalities.set(code,new Map());
  const map=municipalities.get(code),key=JSON.stringify([r.age_band,r.gender]);
  if(!map.has(key))map.set(key,{age:r.age_band,gender:r.gender,municipality:code,region:geo.region,counts:Object.fromEntries(OPTIONS.map(o=>[o.id,0]))});
  map.get(key).counts[r.option_id]++;
 }
 const cells=[];
 for(const map of municipalities.values()){
  const candidate=[...map.values()];
  if(candidate.every(c=>Object.values(c.counts).every(n=>n>=minimum)))cells.push(...candidate);
 }
 cells.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 return {...base,suppressed:cells.length===0,...(!cells.length?{reason:'disclosure_control'}:{}),cells};
}
export function selectCells(result,filters={}) {
 if(Object.keys(filters).some(k=>!['age','gender','geography','region','municipality'].includes(k)))throw Error('Unsupported filter');
 const municipal=result.partition==='municipality';
 if(municipal&&filters.geography)throw Error('Use explicit municipality or region filter');
 if(result.suppressed)return {suppressed:true,count:null,results:[]};
 if(!municipal&&filters.municipality)return {suppressed:true,count:null,results:[],reason:'municipality_not_published'};
 const cells=result.cells.filter(c=>Object.entries(filters).every(([k,v])=>(!municipal&&k==='region'?c.geography:c[k])===v));
 if(!cells.length)return {suppressed:true,count:null,results:[]};
 const results=OPTIONS.map(o=>({option_id:o.id,label:o.label,n:cells.reduce((sum,c)=>sum+c.counts[o.id],0)}));
 const count=results.reduce((sum,r)=>sum+r.n,0);
 const codes=municipal?[...new Set(cells.map(c=>c.municipality))].sort():[];
 return {suppressed:false,count,...(municipal?{coverage:result.coverage,published_municipalities:codes.length,municipality_codes:codes}:{}),results:results.map(r=>({...r,percent:100*r.n/count}))};
}
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
export async function researchAPI(req,env,getSession) {
 const url=new URL(req.url), path=url.pathname;
 if(req.method==='GET'&&path==='/api/research/archive') {
  if(url.search)return response({error:'Filters not supported'},400);
  const {results}=await env.DB.prepare("SELECT id,wave_id,created_at,policy_version,sha256 FROM research_releases r WHERE NOT EXISTS(SELECT 1 FROM research_release_notices n WHERE n.release_id=r.id AND n.kind='withdrawal') ORDER BY wave_id DESC").all();
  return response({releases:results});
 }
 if(req.method==='GET'&&/^\/api\/research\/releases\/[\w-]+$/.test(path)) {
  if(url.search)return response({error:'Use only published cube dimensions'},400);
  const id=path.split('/')[4];
  const {results:notices}=await env.DB.prepare('SELECT kind,note,created_at FROM research_release_notices WHERE release_id=? ORDER BY created_at').bind(id).all();
  if(notices.some(n=>n.kind==='withdrawal'))return response({error:'Release withdrawn',notices},410);
  const row=await env.DB.prepare('SELECT payload_json,sha256 FROM research_releases WHERE id=?').bind(id).first();
  return row?response({release:JSON.parse(row.payload_json),sha256:row.sha256,notices}):response({error:'Not found'},404);
 }
 if(req.method==='GET'&&path==='/api/research/questions') {
  const {results}=await env.DB.prepare("SELECT i.id,i.wave_id,i.position,i.category,v.wording,v.context,v.options_json,v.comparison_key,w.opens_at,w.closes_at,w.timezone,w.status FROM research_items i JOIN research_versions v ON v.id=i.version_id JOIN research_waves w ON w.id=i.wave_id WHERE w.status!='draft' AND i.editorial_review='approved' ORDER BY w.opens_at DESC,i.position LIMIT 416").all();
  return response({questions:results.map(r=>({...r,options:JSON.parse(r.options_json),options_json:undefined}))});
 }
 if(req.method!=='POST')return response({error:'Not found'},404);
 if(req.headers.get('origin')!==new URL(env.APP_ORIGIN).origin||!req.headers.get('content-type')?.startsWith('application/json'))return response({error:'Invalid origin or content type'},403);
 const isAnswer=/^\/api\/research\/items\/[\w-]+\/answers$/.test(path);
 // Rights endpoints remain available when collection has been stopped.
 if(isAnswer&&env.RESEARCH_COLLECTION_ENABLED!=='true')return response({error:'Collection has not been approved'},503);
 const s=await getSession(req,env); if(!s)return response({error:'Unauthorized'},401);
 if(path==='/api/research/withdraw') {
  await env.DB.prepare('UPDATE research_participants SET withdrawn_at=? WHERE user_id=?').bind(new Date().toISOString(),s.user_id).run();
  return response({ok:true,notice:'Further participation blocked. Remove previous responses using their removal keys; account deletion is a separate request.'});
 }
 let data; try {const raw=await req.text();if(raw.length>4096)return response({error:'Too large'},413);data=JSON.parse(raw);}catch{return response({error:'Invalid JSON'},400);}
 if(path==='/api/research/erase') {
  if(typeof data.removal_key!=='string'||!/^[a-f0-9]{64}$/.test(data.removal_key))return response({error:'Invalid removal key'},400);
  const hash=await digest(data.removal_key);
  await env.DB.batch([
   env.DB.prepare('DELETE FROM research_answers WHERE id=(SELECT answer_id FROM research_erasures WHERE token_hash=?)').bind(hash),
   env.DB.prepare('DELETE FROM research_erasures WHERE token_hash=?').bind(hash)
  ]);
  return response({ok:true});
 }
 if(!/^\/api\/research\/items\/[\w-]+\/answers$/.test(path))return response({error:'Not found'},404);
 if(Object.keys(data).some(k=>k!=='option_id')||!OPTIONS.some(o=>o.id===data.option_id))return response({error:'Invalid answer'},400);
 const participant=await env.DB.prepare('SELECT * FROM research_participants WHERE user_id=? AND withdrawn_at IS NULL').bind(s.user_id).first();
 // Participant claims are provisioned only by a trusted adapter; never the client.
 if(!participant||!participant.consent_version)return response({error:'Approved consent and participant claims required'},403);
 if(participant.verification==='mock'&&env.ENVIRONMENT!=='development')return response({error:'Mock identity forbidden'},403);
 const geo=MUNICIPALITIES[participant.municipality_code];
 if(!geo)return response({error:'Valid home municipality required'},409);
 const id=path.split('/')[4], item=await env.DB.prepare('SELECT i.*,w.opens_at,w.closes_at,w.status FROM research_items i JOIN research_waves w ON w.id=i.wave_id WHERE i.id=?').bind(id).first();
 if(!item||!isOpen(item))return response({error:'Question is closed'},409);
 const answerId=crypto.randomUUID(), removalKey=Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
 try {
  await env.DB.batch([
   env.DB.prepare('INSERT INTO research_receipts(user_id,item_id) VALUES(?,?)').bind(s.user_id,id),
   env.DB.prepare('INSERT INTO research_answers(id,item_id,option_id,received_week,age_band,gender,municipality_code,region_code,geography_source,verification,recruitment,consent_version,quality,geography_version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(answerId,id,data.option_id,item.wave_id,participant.age_band,participant.gender,participant.municipality_code,geo.region,participant.geography_source,participant.verification,participant.recruitment,participant.consent_version,'accepted',GEOGRAPHY_VERSION),
   env.DB.prepare('INSERT INTO research_erasures(token_hash,answer_id) VALUES(?,?)').bind(await digest(removalKey),answerId)
  ]);
 }catch(e){if(String(e).includes('UNIQUE constraint failed: research_receipts'))return response({error:'Already answered'},409);throw e;}
 return response({ok:true,removal_key:removalKey,notice:'Save this removal key privately. It is shown once and lets you remove this response.'},201);
}
