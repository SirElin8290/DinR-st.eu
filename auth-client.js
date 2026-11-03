import {AUTH_ORIGIN} from './public-config.js';
export const onAuthOrigin=()=>location.origin===new URL(AUTH_ORIGIN).origin;
export async function getAuthStatus(){
 const local=['127.0.0.1','localhost'].includes(location.hostname);
 const url=(onAuthOrigin()||local?'':AUTH_ORIGIN)+'/api/auth/status';
 const response=await fetch(url,{credentials:'omit',signal:AbortSignal.timeout(5000)});
 if(!response.ok)throw Error('Inloggningen kunde inte kontrolleras.');return response.json();
}
export function openSecureAccount(mode='register'){
 const url=new URL('/',AUTH_ORIGIN);if(mode==='login')url.searchParams.set('mode','login');url.hash='konto';location.assign(url);
}
export async function authRequest(path,data,{csrf,method='POST'}={}){
 if(!onAuthOrigin())throw Error('Öppna den säkra inloggningssidan först.');
 if(!path.startsWith('/api/'))throw Error('Invalid API path');
 const response=await fetch(path,{method,credentials:'same-origin',referrerPolicy:'no-referrer',headers:{...(method!=='GET'?{'content-type':'application/json'}:{}),...(csrf?{'x-csrf-token':csrf}:{})},...(method!=='GET'?{body:JSON.stringify(data||{})}:{}),signal:AbortSignal.timeout(15000)});
 let result;try{result=await response.json();}catch{throw Error('Tjänsten svarade inte som väntat. Försök igen.');}
 if(!response.ok){const error=new Error(result.error||'Försök igen senare.');error.status=response.status;throw error;}return result;
}
