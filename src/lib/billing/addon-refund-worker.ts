import 'server-only';

import { createAdminClient } from '@/lib/auth';
import { getStripeClient } from '@/lib/stripe';
import { assertConfiguredStripeBillingMode } from '@/lib/billing/stripe-billing-subscription-checkout';
import { AddonRefundContractError, resolveAddonRefund, type AddonRefundContract } from '@/lib/billing/addon-refunds';

export type RefundJob = Readonly<{ id: string; claim_token: string; charge_id: string; livemode: boolean }>;
export type RefundJobState = 'pending' | 'complete' | 'ignored' | 'review';
export type AddonRefundWorkerDependencies = Readonly<{
  claim(livemode: boolean): Promise<RefundJob | null>;
  resolve(chargeId: string, livemode: boolean): Promise<{ contract: AddonRefundContract | null; pending: boolean }>;
  apply(job: RefundJob, contract: AddonRefundContract): Promise<{ cancel_subscription: string | null }>;
  cancel(subscriptionId: string, accountId: string, livemode: boolean): Promise<void>;
  finish(job: RefundJob, state: RefundJobState, error: string | null): Promise<boolean>;
}>;

function defaultDependencies(): AddonRefundWorkerDependencies {
  const admin = createAdminClient();
  const stripe = getStripeClient();
  return {
    async claim(livemode) {
      const { data, error } = await admin.rpc('claim_addon_refund_job', { p_livemode: livemode });
      if (error) throw new Error('Refund work list unavailable.');
      if (Array.isArray(data) && data.length === 0) return null;
      if (!Array.isArray(data) || data.length !== 1) throw new Error('Invalid refund claim.');
      const row = data[0];
      if (typeof row.id !== 'string' || typeof row.claim_token !== 'string' || typeof row.charge_id !== 'string'
        || !/^(ch|py)_[A-Za-z0-9]+$/.test(row.charge_id) || row.livemode !== livemode) throw new Error('Invalid refund claim.');
      return row as RefundJob;
    },
    resolve: (chargeId, livemode) => resolveAddonRefund(stripe, chargeId, livemode),
    async apply(job, contract) {
      const { data, error } = await admin.rpc('apply_addon_refund', {
        p_job_id: job.id, p_claim_token: job.claim_token, p_contract: contract,
      });
      if (error) {
        if (error.code === '22023' || error.code === '22000') throw new AddonRefundContractError('refund_database_contract_mismatch');
        throw new Error('Refund application pending.');
      }
      if (!data || typeof data !== 'object' || !('cancel_subscription' in data)
        || (data.cancel_subscription !== null && (typeof data.cancel_subscription !== 'string' || !/^sub_[A-Za-z0-9]+$/.test(data.cancel_subscription)))) {
        throw new Error('Invalid refund application result.');
      }
      return data as { cancel_subscription: string | null };
    },
    async cancel(subscriptionId, accountId, livemode) {
      const current = await stripe.subscriptions.retrieve(subscriptionId);
      if (current.livemode !== livemode || current.metadata.lgq_account_id !== accountId || current.metadata.lgq_purpose !== 'top_up') {
        throw new AddonRefundContractError('refund_cancellation_identity_mismatch');
      }
      if (current.status === 'canceled') return;
      const canceled = await stripe.subscriptions.cancel(subscriptionId, { invoice_now: false, prorate: false });
      if (canceled.status !== 'canceled') throw new Error('Refund cancellation not confirmed.');
    },
    async finish(job, state, errorCode) {
      const { data, error } = await admin.rpc('finish_addon_refund_job', {
        p_job_id: job.id, p_claim_token: job.claim_token, p_state: state, p_error: errorCode,
      });
      if (error) throw new Error('Refund finish unavailable.');
      return data === true;
    },
  };
}

export async function runAddonRefundBatch(options: {
  batchSize?: number; dependencies?: AddonRefundWorkerDependencies;
} = {}) {
  const batchSize = options.batchSize ?? 10;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 25) throw new Error('Invalid refund batch size.');
  const mode = process.env.LGQ_STRIPE_BILLING_LIVEMODE;
  if (mode !== '0' && mode !== '1') throw new Error('Refund mode unavailable.');
  const livemode = mode === '1';
  assertConfiguredStripeBillingMode(livemode);
  const dependencies = options.dependencies ?? defaultDependencies();
  const summary = { claimed: 0, completed: 0, ignored: 0, pending: 0, review: 0, failures: 0 };
  for (let count = 0; count < batchSize; count++) {
    let job: RefundJob | null;
    try { job = await dependencies.claim(livemode); } catch { summary.failures++; break; }
    if (!job) break;
    summary.claimed++;
    let state: RefundJobState = 'complete';
    let errorCode: string | null = null;
    try {
      if (job.livemode !== livemode) throw new AddonRefundContractError('refund_mode_mismatch');
      const resolution = await dependencies.resolve(job.charge_id, livemode);
      if (!resolution.contract) state = 'ignored';
      else {
        const result = await dependencies.apply(job, resolution.contract);
        if (result.cancel_subscription) await dependencies.cancel(result.cancel_subscription, resolution.contract.account_id, livemode);
        if (resolution.pending) state = 'pending';
      }
    } catch (error) {
      if (error instanceof AddonRefundContractError) { state = 'review'; errorCode = error.code; }
      else { state = 'pending'; errorCode = 'refund_retry_required'; }
      summary.failures++;
    }
    try {
      if (!await dependencies.finish(job, state, errorCode)) { summary.failures++; continue; }
      if (state === 'complete') summary.completed++;
      else summary[state]++;
    } catch { summary.failures++; }
  }
  return summary;
}
