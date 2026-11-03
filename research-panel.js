import {selectCells,digest} from './worker/src/research.js';
import {REGIONS,MUNICIPALITIES,GEOGRAPHY_VERSION} from './worker/src/geography.js';
import {CATEGORIES as VISUAL_CATEGORIES,categoryStyle} from './categories.js';
const root=document.querySelector('#researchPanel');
const API=document.querySelector('meta[name="research-api"]')?.content||'';
const GENDERS={woman:'Kvinna',man:'Man',other:'Annat',not_stated:'Inte angivet',unknown:'Okänd'};
const el=(tag,text,parent)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(parent)parent.append(n);return n;};
let controlId=0;
function select(label,parent){const wrap=el('div',undefined,parent),l=el('label',label,wrap),s=el('select',undefined,wrap);s.id='research-control-'+(++controlId);l.htmlFor=s.id;return s;}
function option(select,value,label){const o=el('option',label,select);o.value=value;}
const format=iso=>new Date(iso).toLocaleString('sv-SE',{timeZone:'Europe/Stockholm',dateStyle:'medium',timeStyle:'short'});
async function get(path){const r=await fetch(API+path,{credentials:'omit'});if(!r.ok)throw Error('Unavailable');const d=await r.json();return d;}
async function main(){
 const catalog=await fetch('data/research-catalog.json').then(r=>{if(!r.ok)throw Error('Missing catalog');return r.json();});
 const list=document.querySelector('#questionList');list.replaceChildren();
 catalog.questions.forEach((q,i)=>{
  const category=VISUAL_CATEGORIES.find(c=>c.label===q.category),a=el('article',undefined,list);a.className='question';
  if(category){categoryStyle(a,category);a.id='category-'+category.id;}
  const header=el('div',undefined,a);header.className='question-module-head';el('span',String(i+1).padStart(2,'0'),header).className='module-index';el('span',q.category,header);el('span','Utkast',header).className='module-state';
  const b=el('div',undefined,a);b.className='question-body';el('h3',q.wording,b);el('p','Ett perspektiv på en fråga vi delar. Insamlingen har inte öppnats.',b);
  const foot=el('div',undefined,b);foot.className='question-footer';el('span','Veckans fråga',foot);const link=el('a','Läs frågan ↗',foot);link.href='vote.html?q='+i;
 });
 if(location.hash.startsWith('#category-'))requestAnimationFrame(()=>document.getElementById(location.hash.slice(1))?.scrollIntoView());
 root.replaceChildren();el('h2','Jämför svar och hitta gamla frågor',root);
 el('p','Öppet för alla. Resultaten beskriver deltagarna på DinRöst. Urvalet är självrekryterat och resultaten visar inte säkert vad Sveriges befolkning tycker.',root);
 el('p','Åtta frågor per kalendervecka. Måndag 00.00–söndag 23.59.59, svensk tid. Slutliga resultat visas efter granskning.',root);
 el('p','Kommunstatistik visas när underlaget räcker. Kommuner med små grupper döljs helt. Rikets och regionernas siffror summerar endast publicerade kommungrupper.',root);
 const status=el('p','Hämtar frågearkivet …',root);status.setAttribute('role','status');
 const controls=el('div',undefined,root);controls.className='research-controls';
 const searchLabel=el('label','Sök i frågearkivet',controls),search=el('input',undefined,searchLabel);search.type='search';search.placeholder='Sök ord i frågan';
 const category=select('Kategori',controls);option(category,'','Alla åtta kategorier');catalog.questions.forEach(q=>option(category,q.category,q.category));
 const left=select('Första frågan / veckan',controls),right=select('Jämför med',controls);
 const age=select('Åldersgrupp',controls),gender=select('Kön (profiluppgift)',controls),geography=select('Region',controls),municipality=select('Kommun',controls);
 const output=el('div',undefined,root);output.setAttribute('aria-live','polite');
 const download=el('button','Hämta visad jämförelse (JSON)',root);download.type='button';download.disabled=true;
 let entries=[],view=null;
 function populate(){
  const oldLeft=left.value,oldRight=right.value;
  left.replaceChildren();right.replaceChildren();option(right,'','Ingen jämförelse');
  entries.filter(e=>(!category.value||e.item.category===category.value)&&e.item.wording.toLocaleLowerCase('sv').includes(search.value.toLocaleLowerCase('sv'))).forEach(e=>{const label=`${e.release.wave.id} · ${e.item.wording}`;option(left,e.item.id,label);option(right,e.item.id,label);});
  if([...left.options].some(o=>o.value===oldLeft))left.value=oldLeft;if([...right.options].some(o=>o.value===oldRight))right.value=oldRight;
  dimensions();
 }
 function dimensions(){
  const selected=entries.filter(e=>[left.value,right.value].includes(e.item.id));
  for(const [s,k,label] of [[age,'age','Alla åldrar'],[gender,'gender','Alla']]){
   const prev=s.value;s.replaceChildren();option(s,'',label);const values=[...new Set(selected.flatMap(e=>e.item.result.cells.map(c=>c[k])))].sort();values.forEach(v=>option(s,v,k==='geography'?(REGIONS[v]||'Okänd region'):k==='gender'?(GENDERS[v]||v):v));if(values.includes(prev))s.value=prev;
  }
  const previous=geography.value;geography.replaceChildren();option(geography,'','Alla regioner – publicerade grupper');Object.entries(REGIONS).sort((a,b)=>a[1].localeCompare(b[1],'sv')).forEach(([code,name])=>option(geography,code,name));geography.value=previous;
  municipalities();
  render();
 }
 function municipalities(){
  const previous=municipality.value;municipality.replaceChildren();option(municipality,'','Alla kommuner – publicerade grupper');
  Object.entries(MUNICIPALITIES).filter(([,g])=>!geography.value||g.region===geography.value).sort((a,b)=>a[1].name.localeCompare(b[1].name,'sv')).forEach(([code,g])=>option(municipality,code,g.name));
  if([...municipality.options].some(o=>o.value===previous))municipality.value=previous;
 }
 function render(){
  output.replaceChildren();const selected=[left.value,right.value].map(id=>entries.find(e=>e.item.id===id)).filter(Boolean),filters={};
  for(const [s,k] of [[age,'age'],[gender,'gender'],[geography,'region'],[municipality,'municipality']])if(s.value)filters[k]=s.value;
  view={filters,comparisons:[]};download.disabled=!selected.length;
  if(!selected.length){el('p','Inga publicerade frågor matchar sökningen.',output);return;}
  const shown=selected.map(e=>selectCells(e.item.result,filters));
  const comparable=selected.length===2&&!shown.some(r=>r.suppressed)&&selected[0].item.comparison_key===selected[1].item.comparison_key&&selected[0].release.policy.version===selected[1].release.policy.version&&selected[0].release.policy.geography_version===selected[1].release.policy.geography_version&&JSON.stringify(shown[0].municipality_codes)===JSON.stringify(shown[1].municipality_codes);
  if(selected.length===2)el('p',comparable?'Samma fråge- och metodversion och samma publicerade kommuner. Skillnader gäller deltagarna vid respektive mättillfälle.':'Fråga, metod, publicerade kommuner eller tillgängligt underlag skiljer sig. Resultaten ska inte tolkas som en direkt jämförbar tidsserie.',output);
  for(const e of selected){
   const section=el('section',undefined,output),theme=VISUAL_CATEGORIES.find(c=>c.label===e.item.category);if(theme)categoryStyle(section,theme);el('h3',`${e.release.wave.id} · ${e.item.category}`,section);el('p',e.item.wording,section);
   el('p',`Svarstid: ${format(e.release.wave.opens_at)} till ${format(e.release.wave.closes_at)} (sluttid ingår inte).`,section);
   el('p',e.item.sponsor?`Beställare: ${e.item.sponsor}. Redaktionellt godkänd.`:'Ordinarie fråga utan extern beställare.',section);
   for(const notice of e.notices||[])el('p',`Rättelse ${format(notice.created_at)}: ${notice.note}`,section);
   const result=selectCells(e.item.result,filters);
   if(result.suppressed)el('p','Resultatet visas inte: för litet underlag, testdata eller en grupp som inte har publicerats. Inget antal lämnas ut.',section);
   else {
    el('p',`${result.count.toLocaleString('sv-SE')} svar · oviktade resultat`,section);
    if(result.coverage==='published_municipalities_only')el('p',`Omfattar publicerade grupper i ${result.published_municipalities} ${result.published_municipalities===1?'kommun':'kommuner'}. Svar från skyddade kommuner ingår inte i siffrorna.`,section);
    const table=el('table',undefined,section);const head=el('tr',undefined,el('thead',undefined,table));['Svar','Antal','Andel'].forEach(t=>el('th',t,head));const body=el('tbody',undefined,table);
    result.results.forEach(r=>{const tr=el('tr',undefined,body);[r.label,String(r.n),r.percent.toLocaleString('sv-SE',{minimumFractionDigits:1,maximumFractionDigits:1})+' %'].forEach(t=>el('td',t,tr));});
   }
   const details=el('details',undefined,section);el('summary','Metod och källuppgifter',details);el('p',e.release.method.population,details);el('p',e.release.method.nonresponse,details);el('p',e.release.method.verification,details);el('p',`Publicerad ${format(e.release.created_at)} · ${e.release.id} · kontrollsumma ${e.hash}`,details);
   view.comparisons.push({release_id:e.release.id,sha256:e.hash,wave:e.release.wave,question:e.item.wording,version:e.item.version_id,comparison_key:e.item.comparison_key,method:e.release.method,policy:e.release.policy,notices:e.notices||[],result,comparable});
  }
 }
 download.onclick=()=>{if(!view)return;const blob=new Blob([JSON.stringify(view,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download='dinrost-jamforelse.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 search.oninput=populate;category.onchange=populate;left.onchange=dimensions;right.onchange=dimensions;[age,gender,municipality].forEach(s=>s.onchange=render);geography.onchange=()=>{municipalities();render();};
 try{
  let archive,staticArchive=false;
  try{archive=await get('/api/research/archive');}catch{
   const response=await fetch('data/research-releases/index.json');if(!response.ok)throw Error('Archive unavailable');archive=await response.json();staticArchive=true;
  }
  const releases=await Promise.all(archive.releases.map(async r=>{
   if(!/^release-\d{4}-\d{2}-\d{2}$/.test(r.id))throw Error('Invalid release ID');
   const d=staticArchive?await fetch('data/research-releases/'+r.id+'.json').then(r=>{if(!r.ok)throw Error('Missing release');return r.json();}):await get('/api/research/releases/'+encodeURIComponent(r.id));
   if(await digest(JSON.stringify(d.release))!==d.sha256)throw Error('Invalid checksum');
   if(d.release.policy.geography_version&&d.release.policy.geography_version!==GEOGRAPHY_VERSION)throw Error('Unsupported geography version');
   return d;
  }));
  entries=releases.flatMap(d=>d.release.items.map(item=>({item,release:d.release,hash:d.sha256,notices:d.notices})));
  status.textContent=entries.length?'Välj frågor och veckor för att jämföra resultaten.':'Inga granskade veckor har publicerats ännu.';
 }catch{status.textContent='Frågearkivet är inte anslutet ännu. Inga verkliga resultat visas.';}
 populate();
}
main().catch(()=>{root.textContent='Kontrollpanelen kunde inte laddas. Försök igen senare.';});
