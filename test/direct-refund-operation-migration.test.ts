import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationPath = fileURLToPath(new URL(
  '../migrations/20260816050000_direct_charge_refund_operations.sql',
  import.meta.url,
));
const modulePath = fileURLToPath(new URL(
  '../src/lib/billing/direct-refund-operation.ts',
  import.meta.url,
));
/**
 * Normalize line endings before matching. Several assertions below are exact
 * multi-line literals, and a checkout with core.autocrlf=true delivers CRLF,
 * which fails every one of them on Windows while the SQL contract is intact.
 */
function readNormalized(path: string): string {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}

const sql = readNormalized(migrationPath).toLowerCase();
const source = readNormalized(modulePath);
const srcRoot = join(dirname(modulePath), '..', '..');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.[cm]?[jt]sx?$/.test(entry.name) ? [path] : [];
  });
}

describe('DARK direct-charge refund migration', () => {
  it('requires an immutable server authorization with versioned gross/eligible allocation', () => {
    expect(sql).toContain('create table if not exists public.billing_direct_refund_authorizations');
    expect(sql).toContain('gross_refund_cents bigint not null');
    expect(sql).toContain('eligible_service_refund_cents bigint not null');
    expect(sql).toContain('allocation_policy text not null');
    expect(sql).toContain('allocation_version text not null');
    expect(sql).toContain("allocation_fingerprint ~ '^[0-9a-f]{64}$'");
    expect(sql).toContain('protect_direct_refund_authorization');
    expect(sql).not.toMatch(/grant\s+(?:insert|all)[^;]*billing_direct_refund_authorizations/);
    expect(source).not.toMatch(/grossRefundCents:\s*input\./);
    expect(source).not.toMatch(/eligibleServiceRefundCents:\s*input\./);
  });

  it('binds tenant, payment, account mode, direct model, PaymentIntent, charge, and fee', () => {
    for (const binding of [
      'v_authorization.account_id is distinct from p_account_id',
      'v_authorization.payment_id is distinct from p_payment_id',
      "v_authorization.charge_model <> 'direct'",
      'v_authorization.stripe_account_id is distinct from p_stripe_account_id',
      'v_authorization.livemode is distinct from p_livemode',
      'v_payment.stripe_payment_intent is distinct from v_authorization.stripe_payment_intent_id',
      'v_payment.stripe_charge_id is distinct from v_authorization.stripe_charge_id',
      'v_payment.stripe_application_fee_id is distinct from v_authorization.stripe_application_fee_id',
    ]) {
      expect(sql).toContain(binding);
    }
    expect(sql).toContain('billing_direct_refund_operations_operation_fk');
    expect(sql).toContain('billing_direct_refund_operations_authorization_fk');
  });

  it('serializes cumulative refunds and rounds only the eligible-service fee target', () => {
    expect(sql).toContain('for update;');
    expect(sql).toContain('billing_payment_operations_one_active_direct_refund');
    expect(sql).toContain('cumulative_eligible_after_cents = cumulative_eligible_before_cents + eligible_service_refund_cents');
    expect(sql).toMatch(/v_fee_after := case[\s\S]*v_eligible_after::numeric \* v_payment\.fee_rate_bps::numeric \/ 10000/);
    expect(sql).toMatch(/v_fee_before <> pg_catalog\.round\([\s\S]*v_eligible_before::numeric \* v_payment\.fee_rate_bps::numeric \/ 10000/);
    expect(sql).not.toMatch(/v_gross_(?:before|after)::numeric \* v_payment\.fee_rate_bps/);
    expect(sql).toContain('eligible_service_refund_cents between 0 and gross_refund_cents');
  });

  it('keeps older successful operations replayable after later cumulative refunds', () => {
    expect(sql).toContain('v_payment.refunded_amount < v_existing.cumulative_gross_after_cents::numeric / 100');
    expect(sql).toContain('v_payment.eligible_service_refunded_amount < v_existing.cumulative_eligible_after_cents::numeric / 100');
    expect(sql).toContain('v_payment.platform_fee_refunded < v_existing.application_fee_refund_after_cents::numeric / 100');
    expect(sql).toContain('a later serialized refund may have advanced the payment');
  });

  it('rechecks connected-account scope and disputes at the charge submission boundary', () => {
    const beginSubmission = sql.slice(
      sql.indexOf('create or replace function public.begin_direct_charge_refund_submission'),
      sql.indexOf('-- internal atomic accounting transition'),
    );
    expect(beginSubmission).toContain('a.stripe_merchant_account_id = v_hint.stripe_account_id');
    expect(beginSubmission).toContain('a.merchant_livemode = v_hint.livemode');
    expect(beginSubmission).toContain('v_payment.stripe_dispute_id is not null');
    expect(beginSubmission).toContain('v_payment.disputed_at is not null');
    expect(beginSubmission).toContain('v_payment.reconciled_at is null');
  });

  it('uses a one-call full refund but exact split fee reversal for partial/mixed refunds', () => {
    expect(sql).toContain("refund_mode in ('full_combined', 'split')");
    expect(sql).toContain("v_mode := case");
    expect(source).toContain("plan.refundMode === 'full_combined' ? {} : { amountCents: plan.grossRefundCents }");
    expect(source).toContain("refundApplicationFee: plan.refundMode === 'full_combined'");
    expect(source).toContain("plan.refundMode === 'split' && plan.applicationFeeRefundCents > 0");
    expect(source).toContain('amountCents: plan.applicationFeeRefundCents');
  });

  it('persists both provider results and can resume only the distinct fee step', () => {
    expect(sql).toContain('stripe_refund_id text');
    expect(sql).toContain('stripe_refund_result jsonb');
    expect(sql).toContain('stripe_application_fee_refund_id text');
    expect(sql).toContain('stripe_application_fee_refund_result jsonb');
    expect(sql).toContain("set phase = 'fee_ready'");
    expect(sql).toContain("v_claim_status := 'fee_ready'");
    expect(sql).toContain('no path can submit the charge again');
    expect(source).toContain("claim.status === 'fee_ready'");
  });

  it('never reclaims a charge- or fee-submitted ambiguity', () => {
    expect(sql).toContain("phase in (\n      'charge_ready', 'charge_submitted', 'fee_ready', 'fee_submitted'");
    expect(sql).toContain("state in ('claimed', 'submitted', 'indeterminate')");
    expect(sql).toContain('charge_submitted and fee_submitted are never reclaimed');
    expect(sql).not.toMatch(/v_detail\.phase = 'charge_submitted'[\s\S]{0,300}set claim_token = v_claim_token/);
    expect(sql).not.toMatch(/v_detail\.phase = 'fee_submitted'[\s\S]{0,300}set claim_token = v_claim_token/);
  });

  it('uses service-role-only RPC mutation with RLS and legacy-grant cleanup', () => {
    expect(sql).toContain('alter table public.billing_direct_refund_authorizations enable row level security');
    expect(sql).toContain('alter table public.billing_direct_refund_operations enable row level security');
    expect(sql).toContain('from public, anon, authenticated, service_role');
    expect(sql).toContain('revoke all on table public.billing_direct_refund_operations');
    expect(sql).toContain('grant select on table public.billing_direct_refund_operations to service_role');
    expect(sql).toContain('grant execute on function public.claim_direct_charge_refund_operation');
    expect(sql).toContain('grant execute on function public.record_direct_charge_refund_result');
    expect(sql).toContain('grant execute on function public.complete_direct_application_fee_refund_operation');
  });

  it('stays direct-charge only and contains no destination/transfer reversal fallback', () => {
    expect(sql).not.toContain('reverse_transfer');
    expect(sql).not.toContain('transfer_data');
    expect(source).not.toContain('reverseTransfer');
  });

  it('has no active source import while DARK', () => {
    const importers = sourceFiles(srcRoot)
      .filter((path) => path !== modulePath)
      .filter((path) => readFileSync(path, 'utf8').includes("@/lib/billing/direct-refund-operation"));
    expect(importers).toEqual([]);
  });
});
