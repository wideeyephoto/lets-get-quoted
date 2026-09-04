import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationPath = fileURLToPath(new URL(
  '../migrations/20260816073000_one_off_direct_payment_preparation.sql',
  import.meta.url,
));
const sql = readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n').toLowerCase();
const compact = sql.replace(/\s+/g, ' ');

describe('one-off direct payment preparation migration', () => {
  it('is an additive, transactional, service-only RPC with fixed execution context', () => {
    expect(compact).toContain('begin;');
    expect(compact.trimEnd().endsWith('commit;')).toBe(true);
    expect(sql).toContain('create or replace function public.prepare_one_off_direct_invoice_payment');
    const rpc = sql.slice(sql.indexOf('create or replace function public.prepare_one_off_direct_invoice_payment'));
    expect(rpc).toContain('security definer');
    expect(rpc).toContain("set search_path = ''");
    expect(rpc).toContain("set timezone = 'utc'");
    expect(compact).toContain(
      'revoke all on function public.prepare_one_off_direct_invoice_payment(uuid, uuid, uuid, uuid) from public, anon, authenticated, service_role',
    );
    expect(compact).toContain(
      'grant execute on function public.prepare_one_off_direct_invoice_payment(uuid, uuid, uuid, uuid) to service_role',
    );
    expect(compact).not.toContain('create table');
  });

  it('derives under a deterministic account-entitlement-job-child-parent lock order', () => {
    const rpc = sql.slice(sql.indexOf('create or replace function public.prepare_one_off_direct_invoice_payment'));
    const account = rpc.indexOf('from public.accounts a');
    const entitlement = rpc.indexOf('from public.workspace_entitlements e');
    const job = rpc.indexOf('from public.jobs j');
    const invoice = rpc.indexOf('from public.invoices i');
    const items = rpc.indexOf('from public.invoice_items ii');
    const payments = rpc.indexOf('from public.payments p');

    expect(account).toBeGreaterThan(-1);
    expect(account).toBeLessThan(entitlement);
    expect(entitlement).toBeLessThan(job);
    expect(job).toBeLessThan(items);
    expect(items).toBeLessThan(payments);
    expect(payments).toBeLessThan(invoice);
    expect(rpc).toMatch(/from public\.accounts a[\s\S]*for update/);
    expect(rpc).toMatch(/from public\.workspace_entitlements e[\s\S]*for update/);
    expect(rpc).toMatch(/from public\.invoices i[\s\S]*for update/);
    expect(rpc).toMatch(/from public\.payments p[\s\S]*order by p\.id[\s\S]*for update/);
  });

  it('requires fresh coherent Accounts v2 Merchant readiness and Stripe-owned fees and losses', () => {
    for (const invariant of [
      "merchant_onboarding_state is distinct from 'ready'",
      "merchant_dashboard_type is distinct from 'full'",
      'merchant_configuration_verified_at is null',
      'merchant_card_payments_active is distinct from true',
      'merchant_payouts_active is distinct from true',
      "merchant_fees_collector is distinct from 'stripe'",
      "merchant_losses_collector is distinct from 'stripe'",
      "merchant_configuration_verified_at < pg_catalog.clock_timestamp() - interval '24 hours'",
      "'lgq.stripe-merchant.v1'",
      "'v2.core.account'",
      "'{responsibilities,fees_collector}'",
      "'{responsibilities,losses_collector}'",
      "'{stripe_response,status_code}'",
      "'{stripe_response,request_id}'",
      "'{verification,ready}'",
      "is distinct from '[]'::jsonb",
    ]) {
      expect(compact).toContain(invariant);
    }
  });

  it('uses only the exact current active entitlement tuple as fee authority', () => {
    expect(compact).toContain("v_entitlement.entitlement_state = 'active'");
    expect(compact).toContain("v_entitlement.catalog_version = '2026-08-15-preview'");
    expect(compact).toContain("when 'flex' then 125");
    expect(compact).toContain("when 'solo' then 50");
    expect(compact).toContain("when 'growth' then 25");
    expect(compact).toContain("when 'scale' then 10");
    expect(compact).toContain("v_entitlement.billing_status = 'free'");
    expect(compact).toContain("v_entitlement.billing_status = 'active'");
    expect(compact).toContain('v_entitlement.period_end > pg_catalog.now()');
    expect(compact).not.toContain('a.plan::text');
  });

  it('proves tenant/job/invoice/payment identity and reconciles invoice math from line items', () => {
    expect(compact).toContain('j.id = p_job_id and j.account_id = p_account_id');
    expect(compact).toContain('v_invoice.account_id is distinct from p_account_id');
    expect(compact).toContain('v_invoice.job_id is distinct from p_job_id');
    expect(compact).toContain('v_payment.account_id is distinct from p_account_id');
    expect(compact).toContain('v_payment.job_id is distinct from p_job_id');
    expect(compact).toContain('v_payment.invoice_id is distinct from p_invoice_id');
    expect(compact).toContain('pg_catalog.sum(ii.amount)');
    expect(compact).toContain('v_subtotal * v_invoice.discount_percent / 100');
    expect(compact).toContain('v_eligible_subtotal * v_invoice.tax_rate / 100');
    expect(compact).toContain('v_invoice.total is distinct from v_reconciled_total');
  });

  it('supports only the full outstanding one-off and keeps tax out of LGQ fee basis', () => {
    expect(compact).toContain("v_payment.kind not in ('deposit', 'stage', 'final')");
    expect(compact).toContain('v_payment.payment_plan_id is not null');
    expect(compact).toContain('v_payment.recurring_plan_id is not null');
    expect(compact).toContain('v_payment.installment_seq is not null');
    expect(compact).toContain('v_payment.due_date is not null');
    expect(compact).toContain("p.status in ('requested', 'processing', 'failed', 'disputed')");
    expect(compact).toMatch(/p\.id <> p_payment_id[\s\S]*or p\.charge_model = 'direct'/);
    expect(compact).not.toContain("p.charge_model = 'direct' and p.status not in");
    expect(compact).toContain('v_payment.amount is distinct from v_outstanding_amount');
    expect(compact).toContain('one-off direct payment must equal the full outstanding invoice balance');
    expect(compact).toContain('v_fee_basis_cents := v_eligible_total_cents - v_eligible_before_cents');
    expect(compact).toContain('v_application_fee_cents := pg_catalog.round');
    expect(compact).not.toMatch(/v_fee_basis_cents\s*:=.*v_tax_amount/);
  });

  it('snapshots exact direct fields in a single transaction and has exact replay/mismatch behavior', () => {
    expect(compact).toContain("v_status := 'prepared'");
    expect(compact).toContain("v_status := 'replay'");
    expect(compact).toContain("set charge_model = 'direct'");
    expect(compact).toContain('stripe_account_id = v_account.stripe_merchant_account_id');
    expect(compact).toContain('stripe_livemode = v_account.merchant_livemode');
    expect(compact).toContain('fee_plan_code = v_entitlement.plan_code');
    expect(compact).toContain('fee_catalog_version = v_entitlement.catalog_version');
    expect(compact).toContain('fee_rate_bps = v_entitlement.platform_fee_bps');
    expect(compact).toContain('fee_basis_amount = v_fee_basis_cents::numeric / 100');
    expect(compact).toContain('platform_fee = v_application_fee_cents::numeric / 100');
    expect(compact).toContain("reconciliation_status = 'pending'");
    expect(compact).toContain('prepared direct payment does not match the current immutable snapshot');
    expect(compact).toContain("pg_catalog.set_config( 'lgq.direct_payment_preparation_id'");
    expect(compact).toContain("coalesce( pg_catalog.current_setting('lgq.direct_payment_preparation_id', true), '' ) = old.id::text");
    expect(compact).not.toContain('pg_catalog.coalesce(');
    const directReplay = compact.slice(compact.indexOf("if v_payment.charge_model = 'direct' then"));
    const destinationPreparation = directReplay.slice(directReplay.indexOf("elsif v_payment.charge_model = 'destination' then"));
    expect(directReplay).toContain("v_payment.status::text = 'processing'");
    expect(directReplay).toContain("v_operation.state is distinct from 'succeeded'");
    expect(directReplay).toContain('v_operation.provider_object_id is distinct from v_payment.stripe_checkout_session');
    expect(directReplay.indexOf("v_status := 'replay'")).toBeLessThan(
      directReplay.indexOf("elsif v_payment.charge_model = 'destination' then"),
    );
    expect(destinationPreparation).toContain('unprepared payment has already entered the checkout operation ledger');
    expect(destinationPreparation).toContain('from public.billing_payment_operations o');
    expect(compact).toContain('if v_succeeded_operation_replay then');
    expect(compact).toContain('v_expected_bps := case v_payment.fee_plan_code');
    expect(compact).toContain('succeeded direct replay has a non-canonical frozen fee snapshot');
    expect(compact.indexOf('if v_succeeded_operation_replay then')).toBeLessThan(
      compact.indexOf('if not v_entitlement_is_current then'),
    );
  });

  it('freezes prepared invoice truth and rechecks entitlement at orchestrator claim and submit', () => {
    expect(compact).toContain('reject_direct_prepared_invoice_item_mutation');
    expect(compact).toContain('reject_direct_prepared_invoice_mutation');
    expect(compact).toContain('reject_competing_open_invoice_payment');
    expect(compact).toContain('create unique index if not exists payments_one_direct_invoice_idx');
    expect(compact).toContain('before insert or update or delete on public.payments');
    expect(compact).toContain('sibling payments are immutable while a direct payment is open');
    const siblingFunction = compact.indexOf(
      'create or replace function public.reject_competing_open_invoice_payment',
    );
    const siblingGuard = compact.slice(
      compact.indexOf('if exists ( select 1 from public.payments p', siblingFunction),
      compact.indexOf("raise exception 'sibling payments are immutable", siblingFunction),
    );
    expect(siblingGuard).toContain('p.id <> v_payment_id');
    expect(siblingGuard).not.toContain('new.status');
    expect(compact).toContain('require_direct_checkout_entitlement_insert_trigger');
    expect(compact).toContain('require_direct_checkout_entitlement_submit_trigger');
    expect(compact).toContain('direct checkout requires the exact active entitlement snapshot');
  });

  it('does not activate or alter either live Stripe rail', () => {
    expect(sql).not.toContain('transfer_data');
    expect(sql).not.toContain('stripe_connect_id');
    expect(sql).not.toContain('checkout.sessions.create');
    expect(sql).not.toContain('paymentintents.create');
    expect(sql).not.toContain('process.env');
  });
});
