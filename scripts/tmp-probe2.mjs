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
const tables = ['workspace_overage_authorizations','workspace_overage_settings','workspace_overage_accruals','workspace_overage_accrual_events','workspace_overage_settlements','usage_reservations','usage_credit_lots','voice_calls','office_invitations','office_capabilities','workspace_storage_usage','workspace_purchased_capacity'];
const r1 = await c.query("select table_name from information_schema.tables where table_schema='public' and table_name = any($1)",[tables]);
const have = new Set(r1.rows.map(r=>r.table_name));
for (const t of tables) console.log((have.has(t)?'TABLE OK   ':'TABLE MISS ')+t);
const fns = ['authorize_usage_overage','release_usage_overage','close_overage_period','claim_overage_settlement','complete_overage_settlement','fail_overage_settlement','reconcile_direct_payment','direct_payments_pending_reconciliation','remove_office_user','create_office_invitation','office_seat_usage','reconcile_workspace_storage_usage_v1','grant_voice_minute_allowance','commit_usage_reservation_partial','expire_usage_reservations','release_expired_usage_reservations'];
const r2 = await c.query("select proname, count(*) as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname = any($1) group by 1",[fns]);
const fmap = new Map(r2.rows.map(r=>[r.proname, r.n]));
for (const f of fns) console.log((fmap.has(f)?'FUNC OK  x'+fmap.get(f)+' ':'FUNC MISS   ')+f);
await c.end();
