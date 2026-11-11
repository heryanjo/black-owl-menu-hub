import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Adapter keeps the same prepared statement and transactional batch semantics as D1.
export function createLocalDatabase(filename = ':memory:') {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const sqlite = new DatabaseSync(filename);
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec('CREATE TABLE IF NOT EXISTS _local_migrations (name TEXT PRIMARY KEY)');
  for (const migration of ['0000_menu_hub','0001_member_access','0002_menu_subcategory']) {
  const applied = sqlite.prepare('SELECT name FROM _local_migrations WHERE name = ?').get(migration);
  if (!applied) {
    sqlite.exec('BEGIN');
    try {
      sqlite.exec(readFileSync(resolve(root, 'drizzle/'+migration+'.sql'), 'utf8'));
      sqlite.prepare('INSERT INTO _local_migrations (name) VALUES (?)').run(migration);
      sqlite.exec('COMMIT');
    } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  }
  }
  function prepare(sql, values = []) {
    return {
      bind(...args) { return prepare(sql, args); },
      async first() { return sqlite.prepare(sql).get(...values) ?? null; },
      async all() { return { results: sqlite.prepare(sql).all(...values), success: true, meta: { changes: 0 } }; },
      async run() {
        const stmt = sqlite.prepare(sql);
        if (stmt.columns().length) return { results: stmt.all(...values), success: true, meta: { changes: 0 } };
        const result = stmt.run(...values);
        return { results: [], success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
      },
    };
  }
  let pending = Promise.resolve();
  return {
    prepare,
    batch(statements) {
      const operation = pending.then(async () => {
        sqlite.exec('BEGIN');
        try {
          const results = [];
          for (const stmt of statements) results.push(await stmt.run());
          sqlite.exec('COMMIT');
          return results;
        } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
      });
      pending = operation.catch(() => {});
      return operation;
    },
    close() { sqlite.close(); },
    sqlite,
  };
}

export async function startServer({ port = Number(process.env.PORT || 4173), filename = resolve(root, '.sites-runtime/menu.sqlite') } = {}) {
  const DB = createLocalDatabase(filename);
  let worker;
  try { worker = (await import(pathToFileURL(resolve(root, 'dist/server/index.js')).href)).default; }
  catch (error) { DB.close(); throw new Error('Build the site first with npm run build. ' + error.message); }
  const server = createServer(async (req, res) => {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const request = new Request(`http://${req.headers.host || `127.0.0.1:${port}`}${req.url}`, { method: req.method, headers: req.headers, ...(req.method !== 'GET' && req.method !== 'HEAD' ? { body: Buffer.concat(chunks) } : {}) });
      const response = await worker.fetch(request, { DB, BOOTSTRAP_ADMIN_EMAIL: process.env.BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_PIN_HASH: process.env.BOOTSTRAP_PIN_HASH, BOOTSTRAP_PIN_SALT: process.env.BOOTSTRAP_PIN_SALT }, { waitUntil(promise) { promise.catch(console.error); } });
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) { console.error(error); res.writeHead(500, { 'content-type': 'text/plain' }); res.end('Server error'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  console.log(`Black Owl Menu Hub: http://127.0.0.1:${port}`);
  const close = () => server.close(() => { DB.close(); process.exit(0); });
  process.once('SIGINT', close); process.once('SIGTERM', close);
  return { server, DB };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await startServer();
