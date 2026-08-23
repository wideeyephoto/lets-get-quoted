import 'server-only';

import { runPaymentSmsProducerBatch } from '@/lib/payment-sms-producer-worker';
import { runSmsDeliveryBatch } from '@/lib/sms-delivery-worker';
import {
  reconcileSmsMatchedStatuses,
  reconcileSmsTextUsage,
} from '@/lib/sms-usage-reconciliation';

const BATCH_SIZE = 20;

export function smsDeliveryWorkerEnabled(): boolean {
  return process.env.LGQ_SMS_DELIVERY_WORKER_ENABLED === '1';
}

export async function runSmsDeliveryCronBatch(): Promise<Record<string, number | string | null>> {
  let producerClaimed = 0;
  let producerCompleted = 0;
  let producerFailed = 0;
  let producerRuntimeFailure = 0;
  try {
    // Payment status transitions commit their own producer task. Drain those
    // before delivery so a newly materialized SMS can be claimed in this run.
    const producer = await runPaymentSmsProducerBatch(BATCH_SIZE);
    producerClaimed = producer.claimed;
    producerCompleted = producer.completed;
    producerFailed = producer.failed;
  } catch {
    producerRuntimeFailure = 1;
  }

  let disabledReason: string | null = null;
  let claimed = 0;
  let completed = 0;
  let cancelled = 0;
  let deferred = 0;
  let indeterminate = 0;
  let failed = 0;
  let deliveryRuntimeFailure = 0;
  try {
    const result = await runSmsDeliveryBatch(BATCH_SIZE);
    disabledReason = result.disabledReason;
    claimed = result.claimedCount;
    completed = result.completedCount;
    cancelled = result.cancelledCount;
    deferred = result.deferredCount;
    indeterminate = result.indeterminateCount;
    failed = result.failedCount;
  } catch {
    deliveryRuntimeFailure = 1;
  }

  let usageExamined = 0;
  let usageCommitted = 0;
  let usageReleased = 0;
  let usageUnmetered = 0;
  let usageFailed = 0;
  let usageRuntimeFailure = 0;
  try {
    // Accounting recovery is independent from delivery. A broken claim loop
    // must not strand prior reservations or overage authorizations.
    const usage = await reconcileSmsTextUsage(100);
    usageExamined = usage.examined;
    usageCommitted = usage.committed;
    usageReleased = usage.released;
    usageUnmetered = usage.unmetered;
    usageFailed = usage.failed;
  } catch {
    usageRuntimeFailure = 1;
  }

  let statusExamined = 0;
  let statusProjected = 0;
  let statusFailed = 0;
  let statusRuntimeFailure = 0;
  try {
    // A signed callback may beat provider-id persistence. Replay only the exact
    // stored receipt once the matching event becomes visible.
    const status = await reconcileSmsMatchedStatuses(100);
    statusExamined = status.examined;
    statusProjected = status.projected;
    statusFailed = status.failed;
  } catch {
    statusRuntimeFailure = 1;
  }

  // Keep provider, recipient, workspace, and database details out of the cron
  // response and cron_runs. Aggregate counts are enough to page an operator.
  return Object.freeze({
    requested: BATCH_SIZE,
    disabled_reason: disabledReason,
    producer_claimed: producerClaimed,
    producer_completed: producerCompleted,
    producer_failed: producerFailed,
    claimed,
    completed,
    cancelled,
    deferred,
    indeterminate,
    failed,
    usage_examined: usageExamined,
    usage_committed: usageCommitted,
    usage_released: usageReleased,
    usage_unmetered: usageUnmetered,
    usage_failed: usageFailed,
    status_examined: statusExamined,
    status_projected: statusProjected,
    status_failed: statusFailed,
    failures: producerFailed + indeterminate + failed + usageFailed + statusFailed
      + producerRuntimeFailure + deliveryRuntimeFailure
      + usageRuntimeFailure + statusRuntimeFailure,
  });
}
