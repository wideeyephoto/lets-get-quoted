import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
const txt = await readFile('C:/dev/operator-resolution-worktree/.env.local','utf8');
for (const line of txt.split(/\r?\n/)) {
  const t=line.trim(); if(!t||t.startsWith('#'))continue;
  const i=t.indexOf('='); if(i===-1)continue;
  const k=t.slice(0,i).trim(); const v=t.slice(i+1).trim().replace(/^['"]|['"]$/g,'');
  if(k && !process.env[k]) process.env[k]=v;
}
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl:{rejectUnauthorized:false} });
await c.connect();
await c.query('set default_transaction_read_only = on');
const cols = await c.query("select column_name from information_schema.columns where table_schema='public' and table_name='billing_events' order by ordinal_position");
console.log('billing_events cols: ' + cols.rows.map(r=>r.column_name).join(', '));
const r = await c.query("select event_scope, processing_status as status, count(*)::int n, min(received_at) oldest, max(received_at) newest from public.billing_events group by 1,2 order by 1,2");
console.log('\nscope / status / n / oldest / newest');
for (const x of r.rows) console.log('  ' + x.event_scope + ' | ' + x.status + ' | ' + x.n + ' | ' + String(x.oldest).slice(0,24) + ' | ' + String(x.newest).slice(0,24));
await c.end();
