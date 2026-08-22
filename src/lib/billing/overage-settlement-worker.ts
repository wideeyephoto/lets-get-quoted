import 'server-only';

import { createHash } from 'node:crypto';

import { createAdminClient } from '@/lib/auth';
import { getStripeClient } from '@/lib/stripe';

/**
 * THE TWO WORKERS THE OVERAGE RAIL HAS NEVER HAD.
 *
 * `20260819260000` built the whole settlement mechanism -- an immutable
 * snapshot per period and a claim/complete/fail ledger around the Stripe call --
 * and nothing in `src/` has ever called any of it. The only callers were the
 * PG17 harnesses. So a workspace could authorize overage, incur it, and LGQ had
 * no way to bill for it: the "failing to take money it should" half of the
 * money path, with the hard part already written and no hand on it.
 *
 * IT IS AN INVOICE ITEM, NOT A METERED PRICE. This was recorded as blocked on
 * Stripe catalog work twice. It never was: `invoiceItems.create` carries its own
 * amount and needs no Price object, so there is nothing to set up in Stripe
 * before this can run.
 *
 * TWO WORKERS AND TWO FLAGS, because they are not equally dangerous. Closing a
 * period freezes a number and touches no money; settling one creates a charge
 * against a real customer. Same measure-then-enforce split the usage meters use.
 */

export const OVERAGE_PERIOD_CLOSE_FLAG = 'LGQ_OVERAGE_PERIOD_CLOSE_ENABLED' as const;
export const OVERAGE_SETTLEMENT_FLAG = 'LGQ_OVERAGE_SETTLEMENT_ENABLED' as const;

type ServerEnvironment = Record<string, string | undefined>;

export function overagePeriodCloseWorkerEnabled(env: ServerEnvironment = process.env): boolean {
  return env[OVERAGE_PERIOD_CLOSE_FLAG] === '1';
}

export function overageSettlementWorkerEnabled(env: ServerEnvironment = process.env): boolean {
  return env[OVERAGE_SETTLEMENT_FLAG] === '1';
}

export const OVERAGE_PERIOD_CLOSE_BATCH_SIZE = 100;
export const OVERAGE_SETTLEMENT_BATCH_SIZE = 25;

/**
 * The key Stripe dedupes on, derived ONLY from fields that cannot move.
 *
 * A settlement may be claimed more than once -- `indeterminate` is deliberately
 * re-claimable, because Stripe may or may not have created the item and asking
 * again is the only way to find out. That is safe exactly as long as the second
 * ask carries the SAME key. Deriving it from anything mutable (attempt count, a
 * timestamp, the claim token) would turn the retry that exists to prevent double
 * billing into the thing that causes it.
 */
export function overageSettlementIdempotencyKey(input: {
  settlementId: string;
  chargeableCents: number;
}): string {
  const digest = createHash('sha256')
    .update(`${input.settlementId}:${input.chargeableCents}`, 'utf8')
    .digest('hex');
  return `lgq:billing:v1:overage.settle:${digest}`;
}

export type OveragePeriodCloseSummary = Readonly<{
  candidates: number;
  closed: number;
  already_closed: number;
  nothing_owed: number;
  failures: number;
}>;

/**
 * Freeze every billing period that has ended into a settlement row.
 *
 * Repeats are free: `close_overage_period` returns the existing row with
 * `already_closed: true` rather than writing a second one, which is what makes
 * "call it for every ended period" the simple correct implementation instead of
 * a diff against existing settlements that could get its join wrong.
 */
export async function runOveragePeriodCloseBatch(
  limit: number = OVERAGE_PERIOD_CLOSE_BATCH_SIZE,
): Promise<OveragePeriodCloseSummary> {
  const admin = createAdminClient();
  let candidates = 0;
  let closed = 0;
  let alreadyClosed = 0;
  let nothingOwed = 0;
  let failures = 0;

  // Only ENDED periods. A period still running has accruals that can still
  // move, and freezing one early would bill a contractor for a month they are
  // halfway through.
  const { data, error } = await admin
    .from('workspace_overage_accruals')
    .select('account_id, period_start, period_end')
    .lte('period_end', new Date().toISOString())
    .order('period_end', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('overage period close: candidate read failed:', error.message);
    return Object.freeze({ candidates: 0, closed: 0, already_closed: 0, nothing_owed: 0, failures: 1 });
  }

  // One row per resource per period, so the same period arrives several times.
  const periods = new Map<string, { accountId: string; periodStart: string; periodEnd: string }>();
  for (const row of data ?? []) {
    const r = row as Record<string, unknown>;
    const accountId = String(r.account_id);
    const periodStart = String(r.period_start);
    const periodEnd = String(r.period_end);
    periods.set(`${accountId}|${periodStart}|${periodEnd}`, { accountId, periodStart, periodEnd });
  }
  candidates = periods.size;

  for (const period of periods.values()) {
    try {
      const { data: result, error: closeError } = await admin.rpc('close_overage_period', {
        p_account_id: period.accountId,
        p_period_start: period.periodStart,
        p_period_end: period.periodEnd,
      });
      if (closeError) throw new Error(closeError.message);

      const row = (result ?? {}) as Record<string, unknown>;
      if (row.already_closed === true) alreadyClosed += 1;
      else if (row.state === 'nothing_owed') nothingOwed += 1;
      else closed += 1;
    } catch (error) {
      failures += 1;
      // The account id, never the amounts. A worker log is not a place to
      // reproduce somebody's billing.
      console.error(`overage period close failed for ${period.accountId}:`, error);
    }
  }

  return Object.freeze({ candidates, closed, already_closed: alreadyClosed, nothing_owed: nothingOwed, failures });
}

export type OverageSettlementSummary = Readonly<{
  claimable: number;
  charged: number;
  no_customer: number;
  indeterminate: number;
  terminal_failures: number;
  worker_errors: number;
}>;

/**
 * Stripe failures split three ways, and the split decides whether a contractor
 * can be charged twice.
 *
 * A request that never reached Stripe may be retried freely. One that MAY have
 * been processed must go back as `indeterminate` so the same idempotency key
 * asks again rather than a fresh attempt charging a second time. Only a refusal
 * Stripe is certain about is terminal.
 */
function classifyStripeFailure(error: unknown): { code: string; indeterminate: boolean } {
  const err = error as { type?: string; code?: string; message?: string } | null;
  const type = String(err?.type ?? '');
  const code = String(err?.code ?? '');

  // Stripe answered and refused. Retrying reproduces the refusal.
  if (type === 'StripeInvalidRequestError' || code === 'resource_missing') {
    return { code: code || 'invalid_request', indeterminate: false };
  }
  // Everything else -- connection errors, timeouts, 5xx, an unrecognised shape
  // -- is a maybe. Defaulting the UNKNOWN case to indeterminate is deliberate:
  // the cost of an extra idempotent retry is nothing, and the cost of guessing
  // "never happened" is a duplicate charge.
  return { code: code || type || 'stripe_unavailable', indeterminate: true };
}

export async function runOverageSettlementBatch(
  limit: number = OVERAGE_SETTLEMENT_BATCH_SIZE,
): Promise<OverageSettlementSummary> {
  const admin = createAdminClient();
  let claimable = 0;
  let charged = 0;
  let noCustomer = 0;
  let indeterminate = 0;
  let terminalFailures = 0;
  let workerErrors = 0;

  // `nothing_owed` rows are already resolved and carry no charge, so they are
  // not selected -- the state check does that, but the amount filter says why.
  const { data, error } = await admin
    .from('workspace_overage_settlements')
    .select('id, account_id, period_start, period_end, chargeable_cents, state, lease_expires_at')
    .in('state', ['closed', 'indeterminate'])
    .gt('chargeable_cents', 0)
    .order('period_end', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('overage settlement: candidate read failed:', error.message);
    return Object.freeze({
      claimable: 0, charged: 0, no_customer: 0, indeterminate: 0, terminal_failures: 0, worker_errors: 1,
    });
  }

  const now = Date.now();
  const rows = (data ?? []).filter((row) => {
    const r = row as Record<string, unknown>;
    // A live lease means another run holds it. Only an EXPIRED one is ours to
    // take, or two workers would both ask Stripe about the same settlement.
    if (r.state !== 'indeterminate') return true;
    const lease = r.lease_expires_at ? Date.parse(String(r.lease_expires_at)) : 0;
    return !Number.isFinite(lease) || lease <= now;
  });
  claimable = rows.length;

  for (const row of rows) {
    const r = row as Record<string, unknown>;
    const settlementId = String(r.id);
    const accountId = String(r.account_id);
    const chargeableCents = Number(r.chargeable_cents);

    try {
      const { data: subscription } = await admin
        .from('billing_subscriptions')
        .select('provider_customer_id, livemode')
        .eq('account_id', accountId)
        .not('provider_customer_id', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const customerId = subscription?.provider_customer_id
        ? String(subscription.provider_customer_id)
        : null;

      if (!customerId) {
        // A Flex workspace can accrue overage and has no Stripe customer to
        // bill. That is not a transient fault and retrying forever would bury
        // the real ones, so it is recorded terminally and left for an operator.
        noCustomer += 1;
        // The counter above is the record either way; a failure to WRITE the
        // failure must not abort the rest of the batch.
        const { error: markError } = await admin.rpc('fail_overage_settlement', {
          p_settlement_id: settlementId,
          p_claim_token: null,
          p_error_code: 'no_stripe_customer',
          p_indeterminate: false,
        });
        if (markError) console.error('overage settlement: could not mark no_stripe_customer:', markError.message);
        continue;
      }

      const idempotencyKey = overageSettlementIdempotencyKey({ settlementId, chargeableCents });
      const livemode = subscription?.livemode === true;

      // WRITTEN BEFORE THE CALL. The claim records the key and moves the row to
      // `submitted`, so a process that dies mid-request leaves evidence that we
      // were about to ask rather than a row that looks untouched.
      const { data: token, error: claimError } = await admin.rpc('claim_overage_settlement', {
        p_settlement_id: settlementId,
        p_stripe_idempotency_key: idempotencyKey,
        p_livemode: livemode,
        p_stripe_customer_id: customerId,
      });
      if (claimError) {
        // Another worker claimed it between the read and here, or the state
        // moved. Not an error worth alarming about.
        workerErrors += 1;
        continue;
      }

      const claimToken = String(token);

      try {
        const stripe = getStripeClient();
        const item = await stripe.invoiceItems.create(
          {
            customer: customerId,
            amount: chargeableCents,
            currency: 'usd',
            description: `Extra usage beyond plan allowances, ${String(r.period_start).slice(0, 10)} to ${String(r.period_end).slice(0, 10)}`,
            metadata: { lgq_settlement_id: settlementId, lgq_account_id: accountId },
          },
          { idempotencyKey },
        );

        await admin.rpc('complete_overage_settlement', {
          p_settlement_id: settlementId,
          p_claim_token: claimToken,
          p_invoice_item_id: String(item.id),
        });
        charged += 1;
      } catch (stripeError) {
        const { code, indeterminate: unsure } = classifyStripeFailure(stripeError);
        const { error: markError } = await admin.rpc('fail_overage_settlement', {
          p_settlement_id: settlementId,
          p_claim_token: claimToken,
          p_error_code: code,
          p_indeterminate: unsure,
        });
        // A settlement left in 'submitted' is recovered by its lease expiring,
        // so losing this write delays the retry rather than dropping it.
        if (markError) console.error('overage settlement: could not record failure:', markError.message);
        if (unsure) indeterminate += 1;
        else terminalFailures += 1;
      }
    } catch (error) {
      workerErrors += 1;
      console.error(`overage settlement worker error on ${settlementId}:`, error);
    }
  }

  return Object.freeze({
    claimable,
    charged,
    no_customer: noCustomer,
    indeterminate,
    terminal_failures: terminalFailures,
    worker_errors: workerErrors,
  });
}
