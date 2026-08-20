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
const checks = [
  ['20260819240000 crew-conflict guard','create_office_invitation','office_invitation_is_crew'],
  ['20260819250000 purchased office seats','office_seat_usage','workspace_purchased_capacity_units'],
  ['20260819050000 empty-workspace storage seed','reconcile_workspace_storage_usage_v1','where not exists'],
  ['20260818220000 purchased crew seats','crew_seat_usage','workspace_purchased_capacity_units'],
];
for (const [label, fn, needle] of checks) {
  const r = await c.query("select coalesce(string_agg(pg_get_functiondef(p.oid), E'\n'),'') as src, count(*) as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1",[fn]);
  const src = r.rows[0].src || '';
  if (!src) { console.log('NOFUNC   ' + label + '   (' + fn + ')'); continue; }
  console.log((src.toLowerCase().includes(needle.toLowerCase())?'APPLIED  ':'NOT APPL ') + label + '   (' + fn + ')');
}
// how many overage-settlement functions reference a missing table
const r2 = await c.query("select p.proname, pg_get_functiondef(p.oid) as src from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('close_overage_period','claim_overage_settlement','complete_overage_settlement','fail_overage_settlement')");
for (const row of r2.rows) {
  const s = row.src;
  const refs = ['workspace_overage_accruals','workspace_overage_settings'].filter(t=>s.includes(t));
  console.log('  ' + row.proname + ' references missing tables: ' + (refs.length? refs.join(', ') : '(none)'));
}
await c.end();
