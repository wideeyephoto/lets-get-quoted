import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationPath = fileURLToPath(new URL(
  '../migrations/20260816161844_direct_checkout_generation_recovery.sql',
  import.meta.url,
));
const sql = readFileSync(migrationPath, 'utf8').toLowerCase();

function sliceBetween(start: string, end: string): string {
  const startIndex = sql.indexOf(start);
  const endIndex = sql.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return sql.slice(startIndex, endIndex);
}

describe('direct Checkout generation recovery migration', () => {
  it('keeps one payment while appending a capped, exact generation lineage', () => {
    for (const fact of [
      'add column checkout_generation integer',
      'add column checkout_lifecycle text',
      'add column checkout_session_expires_at timestamptz',
      'add column checkout_expiration_id uuid',
      'add column predecessor_operation_pk uuid',
      'add column superseded_by_operation_pk uuid',
      'add column superseded_at timestamptz',
      'add column current_checkout_operation_pk uuid',
      'billing_payment_operations_checkout_generation_unique',
      'billing_payment_operations_checkout_current_unique',
      'stripe_connected_checkout_expiration_payment_generation_unique',
      "checkout_lifecycle in ('open', 'expired_unpaid', 'paid')",
      "'payment:' || payment_id::text || ':checkout:' || checkout_generation::text",
      'checkout_generation between 1 and 5',
      "'generation_cap'::text",
    ]) {
      expect(sql).toContain(fact);
    }
    expect(sql).not.toContain('insert into public.payments');
  });

  it('claims successors only under account -> payment -> ordered-attempt locks', () => {
    const claim = sliceBetween(
      'create function public.claim_one_off_direct_checkout_operation(',
      'create or replace function public.resolve_stripe_connected_payment_projection_binding(',
    );
    const accountLock = claim.indexOf('from public.accounts a');
    const paymentLock = claim.indexOf('from public.payments p', accountLock);
    const attemptLock = claim.indexOf('from public.billing_payment_operations locked_attempt', paymentLock);
    expect(accountLock).toBeGreaterThanOrEqual(0);
    expect(paymentLock).toBeGreaterThan(accountLock);
    expect(attemptLock).toBeGreaterThan(paymentLock);
    expect(claim.slice(attemptLock, attemptLock + 260)).toContain('order by locked_attempt.checkout_generation');
    expect(claim).toContain("v_current.state <> 'succeeded'");
    expect(claim).toContain("v_current.checkout_lifecycle <> 'expired_unpaid'");
    expect(claim).toContain('p_checkout_generation <> v_current.checkout_generation + 1');
    expect(claim).toContain('p_predecessor_operation_pk is distinct from v_current.id');
    expect(claim).toContain('v_payment.current_checkout_operation_pk is distinct from v_current.id');
    expect(claim).toContain("v_payment.status::text <> 'processing'");
    expect(claim).toContain("v_payment.reconciliation_status <> 'pending'");
    expect(claim).toContain("v_operation.state = 'claimed'");
    expect(claim).toContain("case when v_operation.state = 'claimed' then 'in_progress' else v_operation.state end");
  });

  it('requires exact signed expiration evidence and closes both sides of the late-success race', () => {
    const evidenceTrigger = sliceBetween(
      'create function public.bind_stripe_connected_checkout_expiration_generation()',
      'create trigger bind_stripe_connected_checkout_expiration_generation_trigger',
    );
    const accountLock = evidenceTrigger.indexOf('from public.accounts a');
    const paymentLock = evidenceTrigger.indexOf('from public.payments p', accountLock);
    const attemptLock = evidenceTrigger.indexOf('from public.billing_payment_operations o', paymentLock);
    expect(paymentLock).toBeGreaterThan(accountLock);
    expect(attemptLock).toBeGreaterThan(paymentLock);

    for (const evidence of [
      "x.observed_session_status = 'expired'",
      "x.observed_payment_status = 'unpaid'",
      "x.observed_currency = 'usd'",
      "x.observed_payment_method_types = array['card']::text[]",
      'x.observed_payment_intent_id is null',
      'x.observed_recovered_from is null',
      'x.session_expires_at = v_current.checkout_session_expires_at',
    ]) {
      expect(sql).toContain(evidence);
    }
    expect(sql.match(/stripe_connected_checkout_session_mutex_key/g)?.length).toBeGreaterThanOrEqual(5);
    expect(sql.match(/stripe_connected_checkout_expiration_conflict/g)?.length).toBeGreaterThanOrEqual(4);
    expect(sql).toMatch(/event_type in \(\s*'checkout\.session\.completed',\s*'checkout\.session\.async_payment_succeeded'/);
  });

  it('makes preparation, expiration, success, worker, and settlement consumers generation-aware', () => {
    for (const consumer of [
      'prepare_one_off_direct_invoice_payment_v1_fresh_only',
      'resolve_stripe_connected_checkout_expiration_binding',
      'project_stripe_connected_checkout_expiration',
      'resolve_stripe_connected_payment_projection_binding',
      'project_stripe_connected_payment_event',
      'claim_next_due_stripe_connected_payment_event',
      'enqueue_one_off_direct_payment_settlement',
    ]) {
      expect(sql).toContain(consumer);
    }
    expect(sql).toContain("one_off_direct_checkout_generation_v2");
    expect(sql).toContain('o.id = v_payment.current_checkout_operation_pk');
    expect(sql).toContain('o.id = new.current_checkout_operation_pk');
    expect(sql).toContain("o.checkout_lifecycle = 'paid'");
    expect(sql).toContain("source contract did not match exactly once");
    expect(sql.match(/pg_catalog\.pg_get_functiondef/g)).toHaveLength(4);
  });

  it('is dark, service-only, and contains no provider or legacy-rail mutation', () => {
    expect(sql.startsWith('-- dark generation-aware recovery')).toBe(true);
    expect(sql).toContain('begin;');
    expect(sql.trimEnd().endsWith('commit;')).toBe(true);
    expect(sql).toContain('from public, anon, authenticated, service_role');
    expect(sql).toContain('grant execute on function public.claim_one_off_direct_checkout_operation');
    expect(sql).toContain('grant execute on function public.prepare_one_off_direct_invoice_payment');
    expect(sql).not.toContain('transfer_data');
    expect(sql).not.toContain('stripe_connect_id');
    expect(sql).not.toMatch(/update public\.payments[\s\S]{0,180}set[\s\S]{0,180}refunded_/);
    expect(sql).not.toContain('delete from public.billing_payment_operations');
  });

  it('preserves destination Session writes while keeping direct pointer mutations context-gated', () => {
    const pointerTrigger = sliceBetween(
      'create or replace function public.protect_direct_checkout_session_identity()',
      'create trigger protect_direct_checkout_session_identity_trigger',
    );
    const destinationReturn = pointerTrigger.indexOf(
      "if old.charge_model <> 'direct' and new.charge_model <> 'direct' then",
    );
    const crossModelGuard = pointerTrigger.indexOf(
      "if old.charge_model <> 'direct' or new.charge_model <> 'direct' then",
    );
    const directContextGate = pointerTrigger.indexOf(
      "pg_catalog.current_setting('lgq.direct_checkout_pointer_payment_id', true)",
    );

    expect(destinationReturn).toBeGreaterThanOrEqual(0);
    expect(crossModelGuard).toBeGreaterThan(destinationReturn);
    expect(directContextGate).toBeGreaterThan(crossModelGuard);
    expect(pointerTrigger.slice(destinationReturn, crossModelGuard)).toContain('return new;');
    expect(pointerTrigger).toContain("current_user in ('anon', 'authenticated', 'service_role')");
  });
});
