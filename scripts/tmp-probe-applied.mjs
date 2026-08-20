import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
const txt = await readFile('C:/dev/operator-resolution-worktree/.env.local','utf8');
for (const line of txt.split(/\r?\n/)) {
  const t=line.trim(); if(!t||t.startsWith('#'))continue;
  const i=t.indexOf('='); if(i===-1)continue;
  const k=t.slice(0,i).trim(); const v=t.slice(i+1).trim().replace(/^['"]|['"]$/g,'');
  if(k && !process.env[k]) process.env[k]=v;
}
const probes = [
  ['20260818160000_top_up_projection_shape','function','project_stripe_platform_top_up_event'],
  ['20260818180000_top_up_projection_worker','function','claim_next_due_stripe_platform_top_up_event'],
  ['20260818190000_top_up_purchase_operations','table','billing_top_up_purchase_operations'],
  ['20260818210000_workspace_purchased_capacity','table','workspace_purchased_capacity'],
  ['20260818234500_late_success_settle_reports_moved','function','settle_direct_checkout_late_success_task'],
  ['20260819000000_workspace_storage_usage','table','workspace_storage_usage'],
  ['20260819020000_purchased_capacity_lifecycle','function','apply_purchased_capacity_provider_state'],
  ['20260819030000_ignore_foreign_subscription_event','function','ignore_foreign_stripe_billing_subscription_event'],
  ['20260819080000_usage_overage_authorization','table','workspace_overage_authorizations'],
  ['20260819080000_usage_overage_authorization','table','workspace_overage_settings'],
  ['20260819080000_usage_overage_authorization','function','authorize_usage_overage'],
  ['20260819090100_office_seat_uses_office_role','function','create_office_user_membership_with_seat_entitlement'],
  ['20260819110000_commit_usage_reservation_partial','function','commit_usage_reservation_partial'],
  ['20260819120000_voice_event_inbox','table','voice_events'],
  ['20260819140000_voice_settings','table','voice_settings'],
  ['20260819150000_voice_calls','table','voice_calls'],
  ['20260819190000_voice_minute_allowance','function','grant_voice_minute_allowance'],
  ['20260819210000_office_invitations','table','office_invitations'],
  ['20260819220000_office_capabilities','table','office_capabilities'],
  ['20260819230000_remove_office_user','function','remove_office_user'],
  ['20260819260000_overage_settlement','table','workspace_overage_settlements'],
  ['20260819260000_overage_settlement','function','claim_overage_settlement'],
  ['20260819280000_refund_reconciliation','function','reconcile_direct_payment'],
  ['20260819280000_refund_reconciliation','function','direct_payments_pending_reconciliation'],
  ['20260819290000_overage_accrual_idempotency','table','workspace_overage_accrual_events'],
];
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl:{rejectUnauthorized:false} });
await c.connect();
await c.query('set default_transaction_read_only = on');
for (const [mig, kind, ident] of probes) {
  let present;
  if (kind === 'function') {
    const r = await c.query("select exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1) as e",[ident]);
    present = r.rows[0].e;
  } else {
    const r = await c.query("select exists(select 1 from information_schema.tables where table_schema='public' and table_name=$1) as e",[ident]);
    present = r.rows[0].e;
  }
  console.log((present?'PRESENT ':'ABSENT  ') + mig.padEnd(52) + kind + ' ' + ident);
}
// Source-text probes for the three function-rewrite migrations
const checks = [
  ['20260819290000 idempotency anchor in authorize_usage_overage','authorize_usage_overage','workspace_overage_accrual_events'],
  ['20260819300000 settled guard in release_usage_overage','release_usage_overage','workspace_overage_settlements'],
  ['20260819310000 overlap in authorize_usage_overage','authorize_usage_overage','overlaps'],
  ['20260819050000 empty-workspace storage','reconcile_workspace_storage_usage_v1','left join'],
  ['20260819250000 purchased capacity in office_seat_usage','office_seat_usage','workspace_purchased_capacity'],
  ['20260819240000 crew conflict in create_office_invitation','create_office_invitation','crew'],
];
for (const [label, fn, needle] of checks) {
  const r = await c.query("select coalesce(string_agg(pg_get_functiondef(p.oid), E'\n'),'') as src from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1",[fn]);
  const src = r.rows[0].src || '';
  if (!src) { console.log('NOFUNC  ' + label); continue; }
  console.log((src.toLowerCase().includes(needle.toLowerCase())?'PRESENT ':'ABSENT  ') + label);
}
await c.end();
