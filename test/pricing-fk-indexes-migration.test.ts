import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION_FILE = '20260815222118_pricing_foreign_key_indexes.sql';
const sql = readFileSync(join(process.cwd(), 'migrations', MIGRATION_FILE), 'utf8')
  .replace(/\r\n/g, '\n');
const compact = sql.replace(/\s+/g, ' ').toLowerCase();

describe('pricing foreign-key indexes migration', () => {
  it('is transactional', () => {
    expect(compact).toContain('begin;');
    expect(compact.trimEnd().endsWith('commit;')).toBe(true);
  });

  it('covers every foreign key introduced by the pricing foundation', () => {
    for (const definition of [
      'on public.billing_events (billing_subscription_id)',
      'on public.billing_payment_operations ( payment_id, account_id, stripe_account_id, charge_model )',
      'on public.payments (account_id, stripe_account_id)',
      'on public.usage_reservation_allocations (credit_lot_id, account_id)',
      'on public.usage_reservation_allocations (reservation_id, account_id)',
    ]) {
      expect(compact).toContain(definition);
    }
  });
});
