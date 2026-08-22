import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { createAdminClient } from '@/lib/auth';

export type SmsUsageReconciliationResult = Readonly<{
  examined: number;
  committed: number;
  released: number;
  unmetered: number;
  failed: number;
}>;

export type SmsStatusReconciliationResult = Readonly<{
  examined: number;
  projected: number;
  failed: number;
}>;

const EMPTY: SmsUsageReconciliationResult = Object.freeze({
  examined: 0, committed: 0, released: 0, unmetered: 0, failed: 0,
});

function boundedInteger(value: unknown, maximum: number): number | null {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isSafeInteger(parsed)
    && parsed >= 0 && parsed <= maximum ? parsed : null;
}

/**
 * Retry the exact reservation/overage finalization persisted before egress.
 * Only aggregate counts leave this boundary; phone numbers, event IDs, and
 * ledger identifiers never reach cron_runs or the HTTP response.
 */
export async function reconcileSmsTextUsage(
  batchSize = 100,
  admin: SupabaseClient = createAdminClient(),
): Promise<SmsUsageReconciliationResult> {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 500) {
    throw new Error('SMS text-usage reconciliation batch must be between 1 and 500.');
  }
  const { data, error } = await admin.rpc('reconcile_sms_text_usage', {
    p_batch_size: batchSize,
  });
  if (error) throw new Error('SMS text-usage reconciliation failed.');
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') throw new Error('SMS text-usage result is invalid.');
  const candidate = row as Record<string, unknown>;
  // The SQL boundary processes up to one ordinary evidence batch plus one
  // orphan-reservation and one orphan-overage batch.
  const maximumOutcomes = batchSize * 3;
  const result = {
    examined: boundedInteger(candidate.examined, maximumOutcomes),
    committed: boundedInteger(candidate.committed, maximumOutcomes),
    released: boundedInteger(candidate.released, maximumOutcomes),
    unmetered: boundedInteger(candidate.unmetered, maximumOutcomes),
    failed: boundedInteger(candidate.failed, maximumOutcomes),
  };
  if (Object.values(result).some((value) => value === null)) {
    throw new Error('SMS text-usage result is invalid.');
  }
  const typed = result as Record<keyof SmsUsageReconciliationResult, number>;
  if (typed.committed + typed.released + typed.unmetered + typed.failed !== typed.examined) {
    throw new Error('SMS text-usage result does not reconcile.');
  }
  return Object.freeze({ ...EMPTY, ...typed });
}

/** Replay authenticated status receipts that arrived before provider-id binding. */
export async function reconcileSmsMatchedStatuses(
  batchSize = 100,
  admin: SupabaseClient = createAdminClient(),
): Promise<SmsStatusReconciliationResult> {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 500) {
    throw new Error('SMS matched-status reconciliation batch must be between 1 and 500.');
  }
  const { data, error } = await admin.rpc('reconcile_sms_matched_status_receipts', {
    p_batch_size: batchSize,
  });
  if (error) throw new Error('SMS matched-status reconciliation failed.');
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') throw new Error('SMS matched-status result is invalid.');
  const candidate = row as Record<string, unknown>;
  const examined = boundedInteger(candidate.examined, batchSize);
  const projected = boundedInteger(candidate.projected, batchSize);
  const failed = boundedInteger(candidate.failed, batchSize);
  if (examined === null || projected === null || failed === null
      || projected + failed !== examined) {
    throw new Error('SMS matched-status result is invalid.');
  }
  return Object.freeze({ examined, projected, failed });
}
