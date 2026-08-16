import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationPath = fileURLToPath(new URL(
  '../migrations/20260816061500_paid_plan_monthly_allowance_reset.sql',
  import.meta.url,
));
const sql = readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n').toLowerCase();
const compact = sql.replace(/\s+/g, ' ');

describe('dark paid-plan monthly allowance reset migration', () => {
  it('is an atomic one-workspace RPC with no client usage or clock authority', () => {
    expect(compact.startsWith('-- dark paid-plan monthly allowance reset foundation.')).toBe(true);
    expect(compact).toContain('begin;');
    expect(compact).toContain('commit;');
    expect(compact).toContain(
      'create function public.apply_paid_plan_monthly_allowance_reset( p_account_id uuid )',
    );
    const signature = compact.match(
      /create function public\.apply_paid_plan_monthly_allowance_reset\((.*?)\) returns table/,
    )?.[1];
    expect(signature).toBe(' p_account_id uuid ');
    expect(compact).toContain("set timezone to 'utc'");
    expect(compact).not.toContain('create extension');
    expect(compact).not.toContain('cron.schedule');
    expect(compact).not.toContain('net.http');
  });

  it('locks provider subscription then entitlement and requires paid active truth', () => {
    const subscriptionLock = compact.indexOf('from public.billing_subscriptions s');
    const entitlementLock = compact.indexOf('from public.workspace_entitlements e');
    expect(subscriptionLock).toBeGreaterThan(0);
    expect(entitlementLock).toBeGreaterThan(subscriptionLock);
    expect(compact.slice(subscriptionLock, entitlementLock)).toContain('for update');
    expect(compact.slice(entitlementLock)).toContain('for update');
    expect(compact).toContain("v_subscription.status <> 'active'");
    expect(compact).toContain("v_entitlement.billing_status <> 'active'");
    expect(compact).toContain("v_entitlement.entitlement_state <> 'active'");
    expect(compact).toContain("v_subscription.latest_invoice_status = 'open'");
    expect(compact).toContain("'invoice.payment_failed', 'invoice.payment_action_required'");
    expect(compact).toContain(
      "or v_subscription.latest_invoice_status = 'uncollectible' then",
    );
    expect(compact).toContain("v_subscription.latest_invoice_status is distinct from 'paid'");
    expect(compact).toContain('v_subscription.last_paid_at < v_subscription.current_period_start');
    expect(compact).toContain("'current_provider_period_not_paid'::text");
  });

  it('uses the entitlement cursor and original provider start for anchored months', () => {
    expect(compact).toContain('v_window_start := v_entitlement.next_allowance_reset_at');
    expect(compact).toContain('v_subscription.current_period_start at time zone \'utc\'');
    expect(compact).toContain('pg_catalog.make_interval(months => v_anchor_index)');
    expect(compact).toContain('pg_catalog.make_interval(months => v_anchor_index + 1)');
    expect(compact).toContain('for v_anchor_index in 1..11 loop');
    expect(compact).toContain('v_window_end := least(v_subscription.current_period_end, v_next_anchor_boundary)');
    expect(compact).toContain('allowance_window_end <= provider_period_end');
    expect(compact).not.toContain("interval '1 year'");
    expect(compact).not.toMatch(/v_window_start\s*\+\s*interval\s*'1 month'/);
  });

  it('fails closed across more than one due boundary without skips or backfill', () => {
    expect(compact).toContain('if v_now >= v_window_end then');
    expect(compact).toContain("'blocked_catchup', 0, 0, 'more_than_one_boundary_overdue'");
    expect(compact).toContain("'policy', 'fail_closed_no_retroactive_catchup'");
    expect(compact).toContain("'catchup_requires_reconciliation'::text");
    expect(compact).not.toContain('generate_series');
    expect(compact).not.toMatch(/granted_units\s*\*\s*12/);
    expect(compact).not.toMatch(/units\s*\*\s*12/);
  });

  it('atomically verifies exactly four canonical expiring plan lots', () => {
    expect(compact).toContain("'text_segments'::text, case v_subscription.plan_code when 'solo' then 500");
    expect(compact).toContain("'marketing_email_sends'::text, case v_subscription.plan_code when 'solo' then 500");
    expect(compact).toContain("'ai_intake_threads'::text, case v_subscription.plan_code when 'solo' then 250");
    expect(compact).toContain("'ai_writing_drafts'::text, case v_subscription.plan_code when 'solo' then 50");
    expect(compact).toContain('account_id, resource_code, source_type, idempotency_key');
    expect(compact).toContain("v_existing_lot.source_type <> 'plan_period'");
    expect(compact).toContain("'plan-period:' || v_subscription.catalog_version || ':'");
    expect(compact).toContain('on conflict (account_id, resource_code, idempotency_key) do nothing');
    expect(compact).toContain('tstzrange(v_window_start, v_window_end, \'[)\')');
    expect(compact).toContain('if v_verified_total <> 4 then');
    expect(compact).toContain('set next_allowance_reset_at = v_window_end');
    expect(compact).not.toContain('update public.usage_credit_lots');
    expect(compact).not.toContain('delete from public.usage_credit_lots');
    expect(compact).not.toMatch(/source_type\s*=\s*'purchase'/);
  });

  it('has an immutable PII-free operation identity and service-role-only API', () => {
    expect(compact).toContain('create table public.billing_allowance_reset_operations');
    expect(compact).toContain('unique (billing_subscription_id, allowance_window_start)');
    expect(compact).toContain('unique (account_id, operation_key)');
    expect(compact).toContain("status text not null check (status in ('completed', 'blocked_catchup'))");
    expect(compact).toContain('before update or delete on public.billing_allowance_reset_operations');
    expect(compact).toContain('alter table public.billing_allowance_reset_operations enable row level security');
    expect(compact).toContain('alter table public.billing_allowance_reset_operations force row level security');
    expect(compact).toContain(
      'revoke all on table public.billing_allowance_reset_operations from public, anon, authenticated, service_role',
    );
    expect(compact).toContain(
      'grant select on table public.billing_allowance_reset_operations to service_role',
    );
    expect(compact).toContain(
      'revoke all on function public.apply_paid_plan_monthly_allowance_reset(uuid) from public, anon, authenticated, service_role',
    );
    expect(compact).toContain(
      'grant execute on function public.apply_paid_plan_monthly_allowance_reset(uuid) to service_role',
    );
    for (const forbidden of ['customer_email', 'phone_number', 'street_address', 'customer_name', 'payment_method']) {
      expect(compact).not.toContain(forbidden);
    }
  });
});
