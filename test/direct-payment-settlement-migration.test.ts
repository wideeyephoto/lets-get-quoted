import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationPath = fileURLToPath(new URL(
  '../migrations/20260816083000_direct_payment_settlement_foundation.sql',
  import.meta.url,
));
const sql = readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n').toLowerCase();
const compact = sql.replace(/\s+/g, ' ');

function functionDefinition(name: string): string {
  const start = compact.indexOf(`create function public.${name}(`);
  expect(start, `${name} must be defined`).toBeGreaterThanOrEqual(0);
  const next = compact.indexOf('create function public.', start + 1);
  return compact.slice(start, next < 0 ? compact.length : next);
}

function tableDefinition(name: string): string {
  const start = compact.indexOf(`create table public.${name} (`);
  expect(start, `${name} must be defined`).toBeGreaterThanOrEqual(0);
  const end = compact.indexOf(');', start);
  return compact.slice(start, end + 2);
}

describe('dark direct payment settlement migration', () => {
  it('is additive, transactional, and has no activation mechanism', () => {
    expect(migrationPath).toContain('20260816083000_');
    expect(compact.startsWith('-- dark one-off direct-payment settlement')).toBe(true);
    expect(compact).toContain('begin;');
    expect(compact.trimEnd().endsWith('commit;')).toBe(true);
    for (const forbidden of [
      'cron.schedule', 'net.http', 'create policy', 'create extension',
      'lgq_direct_payment_settlement_enabled', 'vercel.json',
    ]) {
      expect(compact).not.toContain(forbidden);
    }
  });

  it('queues only the exact direct processing-to-paid transition', () => {
    expect(compact).toContain('after update of status, paid_at, stripe_payment_intent');
    expect(compact).toContain("old.charge_model = 'direct'");
    expect(compact).toContain("new.charge_model = 'direct'");
    expect(compact).toContain("old.status::text = 'processing'");
    expect(compact).toContain("new.status::text = 'paid'");
    const enqueue = functionDefinition('enqueue_one_off_direct_payment_settlement');
    expect(enqueue).toContain('old.paid_at is not null');
    expect(enqueue).toContain('new.paid_at is null');
    expect(enqueue).toContain(
      'old.stripe_checkout_session is distinct from new.stripe_checkout_session',
    );
    expect(enqueue).toContain('old.fee_basis_amount is distinct from new.fee_basis_amount');
    expect(enqueue).toContain(
      'old.stripe_payment_intent is distinct from new.stripe_payment_intent',
    );
    expect(enqueue).toContain('direct settlement requires the exact processing-to-paid transition');
  });

  it('reasserts the one-off, unrefunded, full-outstanding invoice scope', () => {
    const enqueue = functionDefinition('enqueue_one_off_direct_payment_settlement');
    for (const guard of [
      "new.kind::text not in ('deposit', 'stage', 'final')",
      'new.payment_plan_id is not null',
      'new.recurring_plan_id is not null',
      'new.installment_seq is not null',
      'new.imported is distinct from false',
      'new.refunded_amount is distinct from 0',
      "v_invoice.status::text not in ('sent', 'signed')",
      'v_invoice.total is distinct from v_reconciled_total',
      'p.id <> new.id',
      "p.status::text in ('requested', 'processing', 'failed', 'disputed')",
      'new.amount is distinct from pg_catalog.round(v_invoice.total - v_prior_paid, 2)',
      'pg_catalog.round(v_prior_paid + new.amount, 2) is distinct from v_invoice.total',
    ]) {
      expect(enqueue).toContain(guard);
    }
  });

  it('rechecks tax-excluded fee allocation and the immutable succeeded Checkout operation', () => {
    const enqueue = functionDefinition('enqueue_one_off_direct_payment_settlement');
    for (const guard of [
      'v_eligible_subtotal := pg_catalog.round(v_subtotal - v_discount_amount, 2)',
      'v_tax_amount := pg_catalog.round',
      "new.fee_catalog_version is distinct from '2026-08-15-preview'",
      '(new.fee_basis_amount * 100)::bigint is distinct from v_expected_fee_basis_cents',
      '(new.platform_fee * 100)::bigint is distinct from v_expected_fee_cents',
      "o.operation_type = 'checkout_session.create'",
      "v_operation.state is distinct from 'succeeded'",
      'v_operation.provider_object_id is distinct from new.stripe_checkout_session',
      'v_operation.completed_at is null',
    ]) {
      expect(enqueue).toContain(guard);
    }
  });

  it('allows paid truth to settle while fee reconciliation evidence is pending', () => {
    const enqueue = functionDefinition('enqueue_one_off_direct_payment_settlement');
    expect(enqueue).toContain(
      "new.stripe_application_fee_id is not null and new.stripe_application_fee_id !~ '^fee_[a-za-z0-9_]+$'",
    );
    expect(enqueue).toContain(
      "new.reconciliation_status = 'reconciled' and ( new.stripe_balance_transaction_id is null or (new.platform_fee > 0 and new.stripe_application_fee_id is null) )",
    );
    expect(enqueue).not.toContain(
      'new.platform_fee > 0 and ( new.stripe_application_fee_id is null',
    );
  });

  it('binds the trigger to exactly one live connected-event projector claim', () => {
    const enqueue = functionDefinition('enqueue_one_off_direct_payment_settlement');
    for (const guard of [
      "e.event_scope = 'connected_payment'",
      "e.event_type = 'checkout.session.completed'",
      "e.processing_status = 'processing'",
      'e.account_id = new.account_id',
      'e.provider_account_id = new.stripe_account_id',
      'e.livemode = new.stripe_livemode',
      'e.provider_created_at >= new.paid_at',
      'e.projection_claim_token is not null',
      'e.projection_lease_expires_at > pg_catalog.now()',
      "e.payload #>> '{schema}' = 'lgq.stripe-event-inbox.v1'",
      "e.payload #>> '{event,id}' = e.provider_event_id",
      "e.payload #>> '{data_object,id}' = new.stripe_checkout_session",
      'pg_catalog.cardinality(v_billing_event_ids) is distinct from 1',
    ]) {
      expect(enqueue).toContain(guard);
    }
  });

  it('marks only the linked sent/signed invoice paid and preserves a real signature time', () => {
    const enqueue = functionDefinition('enqueue_one_off_direct_payment_settlement');
    expect(enqueue).toContain('update public.invoices i');
    expect(enqueue).toContain("set status = 'paid'");
    expect(enqueue).toContain('signed_at = coalesce(i.signed_at, new.paid_at)');
    expect(enqueue).toContain('i.account_id = new.account_id');
    expect(enqueue).toContain('i.job_id = new.job_id');
    expect(enqueue).toContain("i.status::text in ('sent', 'signed')");
    expect(enqueue.indexOf('update public.invoices i')).toBeLessThan(
      enqueue.indexOf('insert into public.billing_direct_payment_settlement_tasks'),
    );
    expect(enqueue).not.toContain('update public.jobs');
  });

  it('uses the existing payment-to-invoice lock order without adding its inverse', () => {
    const enqueue = functionDefinition('enqueue_one_off_direct_payment_settlement');
    expect(enqueue).toContain('after the payment row');
    expect(enqueue).toContain('without reversing lock order');
    expect(enqueue).toContain('from public.invoices i');
    expect(enqueue).toContain('for update');
    expect(enqueue).toContain('from public.invoice_items ii');
    expect(enqueue).not.toMatch(/from public\.invoice_items ii[^;]{0,300}for update/);
  });

  it('stores one PII-free task per payment and event', () => {
    const task = tableDefinition('billing_direct_payment_settlement_tasks');
    expect(task).toContain('payment_id uuid not null unique');
    expect(task).toContain('billing_event_id uuid not null unique');
    expect(task).toContain('account_id uuid not null');
    expect(task).toContain('job_id uuid not null');
    expect(task).toContain('invoice_id uuid not null');
    for (const pii of ['phone', 'body', 'email', 'name', 'address', 'payload', 'metadata']) {
      expect(task).not.toContain(pii);
    }
  });

  it('records the feed independently and never mutates job or special payment workflows', () => {
    const feed = functionDefinition('record_direct_payment_settlement_feed');
    expect(feed).toContain('insert into public.job_feed');
    expect(feed).toContain("'payment_paid'");
    expect(feed).toContain("'client_financial'");
    expect(feed).toContain("on conflict (source_table, source_id, kind)");
    expect(feed).toContain("source_table = 'payments'");
    expect(feed).not.toContain('update public.jobs');
    for (const mutation of [
      'update public.payment_plans', 'update public.recurring_plans',
      'update public.extra_stop_requests', 'insert into public.extra_stop_requests',
    ]) {
      expect(compact).not.toContain(mutation);
    }
  });

  it('requires explicit current consent before staging a receipt text', () => {
    const stage = functionDefinition('stage_direct_payment_settlement_sms');
    for (const guard of [
      'v_payment.sms_consent is distinct from true',
      'v_payment.homeowner_phone is null',
      'p_normalized_phone is distinct from v_expected_phone',
      'from public.sms_consent c',
      "v_consent.status <> 'opted_in'",
      'v_consent.consented_at is null',
      'v_consent.opted_out_at is not null',
      "'skipped_no_consent'",
      "'skipped_opted_out'",
      "'dispatching'",
    ]) {
      expect(stage).toContain(guard);
    }
  });

  it('makes stale or ambiguous pending SMS terminal and never eligible for resend', () => {
    const claim = functionDefinition('claim_direct_payment_settlement_tasks');
    expect(claim).toContain("v_task.sms_status = 'dispatching'");
    expect(claim).toContain("set status = 'indeterminate'");
    expect(claim).toContain("error_code = 'sms_delivery_unknown_after_lease_expiry'");
    expect(claim).toContain("task_state = 'dead_letter'");
    const fail = functionDefinition('fail_direct_payment_settlement_task');
    expect(fail).toContain("if v_task.sms_status = 'dispatching'");
    expect(fail).toContain("set status = 'indeterminate'");
    expect(fail).toContain("p_error_code := 'sms_provider_result_unknown'");
    expect(fail).toContain("task_state = 'dead_letter'");
    const stage = functionDefinition('stage_direct_payment_settlement_sms');
    expect(stage).toContain("v_sms.status not in ('sent', 'opted_out')");
    expect(stage).toContain("error_reason = 'settlement_sms_existing_nonterminal_outcome'");
    expect(stage.indexOf("v_sms.status not in ('sent', 'opted_out')"))
      .toBeLessThan(stage.indexOf('v_sms.phone_number is distinct from p_normalized_phone'));
    expect(compact).toContain("status in ('pending', 'sent', 'failed', 'opted_out', 'indeterminate')");
  });

  it('uses leases, eight bounded attempts, append-only attempts, and dead-lettering', () => {
    expect(compact).toContain('attempt_count integer not null default 0 check (attempt_count between 0 and 8)');
    expect(compact).toContain("v_lease_expires_at := v_now + interval '5 minutes'");
    expect(compact).toContain('for update skip locked');
    expect(compact).toContain("task_state in ('ready', 'leased', 'retry_wait', 'completed', 'dead_letter')");
    expect(compact).toContain('billing_direct_payment_settlement_one_open_attempt');
    expect(compact).toContain('direct payment settlement attempts are append-only');
    expect(compact).toContain('worker_attempt_limit_reached');
    expect(functionDefinition('fail_direct_payment_settlement_task'))
      .toContain('v_task.lease_expires_at <= v_now');
  });

  it('uses FORCE RLS and grants only service-role RPC execution', () => {
    for (const table of [
      'billing_direct_payment_settlement_tasks',
      'billing_direct_payment_settlement_attempts',
    ]) {
      expect(compact).toContain(`alter table public.${table} enable row level security`);
      expect(compact).toContain(`alter table public.${table} force row level security`);
      expect(compact).toContain(`revoke all on table public.${table} from public, anon, authenticated, service_role`);
    }
    for (const signature of [
      'public.claim_direct_payment_settlement_tasks(integer)',
      'public.record_direct_payment_settlement_feed(uuid, uuid)',
      'public.stage_direct_payment_settlement_sms(uuid, uuid, text, text)',
      'public.complete_direct_payment_settlement_sms(uuid, uuid, uuid, text)',
      'public.fail_direct_payment_settlement_task(uuid, uuid, text, boolean)',
    ]) {
      expect(compact).toContain(`revoke all on function ${signature}`);
      expect(compact).toContain(`grant execute on function ${signature} to service_role`);
    }
  });

  it('does not schema-qualify PostgreSQL special forms', () => {
    for (const specialForm of ['coalesce', 'nullif', 'greatest', 'least']) {
      expect(compact).not.toContain(`pg_catalog.${specialForm}(`);
    }
  });
});
