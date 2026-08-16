import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationPath = fileURLToPath(new URL(
  '../migrations/20260815224559_direct_checkout_operation_orchestration.sql',
  import.meta.url,
));
const sql = readFileSync(migrationPath, 'utf8').toLowerCase();

describe('direct Checkout operation orchestration migration', () => {
  it('makes the database the atomic claim/fingerprint/replay authority', () => {
    expect(sql).toContain('claim_one_off_direct_checkout_operation');
    expect(sql).toContain('request_fingerprint');
    expect(sql).toContain('stripe_idempotency_key');
    expect(sql).toContain('on conflict do nothing');
    expect(sql).toContain("'replay'::text");
    expect(sql).toContain("operation ID was already claimed with different immutable input".toLowerCase());
    expect(sql).toContain('billing_payment_operations_one_checkout_per_payment');
  });

  it('uses an owner token and reclaims only a pre-submission expired claim', () => {
    expect(sql).toContain('claim_token uuid');
    expect(sql).toMatch(/v_operation\.state = 'claimed'[\s\S]*lease_expires_at <= pg_catalog\.now\(\)/);
    expect(sql).toContain("set state = 'submitted'");
    expect(sql).not.toMatch(/v_operation\.state = 'submitted'[\s\S]{0,250}set claim_token = v_claim_token/);
    expect(sql).not.toMatch(/v_operation\.state = 'indeterminate'[\s\S]{0,250}set claim_token = v_claim_token/);
  });

  it('checks full Merchant readiness and exact immutable payment fee cents before claim', () => {
    for (const fact of [
      "merchant_onboarding_state = 'ready'",
      "merchant_dashboard_type = 'full'",
      'merchant_card_payments_active',
      'merchant_payouts_active',
      "merchant_fees_collector = 'stripe'",
      "merchant_losses_collector = 'stripe'",
      "merchant_configuration_verified_at >= pg_catalog.now() - interval '24 hours'",
    ]) {
      expect(sql).toContain(fact);
    }
    expect(sql).toContain('v_payment.amount is distinct from p_gross_amount_cents::numeric / 100');
    expect(sql).toContain('v_payment.fee_basis_amount is distinct from p_fee_basis_amount_cents::numeric / 100');
    expect(sql).toContain('v_payment.platform_fee is distinct from p_application_fee_cents::numeric / 100');
    expect(sql).toContain('v_payment.fee_rate_bps is distinct from p_fee_rate_bps');
    expect(sql).toContain('v_payment.fee_rate is distinct from p_fee_rate');
  });

  it('atomically records the payment session and succeeded operation', () => {
    expect(sql).toContain('complete_one_off_direct_checkout_operation');
    expect(sql).toMatch(/update public\.payments[\s\S]*stripe_checkout_session = p_checkout_session_id[\s\S]*update public\.billing_payment_operations[\s\S]*state = 'succeeded'/);
    expect(sql).toContain('protect_direct_checkout_session_identity');
  });

  it('removes direct service-role DML and exposes only narrowly granted security-definer RPCs', () => {
    expect(sql.match(/security definer/g)).toHaveLength(4);
    expect(sql.match(/set search_path = pg_catalog, pg_temp/g)?.length).toBeGreaterThanOrEqual(5);
    expect(sql).toContain('revoke all on table public.billing_payment_operations from service_role');
    expect(sql).toContain('grant select on table public.billing_payment_operations to service_role');
    expect(sql).toContain('from public, anon, authenticated, service_role');
    expect(sql).toContain('grant execute on function public.claim_one_off_direct_checkout_operation');
  });

  it('contains no destination-charge or transfer fallback', () => {
    expect(sql).not.toContain('transfer_data');
    expect(sql).not.toContain('stripe_connect_id');
  });
});
