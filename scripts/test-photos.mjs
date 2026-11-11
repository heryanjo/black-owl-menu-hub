import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createLocalDatabase} from './local-server.mjs';
import {handleApi as rawHandleApi} from '../backend.js';
import {authenticatedApi} from './test-auth-helper.mjs';
const handleApi=authenticatedApi(rawHandleApi);
import rawWorker from '../dist/server/index.js';
import {authenticatedWorker} from './test-auth-helper.mjs';
const worker=authenticatedWorker(rawWorker);
const old=JSON.parse(await readFile('data/sources/pre-photo-seed.json','utf8'));
const next=JSON.parse(await readFile('seed.json','utf8'));
const DB=createLocalDatabase();
const req=(p,method='GET',body)=>new Request('https://test.local'+p,{method,headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
try{
 await handleApi(req('/api/data'),{DB},old);
 const mapped=next.filter(m=>m.image.startsWith('/photos/'));
 const custom=mapped[0],edited=mapped[1];
 assert.equal((await handleApi(req('/api/menus/'+custom.id,'PATCH',{image:'https://example.com/my-own-photo.jpg',note:'Foto milik tim'}),{DB},old)).status,200);
 assert.equal((await handleApi(req('/api/menus/'+edited.id,'PATCH',{price:edited.price+1000,description:'Revisi tim tetap tersimpan',note:'Revisi tim'}),{DB},old)).status,200);
 const result=await worker.fetch(req('/api/data'),{DB},{});assert.equal(result.status,200);
 const data=await result.json();assert.equal(data.menus.length,old.length);assert.equal(data.updates.length,2);
 assert.equal(data.menus.find(m=>m.id===custom.id).image,'https://example.com/my-own-photo.jpg');
 const retained=data.menus.find(m=>m.id===edited.id);assert.equal(retained.image,edited.image);assert.equal(retained.price,edited.price+1000);assert.equal(retained.description,'Revisi tim tetap tersimpan');
 assert.ok(data.menus.filter(m=>m.image.startsWith('/photos/')).length>=800);
 for(const m of mapped){const r=await worker.fetch(req(m.image),{DB},{});assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/webp');const b=new Uint8Array(await r.arrayBuffer());assert.equal(new TextDecoder().decode(b.slice(0,4)),'RIFF');assert.ok(b.length>100);}
 const repeated=await (await worker.fetch(req('/api/data'),{DB},{})).json();assert.equal(repeated.updates.length,2);assert.equal(repeated.menus.find(m=>m.id===custom.id).image,'https://example.com/my-own-photo.jpg');
 assert.ok(data.menus.some(m=>m.photoCredit?.kind==='product-reference'));
 console.log('Photo upgrade passed: all imported photos served as valid WebP, idempotent backfill, custom photos preserved, prices/descriptions/history unchanged.');
}finally{DB.close()}
