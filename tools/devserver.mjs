// Local stand-in for Cloudflare Pages + D1 (28 Oct): serves web/ and routes /api/* to functions/api/*.js
// with an in-memory SQLite (node:sqlite) shaped like the D1 API. For tests only — not deployed.
//   node tools/devserver.mjs [port]      (ADMIN_KEY=test unless set)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'web');
const PORT = +process.argv[2] || 8788;
const sql = new DatabaseSync(':memory:');
const norm = (v) => (typeof v === 'boolean' ? (v ? 1 : 0) : v === undefined ? null : v);
const DB = {
  prepare(q) {
    let args = [];
    const st = {
      bind(...a) { args = a.map(norm); return st; },
      async run() { const r = sql.prepare(q).run(...args); return { success: true, meta: { changes: r.changes } }; },
      async first() { return sql.prepare(q).get(...args) || null; },
      async all() { return { results: sql.prepare(q).all(...args) }; },
    };
    return st;
  },
};
const env = { DB, ADMIN_KEY: process.env.ADMIN_KEY || 'test' };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname.startsWith('/api/')) {
    const name = url.pathname.slice(5).replace(/[^a-z]/g, '');
    const file = path.join(WEB, 'functions', 'api', name + '.js');
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
    const mod = await import(pathToFileURL(file).href);
    const fn = mod['onRequest' + req.method[0] + req.method.slice(1).toLowerCase()];
    if (!fn) { res.writeHead(405); return res.end('method'); }
    const chunks = []; for await (const c of req) chunks.push(c);
    const request = new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
    try {
      const r = await fn({ request, env });
      res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
    } catch (e) { res.writeHead(500); res.end(String(e && e.stack || e)); }
    return;
  }
  let p = path.join(WEB, decodeURIComponent(url.pathname));
  if (p.endsWith('/')) p += 'index.html';
  if (!p.startsWith(WEB) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(PORT, () => console.log('dev server http://localhost:' + PORT));
