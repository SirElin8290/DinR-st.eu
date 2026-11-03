import {onAuthOrigin,authRequest,getAuthStatus} from './auth-client.js';
if(onAuthOrigin()){
 Promise.all([authRequest('/api/auth/me',null,{method:'GET'}),getAuthStatus()]).then(([session,state])=>{
  const slot=document.querySelector('.dashboard-intro .wrap');if(!slot)return;
  const box=document.createElement('div');box.className='account-session';
  const label=document.createElement('span');label.textContent='Inloggad som '+session.user.first_name+' '+session.user.last_name;
  box.append(label);
  for(const [text,path] of [['Logga ut','/api/auth/logout'],['Logga ut på alla enheter','/api/auth/logout-all']]){
   const button=document.createElement('button');button.type='button';button.textContent=text;
   button.addEventListener('click',async()=>{
    button.disabled=true;
    try{await authRequest(path,{}, {csrf:session.csrf_token});location.replace('index.html?mode=login#konto');}
    catch(error){label.textContent=error.message;button.disabled=false;}
   });box.append(button);
  }
  const parent=document.createElement('div');parent.className='wrap';parent.append(box);slot.parentElement.append(parent);
  const badge=document.querySelector('.trust-mini span');if(badge)badge.textContent='E-postverifierad · självrapporterade personuppgifter';
  const header=document.querySelector('.nav .login');if(header){header.textContent='Mitt konto';header.href='#konto';header.addEventListener('click',event=>{event.preventDefault();box.scrollIntoView({block:'center',behavior:'smooth'});});}
 }).catch(error=>{if(error.status!==401){/* Guest statistics remain readable during an auth outage. */}});
}
