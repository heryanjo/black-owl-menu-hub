import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const src=await readFile(new URL('../dist/server/index.js',import.meta.url),'utf8');
const worker=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
assert.equal(typeof worker.default.fetch,'function');
for(const [p,type] of [['/','text/html'],['/style.css','text/css'],['/app.js','text/javascript']]){
 const r=await worker.default.fetch(new Request('https://test.local'+p),{},{});
 assert.equal(r.status,200);assert.ok(r.headers.get('content-type').startsWith(type));
}
assert.equal((await worker.default.fetch(new Request('https://test.local/missing'),{},{})).status,404);
assert.equal((await worker.default.fetch(new Request('https://test.local/api/data'),{},{})).status,503);
console.log('Worker validation passed: pages, assets, missing route, and database connection error.');
