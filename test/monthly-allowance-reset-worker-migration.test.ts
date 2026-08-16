import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationPath = fileURLToPath(new URL(
  '../migrations/20260816063247_billing_allowance_reset_worker_foundation.sql',
  import.meta.url,
));
const sql = readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n').toLowerCase();
const compact = sql.replace(/\s+/g, ' ');

describe('dark paid-plan allowance reset worker migration', () => {
  it('stays dark and exposes only bounded service-role RPCs', () => {
    expect(compact.startsWith('-- dark paid-plan monthly allowance reset worker foundation.')).toBe(true);
    expect(compact).toContain('begin;');
    expect(compact).toContain('commit;');
    expect(compact).toContain('p_batch_size is null or p_batch_size not between 1 and 25');
    expect(compact).toContain('limit p_batch_size for update of w skip locked');
    expect(compact).toContain("v_lease_expires_at := v_now + interval '5 minutes'");
    expect(compact).not.toContain('cron.schedule');
    expect(compact).not.toContain('create extension');
    expect(compact).not.toContain('net.http');
    expect(compact).not.toContain('create policy');
  });

  it('selects due work deterministically without reversing domain lock order', () => {
    expect(compact).toContain('order by e.next_allowance_reset_at, e.account_id');
    expect(compact).toContain('create index workspace_entitlements_paid_allowance_worker_due_idx');
    expect(compact).toContain('for update of w skip locked');
    expect(compact).toContain(
      'create unique index billing_allowance_reset_worker_attempts_one_open_per_account',
    );
    expect(compact).not.toContain('for update of e');
    expect(compact).not.toContain('for update of s');
    const executor = compact.indexOf(
      'create function public.execute_claimed_paid_plan_allowance_reset_work',
    );
    const apply = compact.indexOf(
      'from public.apply_paid_plan_monthly_allowance_reset(v_state.account_id)',
      executor,
    );
    expect(executor).toBeGreaterThan(0);
    expect(apply).toBeGreaterThan(executor);
    expect(compact.slice(executor, apply)).not.toContain('workspace_entitlements');
    expect(compact.slice(executor, apply)).not.toContain('billing_subscriptions');
  });

  it('lets the existing one-workspace RPC own plan, units, and windows', () => {
    const signature = compact.match(
      /create function public\.execute_claimed_paid_plan_allowance_reset_work\((.*?)\) returns table/,
    )?.[1];
    expect(signature).toBe(' p_claim_token uuid ');
    expect(compact).toContain(
      'from public.apply_paid_plan_monthly_allowance_reset(v_state.account_id) r',
    );
    expect(signature).not.toContain('plan');
    expect(signature).not.toContain('units');
    expect(signature).not.toContain('window');
    expect(signature).not.toContain('now');
  });

  it('persists every semantic result and an operator-visible dead letter', () => {
    expect(compact).toContain(
      "'completed', 'blocked_catchup', 'not_due', 'not_eligible', 'failed_retryable', 'failed_terminal'",
    );
    expect(compact).toContain("outcome_status = 'blocked_catchup'");
    expect(compact).toContain("outcome_status in ('not_due', 'not_eligible')");
    expect(compact).toContain("worker_state = 'dead_letter'");
    expect(compact).toContain('create index billing_allowance_reset_worker_attempts_dead_letter_idx');
    expect(compact).toContain(
      'create index billing_allowance_reset_worker_attempts_subscription_account_idx',
    );
    expect(compact).toContain(
      'create index billing_allowance_reset_worker_attempts_reset_operation_idx',
    );
    expect(compact).toContain('where dead_lettered');
    expect(compact).toContain('before update or delete on public.billing_allowance_reset_worker_attempts');
  });

  it('bounds retries, reaps expired leases, and lets the database classify failures', () => {
    expect(compact).toContain('attempt_count integer not null default 0 check (attempt_count between 0 and 8)');
    expect(compact).toContain("error_code = 'worker_lease_expired_attempt_limit'");
    expect(compact).toContain("error_code = 'worker_lease_expired'");
    expect(compact).toContain("using errcode = 'p0004'");
    expect(compact).toContain("then 'worker_claim_lease_expired'");
    expect(compact).toContain('and v_state.attempt_count < 8');
    expect(compact).toContain("p_error_code not in ( 'worker_database_serialization'");
    expect(compact).toContain("then 'failed_retryable' else 'failed_terminal' end");
    expect(compact).not.toContain('p_retryable');
    expect(compact).not.toContain('p_next_attempt_at');
  });

  it('uses fixed privileged-function posture and no direct DML grant', () => {
    for (const name of [
      'claim_due_paid_plan_allowance_reset_work(integer)',
      'execute_claimed_paid_plan_allowance_reset_work(uuid)',
      'fail_claimed_paid_plan_allowance_reset_work(uuid, text)',
    ]) {
      expect(compact).toContain(`revoke all on function public.${name}`);
      expect(compact).toContain(`grant execute on function public.${name}`);
    }
    expect(compact.match(/security definer/g)?.length).toBe(3);
    expect(compact.match(/set search_path = pg_catalog, pg_temp/g)?.length).toBe(4);
    expect(compact.match(/set timezone to 'utc'/g)?.length).toBe(4);
    expect(compact).toContain('alter table public.billing_allowance_reset_worker_states force row level security');
    expect(compact).toContain('alter table public.billing_allowance_reset_worker_attempts force row level security');
    expect(compact).toContain(
      'revoke all on table public.billing_allowance_reset_worker_states from public, anon, authenticated, service_role',
    );
    expect(compact).toContain(
      'revoke all on table public.billing_allowance_reset_worker_attempts from public, anon, authenticated, service_role',
    );
    expect(compact).not.toMatch(/grant (insert|update|delete|truncate)/);
  });

  it('keeps the audit payload PII-free', () => {
    for (const forbidden of [
      'customer_email', 'customer_name', 'phone_number', 'street_address',
      'payment_method', 'raw_payload', 'exception_message',
    ]) {
      expect(compact).not.toContain(forbidden);
    }
  });
});
