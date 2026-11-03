import {getAuthStatus,authRequest,onAuthOrigin} from './auth-client.js';
// Fragments are not sent to the server. Remove the token from the address bar
// before any user action, and retain it only in this short-lived closure.
let token=new URLSearchParams(location.hash.slice(1)).get('token');
history.replaceState(null,'',location.pathname);
const button=document.querySelector('#confirmLink'),status=document.querySelector('#confirmationStatus');
if(!token||!/^[a-f0-9]{64}$/.test(token)||!onAuthOrigin())status.textContent='Ingen giltig länk hittades. Öppna länken i mejlet eller begär en ny.';
else getAuthStatus().then(state=>{
 if(!state.enabled){status.textContent='Inloggningen har inte öppnat ännu. Försök igen när avsändaren är ansluten.';return;}
 button.disabled=false;status.textContent='Länken gäller i 20 minuter och kan användas en gång.';
}).catch(()=>{status.textContent='Tjänsten kunde inte nås. Öppna mejllänken igen senare.';});
button.addEventListener('click',async()=>{
 button.disabled=true;status.textContent='Bekräftar din länk …';
 try{await authRequest('/api/auth/complete',{token});token=null;location.replace('dashboard.html');}
 catch(error){status.textContent=error.message;}
});
