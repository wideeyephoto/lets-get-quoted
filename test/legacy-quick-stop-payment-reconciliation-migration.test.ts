import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = join(
  process.cwd(),
  'migrations',
  '20260816093000_legacy_quick_stop_payment_reconciliation.sql',
);
const sql = readFileSync(migrationPath, 'utf8');
const compact = sql.replace(/\s+/g, ' ').trim().toLowerCase();

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx|js|mjs|cjs)$/.test(entry.name) ? [path] : [];
  });
}

function functionBody(name: string): string {
  const start = compact.indexOf(`create function public.${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = compact.indexOf('create function public.', start + 1);
  return compact.slice(start, next < 0 ? compact.length : next);
}

describe('dark legacy Quick Stop payment reconciliation migration', () => {
  it('is one atomic migration', () => {
    expect(compact).toMatch(/^--[\s\S]* begin;/);
    expect(compact.endsWith('commit;')).toBe(true);
  });

  it('never schema-qualifies PostgreSQL special forms that are not callable functions', () => {
    expect(compact).not.toMatch(/pg_catalog\.(?:coalesce|nullif|greatest|least|current_user)\b/);
  });

  it('fails closed on ambiguous payment bindings before adding uniqueness', () => {
    const preflight = compact.indexOf('ambiguous quick stop payment bindings exist');
    const unique = compact.indexOf('create unique index if not exists extra_stop_requests_payment_unique');
    expect(preflight).toBeGreaterThanOrEqual(0);
    expect(unique).toBeGreaterThan(preflight);
    expect(compact).toContain('group by r.payment_id having pg_catalog.count(*) > 1');
    expect(compact).toContain('cross-account quick stop payment bindings exist');
    expect(compact).toContain('cross-job or non-deposit quick stop payment bindings exist');
    expect(compact).toContain("p.kind::text is distinct from 'deposit'");
    expect(compact).not.toMatch(/delete from public\.extra_stop_requests|update public\.extra_stop_requests[\s\S]{0,120}payment_id = null/);
  });

  it('creates one exact-input late-refund task per payment and request', () => {
    expect(compact).toContain('create table public.quick_stop_payment_tasks');
    expect(compact).toContain("task_type text not null check (task_type = 'late_refund')");
    expect(compact).toContain('constraint quick_stop_payment_tasks_payment_type_unique unique (payment_id, task_type)');
    expect(compact).toContain('constraint quick_stop_payment_tasks_request_type_unique unique (request_id, task_type)');
    for (const field of [
      'charge_model text not null',
      'currency text not null',
      'job_id uuid not null',
      'reverse_transfer boolean not null',
      'refund_application_fee boolean not null',
      'stripe_payment_intent text not null',
      'gross_amount_cents bigint not null',
      'refunded_amount_cents bigint not null',
      'refund_amount_cents bigint not null',
      'stripe_idempotency_key text not null unique',
      'request_fingerprint text not null',
      'payment_paid_at timestamptz not null',
    ]) {
      expect(compact).toContain(field);
    }
    expect(compact).toContain("charge_model text not null check (charge_model = 'destination')");
    expect(compact).toContain('reverse_transfer boolean not null check (reverse_transfer)');
    expect(compact).toContain('refund_application_fee boolean not null check (refund_application_fee)');
    expect(compact).toContain("refund_amount_cents = gross_amount_cents - refunded_amount_cents");
    expect(compact).toContain("extensions.digest(pg_catalog.convert_to(v_snapshot::text, 'utf8'), 'sha256')");
    expect(compact).toContain('quick stop payment task provider snapshot is immutable');
  });

  it('uses deterministic event and task dedupe without changing ordinary owner events', () => {
    expect(compact).toContain('alter table public.extra_stop_events add column if not exists dedupe_key text');
    expect(compact).toContain('create unique index if not exists extra_stop_events_request_dedupe_unique');
    expect(compact).toContain('where dedupe_key is not null');
    expect(compact).toContain('quick_stop_payment.confirmed.v1:');
    expect(compact).toContain('quick_stop_payment.late_refund_queued.v1:');
    expect(compact).toContain('quick_stop_payment.late_refund_completed.v1:');
    expect(compact).toContain("v_task_key := 'late_refund.v1:' || p_payment_id::text");
    expect(compact).toContain('system quick stop event keys are backend-managed');
    expect(compact).toContain("tg_op = 'update' and (old.dedupe_key is not null or new.dedupe_key is not null)");
  });

  it('keeps the task ledger FORCE-RLS and service-role RPC-only', () => {
    expect(compact).toContain('alter table public.quick_stop_payment_tasks enable row level security');
    expect(compact).toContain('alter table public.quick_stop_payment_tasks force row level security');
    expect(compact).toContain('revoke all on table public.quick_stop_payment_tasks from public, anon, authenticated, service_role');
    expect(compact).toContain('grant select on table public.quick_stop_payment_tasks to service_role');
    expect(compact).not.toMatch(/grant (?:insert|update|delete|all) on table public\.quick_stop_payment_tasks/);

    for (const signature of [
      'reconcile_legacy_quick_stop_payment(uuid)',
      'claim_legacy_quick_stop_late_refund_tasks(integer)',
      'complete_legacy_quick_stop_late_refund_task(uuid, uuid, text)',
      'fail_legacy_quick_stop_late_refund_task(uuid, uuid, text, boolean)',
    ]) {
      expect(compact).toContain(`revoke all on function public.${signature} from public, anon, authenticated, service_role`);
      expect(compact).toContain(`grant execute on function public.${signature} to service_role`);
      expect(compact).not.toContain(`grant execute on function public.${signature} to authenticated`);
    }
  });

  it('makes every public RPC SECURITY DEFINER with a fixed empty search path', () => {
    for (const name of [
      'reconcile_legacy_quick_stop_payment',
      'claim_legacy_quick_stop_late_refund_tasks',
      'complete_legacy_quick_stop_late_refund_task',
      'fail_legacy_quick_stop_late_refund_task',
    ]) {
      const body = functionBody(name);
      expect(body).toContain('security definer');
      expect(body).toContain('set search_path = pg_catalog, pg_temp');
      expect(body).toContain("set timezone = 'utc'");
    }
  });

  it('confirms only paid destination Quick Stops with their job and event transactionally', () => {
    const reconcile = functionBody('reconcile_legacy_quick_stop_payment');
    expect(reconcile).toContain("v_payment.charge_model is distinct from 'destination'");
    expect(reconcile).toContain("v_payment.status not in ('paid', 'refunded')");
    expect(reconcile).toContain('from public.payments p where p.id = p_payment_id for update');
    expect(reconcile).toContain('from public.extra_stop_requests r where r.payment_id = p_payment_id for update');
    expect(reconcile).toContain('v_request.job_id is distinct from v_payment.job_id');
    expect(reconcile).toContain("v_payment.kind::text is distinct from 'deposit'");
    expect(reconcile).toContain("v_job.status not in ('new_lead', 'in_progress')");
    expect(reconcile).toContain("set status = 'in_progress'");
    expect(reconcile).toContain("set status = 'confirmed'");
    expect(reconcile).toContain("then 'already_confirmed' else 'confirmed'");
    expect(reconcile).toContain("if v_request.status = 'awaiting_customer_payment' then if v_job.status not in ('new_lead', 'in_progress')");
    expect(reconcile).not.toContain("charge_model = 'direct'");
  });

  it('queues an expired paid offer without claiming that provider money moved', () => {
    const reconcile = functionBody('reconcile_legacy_quick_stop_payment');
    const queue = reconcile.indexOf('insert into public.quick_stop_payment_tasks');
    const refundStatus = reconcile.indexOf("set status = 'refunded'");
    expect(queue).toBeGreaterThanOrEqual(0);
    expect(reconcile).toContain("if v_request.status = 'offer_expired'");
    expect(reconcile).toContain("'late_payment_after_expiry'");
    // The only pre-task refunded transition is guarded by already-refunded
    // local payment truth, never by task insertion alone.
    expect(refundStatus).toBeLessThan(queue);
    const refundTruth = reconcile.indexOf(
      "if v_payment.status = 'refunded' and v_refunded_cents = v_gross_cents then",
    );
    expect(refundTruth).toBeGreaterThanOrEqual(0);
    expect(refundTruth).toBeLessThan(refundStatus);
  });

  it('bounds lease retries, recovers full local refund truth, and dead-letters drift', () => {
    const claim = functionBody('claim_legacy_quick_stop_late_refund_tasks');
    expect(claim).toContain('p_batch_size < 1 or p_batch_size > 10');
    expect(claim).toContain("t.task_state = 'leased' and t.lease_expires_at <= v_now");
    expect(claim).toContain('v_task.attempt_count >= 8');
    expect(claim).toContain("task_state = 'dead_letter'");
    expect(claim).toContain("last_error_code = 'worker_attempt_limit_reached'");
    expect(claim).toContain("last_error_code = 'payment_snapshot_changed'");
    expect(claim).toContain("last_error_code = 'payment_amount_not_exact'");
    expect(claim).toContain("v_lease_expires_at := v_now + interval '5 minutes'");
    expect(claim).toContain('attempt_count = t.attempt_count + 1');
    expect(claim).toContain("completion_source = 'payment_state'");
    expect(claim).toContain('for update skip locked');
    expect(claim.indexOf("completion_source = 'payment_state'"))
      .toBeLessThan(claim.indexOf('if v_task.attempt_count >= 8'));
  });

  it('uses one task-first lock order once a refund task can exist', () => {
    const reconcile = functionBody('reconcile_legacy_quick_stop_payment');
    expect(reconcile.indexOf('from public.quick_stop_payment_tasks t'))
      .toBeLessThan(reconcile.indexOf('from public.payments p'));
    expect(reconcile.indexOf('from public.payments p'))
      .toBeLessThan(reconcile.indexOf('from public.extra_stop_requests r'));

    for (const name of [
      'claim_legacy_quick_stop_late_refund_tasks',
      'complete_legacy_quick_stop_late_refund_task',
    ]) {
      const body = functionBody(name);
      expect(body.indexOf('from public.quick_stop_payment_tasks t'))
        .toBeLessThan(body.indexOf('from public.payments p'));
      expect(body.indexOf('from public.payments p'))
        .toBeLessThan(body.indexOf('from public.extra_stop_requests r'));
    }
  });

  it('completes only after full destination refund truth and fails with bounded backoff', () => {
    const complete = functionBody('complete_legacy_quick_stop_late_refund_task');
    expect(complete).toContain("v_payment.charge_model is distinct from 'destination'");
    expect(complete).toContain("v_payment.status is distinct from 'refunded'");
    expect(complete).toContain('v_refunded is distinct from v_task.gross_amount_cents');
    expect(complete).toContain('v_payment.amount is distinct from v_gross::numeric / 100');
    expect(complete).toContain("set status = 'refunded', refund_cents = v_task.gross_amount_cents::integer");
    expect(complete).toContain("completion_source = 'provider_result'");

    const fail = functionBody('fail_legacy_quick_stop_late_refund_task');
    expect(fail).toContain('p_error_code !~');
    expect(fail).toContain('p_retryable and v_task.attempt_count < 8');
    expect(fail).toContain("task_state = 'retry_wait'");
    expect(fail).toContain('least( 60, (5 * pg_catalog.power(2, v_task.attempt_count - 1))::integer )');
    expect(fail).toContain("task_state = 'dead_letter'");
  });

  it('is reachable only through inactive exact-1 coordinator/worker boundaries', () => {
    const allowed = new Set([
      join(process.cwd(), 'src', 'lib', 'billing', 'legacy-payment-projection-coordinator.ts'),
      join(process.cwd(), 'src', 'lib', 'billing', 'legacy-quick-stop-payment-store.ts'),
      join(process.cwd(), 'src', 'lib', 'billing', 'legacy-quick-stop-late-refund-worker.ts'),
      join(process.cwd(), 'src', 'lib', 'billing', 'legacy-quick-stop-stripe-refund-executor.ts'),
      join(process.cwd(), 'src', 'lib', 'billing', 'billing-worker-cron.ts'),
      join(process.cwd(), 'src', 'app', 'api', 'cron', 'legacy-quick-stop-late-refunds', 'route.ts'),
    ]);
    const active = sourceFiles(join(process.cwd(), 'src')).filter((file) => !allowed.has(file));
    // A silent zero passes every assertion below it. The walk is the thing
    // most likely to break, and its failure looks exactly like success.
    expect(active.length).toBeGreaterThan(1_000);
    for (const file of active) {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toContain('legacy-quick-stop-payment-store');
      expect(source).not.toContain('legacy-quick-stop-late-refund-worker');
      expect(source).not.toContain('reconcile_legacy_quick_stop_payment');
      expect(source).not.toContain('claim_legacy_quick_stop_late_refund_tasks');
    }
  });
});
