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
async function enumHas(typ, val) {
  const r = await c.query("select exists(select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname=$1 and e.enumlabel=$2) as e",[typ,val]);
  return r.rows[0].e;
}
console.log('20260819090000 member_role office        : ' + (await enumHas('member_role','office') ? 'APPLIED':'NOT APPLIED'));
console.log('20260819130000 lead_source ai_voice      : ' + (await enumHas('lead_source','ai_voice') ? 'APPLIED':'NOT APPLIED'));
// catalog version constraints
const r = await c.query("select count(*)::int as n from pg_constraint where pg_get_constraintdef(oid) like '%2026-08-18-preview%'");
console.log('20260818120000 catalog 2026-08-18 checks : ' + r.rows[0].n + ' constraints');
const r0 = await c.query("select count(*)::int as n from pg_constraint where pg_get_constraintdef(oid) like '%2026-08-15-preview%'");
console.log('   remaining 2026-08-15-preview checks   : ' + r0.rows[0].n);
// entitlement rows still on old catalog
const r2 = await c.query("select catalog_version, count(*)::int as n from public.workspace_entitlements group by 1 order by 1");
console.log('20260819040000 workspace_entitlements catalog_version:');
for (const row of r2.rows) console.log('   ' + row.catalog_version + '  x' + row.n);
// webhook source ai_voice
const r3 = await c.query("select conname, pg_get_constraintdef(oid) as d from pg_constraint where conname like '%source%' and pg_get_constraintdef(oid) like '%ai_voice%'");
console.log('20260819100000 ai_voice in a source CHECK: ' + (r3.rowCount ? 'APPLIED ('+r3.rows.map(x=>x.conname).join(', ')+')' : 'NOT APPLIED'));
// truncate revoked on voice_settings
const r4 = await c.query("select grantee, privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='voice_settings' and privilege_type='TRUNCATE' and grantee in ('anon','authenticated')");
console.log('20260819160000 TRUNCATE on voice_settings for browser roles: ' + (r4.rowCount ? 'STILL GRANTED to '+r4.rows.map(x=>x.grantee).join(',') : 'revoked'));
const r5 = await c.query("select count(*)::int as n from information_schema.role_table_grants where table_schema='public' and privilege_type='TRUNCATE' and grantee in ('anon','authenticated')");
console.log('20260819170000 TRUNCATE grants to browser roles across public: ' + r5.rows[0].n);
// grace may still collect
const r6 = await c.query("select coalesce(string_agg(pg_get_functiondef(p.oid), E'\n'),'') as src from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'prepare_one_off_direct_invoice_payment%'");
console.log("20260819070000 grace collects (src mentions 'grace'): " + (r6.rows[0].src.includes("'grace'") ? 'APPLIED' : 'NOT APPLIED'));
await c.end();
