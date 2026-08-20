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
const r = await c.query("select conrelid::regclass::text as tbl, conname, pg_get_constraintdef(oid) as d from pg_constraint where pg_get_constraintdef(oid) like '%2026-08-15-preview%'");
for (const row of r.rows) console.log('OLD-CATALOG CHECK: ' + row.tbl + '.' + row.conname + ' => ' + row.d.slice(0,160));
const r2 = await c.query("select we.account_id, we.catalog_version, we.plan_code, a.business_name, a.test_marker is not null as is_test from public.workspace_entitlements we join public.accounts a on a.id=we.account_id order by we.catalog_version");
for (const row of r2.rows) console.log('ENT: ' + row.catalog_version + '  plan=' + row.plan_code + '  test=' + row.is_test + '  ' + (row.business_name||'').slice(0,30));
await c.end();
