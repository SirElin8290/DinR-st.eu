import {CATEGORIES,categoryStyle} from './categories.js';
import {MUNICIPALITIES,REGIONS} from './worker/src/geography.js';
import {parsePersonalNumber} from './worker/src/personal-number.js';

const tiles=document.querySelector('#entryCategories');
for(const category of CATEGORIES){
 const link=document.createElement('a');link.className='entry-category';link.href='dashboard.html#category-'+category.id;categoryStyle(link,category);
 const dot=document.createElement('span');dot.className='category-dot';dot.setAttribute('aria-hidden','true');
 const label=document.createElement('span');label.textContent=category.label;
 const arrow=document.createElement('span');arrow.className='category-arrow';arrow.textContent='↗';arrow.setAttribute('aria-hidden','true');
 link.append(dot,label,arrow);tiles.append(link);
}
const byName=new Map(Object.entries(MUNICIPALITIES).map(([code,g])=>[g.name.toLocaleLowerCase('sv'),{code,...g}]));
const options=document.querySelector('#municipalityOptions');
Object.values(MUNICIPALITIES).sort((a,b)=>a.name.localeCompare(b.name,'sv')).forEach(g=>{const option=document.createElement('option');option.value=g.name;options.append(option);});
const scene=document.querySelector('#konto'),rotor=scene.querySelector('.auth-card-rotor');
const panels=[document.querySelector('#registerPanel'),document.querySelector('#loginPanel')];
const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
let activeFace=0,focusTimer;
function resizeCard(){scene.style.height=panels[activeFace].offsetHeight+'px';}
function activateTab(index,focus=false,updateURL=true){
 clearTimeout(focusTimer);
 if(panels[1-index].contains(document.activeElement))document.activeElement.blur();
 activeFace=index;
 panels.forEach((panel,i)=>{panel.inert=i!==index;panel.setAttribute('aria-hidden',String(i!==index));});
 scene.classList.toggle('is-login',index===1);resizeCard();
 if(updateURL){const url=new URL(location.href);if(index===1)url.searchParams.set('mode','login');else url.searchParams.delete('mode');history.replaceState(null,'',url);}
 if(focus){focusTimer=setTimeout(()=>{document.querySelector(index===1?'#backLoginButton':'#registerTab').focus({preventScroll:true});},motion.matches?0:660);}
}
scene.querySelectorAll('[data-auth-face]').forEach(button=>{
 button.addEventListener('click',()=>activateTab(button.dataset.authFace==='login'?1:0,true));
 button.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();activateTab(event.key==='Home'?0:event.key==='End'?1:1-activeFace,true);}});
});
document.querySelector('.entry-login-shortcut')?.addEventListener('click',event=>{event.preventDefault();activateTab(1,true);scene.scrollIntoView({behavior:motion.matches?'auto':'smooth',block:'start'});});
activateTab(new URLSearchParams(location.search).get('mode')==='login'?1:0,false,false);
scene.classList.add('auth-ready');resizeCard();
const cardObserver=new ResizeObserver(resizeCard);panels.forEach(panel=>cardObserver.observe(panel));
window.addEventListener('resize',resizeCard);

const pnr=document.querySelector('#personalNumber'),pnrError=document.querySelector('#personalError'),age=document.querySelector('#derivedAge'),gender=document.querySelector('#derivedGender');
const feedback=document.querySelector('#registerFeedback');
const messages={format:'Ange personnumret med tolv siffror: ÅÅÅÅMMDD-XXXX.',date:'Personnumret innehåller ett ogiltigt födelsedatum.',future:'Födelsedatumet kan inte ligga i framtiden.',checksum:'Kontrollera personnumrets siffror.',coordination_number:'Samordningsnummer stöds ännu inte i den här förhandsversionen.'};
function updatePersonalNumber(showError=false){
 const info=parsePersonalNumber(pnr.value);
 age.textContent=info.valid?info.age+' år':'Fylls i automatiskt';gender.textContent=info.valid?(info.legalGender==='woman'?'Kvinna':'Man'):'Fylls i automatiskt';
 const error=info.valid?(!info.eligible?'Du behöver vara minst 16 år för att delta.':''):messages[info.code];
 pnr.setCustomValidity(error||'');
 if(showError||info.valid){pnrError.textContent=pnr.value.trim()?error:'';pnr.setAttribute('aria-invalid',String(Boolean(error&&pnr.value.trim())));}
 return info;
}
pnr.addEventListener('input',()=>{pnrError.textContent='';pnr.removeAttribute('aria-invalid');feedback.textContent='';updatePersonalNumber();});pnr.addEventListener('blur',()=>updatePersonalNumber(true));
const municipality=document.querySelector('#homeMunicipality'),municipalityHelp=document.querySelector('#municipalityHelp');
function validateMunicipality(){const row=byName.get(municipality.value.trim().toLocaleLowerCase('sv'));municipality.setCustomValidity(row?'':'Välj en kommun i listan.');municipalityHelp.textContent=row?REGIONS[row.region]+' · Ingen gatuadress behövs.':'Bara din kommun. Vi frågar inte efter din adress.';return row;}
municipality.addEventListener('input',()=>{validateMunicipality();feedback.textContent='';});municipality.addEventListener('change',validateMunicipality);
const registration=document.querySelector('#registrationForm'),login=document.querySelector('#loginForm');
// These views deliberately have no fetch, storage, analytics or submission path.
// Actual registration requires the reviewed server and e-mail verification flow.
registration.addEventListener('submit',e=>e.preventDefault());login.addEventListener('submit',e=>e.preventDefault());
document.querySelector('#registerButton').addEventListener('click',()=>{
 updatePersonalNumber(true);validateMunicipality();
 for(const id of ['givenName','familyName']){const field=document.querySelector('#'+id);field.setCustomValidity(field.value.trim()?'':'Fyll i ditt namn.');}
 if(!registration.reportValidity())return;
 feedback.textContent='Uppgifterna är kontrollerade på den här enheten. Registreringen är inte öppen ännu. Inget konto har skapats och inga uppgifter har skickats eller sparats.';
});
document.querySelector('#loginButton').addEventListener('click',()=>{if(!login.reportValidity())return;document.querySelector('#loginFeedback').textContent='Inloggningen har inte öppnat ännu. Ingen inloggningslänk har skickats och e-postadressen har inte sparats.';});
['givenName','familyName'].forEach(id=>document.querySelector('#'+id).addEventListener('input',e=>e.target.setCustomValidity('')));
document.querySelectorAll('.account-primary').forEach(button=>button.disabled=false);
// Do not retain a filled form in browser back/forward cache.
window.addEventListener('pagehide',()=>{registration.reset();login.reset();});
window.addEventListener('pageshow',event=>{if(event.persisted){registration.reset();login.reset();updatePersonalNumber();}});
