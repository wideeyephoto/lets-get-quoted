import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationPath = fileURLToPath(new URL(
  '../migrations/20260816080000_stripe_connected_payment_event_projection.sql',
  import.meta.url,
));
const sql = readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n').toLowerCase();
const compact = sql.replace(/\s+/g, ' ');

function functionDefinition(name: string): string {
  const start = compact.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} must be defined`).toBeGreaterThanOrEqual(0);
  const next = compact.indexOf('create or replace function public.', start + 1);
  return compact.slice(start, next < 0 ? compact.length : next);
}

describe('dark connected payment event projection migration', () => {
  it('is ordered after direct preparation, transactional, and has no activation surface', () => {
    expect(migrationPath).toContain('20260816080000_');
    expect(compact.startsWith('-- dark success-only connected-payment')).toBe(true);
    expect(compact).toContain('begin;');
    expect(compact.trimEnd().endsWith('commit;')).toBe(true);
    for (const forbidden of [
      'cron.schedule',
      'net.http',
      'create policy',
      'create trigger on',
      'lgq_stripe_merchant',
      'stripe_connect_id',
      'transfer_data',
      'on_behalf_of',
    ]) {
      expect(compact).not.toContain(forbidden);
    }
  });

  it('claims only paid-card Checkout completion candidates by explicit inbox ID', () => {
    const claim = functionDefinition('claim_stripe_connected_payment_event');
    expect(claim).toContain("v_event.event_scope <> 'connected_payment'");
    expect(claim).toContain("v_event.event_type <> 'checkout.session.completed'");
    expect(claim).toContain(
      "v_event.payload #>> '{data_object,object}' is distinct from 'checkout.session'",
    );
    expect(claim).toContain("v_checkout_session_id !~ '^cs_[a-za-z0-9_]+$'");
    expect(claim).not.toContain('checkout.session.async_payment_succeeded');
    expect(claim).not.toContain('payment_intent.succeeded');
    expect(claim).not.toContain('charge.succeeded');
    expect(compact).toContain('unsupported connected event types remain received and unclaimed');
  });

  it('revalidates the redacted envelope, digest, workspace, Merchant, and livemode', () => {
    const claim = functionDefinition('claim_stripe_connected_payment_event');
    for (const guard of [
      "extensions.digest(pg_catalog.convert_to(v_event.payload::text, 'utf8'), 'sha256')",
      "v_event.payload #>> '{schema}' is distinct from 'lgq.stripe-event-inbox.v1'",
      "v_event.payload #>> '{scope}' is distinct from 'connected_payment'",
      "v_event.payload #>> '{event,account}' is distinct from v_event.provider_account_id",
      "v_event.payload #> '{event,livemode}' is distinct from pg_catalog.to_jsonb(v_event.livemode)",
      'a.id = v_event.account_id',
      'a.stripe_merchant_account_id = v_event.provider_account_id',
      'a.merchant_livemode = v_event.livemode',
    ]) {
      expect(claim).toContain(guard);
    }
  });

  it('binds workspace metadata back through the immutable DB operation and payment', () => {
    const resolve = functionDefinition('resolve_stripe_connected_payment_projection_binding');
    for (const guard of [
      'v_event.account_id is distinct from p_workspace_id',
      'p.id = p_payment_id',
      'p.account_id = p_workspace_id',
      "v_payment.charge_model <> 'direct'",
      'v_payment.stripe_account_id is distinct from v_event.provider_account_id',
      'v_payment.stripe_livemode is distinct from v_event.livemode',
      "o.operation_type = 'checkout_session.create'",
      'o.operation_id = pg_catalog.btrim(p_operation_id)',
      "v_operation.state <> 'succeeded'",
      'v_operation.provider_object_id is distinct from v_payment.stripe_checkout_session',
      "v_operation.metadata #>> '{schema}' is distinct from 'one_off_direct_checkout_v1'",
    ]) {
      expect(resolve).toContain(guard);
    }
  });

  it('projects provider IDs and paid/reconciliation state in one owned transaction', () => {
    const project = functionDefinition('project_stripe_connected_payment_event');
    for (const lock of [
      'from public.billing_events e',
      'from public.accounts a',
      'from public.payments p',
      'from public.billing_payment_operations o',
      'for update',
      'for key share',
      'for share',
    ]) {
      expect(project).toContain(lock);
    }
    for (const assignment of [
      "status = 'paid'",
      'paid_at = v_paid_at',
      'stripe_payment_intent = coalesce',
      'stripe_charge_id = coalesce',
      'stripe_application_fee_id = coalesce',
      'stripe_balance_transaction_id = coalesce',
      'reconciliation_status = v_final_reconciliation_status',
      "processing_status = 'processed'",
      "projection_schema_version = 'stripe_connected_payment_projection_v1'",
    ]) {
      expect(project).toContain(assignment);
    }
    expect(project.indexOf('update public.payments p')).toBeLessThan(
      project.indexOf('update public.billing_events e'),
    );
  });

  it('never overwrites conflicting provider truth and never downgrades reconciliation', () => {
    const project = functionDefinition('project_stripe_connected_payment_event');
    for (const immutable of [
      'v_payment.stripe_payment_intent is not null',
      'v_payment.stripe_charge_id is not null',
      'v_payment.stripe_application_fee_id is not null',
      'v_payment.stripe_balance_transaction_id is not null',
      'v_payment.paid_at is not null',
      "when v_payment.reconciliation_status = 'reconciled' then 'reconciled'",
    ]) {
      expect(project).toContain(immutable);
    }
    expect(project).toContain('connected payment projection conflicts with immutable payment truth');
  });

  it('requires complete fee and balance evidence before reconciliation', () => {
    const project = functionDefinition('project_stripe_connected_payment_event');
    expect(project).toContain("v_reconciliation_status not in ('pending', 'reconciled')");
    expect(project).toContain('v_application_fee_cents = 0 and v_application_fee_id is not null');
    expect(project).toContain("v_reconciliation_status = 'reconciled'");
    expect(project).toContain('v_balance_transaction_id is null');
    expect(project).toContain('v_application_fee_cents > 0 and v_application_fee_id is null');
    expect(compact).toContain("'direct_payment_paid_pending_reconciliation'");
    expect(compact).toContain("'direct_payment_paid_reconciled'");
  });

  it('accepts only an exact PII-free projection object', () => {
    const project = functionDefinition('project_stripe_connected_payment_event');
    expect(project).toContain('not (p_projection ?& v_expected_keys)');
    expect(project).toContain("(p_projection - v_expected_keys) <> '{}'::jsonb");
    for (const forbidden of [
      'customer_email', 'customer_name', 'phone', 'address', 'client_secret', 'payment_method',
    ]) {
      expect(project).not.toContain(forbidden);
    }
  });

  it('uses leases, fixed failure codes, and service-role-only RPC execution', () => {
    expect(compact).toContain("projection_lease_expires_at = pg_catalog.now() + interval '5 minutes'");
    const fail = functionDefinition('fail_stripe_connected_payment_event');
    expect(fail).toContain("p_error_code !~ '^[a-z][a-z0-9_]{2,63}$'");
    expect(fail).toContain('last_error = p_error_code');
    expect(fail).not.toContain('payload');
    for (const signature of [
      'public.claim_stripe_connected_payment_event(uuid)',
      'public.resolve_stripe_connected_payment_projection_binding( uuid, uuid, uuid, uuid, text )',
      'public.project_stripe_connected_payment_event(uuid, uuid, jsonb)',
      'public.fail_stripe_connected_payment_event( uuid, uuid, text, boolean, timestamptz )',
    ]) {
      expect(compact).toContain(`revoke all on function ${signature}`);
      expect(compact).toContain(`grant execute on function ${signature}`);
    }
    expect(sql.match(/set timezone to 'utc'/g)).toHaveLength(4);
    expect(sql.match(/set search_path = pg_catalog, pg_temp/g)).toHaveLength(4);
  });

  it('does not schema-qualify PostgreSQL special forms', () => {
    for (const specialForm of ['coalesce', 'nullif', 'greatest', 'least']) {
      expect(compact).not.toContain(`pg_catalog.${specialForm}(`);
    }
  });
});
