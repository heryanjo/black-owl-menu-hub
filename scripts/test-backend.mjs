import assert from 'node:assert/strict';
import { handleApi as rawHandleApi } from '../backend.js';
import {authenticatedApi} from './test-auth-helper.mjs';
const handleApi=authenticatedApi(rawHandleApi);
import { createLocalDatabase } from './local-server.mjs';
const DB = createLocalDatabase();
const seed = [{ id:'initial-menu', name:'Menu Awal', category:'Makanan', price:65000, description:'Deskripsi', status:'Aktif', image:'https://menu.blackowl.id/photo.jpg', outlets:[1,2] }];
const call = async (path, method='GET', payload, headers={}) => {
 const request = new Request('https://test.local'+path, { method, headers:{ 'content-type':'application/json',origin:'https://test.local',...headers }, ...(payload===undefined?{}:{body:JSON.stringify(payload)}) });
 const response=await handleApi(request,{DB},seed);return {status:response.status,body:await response.json()};
};
try {
 let result=await call('/api/data'); assert.equal(result.status,200);assert.equal(result.body.menus.length,1);assert.equal(result.body.updates.length,0);assert.deepEqual(result.body.outlets.map(o=>o.name),['Pantai Indah Kapuk','Kelapa Gading','Gading Serpong','Surabaya','Medan','SCBD']);
 const original=result.body.menus[0];
 result=await call('/api/menus/initial-menu','PATCH',{price:75000,status:'Update harga',note:'Harga berubah',updatedAt:original.updatedAt});assert.equal(result.status,200);const changed=result.body.menu;
 result=await call('/api/data');assert.equal(result.body.updates.length,1);assert.equal(result.body.updates[0].type,'Update harga');assert.deepEqual(result.body.updates[0].changes.find(c=>c.field==='price'),{field:'price',label:'Harga',before:65000,after:75000});
 result=await call('/api/menus/initial-menu','PATCH',{price:85000,updatedAt:original.updatedAt});assert.equal(result.status,409);
 result=await call('/api/menus/initial-menu','PATCH',{price:75000,updatedAt:changed.updatedAt});assert.equal(result.status,400);
 result=await call('/api/menus/initial-menu','PATCH',{image:'javascript:alert(1)'});assert.equal(result.status,400);
 result=await call('/api/menus/initial-menu','PATCH',{price:-1});assert.equal(result.status,400);
 result=await call('/api/menus/initial-menu','PATCH',{outlets:[7]});assert.equal(result.status,400);
 result=await call('/api/menus/initial-menu','PATCH',{price:85000},{origin:'https://evil.local'});assert.equal(result.status,403);
 result=await call('/api/menus','POST',{name:'Minuman Baru',category:'Minuman',price:null,outlets:[6],note:'Racikan baru'});assert.equal(result.status,201);assert.equal(result.body.menu.price,null);const addedId=result.body.menu.id;
 result=await call('/api/data');assert.equal(result.body.menus.length,2);assert.equal(result.body.updates.length,2);assert.equal(result.body.updates.find(u=>u.menuId===addedId).type,'Menu baru');
 const names=result.body.outlets.map(o=>({...o,name:o.name==='SCBD'?'SCBD Jakarta':o.name}));result=await call('/api/outlets','PUT',{outlets:names});assert.equal(result.status,200);assert.equal(result.body.outlets[5].name,'SCBD Jakarta');
 result=await call('/api/menus/missing','PATCH',{price:10000});assert.equal(result.status,404);
 result=await call('/api/data');assert.equal(result.body.updates.length,2);assert.equal(result.body.menus.find(m=>m.id==='initial-menu').price,75000);
 console.log('Backend checks passed: idempotent seed, real outlet names, price history, conflict detection, no-op rejection, URL/price/outlet validation, origin guard, new menu, nullable price, outlet rename, and missing menu.');
} finally { DB.close(); }
