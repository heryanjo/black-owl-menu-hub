import {pinDigest,handleAuth} from '../auth.js';
const fixtures=new WeakMap();
export async function getTestIdentity(DB){
 if(!fixtures.has(DB))fixtures.set(DB,(async()=>{
  const pin='583921',salt=Buffer.from('fixture-salt-123').toString('base64');
  const env={DB,BOOTSTRAP_ADMIN_EMAIL:'owner@example.test',BOOTSTRAP_PIN_SALT:salt,BOOTSTRAP_PIN_HASH:await pinDigest(pin,salt)};
  const r=await handleAuth(new Request('https://test.local/api/auth/login',{method:'POST',headers:{'content-type':'application/json',origin:'https://test.local'},body:JSON.stringify({email:env.BOOTSTRAP_ADMIN_EMAIL,pin})}),env);
  if(r.status!==200)throw Error('Test auth bootstrap failed: '+r.status+' '+await r.text());
  return {env,cookie:r.headers.get('set-cookie').split(';')[0]};
 })());
 return fixtures.get(DB);
}
export function authenticatedApi(handler){return async(request,env,seed)=>{const identity=await getTestIdentity(env.DB);const headers=new Headers(request.headers);headers.set('cookie',identity.cookie);return handler(new Request(request,{headers}),{...identity.env,...env},seed)}}
export function authenticatedWorker(worker){return {async fetch(request,env,ctx){if(!env.DB)return worker.fetch(request,env,ctx);const identity=await getTestIdentity(env.DB);const headers=new Headers(request.headers);headers.set('cookie',identity.cookie);return worker.fetch(new Request(request,{headers}),{...identity.env,...env},ctx)}}}
