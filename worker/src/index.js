import {researchAPI} from './research.js';
import {auth,authReadiness} from './auth.js';
import {MUNICIPALITIES} from './geography.js';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
function headers(req,env,response){
 const h=new Headers(response.headers),origin=req.headers.get('origin');
 const own=new URL(env.APP_ORIGIN).origin;
 const publicRead=req.method==='GET'&&(new URL(req.url).pathname==='/api/auth/status'||new URL(req.url).pathname.startsWith('/api/research/'));
 if(origin===own||(publicRead&&origin===env.FRONTEND_ORIGIN))h.set('access-control-allow-origin',origin);
 if(origin===own){h.set('access-control-allow-credentials','true');h.set('access-control-allow-methods','GET,POST,OPTIONS');h.set('access-control-allow-headers','content-type,x-csrf-token');}
 h.set('vary','Origin');h.set('x-content-type-options','nosniff');h.set('referrer-policy','no-referrer');h.set('permissions-policy','camera=(), microphone=(), geolocation=()');h.set('x-frame-options','DENY');
 h.set('strict-transport-security','max-age=31536000');
 h.set('content-security-policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://dinrost-api.soren-johansson-7.workers.dev; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
 if(new URL(req.url).pathname.startsWith('/api/')||new URL(req.url).pathname==='/complete.html')h.set('cache-control','no-store');
 return new Response(response.body,{status:response.status,headers:h});
}
async function consent(req,env){
 if(env.RESEARCH_COLLECTION_ENABLED!=='true')return json({error:'Deltagandet är inte öppet ännu.'},503);
 if(req.method!=='POST'||req.headers.get('origin')!==new URL(env.APP_ORIGIN).origin||!await auth.validCSRF(req,env))return json({error:'Otillåten begäran.'},403);
 const s=await auth.getSession(req,env);if(!s)return json({error:'Du behöver logga in.'},401);
 const text=await req.text();if(text.length>1024)return json({error:'För stor begäran.'},413);
 const d=JSON.parse(text);if(d.accepted!==true||!env.OPINION_CONSENT_VERSION||d.version!==env.OPINION_CONSENT_VERSION)return json({error:'Aktuellt uttryckligt samtycke krävs.'},400);
 const p=s.profile,geo=MUNICIPALITIES[p.municipality_code];
 await env.DB.prepare("INSERT INTO research_participants(user_id,verification,age_band,gender,municipality_code,region_code,geography_source,recruitment,consent_version,consented_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET verification=excluded.verification,age_band=excluded.age_band,gender=excluded.gender,municipality_code=excluded.municipality_code,region_code=excluded.region_code,geography_source=excluded.geography_source,consent_version=excluded.consent_version,consented_at=excluded.consented_at,withdrawn_at=NULL").bind(s.user_id,'email_verified',s.age_band,p.legal_gender,p.municipality_code,geo.region,'self_reported','unknown',env.OPINION_CONSENT_VERSION,new Date().toISOString()).run();
 return json({ok:true});
}
export default {
 async fetch(req,env,ctx){
  let response;const path=new URL(req.url).pathname;
  try{
   if(req.method==='OPTIONS')response=new Response(null,{status:204});
   else if(path==='/api/health')response=json({ok:true,auth_enabled:authReadiness(env).enabled,research_collection:env.RESEARCH_COLLECTION_ENABLED==='true'});
   else if(path==='/api/auth/mock')response=json({error:'Mock authentication removed'},410);
   else if(path.startsWith('/api/auth/'))response=await auth.handle(req,env,ctx);
   else if(path==='/api/research/consent')response=await consent(req,env);
   else if(path.startsWith('/api/research/')){
    if(req.method!=='GET'&&(req.headers.get('origin')!==new URL(env.APP_ORIGIN).origin||!await auth.validCSRF(req,env)))response=json({error:'Ladda om sidan och försök igen.'},403);
    else response=await researchAPI(req,env,(r,e)=>auth.getSession(r,e));
   }
   else if(path.startsWith('/api/'))response=json({error:'Not found'},404);
   else response=env.ASSETS?await env.ASSETS.fetch(req):json({error:'Not found'},404);
  }catch{response=json({error:'Tjänsten är tillfälligt otillgänglig. Försök igen senare.'},503);}
  return headers(req,env,response);
 },
 async scheduled(event,env,ctx){ctx.waitUntil(auth.maintain(env));}
};
