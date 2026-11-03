import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parsePersonalNumber,todayInStockholm} from '../src/personal-number.js';
import {CATEGORIES} from '../../categories.js';
// Synthetic local fixtures; these are never used as identities or sent to a server.
function fixture(date,serial='001'){
 const double=[0,2,4,6,8,1,3,5,7,9];
 const sum=(date+serial).slice(2).split('').reduce((s,n,i)=>s+(i%2===0?double[Number(n)]:Number(n)),0);
 return date+'-'+serial+((10-sum%10)%10);
}
test('personnummer provides age and legal gender without returning the identifier',()=>{
 const male=parsePersonalNumber(fixture('20000229','001'),'2026-11-03');
 assert.deepEqual(male,{valid:true,age:26,legalGender:'man',eligible:true,ageBand:'18-29'});
 assert.equal(parsePersonalNumber(fixture('20000229','002'),'2026-11-03').legalGender,'woman');
 assert.equal(JSON.stringify(male).includes('20000229'),false);
});
test('minimum age changes on the sixteenth birthday, not at the new year',()=>{
 const input=fixture('20101103');
 const before=parsePersonalNumber(input,'2026-11-02'),birthday=parsePersonalNumber(input,'2026-11-03');
 assert.equal(before.age,15);assert.equal(before.eligible,false);assert.equal(before.ageBand,null);
 assert.equal(birthday.age,16);assert.equal(birthday.eligible,true);assert.equal(birthday.ageBand,'16-17');
});
test('invalid dates, future dates and invalid checksums are rejected',()=>{
 assert.equal(parsePersonalNumber(fixture('19000229'),'2026-11-03').code,'date');
 assert.equal(parsePersonalNumber(fixture('20010431'),'2026-11-03').code,'date');
 assert.equal(parsePersonalNumber(fixture('20261104'),'2026-11-03').code,'future');
 const valid=fixture('20000229'),bad=valid.slice(0,-1)+((Number(valid.at(-1))+1)%10);
 assert.equal(parsePersonalNumber(bad,'2026-11-03').code,'checksum');
});
test('explicit century is required; coordination numbers are not silently reinterpreted',()=>{
 const input=fixture('19000101');assert.equal(parsePersonalNumber(input,'2026-11-03').age,126);
 assert.equal(parsePersonalNumber(input.replace('-',''),'2026-11-03').valid,true);
 for(const bad of ['000101-1234','2000-01-01-1234','20000101+1234',null])assert.equal(parsePersonalNumber(bad,'2026-11-03').valid,false);
 assert.equal(parsePersonalNumber(fixture('20000161'),'2026-11-03').code,'coordination_number');
});
test('registration uses the Swedish calendar date around midnight and DST',()=>{
 assert.equal(todayInStockholm(new Date('2026-11-02T23:30:00Z')),'2026-11-03');
 assert.equal(todayInStockholm(new Date('2026-06-02T22:30:00Z')),'2026-06-03');
});
test('all eight category labels have distinct colors with readable text contrast',()=>{
 function luminance(hex){const channels=hex.slice(1).match(/../g).map(h=>parseInt(h,16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return .2126*channels[0]+.7152*channels[1]+.0722*channels[2];}
 assert.equal(CATEGORIES.length,8);assert.equal(new Set(CATEGORIES.map(c=>c.color)).size,8);
 for(const c of CATEGORIES){const a=luminance(c.color),b=luminance(c.tint);assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,c.label+' contrast');}
});
