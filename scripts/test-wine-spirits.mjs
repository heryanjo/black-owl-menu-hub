import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createLocalDatabase} from './local-server.mjs';
import {handleApi as rawHandleApi} from '../backend.js';
import {authenticatedApi} from './test-auth-helper.mjs';
const handleApi=authenticatedApi(rawHandleApi);
const seed=JSON.parse(await readFile('seed.json','utf8'));
const old=seed.filter(m=>!['Wine','Spirits'].includes(m.category));
const DB=createLocalDatabase();
const get=async menus=>{const r=await handleApi(new Request('https://test.local/api/data'),{DB},menus);assert.equal(r.status,200);return r.json()};
try{
 const before=await get(old);const id=before.menus[0].id;
 const edit=await handleApi(new Request('https://test.local/api/menus/'+id,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({price:123456,note:'Revisi tersimpan sebelum impor'})}),{DB},old);assert.equal(edit.status,200);
 const after=await get(seed);assert.equal(after.menus.find(m=>m.id===id).price,123456);assert.equal(after.updates.length,1);
 assert.equal(after.menus.filter(m=>m.category==='Wine').length,100);assert.equal(after.menus.filter(m=>m.category==='Spirits').length,453);
 for(let outlet=1;outlet<=6;outlet++)for(const category of ['Wine','Spirits'])assert.ok(after.menus.some(m=>m.category===category&&m.outlets.includes(outlet)));
 assert.ok(after.menus.some(m=>m.name==='Glenfiddich 12 — Bottle'&&m.price===2500000));
 assert.ok(after.menus.some(m=>m.name==='Glenfiddich 12 — Glass'&&m.price===215000));
 const again=await get(seed);assert.equal(again.menus.length,after.menus.length);assert.equal(again.updates.length,1);
 console.log('Wine/Spirits upgrade passed: live-database import, 6 outlets, bottle/glass prices, preserved edits/history, no duplicates.');
}finally{DB.close()}
