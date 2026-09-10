import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const dir of [
  join(REPO, 'node_modules/@embedded-postgres/windows-x64/native/bin'),
  join(REPO, 'node_modules/@embedded-postgres/linux-x64/native/bin'),
  join(REPO, 'node_modules/@embedded-postgres/darwin-arm64/native/bin'),
]) {
  process.env.PATH = `${dir}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`;
}

let EmbeddedPostgres;
try {
  ({ default: EmbeddedPostgres } = await import('embedded-postgres'));
} catch {
  console.error('embedded-postgres is not installed.');
  process.exit(2);
}

const m = (n) => readFileSync(join(REPO, 'migrations', n), 'utf8').replace(/\r\n/g, '\n');

const R = [];
const ck = (n, ok, d) => R.push({ n, ok: Boolean(ok), d });

const dataDir = mkdtempSync(join(tmpdir(), 'lgq-pg17-migration-rehearsal-'));
const pg = new EmbeddedPostgres({
  databaseDir: dataDir, user: 'postgres', password: 'postgres',
  port: Number(process.env.LGQ_REHEARSAL_PORT || 54364),
  persistent: false, onLog: () => {}, onError: () => {},
});

let c;
try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('lgq_rehearsal');
  c = pg.getPgClient('lgq_rehearsal');
  await c.connect();
  const q = (sql, params) => c.query(sql, params);
  const fails = async (sql, params) => {
    try { await q(sql, params); return null; } catch (e) { return e.message ?? String(e); }
  };

  // Setup prerequisites
  await q(`
    create extension if not exists pgcrypto;
    do $roles$ begin
      if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
      if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
    end $roles$;
    create schema if not exists storage;
    create table if not exists storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table public.accounts (id uuid primary key);
    create function public.is_owner(p uuid) returns boolean
      language sql stable as $o$ select false $o$;
    create table public.workspace_overage_settings (
      account_id uuid primary key references public.accounts(id) on delete cascade,
      enabled boolean not null default false,
      cap_cents bigint
    );
    create table public.workspace_overage_accruals (
      account_id uuid not null references public.accounts(id) on delete cascade,
      period_start timestamptz not null,
      period_end timestamptz not null,
      resource_code text not null,
      units bigint not null default 0,
      millicents bigint not null default 0,
      first_accrued_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (account_id, period_start, resource_code)
    );
    create table public.merchandise_order_quotes (id uuid primary key, account_id uuid, expires_at timestamptz, proof_id uuid, card_count int, subtotal_cents int, shipping_cost_cents int, total_cents int, wholesale_cost_cents int, platform_fee_cents int);
    create table public.merchandise_card_proofs (id uuid primary key, account_id uuid, is_approved boolean, preflight_passed boolean, approval_hash text, approved_at timestamptz);
    create table public.merchandise_orders (id uuid primary key, account_id uuid, order_number text, proof_id uuid, quote_id uuid, status text, payment_status text, fulfillment_status text, items jsonb, subtotal numeric, shipping_cost numeric, tax_amount numeric, total_amount numeric, shipping_address jsonb, proof_approved_at timestamptz, stripe_session_id text, stripe_payment_intent_id text, printful_order_id bigint, printful_external_id text, tracking_number text, tracking_carrier text, estimated_delivery_date date, confirmed_at timestamptz, updated_at timestamptz);
    create table public.merchandise_checkout_operations (id uuid primary key default gen_random_uuid(), operation_key text unique, account_id uuid, order_id uuid, quote_id uuid, status text, lease_token text, lease_expires_at timestamptz, stripe_session_id text, last_error text);
    create table public.merchandise_revenue_ledger (account_id uuid, order_id uuid, order_number text, gross_retail_amount numeric, wholesale_manufacturing_cost numeric, platform_cut_amount numeric, stripe_processing_fee numeric, net_platform_profit numeric);
    create table public.merchandise_fulfillment_attempts (id uuid primary key default gen_random_uuid(), order_id uuid, attempt_number int, provider text, status text, response_payload jsonb, error_message text);
    create table public.jobs (id uuid primary key, account_id uuid, status text);
    create table public.sites (id uuid primary key default gen_random_uuid(), account_id uuid, content jsonb);
    create table public.neighborhood_halo_settings (account_id uuid primary key, monthly_spend_cap_dollars numeric);
    create table public.neighborhood_halo_campaigns (id uuid primary key, account_id uuid, job_id uuid, status text, street_name text, neighborhood_name text, city text, state text, center_lat numeric, center_lng numeric, radius_miles numeric, budget_dollars numeric, daily_budget_dollars numeric, duration_days int, wallet_deducted_cents int, ad_copy jsonb, before_photo_url text, after_photo_url text, landing_page_url text, expires_at timestamptz, spend_dollars numeric default 0, impressions int default 0, clicks int default 0, days_active int default 0, updated_at timestamptz default now(), deleted_at timestamptz, auto_kill_reason text, auto_killed_at timestamptz, created_at timestamptz default now());
    create table public.workspace_overage_accrual_events (account_id uuid, period_start timestamptz, resource_code text, released_at timestamptz, settled_at timestamptz);
    create table public.webhook_failures (id uuid primary key, created_at timestamptz, resolved_at timestamptz);
    create table public.billing_event_operational_classifications (id uuid primary key, received_at timestamptz, processing_status text, event_scope text, attempt_count int, requires_billing_action boolean, projection_result text, projection_lease_expires_at timestamptz, case_key text, requires_configuration_review boolean);
    create table public.sms_events (id uuid primary key, status text, created_at timestamptz, failed_at timestamptz, indeterminate_at timestamptz);
    create table public.sms_delivery_tasks (sms_event_id uuid primary key, task_state text, attempt_count int, last_error_code text, available_at timestamptz, lease_expires_at timestamptz, failed_at timestamptz, indeterminate_at timestamptz);
    create table public.payments (id uuid primary key, status text, dispute_status text, stripe_dispute_id text, disputed_at timestamptz, requested_at timestamptz, dispute_due_by timestamptz);
    create table public.cron_runs (id uuid primary key, started_at timestamptz, job text, ok boolean);
    create table public.operational_alert_findings (source_key text primary key, category text, reference text, occurred_at timestamptz, detail text, action_required text, admin_path text, last_seen_at timestamptz, resolved_at timestamptz, delivery_id uuid, detected_at timestamptz);
  `);

  await q(m('20260819260000_overage_settlement.sql'));
  await q(m('20260909210000_overage_settlement_reaper_and_starvation.sql'));

  const accountId = '11111111-1111-4111-8111-111111111111';
  await q('insert into public.accounts (id) values ($1)', [accountId]);
  const settle = await q("insert into public.workspace_overage_settlements(id, account_id, period_start, period_end, total_millicents, chargeable_cents, residual_millicents, lines, state, attempt_count, resolved_at) values(gen_random_uuid(), $1, now(), now() + interval '1 day', 1000, 1, 0, '[]'::jsonb, 'closed', 0, null) returning id", [accountId]);
  await q("select public.claim_overage_settlement($1::uuid, 'lgq:billing:v1:overage.settle:' || repeat('a', 64), false, 'cus_abcd1234')", [settle.rows[0].id]);

  // Apply migrations
  const m1 = m('20260910104058_marketing_flow_repair.sql');
  const m2 = m('20260910121506_overage_recovery_guards.sql');
  
  await q(m1);
  await q(m2);

  ck('migrations applied cleanly', true);

  // Test sync_halo_metrics
  const haloSig = await q("select has_function_privilege('service_role', 'public.sync_halo_metrics(uuid, integer, integer, integer, integer)', 'execute') as ok");
  ck('sync_halo_metrics exists with expected signature', haloSig.rows[0].ok);

  // Test claim_overage_settlement_v2 exists
  const v2Sig = await q("select has_function_privilege('service_role', 'public.claim_overage_settlement_v2(uuid, text, boolean, text, jsonb)', 'execute') as ok");
  ck('claim_overage_settlement_v2 exists', v2Sig.rows[0].ok);

  // Test list_claimable_overage_settlements exists
  const listSig = await q("select has_function_privilege('service_role', 'public.list_claimable_overage_settlements(integer, uuid[])', 'execute') as ok");
  ck('list_claimable_overage_settlements exists', listSig.rows[0].ok);

  // Test observe_overage_invoice_item exists
  const obsSig = await q("select has_function_privilege('service_role', 'public.observe_overage_invoice_item(uuid, uuid, text)', 'execute') as ok");
  ck('observe_overage_invoice_item exists', obsSig.rows[0].ok);

  // Test reconcile_overage_invoice_item exists
  const recSig = await q("select has_function_privilege('service_role', 'public.reconcile_overage_invoice_item(uuid, bigint, jsonb, text)', 'execute') as ok");
  ck('reconcile_overage_invoice_item exists', recSig.rows[0].ok);

  // Legacy raise error
  const legacyCall = await fails("select public.claim_overage_settlement(gen_random_uuid(), 'k', false, 'cus_1')");
  ck('legacy claim_overage_settlement raises error', legacyCall && legacyCall.includes('claim_overage_settlement_v2'));

  // Test overage_settlement_evidence table exists and has RLS
  const evTable = await q("select relrowsecurity from pg_class where oid = 'public.overage_settlement_evidence'::regclass");
  ck('overage_settlement_evidence exists and has RLS enabled', evTable.rows[0].relrowsecurity === true);

  // Verify legacy backfill
  const legacyRows = await q("select recovery_reason from public.workspace_overage_settlements where account_id = $1", [accountId]);
  ck('legacy backfill applied legacy_attempt_unknown', legacyRows.rows[0].recovery_reason === 'legacy_attempt_unknown');

} catch (error) {
  ck('harness ran to completion', false, error.message ?? String(error));
} finally {
  try { await pg.stop(); } catch {}
  try { rmSync(dataDir, { recursive: true, force: true }); } catch {}
}

let failed = 0;
for (const { n, ok, d } of R) {
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${ok || d == null ? '' : `\n       ${typeof d === 'string' ? d : JSON.stringify(d)}`}`);
}
console.log(`\n${R.length - failed}/${R.length} passed`);
process.exit(failed === 0 ? 0 : 1);
