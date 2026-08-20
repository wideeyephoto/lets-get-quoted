import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
const txt = await readFile('C:/dev/operator-resolution-worktree/.env.local','utf8');
for (const line of txt.split(/\r?\n/)) {
  const t=line.trim(); if(!t||t.startsWith('#'))continue;
  const i=t.indexOf('='); if(i===-1)continue;
  const k=t.slice(0,i).trim(); const v=t.slice(i+1).trim().replace(/^['"]|['"]$/g,'');
  if(k && !process.env[k]) process.env[k]=v;
}
const names = (await readFile('C:/Users/brett/AppData/Local/Temp/rpcs.txt','utf8')).split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl:{rejectUnauthorized:false} });
await c.connect();
await c.query('set default_transaction_read_only = on');
const r = await c.query("select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname = any($1)",[names]);
const have = new Set(r.rows.map(x=>x.proname));
const missing = names.filter(n=>!have.has(n));
console.log('CALLED FROM src/ BUT ABSENT IN DB (' + missing.length + '):');
for (const m of missing) console.log('  ' + m);
await c.end();
