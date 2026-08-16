import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION_FILE = '20260815213142_pricing_entitlements.sql';
const sql = readFileSync(join(process.cwd(), 'migrations', MIGRATION_FILE), 'utf8')
  .replace(/\r\n/g, '\n');

const compact = sql.replace(/\s+/g, ' ').toLowerCase();

function functionDefinition(name: string): string {
  const start = compact.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} must be defined`).toBeGreaterThanOrEqual(0);
  const next = compact.indexOf('create or replace function public.', start + 1);
  return compact.slice(start, next < 0 ? compact.length : next);
}

describe('pricing entitlement migration shape', () => {
  it('is one exact timestamped, transactional migration', () => {
    expect(MIGRATION_FILE).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
    expect(compact.startsWith('-- pricing, subscriptions')).toBe(true);
    expect(compact).toContain('begin;');
    expect(compact.trimEnd().endsWith('commit;')).toBe(true);
  });

  it('keeps the legacy plan enum and recipient account untouched', () => {
    expect(compact).not.toMatch(/alter type\s+(public\.)?plan_tier/);
    expect(compact).not.toMatch(/update\s+public\.accounts\s+set\s+stripe_connect_id/);
    expect(compact).not.toMatch(/set\s+stripe_merchant_account_id\s*=\s*stripe_connect_id/);
    expect(compact).toContain('add column if not exists stripe_merchant_account_id text');
    expect(compact).toContain("merchant_onboarding_state in ('not_started', 'pending', 'restricted', 'ready', 'disabled')");
    expect(compact).toContain('accounts_stripe_merchant_account_unique');
    expect(compact).toContain('merchant_requirements_checked_at timestamptz');
    expect(compact).toContain('merchant_ready_at timestamptz');
    const guard = functionDefinition('protect_account_merchant_state');
    expect(guard).toContain("current_user in ('anon', 'authenticated')");
    expect(guard).toContain('stripe merchant state is backend-managed');
    expect(compact).toContain('before insert on public.accounts');
  });

  it('snapshots the direct-charge account, fee basis, fee plan, and reconciliation ids on each payment', () => {
    for (const column of [
      'refunded_at timestamptz',
      'platform_fee_refunded numeric(12,2) not null default 0',
      'fee_basis_amount numeric(12,2)',
      'fee_plan_code text',
      'fee_catalog_version text',
      'fee_rate_bps integer',
      'stripe_account_id text',
      "charge_model text not null default 'destination'",
      'stripe_charge_id text',
      'stripe_application_fee_id text',
      'stripe_latest_refund_id text',
      'stripe_latest_application_fee_refund_id text',
      'stripe_balance_transaction_id text',
      'reconciliation_status text',
      'reconciled_at timestamptz',
    ]) {
      expect(compact, column).toContain(`add column if not exists ${column}`);
    }

    expect(compact).toContain("check (charge_model in ('destination', 'direct'))");
    for (const required of [
      'stripe_account_id is not null',
      'fee_basis_amount is not null',
      'fee_plan_code is not null',
      'fee_catalog_version is not null',
      'fee_rate_bps is not null',
      'fee_rate is not null',
      'platform_fee is not null',
      'reconciliation_status is not null',
      "stripe_account_id ~ '^acct_[a-za-z0-9]{8,}$'",
      'fee_rate = fee_rate_bps::numeric / 10000',
      'platform_fee = pg_catalog.round(fee_basis_amount * fee_rate_bps::numeric / 10000, 2)',
    ]) {
      expect(compact, required).toContain(required);
    }
    expect(compact).toContain('constraint payments_platform_fee_check');
    expect(compact).toContain('constraint payments_fee_rate_check');
    const guard = functionDefinition('protect_payment_pricing_snapshot');
    expect(guard).toContain("current_user in ('anon', 'authenticated')");
    expect(guard).toContain('payment pricing and stripe reconciliation fields are backend-managed');
    expect(compact).toContain('before insert on public.payments');
    expect(compact).toContain('stripe_balance_transaction_id, reconciliation_status, reconciled_at on public.payments');
    for (const immutable of [
      'charge_model is distinct from new.charge_model',
      'stripe_account_id is not null and old.stripe_account_id is distinct from new.stripe_account_id',
      'fee_basis_amount is not null and old.fee_basis_amount is distinct from new.fee_basis_amount',
      "old.charge_model = 'direct' and old.platform_fee is not null and old.platform_fee is distinct from new.platform_fee",
      "old.charge_model = 'direct' and old.fee_rate is not null and old.fee_rate is distinct from new.fee_rate",
      'fee_rate_bps is not null and old.fee_rate_bps is distinct from new.fee_rate_bps',
      'fee_plan_code is not null and old.fee_plan_code is distinct from new.fee_plan_code',
      'fee_catalog_version is not null and old.fee_catalog_version is distinct from new.fee_catalog_version',
      'stripe_application_fee_id is not null',
      'stripe_charge_id is not null and old.stripe_charge_id is distinct from new.stripe_charge_id',
      'stripe_balance_transaction_id is not null',
    ]) {
      expect(guard, immutable).toContain(immutable);
    }

    const truthGuard = functionDefinition('protect_direct_payment_truth');
    expect(truthGuard).toContain("old.charge_model <> 'direct'");
    expect(truthGuard).toContain('direct payment identity and amount are immutable');
    expect(truthGuard).toContain('direct payment provider state is backend-managed');
    expect(truthGuard).toContain('old.stripe_payment_intent is not null');
    expect(truthGuard).toContain('direct payment audit rows cannot be deleted');
    expect(compact).toContain('before delete on public.payments');
  });

  it('creates the normalized subscription, entitlement, event, lot, and reservation tables', () => {
    for (const table of [
      'billing_subscriptions',
      'workspace_entitlements',
      'billing_events',
      'billing_payment_operations',
      'usage_credit_lots',
      'usage_reservations',
      'usage_reservation_allocations',
    ]) {
      expect(compact, table).toContain(`create table if not exists public.${table}`);
      expect(compact, `${table} RLS`).toContain(`alter table public.${table} enable row level security`);
      expect(compact, `${table} explicit revoke`).toContain(`revoke all on table public.${table} from public, anon, authenticated`);
    }

    for (const backendManaged of [
      'billing_subscriptions',
      'workspace_entitlements',
      'billing_events',
      'billing_payment_operations',
    ]) {
      expect(compact).toContain(`grant select, insert, update on table public.${backendManaged} to service_role`);
      expect(compact).not.toContain(`grant select, insert, update, delete on table public.${backendManaged} to service_role`);
    }
    for (const ledger of [
      'usage_credit_lots',
      'usage_reservations',
      'usage_reservation_allocations',
    ]) {
      expect(compact).toContain(`grant select on table public.${ledger} to service_role`);
      expect(compact).not.toContain(`grant select, insert, update on table public.${ledger} to service_role`);
    }
  });

  it('makes only safe owner-scoped entitlement and balance data client-readable', () => {
    expect(compact).toContain('create policy workspace_entitlements_owner_read');
    expect(compact).toContain('create policy usage_credit_lots_owner_read');
    expect(compact.match(/using \(\(select public\.is_owner\(account_id\)\)\)/g)).toHaveLength(2);

    expect(compact).toContain('grant select on table public.workspace_entitlements to authenticated');
    expect(compact).toContain('grant select ( account_id, resource_code, granted_units, consumed_units, reserved_units, revoked_units, available_from, expires_at ) on table public.usage_credit_lots to authenticated');
    expect(compact).toContain('grant select on table public.workspace_usage_credit_balances to authenticated');
    expect(compact).not.toMatch(/grant\s+(insert|update|delete|all)[^;]*\s+to authenticated/);

    // Raw Stripe payloads and reservation allocation details have no client policy.
    expect(compact).not.toMatch(/create policy[^;]+on public\.billing_events/);
    expect(compact).not.toMatch(/create policy[^;]+on public\.billing_payment_operations/);
    expect(compact).not.toMatch(/create policy[^;]+on public\.usage_reservations/);
    expect(compact).not.toMatch(/create policy[^;]+on public\.usage_reservation_allocations/);
  });

  it('uses a security-invoker aggregate balance view', () => {
    expect(compact).toContain('create or replace view public.workspace_usage_credit_balances with (security_invoker = true)');
    expect(compact).toContain('from public.usage_credit_lots l');
    expect(compact).toContain('then l.granted_units - l.consumed_units - l.reserved_units - l.revoked_units');
    expect(compact).toContain('as available_units');
    expect(compact).toContain('as next_expiration_at');
  });
});

describe('pricing entitlement security and accounting invariants', () => {
  const privilegedFunctions: Array<[string, string]> = [
    ['grant_usage_credits', 'uuid, text, bigint, text, text, text, uuid, timestamptz, timestamptz, jsonb'],
    ['reserve_usage_credits', 'uuid, text, bigint, text, text, timestamptz, jsonb'],
    ['commit_usage_reservation', 'uuid, text'],
    ['release_usage_reservation', 'uuid, text, text'],
    ['expire_usage_reservations', 'integer'],
    ['initialize_workspace_pricing', ''],
  ];

  it.each(privilegedFunctions)('%s is pinned, schema-qualified, and service-role only', (name, signature) => {
    const definition = functionDefinition(name);
    expect(definition).toContain('security definer');
    expect(definition).toContain('set search_path = pg_catalog, pg_temp');

    const qualified = `public.${name}(${signature})`;
    expect(compact).toContain(`revoke all on function ${qualified} from public, anon, authenticated`);
    expect(compact).toContain(`grant execute on function ${qualified} to service_role`);
    expect(compact).not.toContain(`grant execute on function ${qualified} to authenticated`);
  });

  it('serializes grants/reservations and allocates credits with durable idempotency keys', () => {
    expect(compact).toContain('constraint usage_credit_lots_idempotency_unique unique (account_id, resource_code, idempotency_key)');
    expect(compact).toContain('constraint usage_reservations_idempotency_unique unique (account_id, resource_code, idempotency_key)');
    expect(functionDefinition('grant_usage_credits')).toContain('pg_catalog.pg_advisory_xact_lock');
    expect(functionDefinition('grant_usage_credits')).toContain('and e.account_id = p_account_id');
    expect(functionDefinition('reserve_usage_credits')).toContain('pg_catalog.pg_advisory_xact_lock');
    expect(functionDefinition('reserve_usage_credits')).toContain('for update');
    expect(functionDefinition('reserve_usage_credits')).toContain('insufficient usage credits');
    expect(compact).toContain('consumed_units + reserved_units + revoked_units <= granted_units');
    expect(compact).toContain("source_type <> 'purchase' or expires_at is null");
  });

  it('persists Stripe mutations beyond the provider idempotency window', () => {
    expect(compact).toContain('constraint billing_payment_operations_business_key_unique unique (account_id, operation_type, operation_id)');
    expect(compact).toContain('constraint billing_payment_operations_stripe_key_unique unique (stripe_account_id, stripe_idempotency_key)');
    expect(compact).toContain('request_fingerprint text not null');
    expect(compact).toContain("state in ('claimed', 'submitted', 'succeeded', 'failed', 'indeterminate')");
    expect(compact).toContain('billing_payment_operations_recovery_idx');
    expect(compact).toContain('references public.payments(id, account_id) on delete restrict');
  });

  it('commits, releases, and expires reservations without losing their allocation audit', () => {
    const commit = functionDefinition('commit_usage_reservation');
    expect(commit).toContain('set reserved_units = l.reserved_units - v_allocation.units, consumed_units = l.consumed_units + v_allocation.units');
    expect(commit).toContain("set state = 'committed'");

    const release = functionDefinition('release_usage_reservation');
    expect(release).toContain('set reserved_units = l.reserved_units - v_allocation.units');
    expect(release).toContain("set state = 'released'");

    const expire = functionDefinition('expire_usage_reservations');
    expect(expire).toContain('for update skip locked');
    expect(expire).toContain("set state = 'expired'");
    expect(compact).toContain('primary key (reservation_id, credit_lot_id)');
    expect(compact).toContain('references public.usage_credit_lots(id, account_id) on delete no action deferrable initially deferred');
  });

  it('maps every existing development workspace to Flex and issues starter credits only once', () => {
    expect(compact).toContain("where a.plan::text <> 'free'");
    expect(compact).toContain('pricing backfill requires an explicit review of non-free legacy workspaces');
    expect(compact).toContain("a.id, 'flex', 'none', 'free', 'active', '2026-08-15-preview', 125");
    expect(compact).toContain('on conflict (account_id) do nothing');
    expect(compact).toContain("('text_segments'::text, 50::bigint)");
    expect(compact).toContain("('marketing_email_sends'::text, 100::bigint)");
    expect(compact).toContain("('ai_intake_threads'::text, 30::bigint)");
    expect(compact).toContain("('ai_writing_drafts'::text, 25::bigint)");
    expect(compact).toContain("'flex-starter:2026-08-15-preview:' || seed.resource_code");
    expect(compact).toContain('on conflict (account_id, resource_code, idempotency_key) do nothing');
  });
});
