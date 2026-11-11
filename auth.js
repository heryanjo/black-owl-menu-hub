const SESSION_COOKIE = 'blackowl_session';
const SESSION_MS = 8 * 60 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const PIN_ROUNDS = 100000;
function authJson(body, status = 200, headers = {}) { return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers } }); }
function authFail(message, status = 400) { const e = new Error(message); e.status = status; throw e; }
function emailValue(value) { if (typeof value !== 'string' || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) authFail('Masukkan alamat email yang valid.'); return value.trim().toLowerCase(); }
function pinValue(value) { if (typeof value !== 'string' || !/^\d{4,12}$/.test(value)) authFail('PIN harus berisi 4–12 angka.'); return value; }
function b64(bytes) { return btoa(String.fromCharCode(...bytes)); }
function unb64(value) { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }
export async function pinDigest(pin, salt) { const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']); return b64(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: unb64(salt), iterations: PIN_ROUNDS, hash: 'SHA-256' }, key, 256))); }
async function secretHash(value) { return b64(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))); }
function sameHash(a, b) { let difference = a.length ^ b.length; for (let i = 0; i < Math.max(a.length,b.length); i++) difference |= (a.charCodeAt(i)||0) ^ (b.charCodeAt(i)||0); return difference === 0; }
function newSalt() { return b64(crypto.getRandomValues(new Uint8Array(16))); }
function publicMember(row) { return { id: row.id, email: row.email, name: row.display_name, role: row.role, active: !!row.active, createdAt: row.created_at, updatedAt: row.updated_at }; }
function cookieHeader(request, value, maxAge) { return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${new URL(request.url).protocol==='https:'?'; Secure':''}`; }
function sessionToken(request) { const value = request.headers.get('cookie')?.split(';').map(c=>c.trim()).find(c=>c.startsWith(SESSION_COOKIE+'='))?.slice(SESSION_COOKIE.length+1); return value && /^[a-f0-9]{64}$/.test(value) ? value : null; }
function authOrigin(request) { const origin=request.headers.get('origin'); if ((origin && origin!==new URL(request.url).origin) || request.headers.get('sec-fetch-site')==='cross-site') authFail('Permintaan dari website lain tidak diizinkan.',403); }
async function authBody(request) { if(!request.headers.get('content-type')?.includes('application/json'))authFail('Gunakan format JSON.',415);const text=await request.text();if(text.length>10000)authFail('Data terlalu besar.',413);try{const value=JSON.parse(text);if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value;}catch{authFail('Data tidak valid.');} }
async function bootstrapAdmin(env) {
 if(await env.DB.prepare("SELECT value FROM metadata WHERE key = 'admin_bootstrap_v1'").first())return;
 if(!env.BOOTSTRAP_ADMIN_EMAIL || !env.BOOTSTRAP_PIN_HASH || !env.BOOTSTRAP_PIN_SALT)authFail('Login sedang disiapkan. Coba lagi sebentar.',503);
 const email=emailValue(env.BOOTSTRAP_ADMIN_EMAIL),now=new Date().toISOString();
 await env.DB.batch([
  env.DB.prepare("INSERT OR IGNORE INTO admin_members (id,email,display_name,role,pin_hash,pin_salt,active,auth_version,created_at,updated_at) VALUES (?,?,?,'superadmin',?,?,1,1,?,?)").bind(crypto.randomUUID(),email,'Heryan',env.BOOTSTRAP_PIN_HASH,env.BOOTSTRAP_PIN_SALT,now,now),
  env.DB.prepare("INSERT OR IGNORE INTO metadata (key,value) VALUES ('admin_bootstrap_v1',?)").bind(now)
 ]);
}
export async function getAuthMember(request, env) {
 if(!env.DB)return null;
 const token=sessionToken(request);if(!token)return null;
 const hash=await secretHash(token);
 const row=await env.DB.prepare('SELECT m.* FROM admin_members m JOIN admin_sessions s ON s.member_id=m.id WHERE s.token_hash=? AND s.expires_at>? AND s.auth_version=m.auth_version AND m.active=1').bind(hash,Date.now()).first();
 return row?publicMember(row):null;
}
export async function requireAuthMember(request,env,roles) { const member=await getAuthMember(request,env);if(!member)authFail('Silakan masuk dengan email dan PIN.',401);if(roles&&!roles.includes(member.role))authFail('Akun Anda tidak memiliki izin untuk tindakan ini.',403);return member; }
async function rateKeys(request,email) { const ip=request.headers.get('cf-connecting-ip')||'unknown';return ['email:'+await secretHash(email),'ip:'+await secretHash(ip)]; }
async function checkRate(db,keys) { const now=Date.now();for(let i=0;i<keys.length;i++){const r=await db.prepare('SELECT attempts,window_start FROM auth_attempts WHERE key=?').bind(keys[i]).first();if(r&&r.window_start>now-LOCK_MS&&r.attempts>=(i===0?5:30))authFail('Terlalu banyak percobaan. Coba lagi dalam 15 menit.',429);} }
async function failedAttempt(db,keys) {const now=Date.now();await db.batch(keys.map(key=>db.prepare('INSERT INTO auth_attempts (key,attempts,window_start) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN window_start<? THEN 1 ELSE attempts+1 END,window_start=CASE WHEN window_start<? THEN ? ELSE window_start END').bind(key,now,now-LOCK_MS,now-LOCK_MS,now)));}
async function createSession(db,request,row) { const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');const hash=await secretHash(token),now=Date.now();await db.batch([db.prepare('DELETE FROM admin_sessions WHERE expires_at<?').bind(now),db.prepare('INSERT INTO admin_sessions (token_hash,member_id,auth_version,created_at,expires_at) VALUES (?,?,?,?,?)').bind(hash,row.id,row.auth_version,now,now+SESSION_MS)]);return cookieHeader(request,token,SESSION_MS/1000); }
async function login(request,env) {
 const body=await authBody(request),email=emailValue(body.email);const pin=typeof body.pin==='string'&&body.pin.length<=12?body.pin:'';
 await env.DB.prepare('DELETE FROM auth_attempts WHERE window_start<?').bind(Date.now()-24*60*60*1000).run();
 const keys=await rateKeys(request,email);await checkRate(env.DB,keys);
 const row=await env.DB.prepare('SELECT * FROM admin_members WHERE email=?').bind(email).first();
 const salt=row?.pin_salt||b64(new Uint8Array(16));const hash=await pinDigest(pin,salt);
 if(!row||!row.active||!sameHash(hash,row.pin_hash)){await failedAttempt(env.DB,keys);authFail('Email atau PIN tidak sesuai, atau akun belum aktif.',401);}
 await env.DB.prepare('DELETE FROM auth_attempts WHERE key=?').bind(keys[0]).run();
 return authJson({user:publicMember(row)},200,{'set-cookie':await createSession(env.DB,request,row)});
}
async function listMembers(db) { const rows=await db.prepare('SELECT id,email,display_name,role,active,created_at,updated_at FROM admin_members ORDER BY created_at,email').all();return authJson({members:rows.results.map(publicMember)}); }
function memberInput(body,partial=false) {const clean={};if(!partial||'email' in body)clean.email=emailValue(body.email);if(!partial||'name' in body){if(typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>100)authFail('Nama anggota harus berisi 1–100 karakter.');clean.name=body.name.trim();}if(!partial||'role' in body){if(!['superadmin','editor','viewer'].includes(body.role))authFail('Peran anggota tidak valid.');clean.role=body.role;}if('active' in body){if(typeof body.active!=='boolean')authFail('Status anggota tidak valid.');clean.active=body.active?1:0;}if(!partial||body.pin)clean.pin=pinValue(body.pin);return clean;}
async function addMember(request,db) { const clean=memberInput(await authBody(request));const salt=newSalt(),hash=await pinDigest(clean.pin,salt),now=new Date().toISOString();if(await db.prepare('SELECT id FROM admin_members WHERE email=?').bind(clean.email).first())authFail('Email ini sudah terdaftar.',409);const id=crypto.randomUUID();try{await db.prepare('INSERT INTO admin_members (id,email,display_name,role,pin_hash,pin_salt,active,auth_version,created_at,updated_at) VALUES (?,?,?,?,?,?,1,1,?,?)').bind(id,clean.email,clean.name,clean.role,hash,salt,now,now).run();}catch(e){if(String(e.message).includes('UNIQUE'))authFail('Email ini sudah terdaftar.',409);throw e;}return authJson({member:publicMember({id,email:clean.email,display_name:clean.name,role:clean.role,active:1,created_at:now})},201); }
async function editMember(request,db,id,actor) {
 const current=await db.prepare('SELECT * FROM admin_members WHERE id=?').bind(id).first();if(!current)authFail('Anggota tidak ditemukan.',404);
 const body=await authBody(request);if(body.updatedAt&&body.updatedAt!==current.updated_at)authFail('Akses anggota baru saja berubah. Muat ulang dan coba lagi.',409);
 const input=memberInput(body,true),next={...current,email:input.email??current.email,display_name:input.name??current.display_name,role:input.role??current.role,active:input.active??current.active};
 if(actor.id===id&&(next.email!==current.email||next.role!==current.role||!next.active))authFail('Email, peran, dan status akun Anda sendiri tidak dapat diubah di sini.');
 if(next.email!==current.email&&await db.prepare('SELECT id FROM admin_members WHERE email=? AND id<>?').bind(next.email,id).first())authFail('Email ini sudah terdaftar.',409);
 const salt=input.pin?newSalt():current.pin_salt,hash=input.pin?await pinDigest(input.pin,salt):current.pin_hash;
 const revoke=!!input.pin||next.email!==current.email||next.role!==current.role||next.active!==current.active;
 const changedAt=new Date(Math.max(Date.now(),Date.parse(current.updated_at)+1)).toISOString();
 const result=await db.batch([
  db.prepare("UPDATE admin_members SET email=?,display_name=?,role=?,active=?,pin_hash=?,pin_salt=?,auth_version=auth_version+?,updated_at=? WHERE id=? AND auth_version=? AND updated_at=? AND (role<>'superadmin' OR (?='superadmin' AND ?=1) OR (SELECT COUNT(*) FROM admin_members WHERE role='superadmin' AND active=1)>1)").bind(next.email,next.display_name,next.role,next.active,hash,salt,revoke?1:0,changedAt,id,current.auth_version,current.updated_at,next.role,next.active),
  ...(revoke?[db.prepare('DELETE FROM admin_sessions WHERE member_id=? AND EXISTS (SELECT 1 FROM admin_members WHERE id=? AND auth_version>?)').bind(id,id,current.auth_version)]:[])
 ]);
 if(!result[0].meta.changes)authFail('Perubahan ditolak. Pertahankan minimal satu superadmin aktif, lalu muat ulang dan coba lagi.',409);
 next.updated_at=changedAt;return authJson({member:publicMember(next),requiresLogin:revoke&&actor.id===id});
}
export async function handleAuth(request,env) {
 const path=new URL(request.url).pathname;if(!path.startsWith('/api/auth/')&&!path.startsWith('/api/admin/'))return null;
 try{
  if(!env.DB)authFail('Database belum terhubung.',503);
  if(!['GET','HEAD'].includes(request.method))authOrigin(request);
  await bootstrapAdmin(env);
  if(path==='/api/auth/me'&&request.method==='GET')return authJson({user:await getAuthMember(request,env)});
  if(path==='/api/auth/login'&&request.method==='POST')return await login(request,env);
  if(path==='/api/auth/logout'&&request.method==='POST'){const token=sessionToken(request);if(token)await env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash=?').bind(await secretHash(token)).run();return authJson({ok:true},200,{'set-cookie':cookieHeader(request,'',0)});}
  const actor=await requireAuthMember(request,env,['superadmin']);
  if(path==='/api/admin/members'&&request.method==='GET')return await listMembers(env.DB);
  if(path==='/api/admin/members'&&request.method==='POST')return await addMember(request,env.DB);
  const match=path.match(/^\/api\/admin\/members\/([a-f0-9-]{36})$/);if(match&&request.method==='PATCH')return await editMember(request,env.DB,match[1],actor);
  return authJson({error:'Alamat tidak ditemukan.'},404);
 }catch(e){if(!e.status)console.error('Access control failure:',e.message);return authJson({error:e.status?e.message:'Data akses belum dapat diproses.'},e.status||500,e.status===429?{'retry-after':'900'}:{});}
}
