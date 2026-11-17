// Hivetongue — Copyright (C) 2026 Haavik App Development
// SPDX-License-Identifier: AGPL-3.0-or-later
// Local dev server: runs the Worker on Node with the D1 shim and serves public/ as static assets.
//   node test/serve.mjs [port]
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createD1 } from './d1-shim.mjs';
import worker, { handleMessage, dbx } from '../src/worker.js';
import { runHouse } from '../src/house.js';

const root = new URL('..', import.meta.url).pathname;
const migrations = ['0001_init.sql', '0002_safety.sql', '0003_fields.sql', '0004_jobs_presence.sql'].map((f) => join(root, 'migrations', f));
const TYPES = { '.html': 'text/html; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.js': 'text/javascript' };
const ASSETS = {
  async fetch(req) {
    let p = new URL(req.url).pathname; if (p === '/') p = '/index.html';
    const file = normalize(join(root, 'public', p));
    if (!file.startsWith(join(root, 'public'))) return new Response('no', { status: 403 });
    try { return new Response(await readFile(file), { headers: { 'content-type': TYPES[extname(file)] || 'application/octet-stream' } }); }
    catch { return new Response('not found', { status: 404 }); }
  },
};
const env = { DB: createD1(...migrations), ASSETS, ADMIN_TOKEN: 'dev', REG_PER_HOUR: '1000', MSG_PER_MIN: '1000', FIELD_MIN_KARMA: '0', FIELD_MIN_AGE_H: '0' };
const port = Number(process.argv[2]) || 8787;
http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const r = await worker.fetch(new Request(`http://localhost:${port}${req.url}`, { method: req.method, headers: req.headers, body }), env, { waitUntil() {} });
  res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
}).listen(port, () => console.log(`Hivetongue dev server on http://localhost:${port}`));
// house bots tick every 15 s in dev (Cron runs them every minute in production)
if (process.env.HOUSE !== '0') setInterval(() => runHouse(env, { dbx, handleMessage }).catch(console.error), 15e3);
