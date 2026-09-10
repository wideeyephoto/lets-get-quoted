import 'server-only';
import { createHash } from 'node:crypto';
import type Stripe from 'stripe';
import { createAdminClient } from '@/lib/auth';
import { getStripeClient } from '@/lib/stripe';

export const OVERAGE_PERIOD_CLOSE_FLAG = 'LGQ_OVERAGE_PERIOD_CLOSE_ENABLED' as const;
export const OVERAGE_SETTLEMENT_FLAG = 'LGQ_OVERAGE_SETTLEMENT_ENABLED' as const;
type ServerEnvironment = Record<string, string | undefined>;
export const overagePeriodCloseWorkerEnabled = (env: ServerEnvironment = process.env): boolean => env[OVERAGE_PERIOD_CLOSE_FLAG] === '1';
export const overageSettlementWorkerEnabled = (env: ServerEnvironment = process.env): boolean => env[OVERAGE_SETTLEMENT_FLAG] === '1';
export const OVERAGE_PERIOD_CLOSE_BATCH_SIZE = 100;
export const OVERAGE_SETTLEMENT_BATCH_SIZE = 25;

// Replay also requires the original parameters and an unexpired retry window.
export function overageSettlementIdempotencyKey(input: { settlementId: string; chargeableCents: number }): string {
  const digest = createHash('sha256').update(`${input.settlementId}:${input.chargeableCents}`, 'utf8').digest('hex');
  return `lgq:billing:v1:overage.settle:${digest}`;
}

export type OveragePeriodCloseSummary = Readonly<{
  candidates: number; closed: number; already_closed: number; nothing_owed: number; deferred: number; failures: number;
}>;
type Row = Record<string, unknown>;
const object = (value: unknown): Row | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Row : null;
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export async function runOveragePeriodCloseBatch(limit = OVERAGE_PERIOD_CLOSE_BATCH_SIZE): Promise<OveragePeriodCloseSummary> {
  const admin = createAdminClient();
  const summary = { candidates: 0, closed: 0, already_closed: 0, nothing_owed: 0, deferred: 0, failures: 0 };
  // The anti-join limits unique periods after excluding closed and unfinished work.
  const { data, error } = await admin.rpc('list_unclosed_overage_periods', { p_limit: limit });
  if (error || !Array.isArray(data)) return Object.freeze({ ...summary, failures: 1 });
  summary.candidates = data.length;
  for (const candidate of data) {
    const period = object(candidate);
    try {
      if (!period || !uuid(period.account_id) || typeof period.period_start !== 'string' || typeof period.period_end !== 'string') {
        throw new Error('Invalid close candidate');
      }
      const { data: result, error: closeError } = await admin.rpc('close_overage_period', {
        p_account_id: period.account_id, p_period_start: period.period_start, p_period_end: period.period_end,
      });
      if (closeError) throw new Error(closeError.message);
      const row = object(result);
      if (row?.deferred === true) summary.deferred += 1;
      else if (row?.already_closed === true && uuid(row.id)) summary.already_closed += 1;
      else if (row?.state === 'nothing_owed' && uuid(row.id)) summary.nothing_owed += 1;
      else if (row?.state === 'closed' && uuid(row.id)) summary.closed += 1;
      else throw new Error('Unconfirmed period close');
    } catch {
      summary.failures += 1;
      console.error('overage period close failed', period?.account_id);
    }
  }
  return Object.freeze(summary);
}

export type OverageSettlementSummary = Readonly<{
  reaped: number; claimable: number; charged: number; completion_unconfirmed: number;
  no_customer: number; indeterminate: number; terminal_failures: number; worker_errors: number;
  contention: number; deferred: number;
}>;

// Never pass arbitrary provider class names/messages into last_error.
export function classifyStripeFailure(error: unknown): { code: string; indeterminate: boolean } {
  const err = error as { type?: string; code?: string } | null;
  if (err?.type === 'StripeIdempotencyError' || err?.code === 'idempotency_key_in_use') {
    return { code: 'stripe_idempotency_conflict', indeterminate: true };
  }
  if (err?.type === 'StripeInvalidRequestError' || err?.code === 'resource_missing') {
    return { code: err?.code === 'resource_missing' ? 'resource_missing' : 'invalid_request', indeterminate: false };
  }
  return { code: err?.type === 'StripeConnectionError' ? 'stripe_connection_error' : 'stripe_unavailable', indeterminate: true };
}

// One 20s request, no SDK retries, with 60s remaining before either deadline.
const REQUEST_OPTIONS = { timeout: 20_000, maxNetworkRetries: 0 } as const;
const hasDispatchTime = (claim: Row): boolean => ['retry_deadline_at', 'lease_expires_at'].every((key) =>
  typeof claim[key] === 'string' && Date.parse(claim[key] as string) > Date.now() + 60_000);

export async function runOverageSettlementBatch(limit = OVERAGE_SETTLEMENT_BATCH_SIZE): Promise<OverageSettlementSummary> {
  const admin = createAdminClient();
  const summary = { reaped: 0, claimable: 0, charged: 0, completion_unconfirmed: 0, no_customer: 0,
    indeterminate: 0, terminal_failures: 0, worker_errors: 0, contention: 0, deferred: 0 };
  const started = Date.now();
  const { data: reaped, error: reapError } = await admin.rpc('reap_overage_settlement_leases', { p_limit: limit });
  if (reapError || !Number.isInteger(reaped) || reaped < 0) return Object.freeze({ ...summary, worker_errors: 1 });
  summary.reaped = reaped as number;
  const allowlistValue = process.env.LGQ_OVERAGE_SETTLEMENT_ACCOUNT_IDS?.trim();
  const allowlist = allowlistValue ? allowlistValue.split(',').map((id) => id.trim()) : undefined;
  if (allowlist && (!allowlist.length || !allowlist.every(uuid))) return Object.freeze({ ...summary, worker_errors: 1 });
  const { data, error } = await admin.rpc('list_claimable_overage_settlements', { p_limit: limit, p_accounts: allowlist ?? null });
  if (error || !Array.isArray(data)) return Object.freeze({ ...summary, worker_errors: 1 });
  summary.claimable = data.length;
  if (!data.length) return Object.freeze(summary);

  let stripe: Stripe;
  let scope: { accountId: string; livemode: boolean };
  try {
    stripe = getStripeClient();
    const [account, balance] = await Promise.all([
      stripe.accounts.retrieve(null, {}, REQUEST_OPTIONS), stripe.balance.retrieve({}, REQUEST_OPTIONS),
    ]);
    if (!account.id || typeof balance.livemode !== 'boolean') throw new Error('Invalid Stripe scope');
    scope = { accountId: account.id, livemode: balance.livemode };
  } catch {
    return Object.freeze({ ...summary, worker_errors: 1 });
  }

  for (const candidate of data) {
    if (Date.now() - started > 180_000) { summary.deferred += 1; continue; }
    const r = object(candidate);
    try {
      if (!r || !uuid(r.id) || !uuid(r.account_id) || !Number.isSafeInteger(Number(r.chargeable_cents)) || Number(r.chargeable_cents) <= 0) {
        throw new Error('Invalid settlement candidate');
      }
      const settlementId = r.id;
      const accountId = r.account_id;
      const chargeableCents = Number(r.chargeable_cents);
      const attempted = Number(r.attempt_count) > 0;
      let payload = object(r.request_payload);
      let key = typeof r.stripe_idempotency_key === 'string' ? r.stripe_idempotency_key : '';
      if (!attempted) {
        const { data: subscription, error: lookupError } = await admin.from('billing_subscriptions')
          .select('provider_customer_id, livemode').eq('account_id', accountId)
          .not('provider_customer_id', 'is', null).order('updated_at', { ascending: false }).limit(1).maybeSingle();
        if (lookupError) throw new Error('Customer lookup failed');
        if (!subscription?.provider_customer_id) {
          const { data: marked, error: markError } = await admin.rpc('fail_overage_settlement', {
            p_settlement_id: settlementId, p_claim_token: null, p_error_code: 'no_stripe_customer', p_indeterminate: false,
          });
          if (markError || marked !== true) summary.worker_errors += 1;
          else summary.no_customer += 1;
          continue;
        }
        if (subscription.livemode !== scope.livemode) throw new Error('Provider mode mismatch');
        key = overageSettlementIdempotencyKey({ settlementId, chargeableCents });
        payload = { customer: String(subscription.provider_customer_id), amount: chargeableCents, currency: 'usd',
          description: `Extra usage beyond plan allowances, ${String(r.period_start).slice(0, 10)} to ${String(r.period_end).slice(0, 10)}`,
          metadata: { lgq_settlement_id: settlementId, lgq_account_id: accountId } };
      }
      // Retries use the original subscription identity, even after plan changes.
      if (!payload || !key || (attempted && (r.stripe_account_id !== scope.accountId || r.livemode !== scope.livemode))) {
        throw new Error('Provider request identity mismatch');
      }
      const { data: claimed, error: claimError } = await admin.rpc('claim_overage_settlement_v2', {
        p_settlement_id: settlementId, p_stripe_idempotency_key: key, p_livemode: scope.livemode,
        p_stripe_account_id: scope.accountId, p_payload: payload,
      });
      if (claimError) throw new Error('Claim failed');
      if (claimed === null) { summary.contention += 1; continue; }
      const claim = object(claimed);
      if (!claim || !uuid(claim.claim_token) || !object(claim.payload) || claim.idempotency_key !== key) throw new Error('Invalid claim result');
      const token = claim.claim_token;
      if (!hasDispatchTime(claim)) { summary.deferred += 1; continue; }
      let itemId: string;
      try {
        // A previous successful response already saved its ID. Finish locally.
        if (typeof claim.invoice_item_id === 'string') itemId = claim.invoice_item_id;
        else {
          const item = await stripe.invoiceItems.create(claim.payload as Stripe.InvoiceItemCreateParams, { ...REQUEST_OPTIONS, idempotencyKey: key });
          itemId = item.id;
        }
      } catch (providerError) {
        const failure = classifyStripeFailure(providerError);
        // A rejection of a retry cannot establish that an earlier attempt failed.
        const unsure = attempted || failure.indeterminate;
        const { data: marked, error: markError } = await admin.rpc('fail_overage_settlement', {
          p_settlement_id: settlementId, p_claim_token: token, p_error_code: failure.code, p_indeterminate: unsure,
        });
        if (markError || marked !== true) summary.worker_errors += 1;
        if (unsure) summary.indeterminate += 1; else summary.terminal_failures += 1;
        continue;
      }
      // Observation survives lost ownership; completion remains token-fenced.
      try {
        const { error: observeError, data: observed } = await admin.rpc('observe_overage_invoice_item', {
          p_settlement_id: settlementId, p_claim_token: token, p_invoice_item_id: itemId,
        });
        if (observeError || observed !== true) summary.worker_errors += 1;
      } catch { summary.worker_errors += 1; }
      let confirmed = false;
      for (let attempt = 0; attempt < 2 && !confirmed; attempt += 1) {
        try {
          const { data: completed, error: completeError } = await admin.rpc('complete_overage_settlement', {
            p_settlement_id: settlementId, p_claim_token: token, p_invoice_item_id: itemId,
          });
          confirmed = !completeError && completed === true;
        } catch { /* Same-item local completion can safely be repeated. */ }
      }
      if (confirmed) summary.charged += 1;
      else {
        summary.completion_unconfirmed += 1;
        console.error('overage completion unconfirmed', settlementId, itemId);
      }
    } catch {
      summary.worker_errors += 1;
      console.error('overage settlement worker failed', r?.id);
    }
  }
  return Object.freeze(summary);
}
