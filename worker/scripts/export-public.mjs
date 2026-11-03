import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,writeFileSync,renameSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {digest,POLICY,OPTIONS,METHOD} from '../src/research.js';
import {MUNICIPALITIES,GEOGRAPHY_VERSION} from '../src/geography.js';
const [database,directory]=process.argv.slice(2);
if(!database||!directory)throw Error('Usage: node scripts/export-public.mjs local.sqlite public-output-directory');
const db=new DatabaseSync(database,{readOnly:true});
function fields(object,allowed){if(!object||Object.keys(object).some(k=>!allowed.includes(k)))throw Error('Unexpected public export field');}
const exports=[];
for(const row of db.prepare('SELECT * FROM research_releases ORDER BY wave_id DESC').all()){
 if(!/^release-\d{4}-\d{2}-\d{2}$/.test(row.id))throw Error('Invalid release ID');
 const notices=db.prepare('SELECT kind,note,created_at FROM research_release_notices WHERE release_id=? ORDER BY created_at').all(row.id);
 if(notices.some(n=>n.kind==='withdrawal')){exports.push({id:row.id,withdrawn:true,body:{withdrawn:true,notices}});continue;}
 if(await digest(row.payload_json)!==row.sha256)throw Error('Invalid stored checksum');
 const release=JSON.parse(row.payload_json);
 fields(release,['id','wave','method','policy','reviewer','created_at','items']);
 fields(release.wave,['id','opens_at','closes_at','timezone','method_id','status']);
 fields(release.method,Object.keys(METHOD));
 fields(release.policy,['version','minimum_option_cell','geography','geography_version','geography_source','dimensions','derived_dimensions','coverage','suppression_scope','revisions','weighting']);
 if(release.id!==row.id||release.policy.version!==POLICY||release.policy.geography_version!==GEOGRAPHY_VERSION)throw Error('Unapproved export policy');
 if(release.items.length!==8)throw Error('Eight questions required');
 for(const item of release.items){
  fields(item,['id','version_id','position','category','wording','context','options','comparison_key','sponsor','result']);
  const r=item.result;
  if(r.partition!=='municipality'||r.coverage!=='published_municipalities_only')throw Error('Invalid municipal partition');
  if(Object.keys(r).some(k=>!['partition','geography_version','coverage','suppressed','reason','cells'].includes(k)))throw Error('Unexpected result field');
  if(r.suppressed&&r.cells.length)throw Error('Suppressed data exposed');
  for(const c of r.cells){
   if(Object.keys(c).some(k=>!['age','gender','municipality','region','counts'].includes(k)))throw Error('Unexpected cell field');
   if(!MUNICIPALITIES[c.municipality]||MUNICIPALITIES[c.municipality].region!==c.region)throw Error('Invalid geographic cell');
   if(Object.keys(c.counts).length!==OPTIONS.length||OPTIONS.some(o=>!Number.isSafeInteger(c.counts[o.id])||c.counts[o.id]<50))throw Error('Unsafe cell count');
  }
 }
 exports.push({id:row.id,body:{release,sha256:row.sha256,notices}});
}
db.close();
// Validate the complete export before modifying any published artifact.
const dest=resolve(directory);mkdirSync(dest,{recursive:true});
for(const e of exports){const path=join(dest,e.id+'.json');writeFileSync(path+'.tmp',JSON.stringify(e.body,null,2)+'\n');renameSync(path+'.tmp',path);}
const index={format_version:1,releases:exports.filter(e=>!e.withdrawn).map(e=>({id:e.id,wave_id:e.body.release.wave.id,sha256:e.body.sha256}))};
writeFileSync(join(dest,'index.json.tmp'),JSON.stringify(index,null,2)+'\n');renameSync(join(dest,'index.json.tmp'),join(dest,'index.json'));
console.log('Validated public aggregates exported. No accounts, receipts, or individual answers exported. No deployment performed.');
