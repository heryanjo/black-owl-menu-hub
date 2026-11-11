import {readFile,writeFile} from 'node:fs/promises';
const seed=JSON.parse(await readFile('seed.json','utf8'));
const subcategories=JSON.parse(await readFile('data/subcategories.json','utf8'));
const css=await readFile('web/style.css','utf8'),js=(await readFile('web/app.js','utf8'))+'\n'+(await readFile('web/sheet.js','utf8'))+'\n'+(await readFile('web/access.js','utf8'));
let html=await readFile('web/index.html','utf8');
const data={subcategories,menus:seed.map(m=>({...m,updatedAt:'2026-10-27T00:00:00.000Z'})),updates:[],outlets:['Pantai Indah Kapuk','Kelapa Gading','Gading Serpong','Surabaya','Medan','SCBD'].map((name,i)=>({id:i+1,name}))};
const adapter=`<script>
// Standalone preview only. Production uses the shared server database.
const previewData=${JSON.stringify(data).replace(/</g,'\\u003c')};
window.fetch=async function(path,options={}){
 const input=options.body?JSON.parse(options.body):{};
 const response=(d,s=200)=>Promise.resolve(new Response(JSON.stringify(d),{status:s,headers:{'content-type':'application/json'}}));
 if(path==='/api/auth/me')return response({user:{id:'preview',email:'preview@example.test',name:'Pratinjau',role:'superadmin'}});
 if(path==='/api/auth/logout')return response({ok:true});
 if(path==='/api/admin/members')return response({members:[]});
 if(path==='/api/data')return response(previewData);
 if(path==='/api/outlets'){previewData.outlets=input.outlets;return response({outlets:input.outlets})}
 if(path.startsWith('/api/menus')){
 const id=path.split('/')[3],old=previewData.menus.find(m=>m.id===id),next={...(old||{}),...input,id:old?.id||crypto.randomUUID(),updatedAt:new Date().toISOString()};delete next.note;
 const fields=['name','category','subcategory','description','price','image','status','outlets'];const changes=fields.filter(k=>JSON.stringify(old?.[k])!==JSON.stringify(next[k])).map(field=>({field,before:old?.[field]??null,after:next[field]}));
 if(!changes.length)return response({error:'Belum ada perubahan pada menu.'},400);
 if(old)previewData.menus[previewData.menus.indexOf(old)]=next;else previewData.menus.unshift(next);
 previewData.updates.unshift({id:crypto.randomUUID(),menuId:next.id,menuName:next.name,type:!old?'Menu baru':changes.some(c=>c.field==='price')?'Update harga':'Perubahan menu',note:input.note,changes,createdAt:next.updatedAt,outlets:next.outlets});
 return response({menu:next});}
 return response({error:'Endpoint tidak ditemukan'},404);
};
</script>`;
html=html.replace('<link rel="stylesheet" href="/style.css">',`<style>${css}\n.preview-label{position:fixed;z-index:15;bottom:12px;right:12px;padding:9px 13px;background:#fff8e9;border:1px solid #e5c990;border-radius:8px;font:10px var(--font);color:#8b6829;box-shadow:0 4px 15px #17201c15;max-width:270px;line-height:1.5}</style>`).replace('<script src="/app.js"></script>',()=>adapter+'<script>'+js.replace(/<\/script/gi,'<\\/script')+'</script>').replace('</body>','<div class="preview-label">PRATINJAU LOKAL · Perubahan hanya simulasi dan hilang saat halaman dimuat ulang. Jalankan server untuk database bersama.</div></body>');
await writeFile('../../blackowl-menu-preview.html',html);
console.log('Wrote /workspace/blackowl-menu-preview.html');
