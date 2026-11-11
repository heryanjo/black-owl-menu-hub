import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createLocalDatabase} from './local-server.mjs';
import {handleApi as rawHandleApi} from '../backend.js';
import {authenticatedApi,getTestIdentity,authenticatedWorker} from './test-auth-helper.mjs';
import rawWorker from '../dist/server/index.js';
import {subcategoryCatalog} from '../taxonomy.js';
const handleApi=authenticatedApi(rawHandleApi),worker=authenticatedWorker(rawWorker);
const seed=JSON.parse(await readFile('seed.json','utf8'));
const DB=createLocalDatabase();
const request=(path,method='GET',body)=>new Request('https://test.local'+path,{method,headers:{'content-type':'application/json',origin:'https://test.local'},...(body?{body:JSON.stringify(body)}:{})});
async function call(path,method='GET',body){const response=await handleApi(request(path,method,body),{DB},seed);return {status:response.status,body:await response.json()}}
try{
 await getTestIdentity(DB);
 // Simulate the previously deployed database, without subcategories.
 for(let i=0;i<seed.length;i+=50)await DB.batch(seed.slice(i,i+50).map(m=>DB.prepare('INSERT INTO menus (id,name,category,description,price,image,status,outlets,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(m.id,m.name,m.category,m.description,m.price,m.image,m.status,JSON.stringify(m.outlets),'2026-10-28T00:00:00.000Z')));
 for(const key of ['initial_menu_import_v1','wine_spirits_import_v1','verified_photos_2026_10_28_v1'])await DB.prepare('INSERT INTO metadata (key,value) VALUES (?,?)').bind(key,'test-existing-import').run();
 const lunch=seed.find(m=>m.category==='Makanan'&&m.subcategory==='LUNCH PACKAGE');assert.ok(lunch);
 const renamed=seed.find(m=>m.category==='Minuman');
 await DB.prepare("UPDATE menus SET subcategory='KIDS MENU',price=123456,description='Revisi tim',image='https://example.test/foto-tim.jpg' WHERE id=?").bind(lunch.id).run();
 await DB.prepare("UPDATE menus SET name='Menu baru milik tim' WHERE id=?").bind(renamed.id).run();
 const upgrade=await worker.fetch(request('/api/data'),{DB},{});assert.equal(upgrade.status,200);let data=await upgrade.json();assert.equal(data.menus.length,932);assert.equal(data.updates.length,0);
 const kept=data.menus.find(m=>m.id===lunch.id);assert.equal(kept.subcategory,'KIDS MENU');assert.equal(kept.price,123456);assert.equal(kept.description,'Revisi tim');assert.equal(kept.image,'https://example.test/foto-tim.jpg');assert.equal(data.menus.find(m=>m.id===renamed.id).subcategory,'');
 for(const m of seed)assert.ok(!m.subcategory||subcategoryCatalog[m.category].includes(m.subcategory));
 assert.ok(data.subcategories.Makanan.includes('LUNCH PACKAGE'));assert.ok(!data.subcategories.Makanan.includes('COFFEE'));assert.ok(!data.subcategories.Makanan.includes('PROMO 888.888'));
 assert.ok(data.subcategories.Spirits.includes('PROMO 888.888'));assert.ok(data.subcategories.Spirits.includes('PROMO 988.888'));assert.ok(!data.subcategories.Spirits.includes('LUNCH PACKAGE'));
 assert.ok(data.menus.some(m=>m.category==='Spirits'&&m.price===888888&&m.subcategory==='PROMO 888.888'));
 assert.ok(data.menus.some(m=>m.category==='Spirits'&&m.price===988888&&m.subcategory==='PROMO 988.888'));
 let result=await call('/api/menus','POST',{name:'Menu tanpa subkategori',category:'Makanan',outlets:[1]});assert.equal(result.status,201);assert.equal(result.body.menu.subcategory,'');const id=result.body.menu.id;
 result=await call('/api/menus/'+id,'PATCH',{subcategory:'LUNCH PACKAGE',note:'Masuk paket makan siang'});assert.equal(result.status,200);assert.equal(result.body.menu.subcategory,'LUNCH PACKAGE');
 data=(await call('/api/data')).body;assert.deepEqual(data.updates[0].changes.find(c=>c.field==='subcategory'),{field:'subcategory',label:'Subkategori',before:'',after:'LUNCH PACKAGE'});
 assert.equal((await call('/api/menus/'+id,'PATCH',{subcategory:'COFFEE'})).status,400);
 assert.equal((await call('/api/menus/'+id,'PATCH',{category:'Spirits',subcategory:'LUNCH PACKAGE'})).status,400);
 result=await call('/api/menus/'+id,'PATCH',{subcategory:''});assert.equal(result.status,200);assert.equal(result.body.menu.subcategory,'');
 await call('/api/menus/'+id,'PATCH',{subcategory:'LUNCH PACKAGE'});
 result=await call('/api/menus/'+id,'PATCH',{category:'Wine'});assert.equal(result.status,200);assert.equal(result.body.menu.subcategory,'');
 result=await call('/api/menus/'+id,'PATCH',{subcategory:'RED WINE'});assert.equal(result.status,200);assert.equal(result.body.menu.subcategory,'RED WINE');
 assert.equal((await call('/api/menus','POST',{name:'Salah kategori',category:'Makanan',subcategory:'PROMO 888.888'})).status,400);
 result=await call('/api/menus','POST',{name:'Pilihan Spirits',category:'Spirits',subcategory:'PROMO 888.888'});assert.equal(result.status,201);
 result=await call('/api/menus','POST',{name:'Pilihan Minuman',category:'Minuman',subcategory:'COFFEE'});assert.equal(result.status,201);
 result=await call('/api/menus','POST',{name:'Kosong eksplisit',category:'Minuman',subcategory:null});assert.equal(result.status,201);assert.equal(result.body.menu.subcategory,'');
 await call('/api/menus/'+lunch.id,'PATCH',{subcategory:'',note:'Tanpa kelompok'});
 data=(await call('/api/data')).body;assert.equal(data.menus.find(m=>m.id===lunch.id).subcategory,'','explicitly cleared source subcategory must not be reimported');
 console.log('Subcategory tests passed: source groups, correct promo tiers, existing database backfill, preserved edits, scoped validation, optional/cleared values, category-switch reset and permanent history.');
}finally{DB.close()}
