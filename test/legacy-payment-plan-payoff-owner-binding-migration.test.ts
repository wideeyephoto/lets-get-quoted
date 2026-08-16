import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = join(
  process.cwd(),
  'migrations',
  '20260816100000_legacy_payment_plan_payoff_owner_binding.sql',
);
const sql = readFileSync(migrationPath, 'utf8').toLowerCase();
const compact = sql.replace(/\s+/g, ' ').trim();
const binderStart = sql.indexOf(
  'create or replace function public.bind_legacy_payment_plan_payoff_owner',
);
const preflightAndGuard = sql.slice(0, binderStart);
const preflight = sql.slice(0, sql.indexOf('create or replace function public.protect_'));
const rpc = sql.slice(binderStart);

describe('dark legacy payment-plan payoff owner binding migration', () => {
  it('is an additive transaction and never backfills the timestamp-only fixture', () => {
    expect(compact).toMatch(/^--[\s\S]* begin; /);
    expect(compact).toMatch(/ commit;$/);
    expect(preflight).toContain('pp.payoff_payment_id is null');
    expect(preflight).toContain('pp.payoff_locked_at is not null');
    expect(preflight).toContain("candidate.status::text in ('requested', 'processing', 'paid')");
    expect(preflight).toContain(') <> 1');
    expect(preflight).not.toContain('update public.payment_plans');
    expect(preflight).not.toContain('set payoff_payment_id');
    expect(sql).not.toContain('add constraint payment_plans_payoff_lock_requires_owner');
    expect(sql).toContain('do not add the reverse (timestamp requires owner) constraint yet');
  });

  it('takes migration and runtime locks in the global parent-to-child order', () => {
    const migrationPlanLock = sql.indexOf(
      'lock table public.payment_plans in share row exclusive mode',
    );
    const migrationPaymentLock = sql.indexOf(
      'lock table public.payments in share row exclusive mode',
    );
    expect(migrationPlanLock).toBeGreaterThan(-1);
    expect(migrationPaymentLock).toBeGreaterThan(migrationPlanLock);

    const runtimePlanLock = rpc.indexOf('from public.payment_plans pp');
    const runtimeForUpdate = rpc.indexOf('for update', runtimePlanLock);
    const runtimeChildLock = rpc.indexOf('from public.payments p', runtimeForUpdate);
    const deterministicOrder = rpc.indexOf('order by p.id', runtimeChildLock);
    const childForUpdate = rpc.indexOf('for update', deterministicOrder);
    const ownerUpdate = rpc.indexOf('update public.payment_plans pp');
    expect(runtimePlanLock).toBeGreaterThan(-1);
    expect(runtimeForUpdate).toBeGreaterThan(runtimePlanLock);
    expect(runtimeChildLock).toBeGreaterThan(runtimeForUpdate);
    expect(deterministicOrder).toBeGreaterThan(runtimeChildLock);
    expect(childForUpdate).toBeGreaterThan(deterministicOrder);
    expect(ownerUpdate).toBeGreaterThan(childForUpdate);
  });

  it('exposes only a service-role, fixed-context invoker RPC', () => {
    expect(rpc).toContain(
      'create or replace function public.bind_legacy_payment_plan_payoff_owner',
    );
    expect(rpc).toContain('p_payment_plan_id uuid');
    expect(rpc).toContain('p_payment_id uuid');
    expect(rpc).toContain('security invoker');
    expect(rpc).toContain("set search_path = ''");
    expect(rpc).toContain("set timezone = 'utc'");
    expect(compact).toContain(
      'revoke all on function public.bind_legacy_payment_plan_payoff_owner( uuid, uuid ) from public, anon, authenticated, service_role',
    );
    expect(compact).toContain(
      'grant execute on function public.bind_legacy_payment_plan_payoff_owner( uuid, uuid ) to service_role',
    );
    expect(rpc).not.toContain('security definer');
  });

  it('blocks raw browser DML for the owner identity without changing legacy timestamp writes', () => {
    expect(preflightAndGuard).toContain(
      'create or replace function public.protect_legacy_payment_plan_payoff_owner()',
    );
    expect(preflightAndGuard).toContain(
      "current_user in ('anon', 'authenticated')",
    );
    expect(preflightAndGuard).toContain(
      'new.payoff_payment_id is not null or new.payoff_locked_at is not null',
    );
    expect(preflightAndGuard).toContain(
      'old.payoff_payment_id is distinct from new.payoff_payment_id',
    );
    expect(preflightAndGuard).toContain(
      'revoke all on function public.protect_legacy_payment_plan_payoff_owner()',
    );
    expect(preflightAndGuard).toContain(
      'before insert or update on public.payment_plans',
    );
    expect(preflightAndGuard).toContain(
      'old.payoff_locked_at is distinct from new.payoff_locked_at',
    );
  });

  it('requires a live, policy-eligible plan and its existing timestamp lock', () => {
    expect(rpc).toContain("v_plan.status not in ('pending_deposit', 'active')");
    expect(rpc).toContain("v_plan.status = 'pending_deposit'");
    expect(rpc).toContain('v_plan.allow_pay_in_full is false');
    expect(rpc).toContain('v_plan.payoff_locked_at is null');
    expect(rpc).toContain('requires the existing payoff lock timestamp');
  });

  it('accepts only the exact sole unresolved destination final for the same account/job', () => {
    for (const proof of [
      'v_payment.account_id is distinct from v_plan.account_id',
      'v_payment.job_id is distinct from v_plan.job_id',
      "v_payment.kind::text <> 'final'",
      "v_payment.status::text not in ('requested', 'processing')",
      "v_payment.charge_model is distinct from 'destination'",
      'v_payment.imported is true',
      "p.kind::text = 'final'",
      "p.status::text in ('requested', 'processing', 'paid')",
      ') <> 1',
    ]) {
      expect(rpc).toContain(proof);
    }
    expect(rpc).toContain("p.status::text in ('processing', 'disputed')");
    expect(rpc).toContain('p.id <> v_payment.id');
  });

  it('rejects every payment, refund, dispute, dunning, and provider-submission fact', () => {
    for (const field of [
      'paid_at',
      'refunded_amount',
      'refunded_at',
      'platform_fee_refunded',
      'disputed_at',
      'dispute_reason',
      'dispute_status',
      'stripe_dispute_id',
      'dispute_due_by',
      'stripe_checkout_session',
      'stripe_payment_intent',
      'stripe_account_id',
      'stripe_charge_id',
      'stripe_application_fee_id',
      'stripe_latest_refund_id',
      'stripe_latest_application_fee_refund_id',
      'stripe_balance_transaction_id',
      'platform_fee',
      'fee_rate',
      'fee_basis_amount',
      'fee_rate_bps',
      'fee_plan_code',
      'fee_catalog_version',
      'reconciliation_status',
      'reconciled_at',
      'failure_code',
      'failure_message',
      'failed_at',
      'dunning_attempts',
      'charge_attempts',
      'next_retry_at',
      'dunning_state',
    ]) {
      expect(rpc).toContain(`v_payment.${field}`);
    }
  });

  it('derives exact remaining cents under lock instead of accepting caller money', () => {
    expect(rpc).toContain(
      'pg_catalog.round((p.amount - p.refunded_amount) * 100)::bigint',
    );
    expect(rpc).toContain(
      'v_remaining_cents := v_plan.total_cents::bigint - v_paid_cents',
    );
    expect(rpc).toContain(
      'pg_catalog.round(v_payment.amount * 100)::bigint <> v_remaining_cents',
    );
    expect(rpc).not.toContain('p_amount');
    expect(rpc).not.toContain('p_remaining_cents');
  });

  it('is idempotent only for the same owner and rejects stale/different owners', () => {
    expect(rpc).toContain('v_plan.payoff_payment_id is distinct from v_payment.id');
    expect(rpc).toContain('conflicts with a different lock owner');
    expect(rpc).toContain('if v_plan.payoff_payment_id is null then');
    expect(rpc).toContain("v_binding_status := 'bound'");
    expect(rpc).toContain("v_binding_status := 'already_bound'");
    expect(rpc).toContain('and pp.payoff_payment_id is null');
    expect(rpc).toContain('lost its owner compare-and-set');
  });

  it('only binds the owner and contains no payment lifecycle or provider side effect', () => {
    expect(rpc).toContain('set payoff_payment_id = v_payment.id');
    expect(rpc).not.toContain('insert into public.payments');
    expect(rpc).not.toContain('delete from public.payments');
    expect(rpc).not.toContain("set status = 'canceled'");
    expect(rpc).not.toContain('net.http_');
    expect(rpc).not.toContain('stripe.checkout.sessions.create');
  });
});
