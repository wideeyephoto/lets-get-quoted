import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationPath = fileURLToPath(new URL(
  '../migrations/20260816051546_direct_refund_foreign_key_indexes.sql',
  import.meta.url,
));
const sql = readFileSync(migrationPath, 'utf8').toLowerCase();
const compact = sql.replace(/\s+/g, ' ').trim();

describe('direct-refund foreign-key index follow-up migration', () => {
  it('covers the authorization-to-payment scope in foreign-key order', () => {
    expect(compact).toContain(
      'create index if not exists billing_direct_refund_authorizations_payment_scope_idx '
      + 'on public.billing_direct_refund_authorizations '
      + '( payment_id, account_id, stripe_account_id, livemode, charge_model )',
    );
  });

  it('covers the refund-operation authorization scope in foreign-key order', () => {
    expect(compact).toContain(
      'create index if not exists billing_direct_refund_operations_authorization_scope_idx '
      + 'on public.billing_direct_refund_operations '
      + '( authorization_id, account_id, payment_id, stripe_account_id, livemode, charge_model )',
    );
  });

  it('covers the refund-operation ledger scope in foreign-key order', () => {
    expect(compact).toContain(
      'create index if not exists billing_direct_refund_operations_operation_scope_idx '
      + 'on public.billing_direct_refund_operations '
      + '( operation_pk, account_id, payment_id, stripe_account_id, livemode, charge_model )',
    );
  });

  it('is retry-safe and adds only non-unique indexes', () => {
    expect(compact.startsWith('-- cover every composite direct-refund foreign key')).toBe(true);
    expect(compact).toContain('begin;');
    expect(compact.endsWith('commit;')).toBe(true);
    expect(compact.match(/create index if not exists/g)).toHaveLength(3);
    expect(compact).not.toContain('create unique index');
    expect(compact).not.toMatch(/\b(?:alter|drop|delete|update|insert)\b/);
  });
});
