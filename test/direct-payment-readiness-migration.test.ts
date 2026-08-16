import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION_FILE = '20260815222631_direct_payment_readiness_gate.sql';
const sql = readFileSync(join(process.cwd(), 'migrations', MIGRATION_FILE), 'utf8')
  .replace(/\r\n/g, '\n');
const compact = sql.replace(/\s+/g, ' ').toLowerCase();

describe('direct payment Merchant readiness migration', () => {
  it('is transactional and snapshots test/live mode', () => {
    expect(compact).toContain('begin;');
    expect(compact.trimEnd().endsWith('commit;')).toBe(true);
    expect(compact).toContain('add column if not exists stripe_livemode boolean');
    expect(compact).toContain('add column if not exists livemode boolean');
    expect(compact).toContain('alter column livemode set not null');
    expect(compact).toContain('stripe_livemode is not null');
  });

  it('binds payment and operation mode to the workspace Merchant account', () => {
    expect(compact).toContain('constraint accounts_id_stripe_merchant_livemode_unique unique (id, stripe_merchant_account_id, merchant_livemode)');
    expect(compact).toContain('foreign key (account_id, stripe_account_id, stripe_livemode) references public.accounts(id, stripe_merchant_account_id, merchant_livemode)');
    expect(compact).toContain('foreign key (payment_id, account_id, stripe_account_id, livemode, charge_model) references public.payments(id, account_id, stripe_account_id, stripe_livemode, charge_model) on delete restrict');
  });

  it('requires recently verified readiness before a direct payment exists', () => {
    expect(compact).toContain("a.merchant_onboarding_state = 'ready'");
    expect(compact).toContain('a.merchant_livemode = new.stripe_livemode');
    expect(compact).toContain("a.merchant_configuration_verified_at >= pg_catalog.now() - interval '24 hours'");
    expect(compact).toContain('direct payment requires a recently verified, ready stripe merchant account');
    expect(compact).toContain('before insert on public.payments');
  });

  it('keeps payment and operation livemode immutable', () => {
    expect(compact).toContain('payments.stripe_livemode is immutable');
    expect(compact).toContain('billing payment operation livemode is immutable');
    expect(compact).toContain('payment stripe mode is backend-managed');
  });
});
