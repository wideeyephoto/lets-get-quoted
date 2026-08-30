import crypto from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  claimClosureJob,
  processClosureJob,
  type ClosureAdapters,
  buildProductionClosureAdapters,
} from './account-closure-orchestrator';

export interface ClosureWorkerResult {
  claimed: number;
  completed: number;
  retried: number;
  failed: number;
}

/**
 * Executes one batch run of the durable account closure background worker.
 * Consumes pending and retryable jobs using FOR UPDATE SKIP LOCKED.
 */
export async function runClosureWorkerBatch(
  admin: SupabaseClient,
  options?: {
    maxBatch?: number;
    leaseDurationSeconds?: number;
    adapters?: ClosureAdapters;
  },
): Promise<ClosureWorkerResult> {
  const maxBatch = options?.maxBatch ?? 10;
  const leaseDuration = options?.leaseDurationSeconds ?? 300;
  const adapters = options?.adapters ?? buildProductionClosureAdapters(admin);

  const result: ClosureWorkerResult = {
    claimed: 0,
    completed: 0,
    retried: 0,
    failed: 0,
  };

  for (let i = 0; i < maxBatch; i++) {
    const claimToken = crypto.randomUUID();
    const job = await claimClosureJob(admin, claimToken, leaseDuration);

    if (!job) {
      // No more claimable jobs in queue
      break;
    }

    result.claimed += 1;

    try {
      const jobId = String(job.id);
      const processResult = await processClosureJob(admin, jobId, adapters, claimToken);
      if (processResult.completed) {
        result.completed += 1;
      } else if (processResult.errors.length > 0) {
        result.retried += 1;
      }
    } catch (err) {
      console.error(`Worker error processing closure job ${String(job.id)}:`, err);
      result.failed += 1;
    }
  }

  return result;
}
