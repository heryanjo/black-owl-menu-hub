import vm from 'node:vm';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createLocalDatabase} from './local-server.mjs';
import {authenticatedWorker,getTestIdentity} from './test-auth-helper.mjs';

const DB=createLocalDatabase();await getTestIdentity(DB);
const worker=authenticatedWorker((await import('../dist/server/index.js')).default);
const source=(await Promise.all(['app','sheet','access'].map(f=>readFile(`web/${f}.js`,'utf8')))).join('\n');
const nodes=new Map(),events={},requests=[];
function node(selector){if(!nodes.has(selector))nodes.set(selector,{hidden:true,innerHTML:'',textContent:'',value:({'#outlet-filter':'all','#status-filter':'all','#sort-filter':'default'})[selector]||'',checked:false,dataset:{},classList:{add(){},remove(){},toggle(){}},addEventListener(type,fn){this.listeners??={};this.listeners[type]=fn},setAttribute(){},focus(){},select(){},scrollIntoView(){},append(){},scrollTop:0});return nodes.get(selector)}
const location={origin:'https://test.local',href:'https://test.local/#sheet',pathname:'/',search:'',hash:'#sheet'};
class TestFormData{constructor(form){this.values=form.values}get(key){const v=this.values[key];return Array.isArray(v)?v[0]??null:v??null}getAll(key){const v=this.values[key];return Array.isArray(v)?v:v===undefined?[]:[v]}}
const context=vm.createContext({console,Intl,Date,URL,Response,Request,FormData:TestFormData,Blob,Map,Set,setTimeout,clearTimeout,setInterval(fn){events.refresh=fn},IntersectionObserver:class{observe(){}},document:{querySelector:node,querySelectorAll:()=>[],addEventListener(){},body:{style:{}},activeElement:{tagName:'BODY',focus(){}}},location,history:{replaceState(a,b,url){location.hash=url.includes('#')?url.slice(url.indexOf('#')):''}},navigator:{clipboard:{writeText:async()=>{}}},window:{addEventListener(type,fn){events[type]=fn}},fetch:async(p,opts={})=>{requests.push({p,...opts});return worker.fetch(new Request('https://test.local'+p,opts),{DB},{})}});
const run=code=>vm.runInContext(code,context);
vm.runInContext(source,context);await new Promise(r=>setTimeout(r,80));
assert.equal(run('view'),'sheet','deep link opens sheet after authentication');
assert.equal(node('#sheet-panel').hidden,false);
assert.equal((node('#sheet-body').innerHTML.match(/data-sheet-row=/g)||[]).length,50);
assert.ok(node('#sheet-body').innerHTML.includes('class="sheet-photo"'));
assert.ok(node('#sheet-body').innerHTML.includes('<img'));
assert.ok(node('#sheet-body').innerHTML.includes('data-sheet-edit='));
node('#sheet-page-size').listeners.change({target:{value:'100'}});
assert.equal((node('#sheet-body').innerHTML.match(/data-sheet-row=/g)||[]).length,100);
node('#sheet-next').onclick();assert.equal(run('sheetPage'),2);
node('#search').value='Kungpao';node('#search').listeners.input();
assert.equal(run('sheetPage'),1,'changing filters resets pagination');assert.ok(node('#sheet-body').innerHTML.includes('Kungpao'));
node('#search').value='__missing__';run('renderCatalog()');assert.ok(node('#sheet-body').innerHTML.includes('Belum ketemu'));
run("resetFilters();category='Makanan';selectedSubcategory='LUNCH PACKAGE';renderCategories();renderCatalog()");
assert.ok(node('#sheet-body').innerHTML.includes('LUNCH PACKAGE'));assert.ok(!node('#sheet-body').innerHTML.includes('PROMO 888.888'));
run('resetFilters()');
const menu=JSON.parse(run('JSON.stringify(filteredMenus()[0])'));
context.testId=menu.id;run("startSheetEdit(testId,'price')");
assert.equal(node('#search').disabled,true,'draft prevents filter rerenders');
assert.ok(node('#sheet-body').innerHTML.includes('form="sheet-edit-form" name="price"'));
assert.ok(node('#sheet-editor').innerHTML.includes('Catatan perubahan'));
assert.ok(node('#sheet-editor').innerHTML.includes('required'));
const prior=run('JSON.stringify(data)');await events.refresh();assert.equal(run('JSON.stringify(data)'),prior,'background refresh preserves active row');
run("setCatalogView('grid')");assert.equal(run('view'),'sheet','cannot silently discard draft by changing view');
node('#sheet-body').listeners.change({target:{dataset:{sheetField:'category'},value:'Spirits'}});
assert.equal(run('sheetEdit.draft.subcategory'),'');assert.ok(node('#sheet-body [data-sheet-field="subcategory"]').innerHTML.includes('PROMO 888.888'));assert.ok(!node('#sheet-body [data-sheet-field="subcategory"]').innerHTML.includes('LUNCH PACKAGE'));
run('cancelSheetEdit()');assert.equal(node('#search').disabled,false);

// Real API/database writes from the sheet submission handler, then read in Card.
run('startSheetEdit(testId)');
const newPrice=(menu.price||10000)+1234;
const values={...menu,price:String(newPrice),note:'Sheet price test'};
const submit=()=>{context.submission={preventDefault(){},target:{values}};return run('saveSheetRow(submission)')};
await submit();
assert.equal(run('sheetEdit'),null);assert.equal(run('data.menus.find(m=>m.id===testId).price'),newPrice);
const request=requests.filter(r=>r.method==='PATCH').at(-1);const patch=JSON.parse(request.body);
assert.deepEqual(Object.keys(patch).sort(),['note','price','updatedAt']);assert.equal(patch.updatedAt,menu.updatedAt,'optimistic version included');
const update=JSON.parse(run('JSON.stringify(data.updates.find(u=>u.menuId===testId))'));
assert.equal(update.type,'Update harga');assert.ok(update.changes.some(c=>c.field==='price'&&c.before===menu.price&&c.after===newPrice));
assert.equal(node('#revision-banner').hidden,false,'same seven-day revision banner');
node('#search').value=menu.name;run("setCatalogView('grid')");
assert.ok(node('#menu-grid').innerHTML.includes(new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(newPrice)),'sheet edit immediately reflected in Card');

// The existing Card edit handler writes to the same record and appears in Sheet.
context.cardSubmission={preventDefault(){},target:{dataset:{menuId:menu.id},values:{...menu,price:String(newPrice+3000),note:'Card price test',outlets:menu.outlets.map(String)},querySelector(){return node('#card-submit')}}};
await run('saveMenu(cardSubmission)');
run("closeDrawer();setCatalogView('sheet')");
assert.ok(node('#sheet-body').innerHTML.includes(new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(newPrice+3000)),'Card edit reflected in Sheet');

// Failed writes retain the draft and never overwrite a concurrent team edit.
run('startSheetEdit(testId)');
const concurrent=await worker.fetch(new Request('https://test.local/api/menus/'+encodeURIComponent(menu.id),{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({price:newPrice+8000,note:'Concurrent edit'})}),{DB},{});assert.equal(concurrent.status,200);
values.price=String(newPrice+5000);await submit();
assert.ok(run('sheetEdit')!==null);assert.ok(node('#sheet-error').textContent.includes('baru saja diubah'));assert.equal(node('#sheet-reload').hidden,false);assert.equal(node('#sheet-save').disabled,false);
const fresh=await (await worker.fetch(new Request('https://test.local/api/data'),{DB},{})).json();assert.equal(fresh.menus.find(m=>m.id===menu.id).price,newPrice+8000);
await node('#sheet-reload').onclick();assert.equal(run('sheetEdit'),null);assert.equal(run('data.menus.find(m=>m.id===testId).price'),newPrice+8000);
run('startSheetEdit(testId)');values.price=String(newPrice+9000);values.note='';await submit();assert.ok(node('#sheet-error').textContent.includes('catatan'));run('cancelSheetEdit()');

run("applyUser({id:'viewer',email:'viewer@example.test',name:'Viewer',role:'viewer'});renderCatalog()");
assert.ok(!node('#sheet-body').innerHTML.includes('data-sheet-edit='));assert.ok(!node('#sheet-body').innerHTML.includes('data-edit='));assert.ok(node('#sheet-body').innerHTML.includes('class="sheet-photo"'));run('startSheetEdit(testId)');assert.equal(run('sheetEdit'),null);
run('showLogin()');assert.equal(node('#sheet-body').innerHTML,'');assert.equal(node('#sheet-editor').innerHTML,'');assert.equal(node('#sheet-panel').hidden,true);
DB.close();
console.log('Sheet checks passed: deep link, mini photos, dense pagination, scoped filters/subcategories, inline editing, two-way Card synchronization, price history/banner, draft protection, conflicts, viewer access and logout.');
