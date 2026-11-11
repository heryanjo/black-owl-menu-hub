import {subcategoryCatalog,subcategoryBackfill} from './taxonomy.js';
import {handleAuth, requireAuthMember} from './auth.js';
const STATUSES = ['Aktif', 'Dalam revisi', 'Update harga', 'Tidak tersedia'];
const FIELDS = ['name', 'category', 'subcategory', 'description', 'price', 'image', 'status', 'outlets'];
const LABELS = { name: 'Nama menu', category: 'Kategori', subcategory: 'Subkategori', description: 'Deskripsi', price: 'Harga', image: 'Foto', status: 'Status', outlets: 'Outlet' };

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
}
function problem(message, status = 400) { const e = new Error(message); e.status = status; throw e; }
function safeParse(value, fallback) { try { return JSON.parse(value); } catch { return fallback; } }
function menuFromRow(row) {
  return { id: row.id, name: row.name, category: row.category, subcategory: row.subcategory || '', description: row.description, price: row.price, image: row.image, status: row.status, outlets: safeParse(row.outlets, []), updatedAt: row.updated_at, photoCredit: typeof photoCredits !== 'undefined' ? photoCredits[row.image] || null : null };
}
function updateFromRow(row) {
  return { id: row.id, menuId: row.menu_id, menuName: row.menu_name, type: row.type, note: row.note, changes: safeParse(row.changes, []), createdAt: row.created_at, outlets: safeParse(row.outlets, []) };
}
function validateText(value, label, min, max) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) problem(`${label} harus berisi ${min}–${max} karakter.`);
  return value.trim();
}
function validImage(value) {
  if (value === '') return '';
  const str = validateText(value, 'URL foto', 1, 2000);
  if (/^\/(?!\/)[^\s\\]*$/.test(str)) return str;
  try { const url = new URL(str); if (url.protocol === 'https:' && !url.username && !url.password) return url.href; } catch {}
  problem('Foto harus menggunakan URL HTTPS atau lokasi gambar di website ini.');
}
function validateMenu(input, partial = false) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) problem('Data menu tidak valid.');
  for (const key of Object.keys(input)) if (![...FIELDS, 'note', 'updatedAt'].includes(key)) problem(`Kolom ${key} tidak dikenali.`);
  const clean = {};
  for (const field of FIELDS) {
    if (!(field in input)) {
      if (partial) continue;
      if (field === 'subcategory') clean.subcategory = '';
      else if (field === 'subcategory') clean.subcategory = validateText(value ?? '', 'Subkategori', 0, 120);
    else if (field === 'description') clean.description = '';
      else if (field === 'image') clean.image = '';
      else if (field === 'status') clean.status = 'Aktif';
      else if (field === 'price') clean.price = null;
      else if (field === 'outlets') clean.outlets = [1, 2, 3, 4, 5, 6];
      else problem(`${LABELS[field]} wajib diisi.`);
      continue;
    }
    const value = input[field];
    if (field === 'name' || field === 'category') clean[field] = validateText(value, LABELS[field], 1, field === 'name' ? 160 : 80);
    else if (field === 'subcategory') clean.subcategory = validateText(value ?? '', 'Subkategori', 0, 120);
    else if (field === 'description') clean.description = validateText(value, 'Deskripsi', 0, 2500);
    else if (field === 'price') {
      if (value !== null && (!Number.isSafeInteger(value) || value < 0 || value > 1000000000)) problem('Harga harus berupa angka rupiah positif atau kosong.');
      clean.price = value;
    } else if (field === 'status') {
      if (!STATUSES.includes(value)) problem('Status menu tidak valid.');
      clean.status = value;
    } else if (field === 'image') clean.image = validImage(value);
    else if (field === 'outlets') {
      if (!Array.isArray(value) || !value.length || value.some(id => !Number.isInteger(id) || id < 1 || id > 6)) problem('Pilih minimal satu dari 6 outlet.');
      clean.outlets = [...new Set(value)].sort((a, b) => a - b);
    }
  }
  return clean;
}
function validateSubcategory(category,value) {
  if (!value) return '';
  const found=(subcategoryCatalog[category] || []).find(v=>v.toLowerCase()===value.toLowerCase());
  if (!found) problem('Subkategori tidak sesuai dengan kategori utama yang dipilih.');
  return found;
}
async function completeSourceSubcategories(db) {
  const key='subcategories_import_2026_10_28_v1';
  if(await db.prepare('SELECT value FROM metadata WHERE key=?').bind(key).first())return;
  const result=await db.prepare('SELECT id,name,category,subcategory FROM menus').all();
  const rows=new Map(result.results.map(r=>[r.id,r]));const statements=[];
  for(const item of subcategoryBackfill){
    const row=rows.get(item.id);
    if(!row || row.subcategory || row.name!==item.name || row.category!==item.category)continue;
    if(!(subcategoryCatalog[row.category]||[]).includes(item.subcategory))continue;
    statements.push(db.prepare("UPDATE menus SET subcategory=? WHERE id=? AND name=? AND category=? AND subcategory=''").bind(item.subcategory,item.id,item.name,item.category));
  }
  for(let i=0;i<statements.length;i+=50)await db.batch(statements.slice(i,i+50));
  await db.prepare('INSERT OR IGNORE INTO metadata (key,value) VALUES (?,?)').bind(key,new Date().toISOString()).run();
}
async function readBody(request) {
  if (!request.headers.get('content-type')?.includes('application/json')) problem('Gunakan format JSON.', 415);
  const body = await request.text();
  if (body.length > 20000) problem('Data terlalu besar.', 413);
  try { return JSON.parse(body); } catch { problem('Data JSON tidak valid.'); }
}
function guardWrite(request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) problem('Permintaan dari website lain tidak diizinkan.', 403);
  if (request.headers.get('sec-fetch-site') === 'cross-site') problem('Permintaan dari website lain tidak diizinkan.', 403);
}
async function seedDatabase(db, seedMenus, importKey = 'initial_menu_import_v1') {
  if (!seedMenus.length) return;
  const seeded = await db.prepare('SELECT value FROM metadata WHERE key = ?').bind(importKey).first();
  if (seeded) return;
  const now = new Date().toISOString();
  const statements = [];
  const outletNames = ['Pantai Indah Kapuk', 'Kelapa Gading', 'Gading Serpong', 'Surabaya', 'Medan', 'SCBD'];
  for (let id = 1; id <= 6; id++) statements.push(db.prepare('INSERT OR IGNORE INTO outlets (id, name) VALUES (?, ?)').bind(id, outletNames[id - 1]));
  for (const item of seedMenus || []) {
    const clean = validateMenu(Object.fromEntries(FIELDS.filter(key => key in item).map(key => [key, item[key]])));
    const id = typeof item.id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(item.id) ? item.id : crypto.randomUUID();
    statements.push(db.prepare('INSERT OR IGNORE INTO menus (id, name, category, subcategory, description, price, image, status, outlets, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, clean.name, clean.category, clean.subcategory, clean.description, clean.price, clean.image, clean.status, JSON.stringify(clean.outlets), now));
  }
  for (let i = 0; i < statements.length; i += 50) await db.batch(statements.slice(i, i + 50));
  await db.prepare('INSERT OR IGNORE INTO metadata (key, value) VALUES (?, ?)').bind(importKey, now).run();
}
async function completeSourcePhotos(db) {
  if (typeof photoBackfill === 'undefined' || !photoBackfill.length) return;
  const key = 'verified_photos_2026_10_28_v1';
  if (await db.prepare('SELECT value FROM metadata WHERE key = ?').bind(key).first()) return;
  const current = await db.prepare('SELECT id, name, image FROM menus').all();
  const rows = new Map(current.results.map(row => [row.id, row]));
  const statements = [];
  for (const item of photoBackfill) {
    const row = rows.get(item.id);
    if (!row || row.name !== item.name || row.image === item.image || (row.image && row.image !== item.oldImage)) continue;
    statements.push(db.prepare('UPDATE menus SET image = ? WHERE id = ? AND image = ? AND name = ?').bind(item.image, item.id, row.image, row.name));
  }
  for (let i = 0; i < statements.length; i += 50) await db.batch(statements.slice(i, i + 50));
  await db.prepare('INSERT OR IGNORE INTO metadata (key, value) VALUES (?, ?)').bind(key, new Date().toISOString()).run();
}
async function getData(db) {
  const [menus, updates, outlets] = await db.batch([
    db.prepare('SELECT * FROM menus ORDER BY name COLLATE NOCASE'),
    db.prepare('SELECT * FROM updates ORDER BY created_at DESC'),
    db.prepare('SELECT * FROM outlets ORDER BY id'),
  ]);
  return json({ menus: menus.results.map(menuFromRow), updates: updates.results.map(updateFromRow), outlets: outlets.results, subcategories: subcategoryCatalog });
}
async function createMenu(request, db) {
  const input = await readBody(request);
  const clean = validateMenu(input);
  clean.subcategory = validateSubcategory(clean.category,clean.subcategory);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const note = input.note === undefined ? 'Menu baru ditambahkan ke database.' : validateText(input.note, 'Catatan', 0, 1500);
  const changes = FIELDS.map(field => ({ field, label: LABELS[field], before: null, after: clean[field] }));
  await db.batch([
    db.prepare('INSERT INTO menus (id, name, category, subcategory, description, price, image, status, outlets, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, clean.name, clean.category, clean.subcategory, clean.description, clean.price, clean.image, clean.status, JSON.stringify(clean.outlets), now),
    db.prepare('INSERT INTO updates (id, menu_id, menu_name, type, note, changes, created_at, outlets) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), id, clean.name, 'Menu baru', note, JSON.stringify(changes), now, JSON.stringify(clean.outlets)),
  ]);
  return json({ menu: { id, ...clean, updatedAt: now } }, 201);
}
async function patchMenu(request, db, id) {
  const row = await db.prepare('SELECT * FROM menus WHERE id = ?').bind(id).first();
  if (!row) problem('Menu tidak ditemukan.', 404);
  const current = menuFromRow(row);
  const input = await readBody(request);
  if (input.updatedAt !== undefined && input.updatedAt !== current.updatedAt) problem('Menu baru saja diubah. Muat ulang lalu coba lagi.', 409);
  const clean = validateMenu(input, true);
  if(clean.category && clean.category!==current.category && !('subcategory' in clean))clean.subcategory='';
  if('subcategory' in clean)clean.subcategory=validateSubcategory(clean.category||current.category,clean.subcategory);
  const changes = Object.keys(clean).filter(field => JSON.stringify(clean[field]) !== JSON.stringify(current[field])).map(field => ({ field, label: LABELS[field], before: current[field], after: clean[field] }));
  if (!changes.length) problem('Belum ada perubahan pada menu.');
  const next = { ...current, ...clean };
  const now = new Date(Math.max(Date.now(), new Date(current.updatedAt).getTime() + 1)).toISOString();
  const type = changes.some(c => c.field === 'price') ? 'Update harga' : next.status === 'Dalam revisi' ? 'Revisi menu' : 'Perubahan menu';
  const note = input.note === undefined ? changes.map(c => c.label).join(', ') + ' diperbarui.' : validateText(input.note, 'Catatan', 0, 1500);
  const result = await db.batch([
    db.prepare('UPDATE menus SET name = ?, category = ?, subcategory = ?, description = ?, price = ?, image = ?, status = ?, outlets = ?, updated_at = ? WHERE id = ? AND updated_at = ?').bind(next.name, next.category, next.subcategory, next.description, next.price, next.image, next.status, JSON.stringify(next.outlets), now, id, current.updatedAt),
    db.prepare('INSERT INTO updates (id, menu_id, menu_name, type, note, changes, created_at, outlets) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE changes() > 0').bind(crypto.randomUUID(), id, next.name, type, note, JSON.stringify(changes), now, JSON.stringify(next.outlets)),
  ]);
  if (!result[0].meta.changes) problem('Menu baru saja diubah. Muat ulang lalu coba lagi.', 409);
  return json({ menu: { ...next, updatedAt: now } });
}
async function updateOutlets(request, db) {
  const input = await readBody(request);
  if (!input || !Array.isArray(input.outlets) || input.outlets.length !== 6) problem('Data harus memuat 6 outlet.');
  const names = input.outlets.map(outlet => {
    if (!outlet || !Number.isInteger(outlet.id) || outlet.id < 1 || outlet.id > 6) problem('ID outlet tidak valid.');
    return { id: outlet.id, name: validateText(outlet.name, 'Nama outlet', 1, 80) };
  });
  if (new Set(names.map(o => o.id)).size !== 6) problem('ID outlet harus unik.');
  if (new Set(names.map(o => o.name.toLowerCase())).size !== 6) problem('Nama outlet harus berbeda.');
  await db.batch(names.map(outlet => db.prepare('UPDATE outlets SET name = ? WHERE id = ?').bind(outlet.name, outlet.id)));
  return json({ outlets: names.sort((a, b) => a.id - b.id) });
}
export async function handleApi(request, env, seedMenus = []) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) return null;
  try {
    const authResponse = await handleAuth(request, env);
    if (authResponse) return authResponse;
    if (!env.DB) problem('Database belum terhubung. Silakan coba lagi setelah deployment selesai.', 503);
    await requireAuthMember(request,env,['GET','HEAD'].includes(request.method)?null:['superadmin','editor']);
    if (!['GET', 'HEAD'].includes(request.method)) guardWrite(request);
    await seedDatabase(env.DB, seedMenus.filter(m => !['Wine', 'Spirits'].includes(m.category)));
    await seedDatabase(env.DB, seedMenus.filter(m => ['Wine', 'Spirits'].includes(m.category)), 'wine_spirits_import_v1');
    await completeSourcePhotos(env.DB);
    await completeSourceSubcategories(env.DB);
    if (url.pathname === '/api/data' && request.method === 'GET') return await getData(env.DB);
    if (url.pathname === '/api/menus' && request.method === 'POST') return await createMenu(request, env.DB);
    const match = url.pathname.match(/^\/api\/menus\/([a-zA-Z0-9_-]{1,100})$/);
    if (match && request.method === 'PATCH') return await patchMenu(request, env.DB, match[1]);
    if (url.pathname === '/api/outlets' && request.method === 'PUT') return await updateOutlets(request, env.DB);
    return json({ error: 'Alamat API tidak ditemukan.' }, 404);
  } catch (error) {
    if (!error.status) console.error('Menu API failure:', error.message);
    return json({ error: error.status ? error.message : 'Data belum dapat diproses. Silakan coba lagi.' }, error.status || 500);
  }
}
