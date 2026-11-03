import {test} from 'node:test';
import assert from 'node:assert/strict';
import {aggregateMunicipal,selectCells,OPTIONS} from '../src/research.js';
import {MUNICIPALITIES,REGIONS,GEOGRAPHY_VERSION} from '../src/geography.js';
const rows=(municipality='1780',count=50)=>OPTIONS.flatMap(o=>Array.from({length:count},()=>({municipality_code:municipality,region_code:MUNICIPALITIES[municipality].region,geography_version:GEOGRAPHY_VERSION,age_band:'18-29',gender:'woman',option_id:o.id,verification:'email_verified',quality:'accepted'})));
test('official code snapshot has all municipalities and preserves leading zeros',()=>{
 assert.equal(Object.keys(MUNICIPALITIES).length,290);assert.equal(Object.keys(REGIONS).length,21);
 assert.equal(MUNICIPALITIES['0114'].name,'Upplands Väsby');assert.equal(MUNICIPALITIES['1492'].name,'Åmål');
 for(const [code,g] of Object.entries(MUNICIPALITIES)){assert.match(code,/^\d{4}$/);assert.equal(g.region,code.slice(0,2));assert.ok(REGIONS[g.region]);}
});
test('small municipality is withheld without suppressing safe municipalities or leaking hidden totals',()=>{
 const result=aggregateMunicipal([...rows(),...rows('1715',1)]);
 assert.equal(result.suppressed,false);assert.equal(selectCells(result).count,150);
 assert.deepEqual(selectCells(result).municipality_codes,['1780']);
 assert.equal(selectCells(result,{municipality:'1715'}).count,null);
 assert.equal(JSON.stringify(result).includes('1715'),false);
 assert.equal(selectCells(result,{municipality:'1780'}).count,150);
});
test('country and region totals derive solely from the same disjoint municipal cells',()=>{
 const result=aggregateMunicipal([...rows(),...rows('1784'),...rows('0180'),...rows('1715',1)]);
 assert.equal(selectCells(result).count,450);
 assert.equal(selectCells(result,{region:'17'}).count,300);
 assert.equal(selectCells(result,{region:'01'}).count,150);
 assert.equal(selectCells(result,{region:'01',municipality:'1780'}).count,null);
 assert.equal(selectCells(result,{age:'18-29',gender:'woman',municipality:'1780'}).count,150);
 assert.throws(()=>selectCells(result,{geography:'17'}));
});
test('invalid, mismatched or unversioned geography prevents release',()=>{
 for(const change of [{municipality_code:'9999'},{region_code:'01'},{geography_version:null}])assert.throws(()=>aggregateMunicipal(rows().map(r=>({...r,...change}))),/geography/);
 assert.throws(()=>aggregateMunicipal(rows(),{minimum:1}));
});
test('zero choices and small demographic groups withhold their whole municipality',()=>{
 assert.equal(aggregateMunicipal(rows().filter(r=>r.option_id!=='yes')).suppressed,true);
 const mixed=aggregateMunicipal([...rows(),...rows('1780',1).map(r=>({...r,gender:'other'})),...rows('0180')]);
 assert.equal(selectCells(mixed,{municipality:'1780'}).count,null);
 assert.equal(selectCells(mixed).count,150);
 assert.equal(aggregateMunicipal(rows().map(r=>({...r,verification:'mock'}))).suppressed,true);
});
test('legacy region-only releases never manufacture municipal results',()=>{
 const old={suppressed:false,cells:[{age:'18-29',gender:'woman',geography:'17',counts:{yes:50,no:50,unsure:50}}]};
 assert.equal(selectCells(old,{region:'17'}).count,150);
 assert.equal(selectCells(old,{municipality:'1780'}).count,null);
});
