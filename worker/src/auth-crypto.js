const encoder=new TextEncoder(),decoder=new TextDecoder();
export const randomToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
export async function hash(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))),v=>v.toString(16).padStart(2,'0')).join('');}
export async function keyedHash(key,value){
 if(typeof key!=='string'||key.length<64)throw Error('Missing authentication key');
 const k=await crypto.subtle.importKey('raw',encoder.encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',k,encoder.encode(value))),v=>v.toString(16).padStart(2,'0')).join('');
}
async function encryptionKey(secret){
 if(!/^[a-f0-9]{64}$/.test(secret||''))throw Error('Missing encryption key');
 return crypto.subtle.importKey('raw',Uint8Array.from(secret.match(/../g).map(v=>parseInt(v,16))),'AES-GCM',false,['encrypt','decrypt']);
}
export async function encrypt(secret,purpose,value){
 const iv=crypto.getRandomValues(new Uint8Array(12)),key=await encryptionKey(secret);
 const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(purpose)},key,encoder.encode(JSON.stringify(value))));
 return 'v1.'+btoa(String.fromCharCode(...iv))+'.'+btoa(String.fromCharCode(...ciphertext));
}
export async function decrypt(secret,purpose,value){
 const [version,iv,data]=String(value).split('.');if(version!=='v1'||!iv||!data)throw Error('Invalid encrypted record');
 const plaintext=await crypto.subtle.decrypt({name:'AES-GCM',iv:Uint8Array.from(atob(iv),c=>c.charCodeAt(0)),additionalData:encoder.encode(purpose)},await encryptionKey(secret),Uint8Array.from(atob(data),c=>c.charCodeAt(0)));
 return JSON.parse(decoder.decode(plaintext));
}
export function constantTimeEqual(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let result=0;for(let i=0;i<a.length;i++)result|=a.charCodeAt(i)^b.charCodeAt(i);return result===0;}
