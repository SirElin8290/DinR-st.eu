import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
const env={APP_ORIGIN:'https://accounts.example',FRONTEND_ORIGIN:'https://sirelin8290.github.io',AUTH_ENABLED:'false',REGISTRATION_ENABLED:'false',MAIL_PROVIDER:'disabled',RESEARCH_COLLECTION_ENABLED:'false',PRIVACY_VERSION:'account-v1-draft'};
test('production wrapper keeps registration closed and allows only public cross-origin status',async()=>{
 const status=await worker.fetch(new Request(env.APP_ORIGIN+'/api/auth/status',{headers:{origin:env.FRONTEND_ORIGIN}}),env,{});
 assert.equal(status.status,200);assert.equal(status.headers.get('access-control-allow-origin'),env.FRONTEND_ORIGIN);assert.equal(status.headers.get('access-control-allow-credentials'),null);assert.equal((await status.json()).enabled,false);
 const post=origin=>worker.fetch(new Request(env.APP_ORIGIN+'/api/auth/register',{method:'POST',headers:{origin,'content-type':'application/json'},body:'{}'}),env,{});
 assert.equal((await post(env.APP_ORIGIN)).status,503);assert.equal((await post('https://evil.example')).status,403);
 assert.equal((await worker.fetch(new Request(env.APP_ORIGIN+'/api/auth/me',{headers:{origin:env.FRONTEND_ORIGIN}}),env,{})).headers.get('access-control-allow-origin'),null);
});
test('mock authentication is gone and empty session/CSRF values cannot authorize mutations',async()=>{
 assert.equal((await worker.fetch(new Request(env.APP_ORIGIN+'/api/auth/mock'),env,{})).status,410);
 const result=await worker.fetch(new Request(env.APP_ORIGIN+'/api/research/erase',{method:'POST',headers:{origin:env.APP_ORIGIN,'content-type':'application/json'},body:'{}'}),env,{});
 assert.equal(result.status,403);assert.equal(result.headers.get('cache-control'),'no-store');assert.match(result.headers.get('content-security-policy'),/form-action 'none'/);assert.equal(result.headers.get('referrer-policy'),'no-referrer');
});
