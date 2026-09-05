import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { createAdminClient } from '@/lib/auth';
import { isSignalWireHostname } from '@/lib/sms-provider';

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

  const { error: orphanError } = await admin.rpc('queue_expired_voice_recording_observations');
  if (orphanError) throw new Error('Expired recording observation cleanup failed');
  const { data: deletions, error: deletionError, count: deletionCount } = await admin.from('voice_recording_deletions')
    .select('id, storage_path', { count: 'exact' }).order('created_at').limit(Math.min(batchSize, 10));
  if (deletionError) throw new Error('Recording deletion queue read failed');
  let recordingFailures = 0;
  let recordingsDeleted = 0;
  const deletionDeadline = Date.now() + 20000;
  for (const job of deletions ?? []) {
    if (Date.now() >= deletionDeadline) break;
    const result = await purgeProviderVoiceRecording(job.storage_path);
    if (!result.ok) { recordingFailures += 1; continue; }
    const { error } = await admin.from('voice_recording_deletions').delete().eq('id', job.id);
    if (error) recordingFailures += 1;
    else recordingsDeleted += 1;
  }
  moreDue = moreDue || (deletionCount ?? deletions?.length ?? 0) > recordingsDeleted;
  return Object.freeze({
    requestedBatchSize: batchSize,
    batches,
    voiceCallsDeleted,
    voiceEventsDeleted,
    moreDue,
    failed: recordingFailures + (moreDue ? 1 : 0),
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

  let mediaUrl: URL;
  let space: URL;
  try {
    mediaUrl = new URL(storagePath);
    const configured = options.spaceUrl || process.env.SIGNALWIRE_SPACE_URL || '';
    space = new URL(configured.startsWith('https://') ? configured : `https://${configured}`);
    if (space.protocol !== 'https:' || !isSignalWireHostname(space.hostname) || space.username || space.password || space.port) throw new Error('Invalid provider host');
    if (mediaUrl.protocol !== 'https:' || !isSignalWireHostname(mediaUrl.hostname) || mediaUrl.username || mediaUrl.password) throw new Error('Unsupported recording host');
  } catch { return { ok: false, error: 'Unsupported recording location; manual cleanup required' }; }
  const match = /\/recordings\/([a-zA-Z0-9_-]+)(?:\.(?:mp3|wav|json))?(?:\/download)?$/i.exec(mediaUrl.pathname);
  const project = options.projectId || process.env.SIGNALWIRE_PROJECT_ID;
  const token = options.apiToken || process.env.SIGNALWIRE_API_TOKEN;
  if (!match || !project || !token) return { ok: false, error: 'Recording deletion is not configured' };
  const compatibility = /\/api\/laml\//i.test(mediaUrl.pathname) || /^RE/i.test(match[1]);
  const path = compatibility
    ? `/api/laml/2010-04-01/Accounts/${encodeURIComponent(project)}/Recordings/${match[1]}.json`
    : `/api/relay/rest/recordings/${match[1]}`;
  try {
    const response = await (options.fetchImpl || fetch)(new URL(path, space.origin).toString(), {
      method: 'DELETE', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Basic ${Buffer.from(`${project}:${token}`).toString('base64')}` },
    });
    return response.ok || response.status === 404 ? { ok: true } : { ok: false, error: `Recording deletion returned HTTP ${response.status}` };
  } catch { return { ok: false, error: 'Recording deletion request failed' }; }
}
