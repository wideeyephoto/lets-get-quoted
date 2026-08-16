import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION_FILE = '20260815220739_pricing_entitlements_hardening.sql';
const sql = readFileSync(join(process.cwd(), 'migrations', MIGRATION_FILE), 'utf8')
  .replace(/\r\n/g, '\n');
const compact = sql.replace(/\s+/g, ' ').toLowerCase();

describe('pricing entitlement hardening migration', () => {
  it('is a transactional follow-up migration', () => {
    expect(MIGRATION_FILE).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
    expect(compact).toContain('begin;');
    expect(compact.trimEnd().endsWith('commit;')).toBe(true);
  });

  it('removes legacy service-role defaults before granting the exact surface', () => {
    for (const table of [
      'billing_subscriptions',
      'workspace_entitlements',
      'billing_events',
      'billing_payment_operations',
      'usage_credit_lots',
      'usage_reservations',
      'usage_reservation_allocations',
      'workspace_usage_credit_balances',
    ]) {
      expect(compact).toContain(`revoke all on table public.${table} from service_role`);
    }

    for (const mutable of [
      'billing_subscriptions',
      'workspace_entitlements',
      'billing_events',
      'billing_payment_operations',
    ]) {
      expect(compact).toContain(`grant select, insert, update on table public.${mutable} to service_role`);
    }
    for (const readonly of [
      'usage_credit_lots',
      'usage_reservations',
      'usage_reservation_allocations',
      'workspace_usage_credit_balances',
    ]) {
      expect(compact).toContain(`grant select on table public.${readonly} to service_role`);
    }
    expect(compact).not.toMatch(/grant\s+[^;]*delete[^;]*to service_role/);
  });

  it('keeps expiration batches bounded even when a caller passes NULL', () => {
    expect(compact).toContain('if p_limit is null or p_limit < 1 or p_limit > 1000 then');
    expect(compact).toContain('limit p_limit for update skip locked');
    expect(compact).toContain('revoke all on function public.expire_usage_reservations(integer) from service_role');
    expect(compact).toContain('grant execute on function public.expire_usage_reservations(integer) to service_role');
  });

  it('makes Stripe reconciliation objects unique within a connected account', () => {
    expect(compact).toContain('create unique index if not exists payments_stripe_account_charge_unique');
    expect(compact).toContain('on public.payments (stripe_account_id, stripe_charge_id)');
    expect(compact).toContain('create unique index if not exists payments_stripe_account_intent_unique');
    expect(compact).toContain('on public.payments (stripe_account_id, stripe_payment_intent)');
    expect(compact).toContain('create unique index if not exists payments_stripe_account_session_unique');
    expect(compact).toContain('on public.payments (stripe_account_id, stripe_checkout_session)');
  });

  it('binds every durable payment operation to its payment Stripe scope', () => {
    expect(compact).toContain('constraint payments_id_account_stripe_account_unique unique (id, account_id, stripe_account_id)');
    expect(compact).toContain('foreign key (payment_id, account_id, stripe_account_id) references public.payments(id, account_id, stripe_account_id) on delete restrict');
  });
});
