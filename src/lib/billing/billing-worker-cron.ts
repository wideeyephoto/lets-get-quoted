import 'server-only';

import {
  runPaidPlanMonthlyAllowanceResetBatch,
  type RunPaidPlanMonthlyAllowanceResetBatchResult,
} from '@/lib/billing/monthly-allowance-reset-worker';
import {
  runStripeBillingSubscriptionProjectionBatch,
  type StripeSubscriptionProjectionWorkerBatchResult,
} from '@/lib/billing/subscription-projection-worker';

/**
 * DARK scheduler boundary for the two durable billing workers.
 *
 * The route gate is deliberately separate from CRON_SECRET. A disabled route
 * must stop before the authenticated cron wrapper reads the secret, creates a
 * service-role client, records a heartbeat, or invokes either worker. Once a
 * gate is enabled, cronRoute remains the single authentication and monitoring
 * authority used by every other scheduled job.
 */

export const STRIPE_SUBSCRIPTION_PROJECTION_WORKER_FLAG =
  'LGQ_STRIPE_SUBSCRIPTION_PROJECTION_WORKER_ENABLED';
export const PAID_PLAN_ALLOWANCE_RESET_WORKER_FLAG =
  'LGQ_PAID_PLAN_ALLOWANCE_RESET_WORKER_ENABLED';

// Request input never controls these bounds. Increasing either value requires
// a reviewed deploy, so a query string cannot turn one scheduler call into an
// unbounded provider or database loop.
export const STRIPE_SUBSCRIPTION_PROJECTION_BATCH_SIZE = 10;
export const PAID_PLAN_ALLOWANCE_RESET_BATCH_SIZE = 10;

type ServerEnvironment = Readonly<Record<string, string | undefined>>;

export function stripeSubscriptionProjectionWorkerEnabled(
  env: ServerEnvironment = process.env,
): boolean {
  return env[STRIPE_SUBSCRIPTION_PROJECTION_WORKER_FLAG] === '1';
}

export function paidPlanAllowanceResetWorkerEnabled(
  env: ServerEnvironment = process.env,
): boolean {
  return env[PAID_PLAN_ALLOWANCE_RESET_WORKER_FLAG] === '1';
}

export type StripeSubscriptionProjectionCronSummary = Readonly<{
  requested: number;
  claimed: number;
  processed: number;
  ignored: number;
  replayed: number;
  in_progress: number;
  retryable_failures: number;
  terminal_failures: number;
  worker_errors: number;
  claim_errors: number;
  failures: number;
}>;

/** Collapse event/workspace/provider identifiers before cron_runs sees them. */
export function summarizeStripeSubscriptionProjectionBatch(
  result: StripeSubscriptionProjectionWorkerBatchResult,
): StripeSubscriptionProjectionCronSummary {
  let processed = 0;
  let ignored = 0;
  let replayed = 0;
  let inProgress = 0;
  let retryableFailures = 0;
  let terminalFailures = 0;
  let workerErrors = 0;

  for (const item of result.results) {
    switch (item.status) {
      case 'processed':
        processed += 1;
        break;
      case 'ignored':
        ignored += 1;
        break;
      case 'replay_processed':
      case 'replay_ignored':
        replayed += 1;
        break;
      case 'in_progress':
        inProgress += 1;
        break;
      case 'failed_retryable':
        retryableFailures += 1;
        break;
      case 'failed_terminal':
        terminalFailures += 1;
        break;
      case 'worker_error':
        workerErrors += 1;
        break;
    }
  }

  const claimErrors = result.status === 'claim_failed' ? 1 : 0;
  const failures = retryableFailures + terminalFailures + workerErrors + claimErrors;
  return Object.freeze({
    requested: result.requestedBatchSize,
    claimed: result.claimedCount,
    processed,
    ignored,
    replayed,
    in_progress: inProgress,
    retryable_failures: retryableFailures,
    terminal_failures: terminalFailures,
    worker_errors: workerErrors,
    claim_errors: claimErrors,
    failures,
  });
}

export type PaidPlanAllowanceResetCronSummary = Readonly<{
  requested: number;
  claimed: number;
  completed: number;
  not_due: number;
  not_eligible: number;
  already_finished: number;
  blocked: number;
  retryable_failures: number;
  terminal_failures: number;
  failures: number;
}>;

/** Collapse workspace, subscription, operation, attempt, and time identifiers. */
export function summarizePaidPlanAllowanceResetBatch(
  result: RunPaidPlanMonthlyAllowanceResetBatchResult,
  requested = PAID_PLAN_ALLOWANCE_RESET_BATCH_SIZE,
): PaidPlanAllowanceResetCronSummary {
  let completed = 0;
  let notDue = 0;
  let notEligible = 0;
  let alreadyFinished = 0;
  let blocked = 0;
  let retryableFailures = 0;
  let terminalFailures = 0;

  for (const outcome of result.outcomes) {
    switch (outcome.status) {
      case 'completed':
        completed += 1;
        break;
      case 'not_due':
        notDue += 1;
        break;
      case 'not_eligible':
        notEligible += 1;
        break;
      case 'already_finished':
        alreadyFinished += 1;
        break;
      case 'blocked_catchup':
        blocked += 1;
        break;
      case 'failed_retryable':
        retryableFailures += 1;
        break;
      case 'failed_terminal':
        terminalFailures += 1;
        break;
    }
  }

  const failures = blocked + retryableFailures + terminalFailures;
  return Object.freeze({
    requested,
    claimed: result.claimedCount,
    completed,
    not_due: notDue,
    not_eligible: notEligible,
    already_finished: alreadyFinished,
    blocked,
    retryable_failures: retryableFailures,
    terminal_failures: terminalFailures,
    failures,
  });
}

export async function runStripeSubscriptionProjectionCronBatch(): Promise<
StripeSubscriptionProjectionCronSummary
> {
  const result = await runStripeBillingSubscriptionProjectionBatch(
    STRIPE_SUBSCRIPTION_PROJECTION_BATCH_SIZE,
  );
  return summarizeStripeSubscriptionProjectionBatch(result);
}

export async function runPaidPlanAllowanceResetCronBatch(): Promise<
PaidPlanAllowanceResetCronSummary
> {
  const result = await runPaidPlanMonthlyAllowanceResetBatch(
    PAID_PLAN_ALLOWANCE_RESET_BATCH_SIZE,
  );
  return summarizePaidPlanAllowanceResetBatch(
    result,
    PAID_PLAN_ALLOWANCE_RESET_BATCH_SIZE,
  );
}
