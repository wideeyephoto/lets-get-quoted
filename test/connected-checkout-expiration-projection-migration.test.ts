import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationPath = fileURLToPath(new URL(
  '../migrations/20260816094500_stripe_connected_checkout_expiration_projection.sql',
  import.meta.url,
));
const sql = readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n');
const compact = sql.replace(/\s+/g, ' ').trim().toLowerCase();

function functionBody(name: string): string {
  const marker = `create function public.${name}(`;
  const start = compact.indexOf(marker);
  expect(start, `${name} must be defined`).toBeGreaterThanOrEqual(0);
  const next = compact.indexOf('create function public.', start + marker.length);
  return compact.slice(start, next < 0 ? compact.length : next);
}

describe('dark connected Checkout expiration projection migration', () => {
  it('is ordered, atomic, and exposes no activation or provider mutation', () => {
    expect(migrationPath).toContain('20260816094500_');
    expect(compact).toMatch(/^-- dark connected-account checkout expiration projection/);
    expect(compact).toContain('begin;');
    expect(compact).toContain('commit; -- activation blockers');
    for (const forbidden of [
      'cron.schedule',
      'net.http',
      'create policy',
      'checkout.sessions.create',
      'paymentintents.create',
      'update public.payments p set',
      'update public.invoices i set',
      'delete from public.payments',
      'delete from public.invoices',
    ]) {
      expect(compact).not.toContain(forbidden);
    }
  });

  it('claims only the minimized connected checkout.session.expired envelope', () => {
    const claim = functionBody('claim_stripe_connected_checkout_expiration_event');
    for (const guard of [
      "v_event.event_scope <> 'connected_payment'",
      "v_event.event_type <> 'checkout.session.expired'",
      "v_event.payload #>> '{schema}' is distinct from 'lgq.stripe-event-inbox.v1'",
      "v_event.payload #>> '{scope}' is distinct from 'connected_payment'",
      "v_event.payload #>> '{event,account}' is distinct from v_event.provider_account_id",
      "v_event.payload #> '{event,livemode}' is distinct from pg_catalog.to_jsonb(v_event.livemode)",
      "v_event.payload #>> '{data_object,object}' is distinct from 'checkout.session'",
      "extensions.digest(pg_catalog.convert_to(v_event.payload::text, 'utf8'), 'sha256')",
    ]) {
      expect(claim).toContain(guard);
    }
    expect(claim).not.toContain("event_type <> 'checkout.session.completed'");
  });

  it('uses a bounded five-minute lease with a durable eight-attempt terminal state', () => {
    const claim = functionBody('claim_stripe_connected_checkout_expiration_event');
    expect(claim).toContain("projection_lease_expires_at = pg_catalog.now() + interval '5 minutes'");
    expect(claim).toContain('if v_event.attempt_count >= 8 then');
    expect(claim).toContain("last_error = 'expiration_retry_attempt_limit'");
    expect(claim).toContain("v_event.processing_status = 'processing'");
    expect(claim).toContain('v_event.projection_lease_expires_at > pg_catalog.now()');

    const fail = functionBody('fail_stripe_connected_checkout_expiration_event');
    expect(fail).toContain('p_retryable and v_event.attempt_count < 8');
    expect(fail).toContain("then 'expiration_retry_attempt_limit'");
    expect(fail).toContain('next_attempt_at = case when v_retryable then p_next_attempt_at else null end');
  });

  it('binds one succeeded create operation to the exact current direct payment and fee snapshot', () => {
    const binding = functionBody('resolve_stripe_connected_checkout_expiration_binding');
    for (const guard of [
      'p.id = p_payment_id',
      'p.account_id = p_workspace_id',
      "v_payment.charge_model <> 'direct'",
      'v_payment.stripe_account_id is distinct from v_event.provider_account_id',
      'v_payment.stripe_livemode is distinct from v_event.livemode',
      'v_payment.stripe_checkout_session is distinct from v_checkout_session_id',
      "v_payment.status::text <> 'processing'",
      "v_payment.reconciliation_status <> 'pending'",
      "o.operation_type = 'checkout_session.create'",
      "v_operation.state <> 'succeeded'",
      'v_operation.provider_object_id is distinct from v_checkout_session_id',
      "v_operation.metadata #>> '{schema}' is distinct from 'one_off_direct_checkout_v1'",
      "v_operation.metadata #>> '{fee_snapshot,gross_amount_cents}'",
      "v_operation.metadata #>> '{fee_snapshot,eligible_service_subtotal_cents}'",
      "v_operation.metadata #>> '{fee_snapshot,application_fee_cents}'",
    ]) {
      expect(binding).toContain(guard);
    }
    expect(compact).toContain('operation_pk uuid not null unique');
    expect(compact).toContain('stripe_connected_checkout_expiration_session_unique');
    expect(compact).toContain('stripe_connected_checkout_expiration_payment_fk');
    expect(compact).toContain('stripe_connected_checkout_expiration_operation_fk');
  });

  it('fails closed on every local payment, refund, dispute, invoice, and success-event indication', () => {
    const project = functionBody('project_stripe_connected_checkout_expiration');
    for (const guard of [
      "v_payment.status::text <> 'processing'",
      "v_payment.reconciliation_status <> 'pending'",
      'v_payment.paid_at is not null',
      'v_payment.stripe_payment_intent is not null',
      'v_payment.stripe_charge_id is not null',
      'v_payment.stripe_application_fee_id is not null',
      'v_payment.stripe_balance_transaction_id is not null',
      'v_payment.refunded_amount is distinct from 0',
      'v_payment.eligible_service_refunded_amount is distinct from 0',
      'v_payment.platform_fee_refunded is distinct from 0',
      'v_payment.disputed_at is not null',
      'v_payment.dispute_reason is not null',
      'v_payment.dispute_status is not null',
      'v_payment.stripe_dispute_id is not null',
      'v_payment.dispute_due_by is not null',
      "v_invoice.status not in ('sent', 'signed')",
      "'checkout.session.completed'",
      "'checkout.session.async_payment_succeeded'",
      "v_failure_code := 'expiration_success_event_conflict'",
    ]) {
      expect(project).toContain(guard);
    }
    expect(project.indexOf('expiration_success_event_conflict')).toBeLessThan(
      project.indexOf('insert into public.stripe_connected_checkout_expirations'),
    );
    expect(project).not.toContain('success_event.processing_status');
  });

  it('uses a per-Session mutex without globally serializing unrelated Sessions', () => {
    const key = functionBody('stripe_connected_checkout_session_mutex_key');
    for (const identity of [
      'p_account_id::text',
      'p_stripe_account_id',
      'p_livemode',
      'p_checkout_session_id',
    ]) {
      expect(key).toContain(identity);
    }
    expect(key).toContain('pg_catalog.hashtextextended');
    expect(key).toContain('lgq:stripe:connected-checkout-session:v1:');

    const insertGuard = functionBody('serialize_stripe_connected_checkout_event_insert');
    for (const exactIdentity of [
      "new.provider = 'stripe'",
      "new.event_scope = 'connected_payment'",
      "new.payload #>> '{event,account}' is distinct from new.provider_account_id",
      "new.payload #> '{event,livemode}' is distinct from pg_catalog.to_jsonb(new.livemode)",
      "new.payload #>> '{data_object,object}' is distinct from 'checkout.session'",
      "v_checkout_session_id !~ '^cs_[a-za-z0-9_]+$'",
    ]) {
      expect(insertGuard).toContain(exactIdentity);
    }
    for (const eventType of [
      'checkout.session.completed',
      'checkout.session.async_payment_succeeded',
      'checkout.session.expired',
    ]) {
      expect(insertGuard).toContain(eventType);
    }
    expect(insertGuard).toContain('pg_catalog.pg_advisory_xact_lock');
    expect(compact).toContain(
      'before insert on public.billing_events for each row execute function public.serialize_stripe_connected_checkout_event_insert()',
    );
  });

  it('closes success/expiration interleavings in payment-then-Session lock order', () => {
    const project = functionBody('project_stripe_connected_checkout_expiration');
    const paymentLock = project.indexOf('select p.* into v_payment');
    const sessionLock = project.indexOf('pg_catalog.pg_advisory_xact_lock');
    const successScan = project.indexOf('from public.billing_events success_event');
    const evidenceInsert = project.indexOf('insert into public.stripe_connected_checkout_expirations');
    expect(paymentLock).toBeGreaterThanOrEqual(0);
    expect(paymentLock).toBeLessThan(sessionLock);
    expect(sessionLock).toBeLessThan(successScan);
    expect(successScan).toBeLessThan(evidenceInsert);

    const paymentGuard = functionBody(
      'guard_stripe_connected_checkout_expiration_payment_truth',
    );
    for (const transition of [
      "old.status::text <> 'paid' and new.status::text = 'paid'",
      'old.paid_at is null and new.paid_at is not null',
      'old.stripe_payment_intent is null and new.stripe_payment_intent is not null',
      'old.stripe_charge_id is null and new.stripe_charge_id is not null',
    ]) {
      expect(paymentGuard).toContain(transition);
    }
    expect(paymentGuard.indexOf('pg_catalog.pg_advisory_xact_lock')).toBeLessThan(
      paymentGuard.indexOf('from public.stripe_connected_checkout_expirations x'),
    );
    expect(paymentGuard).toContain("raise exception 'stripe_connected_checkout_expiration_conflict'");
    expect(paymentGuard).toContain("using errcode = 'p0001'");
    expect(compact).toContain(
      'before update of status, paid_at, stripe_payment_intent, stripe_charge_id on public.payments',
    );
  });

  it('persists one immutable PII-free observed expiration and processes only its event', () => {
    for (const field of [
      'billing_event_id uuid not null unique',
      'provider_event_id text not null unique',
      'provider_created_at timestamptz not null',
      'session_expires_at timestamptz not null',
      "observed_mode text not null check (observed_mode = 'payment')",
      "observed_session_status text not null check (observed_session_status = 'expired')",
      "observed_payment_status text not null check (observed_payment_status = 'unpaid')",
      "observed_currency text not null check (observed_currency = 'usd')",
      "observed_payment_method_types = array['card']::text[]",
      'observed_recovered_from text check (observed_recovered_from is null)',
      'observed_payment_intent_id text check (observed_payment_intent_id is null)',
    ]) {
      expect(compact).toContain(field);
    }
    const project = functionBody('project_stripe_connected_checkout_expiration');
    expect(project).toContain('insert into public.stripe_connected_checkout_expirations');
    expect(project).toContain("projection_schema_version = 'stripe_connected_checkout_expiration_v1'");
    expect(project).toContain("projection_result = 'direct_checkout_expired'");
    expect(project).toContain('where e.id = v_event.id');
    expect(project).not.toContain('update public.payments');
    expect(project).not.toContain('update public.invoices');
    for (const pii of [
      'customer_email', 'customer_name', 'receipt_email', 'phone', 'address',
      'client_secret', 'raw_body',
    ]) {
      expect(project).not.toContain(pii);
    }
  });

  it('records contradictions as fixed terminal manual-reconciliation codes', () => {
    const binding = functionBody('resolve_stripe_connected_checkout_expiration_binding');
    const project = functionBody('project_stripe_connected_checkout_expiration');
    for (const code of [
      'expiration_merchant_mapping_conflict',
      'expiration_payment_binding_conflict',
      'expiration_invoice_lock_conflict',
      'expiration_operation_binding_conflict',
    ]) {
      expect(binding).toContain(code);
    }
    for (const code of [
      'expiration_event_binding_conflict',
      'expiration_payment_evidence_conflict',
      'expiration_success_event_conflict',
      'expiration_evidence_conflict',
    ]) {
      expect(project).toContain(code);
    }
    for (const body of [binding, project]) {
      expect(body).toContain("processing_status = 'failed'");
      expect(body).toContain('next_attempt_at = null');
      expect(body).toContain("'manual_reconciliation'::text");
    }
  });

  it('uses deterministic locks, immutable evidence, FORCE RLS, and service-only RPCs', () => {
    expect(compact).toContain('for update');
    expect(compact).toContain('for key share');
    expect(compact).toContain('for share');
    expect(compact).toContain('before update or delete on public.stripe_connected_checkout_expirations');
    expect(compact).toContain('alter table public.stripe_connected_checkout_expirations enable row level security');
    expect(compact).toContain('alter table public.stripe_connected_checkout_expirations force row level security');
    expect(compact).toContain('revoke all on table public.stripe_connected_checkout_expirations from public, anon, authenticated, service_role');
    expect(compact).toContain('grant select on table public.stripe_connected_checkout_expirations to service_role');

    for (const triggerFunction of [
      'public.stripe_connected_checkout_session_mutex_key( uuid, text, boolean, text )',
      'public.serialize_stripe_connected_checkout_event_insert()',
      'public.guard_stripe_connected_checkout_expiration_payment_truth()',
    ]) {
      expect(compact).toContain(
        `revoke all on function ${triggerFunction} from public, anon, authenticated, service_role`,
      );
    }

    for (const signature of [
      'public.claim_stripe_connected_checkout_expiration_event(uuid)',
      'public.resolve_stripe_connected_checkout_expiration_binding( uuid, uuid, uuid, uuid, text, bigint )',
      'public.project_stripe_connected_checkout_expiration(uuid, uuid, jsonb)',
      'public.fail_stripe_connected_checkout_expiration_event( uuid, uuid, text, boolean, timestamptz )',
    ]) {
      expect(compact).toContain(`revoke all on function ${signature} from public, anon, authenticated, service_role`);
      expect(compact).toContain(`grant execute on function ${signature} to service_role`);
    }
    expect(sql.match(/set search_path = ''/g)).toHaveLength(8);
    expect(sql.match(/set timezone to 'UTC'/g)).toHaveLength(8);
  });

  it('accepts only the exact projection keys and does not schema-qualify special forms', () => {
    const project = functionBody('project_stripe_connected_checkout_expiration');
    expect(project).toContain('not (p_projection ?& v_expected_keys)');
    expect(project).toContain("(p_projection - v_expected_keys) <> '{}'::jsonb");
    expect(project).toContain("p_projection -> 'payment_method_types' is distinct from '[\"card\"]'::jsonb");
    expect(project).toContain("p_projection -> 'recovered_from' is distinct from 'null'::jsonb");
    expect(project).toContain("p_projection -> 'payment_intent_id' is distinct from 'null'::jsonb");
    expect(compact).not.toMatch(/pg_catalog\.(?:coalesce|nullif|greatest|least|current_user)\b/);
  });
});
