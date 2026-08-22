import 'server-only';

import { runSmsInboundActionBatch } from '@/lib/sms-inbound-action-worker';

const BATCH_SIZE = 20;

export function smsInboundActionWorkerEnabled(): boolean {
  return process.env.LGQ_SMS_INBOUND_ACTION_WORKER_ENABLED === '1';
}

export async function runSmsInboundActionCronBatch(): Promise<Record<string, number>> {
  try {
    const result = await runSmsInboundActionBatch(BATCH_SIZE);
    return Object.freeze({
      requested: BATCH_SIZE,
      claimed: result.claimedCount,
      completed: result.completedCount,
      failed: result.failedCount,
      failures: result.failedCount,
    });
  } catch {
    return Object.freeze({ requested: BATCH_SIZE, claimed: 0, completed: 0, failed: 0, failures: 1 });
  }
}
