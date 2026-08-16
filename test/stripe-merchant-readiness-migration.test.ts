import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION_FILE = '20260815221412_stripe_merchant_readiness_scope.sql';
const sql = readFileSync(join(process.cwd(), 'migrations', MIGRATION_FILE), 'utf8')
  .replace(/\r\n/g, '\n');
const compact = sql.replace(/\s+/g, ' ').toLowerCase();

describe('Stripe Merchant readiness and scope migration', () => {
  it('is transactional and persists provider-verified readiness evidence', () => {
    expect(compact).toContain('begin;');
    expect(compact.trimEnd().endsWith('commit;')).toBe(true);
    for (const column of [
      'merchant_livemode boolean',
      'merchant_dashboard_type text',
      'merchant_card_payments_active boolean not null default false',
      'merchant_us_bank_account_payments_active boolean not null default false',
      'merchant_payouts_active boolean not null default false',
      'merchant_fees_collector text',
      'merchant_losses_collector text',
      'merchant_configuration_api_version text',
      'merchant_configuration_snapshot jsonb',
      'merchant_configuration_snapshot_sha256 text',
      'merchant_configuration_verified_at timestamptz',
    ]) {
      expect(compact).toContain(`add column if not exists ${column}`);
    }
  });

  it('cannot mark a Merchant ready without the contractor-owned liability configuration', () => {
    for (const invariant of [
      "merchant_dashboard_type = 'full'",
      'merchant_card_payments_active',
      'merchant_payouts_active',
      "merchant_fees_collector = 'stripe'",
      "merchant_losses_collector = 'stripe'",
      'merchant_livemode is not null',
      'merchant_configuration_verified_at is not null',
      'merchant_configuration_verified_at >= merchant_requirements_checked_at',
      "merchant_configuration_snapshot_sha256 ~ '^[0-9a-f]{64}$'",
    ]) {
      expect(compact).toContain(invariant);
    }
  });

  it('keeps every Merchant verification field backend-managed', () => {
    expect(compact).toContain("current_user in ('anon', 'authenticated')");
    for (const field of [
      'merchant_livemode',
      'merchant_dashboard_type',
      'merchant_card_payments_active',
      'merchant_us_bank_account_payments_active',
      'merchant_payouts_active',
      'merchant_fees_collector',
      'merchant_losses_collector',
      'merchant_configuration_api_version',
      'merchant_configuration_snapshot',
      'merchant_configuration_snapshot_sha256',
      'merchant_configuration_verified_at',
    ]) {
      expect(compact).toContain(`old.${field} is distinct from new.${field}`);
      expect(compact).toContain(field);
    }
    expect(compact).toContain('before update of stripe_merchant_account_id, merchant_onboarding_state');
  });

  it('binds direct payments to the workspace Merchant account', () => {
    expect(compact).toContain('constraint accounts_id_stripe_merchant_account_unique unique (id, stripe_merchant_account_id)');
    expect(compact).toContain('constraint payments_direct_merchant_account_fk foreign key (account_id, stripe_account_id) references public.accounts(id, stripe_merchant_account_id)');
  });

  it('requires every durable payment operation to reference the same direct payment', () => {
    expect(compact).toContain('alter column payment_id set not null');
    expect(compact).toContain('constraint payments_id_account_stripe_model_unique unique (id, account_id, stripe_account_id, charge_model)');
    expect(compact).toContain('foreign key (payment_id, account_id, stripe_account_id, charge_model) references public.payments(id, account_id, stripe_account_id, charge_model) on delete restrict');
  });
});
