import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { createAdminClient } from '@/lib/auth';

export const VOICE_RETENTION_BATCH_SIZE = 500;
export const VOICE_RETENTION_MAX_BATCHES = 50;

export type VoiceRetentionSummary = Readonly<{
  requestedBatchSize: number;
  batches: number;
  voiceCallsDeleted: number;
  voiceEventsDeleted: number;
  moreDue: boolean;
  /** Recognized by cronSummaryHasFailures when the bounded drain cannot catch up. */
  failed: number;
}>;

function resultRow(value: unknown): Record<string, unknown> {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error('Voice retention result was invalid.');
  }
  return candidate as Record<string, unknown>;
}

function count(value: unknown, label: string): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Voice retention ${label} count was invalid.`);
  }
  return parsed;
}

/**
 * Delete expired caller content through the database's entitlement-aware,
 * terminal-state boundary.
 *
 * There is intentionally no rollout flag. A feature gate may prevent new
 * provider work; it may never suspend a retention promise after PII exists.
 */
export async function runVoiceRetentionBatch(
  options: Readonly<{ batchSize?: number; maxBatches?: number }> = {},
  dependencies: Readonly<{ admin?: SupabaseClient }> = {},
): Promise<VoiceRetentionSummary> {
  const batchSize = options.batchSize ?? VOICE_RETENTION_BATCH_SIZE;
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 5000) {
    throw new Error('Voice retention batch size must be between 1 and 5000.');
  }
  const maxBatches = options.maxBatches ?? VOICE_RETENTION_MAX_BATCHES;
  if (!Number.isSafeInteger(maxBatches) || maxBatches < 1 || maxBatches > 100) {
    throw new Error('Voice retention max batches must be between 1 and 100.');
  }

  const admin = dependencies.admin ?? createAdminClient();
  let batches = 0;
  let voiceCallsDeleted = 0;
  let voiceEventsDeleted = 0;
  let moreDue = true;

  while (batches < maxBatches && moreDue) {
    const { data, error } = await admin.rpc('purge_expired_voice_history', {
      p_batch_size: batchSize,
    });
    if (error) {
      const code = typeof error.code === 'string' && error.code.trim()
        ? error.code.trim()
        : 'unknown';
      throw new Error(`Voice retention database operation failed (${code}).`);
    }

    const row = resultRow(data);
    voiceCallsDeleted += count(row.voice_calls_deleted, 'call');
    voiceEventsDeleted += count(row.voice_events_deleted, 'event');
    if (typeof row.more_due !== 'boolean') {
      throw new Error('Voice retention backlog result was invalid.');
    }
    moreDue = row.more_due;
    batches += 1;
  }

  return Object.freeze({
    requestedBatchSize: batchSize,
    batches,
    voiceCallsDeleted,
    voiceEventsDeleted,
    moreDue,
    failed: moreDue ? 1 : 0,
  });
}
