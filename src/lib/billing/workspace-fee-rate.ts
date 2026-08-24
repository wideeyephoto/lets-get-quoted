import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/auth';
import {
  BILLING_PLANS,
  parseBillingPlanId,
  QUICK_STOP_PLATFORM_FEE_BPS,
  QUICK_STOP_PLATFORM_FEE_RATE,
  type BillingPlanId,
} from '@/lib/billing/catalog';

/**
 * The platform fee rate a workspace is actually on.
 *
 * /pricing sells a rate that follows the PLAN -- 1.25% on Flex down to 0.10% on
 * Scale -- and /features/payments says it in as many words: "Your rate follows
 * your plan, not a trailing-volume bracket". The charge path did the opposite.
 * It rated every payment off `computeFeeRate(trailingVolume)`, a four-bracket
 * table in src/lib/stripe.ts that no customer-facing page mentions, so a Scale
 * subscriber paying $329/month for a 0.10% rate was charged 1.25%.
 *
 * The volume brackets are not deleted. They stay as the /admin diagnostic they
 * are already labelled as ("Legacy volume tier (not plan authority)"), which is
 * also what keeps the trailing-volume paging guard meaningful.
 *
 * FAILS CLOSED, on purpose, in the two cases where the right rate is unknowable:
 *
 *  - `plan_code` is a plan the catalog cannot price. The CHECK constraint
 *    permits 'enterprise' and BILLING_PLAN_IDS does not include it, so
 *    parseBillingPlanId returns null and resolveBillingPlanId would quietly
 *    answer 'flex' -- turning an unsupported plan into the HIGHEST rate on the
 *    board. Enterprise terms are negotiated; guessing is wrong in both
 *    directions, and wrong quietly.
 *  - The stored `platform_fee_bps` disagrees with the plan's catalog rate.
 *    Nothing constrains that column against `plan_code` (the only CHECK is
 *    0..10000), so the two can drift. Both payment RPCs already re-derive an
 *    expected bps and refuse on mismatch; a TypeScript reader that trusted the
 *    stored number alone would be the first one without that guard.
 *
 * A missing row is different, and does NOT fail closed: it is a real state
 * (nothing guarantees every account has one) and Flex is both the correct
 * default and numerically identical to what the old bracket table charged at
 * tier 1, so nobody's fee moves because of it.
 */

export type WorkspaceFeeRate = Readonly<{
  planCode: BillingPlanId;
  feeRateBps: number;
  /** The same rate as a decimal, which is the shape the destination rail stores and bills in. */
  feeRate: number;
  source: 'entitlement' | 'default';
}>;

export type PaymentFeeRate = Readonly<{
  planCode: BillingPlanId;
  feeRateBps: number;
  /** The same rate as a decimal, which is the shape the destination rail stores and bills in. */
  feeRate: number;
  source: 'entitlement' | 'default' | 'quick_stop';
}>;

/** No entitlement row is not an error, and Flex is what an unclassified workspace is on. */
const DEFAULT_PLAN: BillingPlanId = 'flex';

function rateFor(planCode: BillingPlanId, source: WorkspaceFeeRate['source']): WorkspaceFeeRate {
  const feeRateBps = BILLING_PLANS[planCode].platformFeeBps;
  return Object.freeze({ planCode, feeRateBps, feeRate: feeRateBps / 10_000, source });
}

export async function getWorkspaceFeeRate(accountId: string): Promise<WorkspaceFeeRate> {
  // Service-role: the only caller that matters is a homeowner paying on the
  // public /pay page, where there is no owner session at all and anon has
  // neither a grant nor a policy on this table.
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('workspace_entitlements')
    .select('plan_code, platform_fee_bps, entitlement_state')
    .eq('account_id', accountId)
    .maybeSingle();

  // A read failure is not a licence to pick a number. The old path threw here
  // too, and billing the wrong rate is worse than not billing yet.
  if (error) {
    throw new Error(`Unable to read the platform fee rate for this workspace: ${error.message}`);
  }

  if (!data) return rateFor(DEFAULT_PLAN, 'default');

  // The projector writes plan_code and platform_fee_bps on EVERY subscription
  // event, cancellation included -- only entitlement_state moves. So a cancelled
  // or unpaid Scale workspace keeps plan_code 'scale' forever, and reading the
  // plan alone would go on charging it 0.10% indefinitely for a subscription it
  // no longer has. 'grace' still gets the plan rate: they are past due, not gone,
  // and grace already blocks collection by other means.
  const entitled = data.entitlement_state === 'active' || data.entitlement_state === 'grace';
  if (!entitled) return rateFor(DEFAULT_PLAN, 'default');

  const planCode = parseBillingPlanId(data.plan_code);
  if (!planCode) {
    throw new Error(
      `Workspace is on plan "${String(data.plan_code)}", which has no catalog platform fee rate. `
      + 'Refusing to guess one.',
    );
  }

  const expectedBps = BILLING_PLANS[planCode].platformFeeBps;
  const storedBps = data.platform_fee_bps;
  if (typeof storedBps === 'number' && storedBps !== expectedBps) {
    throw new Error(
      `Stored platform_fee_bps (${storedBps}) disagrees with the ${planCode} catalog rate (${expectedBps}). `
      + 'Refusing to charge either until the entitlement is reconciled.',
    );
  }

  return rateFor(planCode, 'entitlement');
}

/**
 * Checks whether a payment is the priority visit fee for a Quick Stop.
 * Quick Stop priority fees are created as deposits linked to `extra_stop_requests`.
 */
export async function isQuickStopPayment(
  admin: SupabaseClient,
  payment: { id?: string | null; kind?: string | null },
): Promise<boolean> {
  if (!payment.id) return false;
  if (payment.kind && payment.kind !== 'deposit') return false;

  const { data, error } = await admin
    .from('extra_stop_requests')
    .select('id')
    .eq('payment_id', payment.id)
    .maybeSingle();

  if (error || !data) return false;
  return true;
}

/**
 * Resolves the platform fee rate for a specific payment.
 *
 * Quick Stop priority visit fees are charged a dedicated 10% platform fee
 * (QUICK_STOP_PLATFORM_FEE_BPS = 1000). All subsequent service work invoices
 * and standard payments follow the workspace's plan rate (0.10% – 1.25%).
 */
export async function resolvePaymentFeeRate(
  admin: SupabaseClient,
  payment: { id?: string | null; account_id: string; kind?: string | null },
): Promise<PaymentFeeRate> {
  const isQuickStop = await isQuickStopPayment(admin, payment);
  if (isQuickStop) {
    let planCode: BillingPlanId = DEFAULT_PLAN;
    try {
      const workspaceRate = await getWorkspaceFeeRate(payment.account_id);
      planCode = workspaceRate.planCode;
    } catch {
      planCode = DEFAULT_PLAN;
    }
    return Object.freeze({
      planCode,
      feeRateBps: QUICK_STOP_PLATFORM_FEE_BPS,
      feeRate: QUICK_STOP_PLATFORM_FEE_RATE,
      source: 'quick_stop',
    });
  }

  return getWorkspaceFeeRate(payment.account_id);
}

