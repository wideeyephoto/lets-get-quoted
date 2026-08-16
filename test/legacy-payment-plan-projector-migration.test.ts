import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationPath = fileURLToPath(new URL(
  '../migrations/20260816091500_legacy_payment_plan_projection_foundation.sql',
  import.meta.url,
));
const sql = readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n').toLowerCase();
const compact = sql.replace(/\s+/g, ' ');
const rpc = sql.slice(sql.indexOf('create or replace function public.project_legacy_payment_plan_payment'));
const preflight = sql.slice(
  sql.indexOf('-- refuse to install uniqueness'),
  sql.indexOf('-- schema invariants needed'),
);

describe('dark legacy payment-plan projection foundation migration', () => {
  it('is additive, transactional, fixed-context, and callable only by service_role', () => {
    expect(compact).toContain('begin;');
    expect(compact.trimEnd().endsWith('commit;')).toBe(true);
    expect(sql).toContain('create or replace function public.project_legacy_payment_plan_payment');
    expect(rpc).toContain('security invoker');
    expect(rpc).toContain("set search_path = ''");
    expect(rpc).toContain("set timezone = 'utc'");
    expect(compact).toContain(
      'revoke all on function public.project_legacy_payment_plan_payment( uuid, text, text, text, text ) from public, anon, authenticated, service_role',
    );
    expect(compact).toContain(
      'grant execute on function public.project_legacy_payment_plan_payment( uuid, text, text, text, text ) to service_role',
    );
    expect(compact).not.toContain('create table');
    const planLock = compact.indexOf('lock table public.payment_plans in share row exclusive mode');
    const paymentLock = compact.indexOf('lock table public.payments in share row exclusive mode');
    const feedLock = compact.indexOf('lock table public.job_feed in share row exclusive mode');
    expect(planLock).toBeGreaterThan(-1);
    expect(planLock).toBeLessThan(paymentLock);
    expect(paymentLock).toBeLessThan(feedLock);
  });

  it('has a pure exact-cents schedule authority matching iterative monthly clamping', () => {
    const helper = sql.slice(
      sql.indexOf('create or replace function public.legacy_payment_plan_expected_installments'),
      sql.indexOf('-- refuse to install uniqueness'),
    );
    expect(helper).toContain('immutable');
    expect(helper).toContain('strict');
    expect(helper).toContain('parallel safe');
    expect(helper).toContain("set search_path = ''");
    expect(helper).toContain("set timezone = 'utc'");
    expect(helper).toContain("when 'weekly' then s.due_date + 7");
    expect(helper).toContain("when 'biweekly' then s.due_date + 14");
    expect(helper).toContain("pg_catalog.date_trunc('month', s.due_date::timestamp)");
    expect(helper).toContain("interval '1 month - 1 day'");
    expect(helper).toContain('(p_total_cents - p_deposit_cents) / p_installment_count');
    expect(helper).toContain('* (p_installment_count - 1)');
  });

  it('fails migration preflight on ambiguity without deleting, merging, or guessing', () => {
    for (const guard of [
      'invalid plan money or installment shape',
      'linked payment scope or charge model mismatch',
      'deposit binding is missing or incoherent',
      'more than one deposit is linked to a plan',
      'linked deposit is not the bound deposit',
      'one deposit is bound to multiple plans',
      'malformed installment identity',
      'duplicate installment sequence',
      'installment cents or dates differ from plan truth',
      'more than one unresolved payoff is linked to a plan',
      'payoff lock owner is missing, stale, or ambiguous',
      'source-less plan feed event cannot be bound safely',
      'deterministic feed identity conflicts with plan truth',
    ]) {
      expect(preflight).toContain(guard);
    }
    expect(preflight).not.toMatch(/\bdelete\s+from\b/);
    expect(preflight).not.toMatch(/\bupdate\s+public\./);
    expect(preflight).not.toContain('set payoff_payment_id');
    expect(preflight).toContain('an exact subset of the deterministic schedule is not ambiguous');
    expect(preflight).not.toContain('an active plan has an incomplete schedule');
    expect(preflight).toContain('the migration still does not bind it');
    expect(preflight).toContain("candidate.status::text in ('requested', 'processing', 'paid')");
    expect(preflight).toContain(') <> 1');
  });

  it('adds deterministic uniqueness, shape checks, and same-plan payoff ownership', () => {
    for (const invariant of [
      'add column if not exists payoff_payment_id uuid',
      'payments_plan_installment_seq_uidx',
      'payments_one_plan_deposit_uidx',
      'payment_plans_deposit_payment_uidx',
      'payments_one_unresolved_plan_payoff_uidx',
      'payment_plans_payoff_payment_uidx',
      'payment_plans_money_shape_check',
      'payments_payment_plan_kind_check',
      "payment_plan_id is null or kind in ('deposit', 'plan_installment', 'final')",
      'payments_payment_plan_legacy_scope_check',
      "charge_model = 'destination'",
      'and imported is false',
      "and (status <> 'paid' or paid_at is not null)",
      'payments_plan_installment_shape_check',
      'payments_payment_plan_id_id_key',
      'payment_plans_payoff_payment_same_plan_fkey',
      'foreign key (id, payoff_payment_id)',
      'references public.payments (payment_plan_id, id)',
      'deferrable initially deferred',
      'payment_plans_payoff_owner_requires_lock_check',
      'check (payoff_payment_id is null or payoff_locked_at is not null)',
    ]) {
      expect(compact).toContain(invariant);
    }
    expect(compact).toContain("status in ('requested', 'processing', 'paid')");
  });

  it('locks parent then every linked child in id order before plan-side writes', () => {
    const parent = rpc.indexOf('from public.payment_plans pp');
    const children = rpc.indexOf('from public.payments p', parent);
    const activationInsert = rpc.indexOf('insert into public.payments');
    const feedInsert = rpc.indexOf('insert into public.job_feed');

    expect(parent).toBeGreaterThan(-1);
    expect(parent).toBeLessThan(children);
    expect(children).toBeLessThan(activationInsert);
    expect(activationInsert).toBeLessThan(feedInsert);
    expect(rpc).toMatch(/from public\.payment_plans pp[\s\S]*for update/);
    expect(rpc).toMatch(/from public\.payments p[\s\S]*order by p\.id[\s\S]*for update/);
  });

  it('activates or repairs a deposit only from exact destination payment truth', () => {
    for (const guard of [
      "v_payment.charge_model is distinct from 'destination'",
      'legacy payment-plan linked payment scope or charge model changed',
      'legacy payment-plan deposit binding changed',
      'legacy payment-plan locked schedule conflicts with plan truth',
      "v_payment.kind::text = 'deposit'",
      "v_payment.status::text <> 'paid'",
      'v_plan.deposit_payment_id is distinct from v_payment.id',
      'pg_catalog.round(v_payment.amount * 100)::bigint',
      'legacy payment-plan paid deposit has refunded cents',
      "v_plan.status not in ('pending_deposit', 'active')",
      'v_plan.payoff_locked_at is not null or v_plan.payoff_payment_id is not null',
    ]) {
      expect(rpc).toContain(guard);
    }
    expect(rpc).toContain('on conflict do nothing');
    expect(rpc).toContain('legacy payment-plan installment identity conflicts with expected schedule');
    expect(rpc).toContain('legacy payment-plan schedule is incomplete after projection');
    expect(rpc).toContain("source_table = 'payments'");
    expect(rpc).toContain("f.kind = 'payment_plan_active'");
    expect(rpc).toContain('legacy payment-plan activation has an ambiguous source-less feed event');
    expect(rpc.indexOf('insert into public.job_feed')).toBeLessThan(
      rpc.indexOf('update public.payment_plans pp'),
    );
  });

  it('finalizes exact current-owner payoff truth atomically and cancels rather than deletes', () => {
    const payoff = rpc.slice(rpc.indexOf("if v_payment.kind::text = 'final'"));
    for (const guard of [
      "v_payment.status::text = 'paid'",
      'v_plan.payoff_payment_id is distinct from v_payment.id',
      'v_plan.payoff_locked_at is null',
      "p.status::text in ('processing', 'disputed')",
      'v_other_paid_cents + v_final_cents <> v_plan.total_cents::bigint',
      '(p.amount - p.refunded_amount) * 100',
      "set status = 'canceled'::public.payment_status",
      "p.kind::text = 'plan_installment' and p.status::text in ('requested', 'failed')",
      "p.kind::text = 'deposit' and p.status::text in ('requested', 'failed')",
      "f.kind = 'payment_plan_paid_off'",
      'legacy payment-plan payoff has an ambiguous source-less feed event',
      "set status = 'paid_off'",
      'payoff_locked_at = null',
      'payoff_payment_id = null',
    ]) {
      expect(payoff).toContain(guard);
    }
    expect(payoff).not.toMatch(/\bdelete\s+from\b/);
    expect(payoff.indexOf('update public.payments p')).toBeLessThan(
      payoff.indexOf('update public.payment_plans pp'),
    );
  });

  it('releases only the failed owner and makes stale/replayed failures harmless', () => {
    const failure = rpc.slice(
      rpc.indexOf("v_payment.status::text in ('failed', 'canceled')"),
    );
    expect(failure).toContain('v_plan.payoff_payment_id is distinct from v_payment.id');
    expect(failure).toContain("'payoff_lock_release_replay'::text");
    expect(failure).toContain("'stale_payoff_noop'::text");
    expect(failure).toContain("'payoff_lock_released'::text");
    expect(failure).toContain('legacy payment-plan bound payoff owner has no lock');
  });

  it('is dark and cannot call Stripe or activate any runtime switch', () => {
    for (const forbidden of [
      'stripe.checkout',
      'paymentintents.create',
      'transfer_data',
      'process.env',
      'vercel.json',
      'cron_secret',
      'enabled=1',
    ]) {
      expect(sql).not.toContain(forbidden);
    }
  });
});
