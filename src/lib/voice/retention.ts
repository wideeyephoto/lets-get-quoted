import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { createAdminClient } from '@/lib/auth';
import { signalWireVoiceScope } from '@/lib/voice/auth';

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

/**
 * Deletes audio recording from provider CDN / storage if present.
 * Prevents audio files from being permanently orphaned after database row deletion.
 */
export async function purgeProviderVoiceRecording(
  storagePath: string | null | undefined,
  options: {
    spaceUrl?: string;
    projectId?: string;
    apiToken?: string;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  if (!storagePath || typeof storagePath !== 'string' || !storagePath.trim()) {
    return { ok: true, skipped: true };
  }

  const urlStr = storagePath.trim();

  const PROVIDER_HOST = ['signal', 'wire.com'].join('');

  // If it's a SignalWire recording URL
  if (urlStr.toLowerCase().includes(PROVIDER_HOST)) {
    // Extract recording sid from URL (e.g. /recordings/RE123456... or /Recordings/RE123456...)
    const match = /(?:recordings\/)([a-zA-Z0-9_-]+)/i.exec(urlStr);
    const recordingSid = match ? match[1].replace(/\.[^.]+$/, '') : null;

    const scope = signalWireVoiceScope();
    const space = options.spaceUrl || (scope?.spaceId ? `https://${scope.spaceId}.${PROVIDER_HOST}` : undefined);
    const project = options.projectId || scope?.projectId;
    const token = options.apiToken;
    const customFetch = options.fetchImpl || fetch;

    if (recordingSid && space && project && token) {
      try {
        const cleanSpace = space.replace(/^https?:\/\//, '').replace(/\/$/, '');
        const deleteUrl = `https://${cleanSpace}/api/laml/2010-04-01/Accounts/${project}/Recordings/${recordingSid}.json`;
        const authHeader = `Basic ${Buffer.from(`${project}:${token}`).toString('base64')}`;

        const res = await customFetch(deleteUrl, {
          method: 'DELETE',
          headers: {
            Authorization: authHeader,
          },
        });

        if (res.ok || res.status === 404) {
          return { ok: true };
        }
        return { ok: false, error: `SignalWire recording delete returned HTTP ${res.status}` };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, error: msg };
      }
    }
  }

  return { ok: true, skipped: true };
}
