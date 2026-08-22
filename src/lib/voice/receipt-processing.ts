import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { VoiceReceipt } from '@/lib/voice/provider';
import { settleVoiceReceipt, type VoiceSettlement } from '@/lib/voice/settlement';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RpcError = Readonly<{ code?: string; message?: string }>;

export class VoiceReceiptProcessingRpcError extends Error {
  override readonly name = 'VoiceReceiptProcessingRpcError';

  constructor(readonly operation: string, readonly rpcCode: string | null) {
    super(`Voice receipt ${operation} failed.`);
  }
}

function rpcFailure(operation: string, error: RpcError | null): VoiceReceiptProcessingRpcError {
  return new VoiceReceiptProcessingRpcError(operation, error?.code?.trim() || null);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (Array.isArray(value) && value.length !== 1) {
    throw new Error(`Voice receipt ${label} result was invalid.`);
  }
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error(`Voice receipt ${label} result was invalid.`);
  }
  return candidate as Record<string, unknown>;
}

function uuid(value: unknown, label: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new Error(`Voice receipt ${label} was invalid.`);
  }
  return value.toLowerCase();
}

function optionalInteger(value: unknown, label: string): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Voice receipt ${label} was invalid.`);
  }
  return parsed;
}

export type VoiceEventIngestInput = Readonly<{
  providerCallId: string;
  eventType: string;
  providerProjectId: string | null;
  providerSpaceId: string | null;
  expectedProjectId: string;
  expectedSpaceId: string;
  payload: unknown;
}>;

export type VoiceEventIngestResult = Readonly<{
  voiceEventId: string;
  inserted: boolean;
  admitted: boolean;
}>;

/**
 * Land immutable evidence, retrying one exact unique-race only.
 *
 * Two identical deliveries can both miss the initial SELECT in the ingest RPC;
 * one INSERT then wins and the other sees 23505. Replaying the same RPC once
 * lets the database compare the full persisted JSON. A changed payload receives
 * 23505 again and remains rejected, preserving the immutable replay guard.
 */
export async function ingestVoiceEvent(
  admin: SupabaseClient,
  input: VoiceEventIngestInput,
): Promise<VoiceEventIngestResult> {
  // The SQL boundary repeats this check. Keeping it here avoids a needless RPC
  // for an impossible comparison, while the database check protects every
  // caller (including a future worker that bypasses this adapter).
  if (!input.expectedProjectId.trim() || !input.expectedSpaceId.trim()
      || !input.providerProjectId?.trim() || !input.providerSpaceId?.trim()) {
    throw new VoiceReceiptProcessingRpcError('scope validation', '22023');
  }
  const args = {
    p_provider_call_id: input.providerCallId,
    p_event_type: input.eventType,
    p_provider_project_id: input.providerProjectId,
    p_provider_space_id: input.providerSpaceId,
    p_expected_project_id: input.expectedProjectId,
    p_expected_space_id: input.expectedSpaceId,
    p_payload: input.payload,
  };
  let result = await admin.rpc('ingest_voice_event', args);
  if (result.error?.code === '23505') {
    result = await admin.rpc('ingest_voice_event', args);
  }
  if (result.error) throw rpcFailure('ingest', result.error);
  const row = record(result.data, 'ingest');
  if (typeof row.inserted !== 'boolean' || typeof row.admitted !== 'boolean') {
    throw new Error('Voice receipt ingest result was invalid.');
  }
  return Object.freeze({
    voiceEventId: uuid(row.voice_event_id, 'event id'),
    inserted: row.inserted,
    admitted: row.admitted,
  });
}

export type VoiceReceiptClaim = Readonly<{
  status: 'claimed' | 'busy' | 'deferred' | 'processed' | 'ignored' | 'exhausted';
  eventId: string;
  claimToken: string | null;
  attemptNumber: number;
  retryAfterSeconds: number | null;
}>;

export type VoiceReceiptFailure = Readonly<{
  status: 'retryable' | 'exhausted';
  retryAfterSeconds: number | null;
}>;

export interface VoiceReceiptProcessingStore {
  claim(eventId: string): Promise<VoiceReceiptClaim>;
  complete(claim: VoiceReceiptClaim): Promise<void>;
  fail(
    claim: VoiceReceiptClaim,
    errorCode: string,
    retryable: boolean,
  ): Promise<VoiceReceiptFailure>;
}

export class SupabaseVoiceReceiptProcessingStore implements VoiceReceiptProcessingStore {
  constructor(private readonly admin: SupabaseClient) {}

  async claim(eventId: string): Promise<VoiceReceiptClaim> {
    const canonicalEventId = uuid(eventId, 'event id');
    const { data, error } = await this.admin.rpc('claim_voice_event_processing', {
      p_voice_event_id: canonicalEventId,
    });
    if (error) throw rpcFailure('claim', error);
    const row = record(data, 'claim');
    const statuses = new Set<VoiceReceiptClaim['status']>([
      'claimed', 'busy', 'deferred', 'processed', 'ignored', 'exhausted',
    ]);
    const status = row.claim_status;
    if (typeof status !== 'string' || !statuses.has(status as VoiceReceiptClaim['status'])) {
      throw new Error('Voice receipt claim status was invalid.');
    }
    const claimToken = row.claim_token == null ? null : uuid(row.claim_token, 'claim token');
    const attemptNumber = optionalInteger(row.attempt_number, 'attempt number');
    const retryAfterSeconds = optionalInteger(row.retry_after_seconds, 'retry delay');
    if (attemptNumber === null
        || (status === 'claimed' && claimToken === null)
        || (status !== 'claimed' && claimToken !== null)
        || (['busy', 'deferred'].includes(status) && retryAfterSeconds === null)
        || (!['busy', 'deferred'].includes(status) && retryAfterSeconds !== null)) {
      throw new Error('Voice receipt claim shape was invalid.');
    }
    return Object.freeze({
      status: status as VoiceReceiptClaim['status'],
      eventId: canonicalEventId,
      claimToken,
      attemptNumber,
      retryAfterSeconds,
    });
  }

  async complete(claim: VoiceReceiptClaim): Promise<void> {
    if (claim.status !== 'claimed' || !claim.claimToken) {
      throw new Error('Only a claimed voice receipt can be completed.');
    }
    const { data, error } = await this.admin.rpc('complete_voice_event_processing', {
      p_voice_event_id: uuid(claim.eventId, 'event id'),
      p_claim_token: uuid(claim.claimToken, 'claim token'),
    });
    if (error) throw rpcFailure('completion', error);
    if (data !== true) throw new Error('Voice receipt completion result was invalid.');
  }

  async fail(
    claim: VoiceReceiptClaim,
    errorCode: string,
    retryable: boolean,
  ): Promise<VoiceReceiptFailure> {
    if (claim.status !== 'claimed' || !claim.claimToken) {
      throw new Error('Only a claimed voice receipt can fail.');
    }
    if (!/^[a-z][a-z0-9_]{2,99}$/.test(errorCode)) {
      throw new Error('Voice receipt failure code was invalid.');
    }
    const { data, error } = await this.admin.rpc('fail_voice_event_processing', {
      p_voice_event_id: uuid(claim.eventId, 'event id'),
      p_claim_token: uuid(claim.claimToken, 'claim token'),
      p_error_code: errorCode,
      p_retryable: retryable,
    });
    if (error) throw rpcFailure('failure finalization', error);
    const row = record(data, 'failure');
    if (row.failure_status !== 'retryable' && row.failure_status !== 'exhausted') {
      throw new Error('Voice receipt failure status was invalid.');
    }
    const retryAfterSeconds = optionalInteger(row.retry_after_seconds, 'retry delay');
    if ((row.failure_status === 'retryable' && retryAfterSeconds === null)
        || (row.failure_status === 'exhausted' && retryAfterSeconds !== null)) {
      throw new Error('Voice receipt failure shape was invalid.');
    }
    return Object.freeze({
      status: row.failure_status,
      retryAfterSeconds,
    });
  }
}

type SettleVoiceReceipt = (
  admin: SupabaseClient,
  receipt: VoiceReceipt,
  options: Readonly<{ voiceEventId?: string }>,
) => Promise<VoiceSettlement>;

export type VoiceReceiptProcessingResult =
  | Readonly<{
    status: 'busy' | 'deferred' | 'processed_before' | 'ignored' | 'exhausted';
    retryAfterSeconds: number | null;
  }>
  | Readonly<{
    status: 'processed';
    minutes: number | null;
  }>
  | Readonly<{
    status: 'retryable_failure' | 'terminal_failure';
    reason: string;
    retryAfterSeconds: number | null;
    error: unknown | null;
    minutes: number | null;
  }>;

export async function processVoiceReceipt(
  admin: SupabaseClient,
  eventId: string,
  receipt: VoiceReceipt,
  dependencies: Readonly<{
    store?: VoiceReceiptProcessingStore;
    settle?: SettleVoiceReceipt;
  }> = {},
): Promise<VoiceReceiptProcessingResult> {
  const store = dependencies.store ?? new SupabaseVoiceReceiptProcessingStore(admin);
  const settle = dependencies.settle ?? settleVoiceReceipt;
  const claim = await store.claim(eventId);

  if (claim.status !== 'claimed') {
    return Object.freeze({
      status: claim.status === 'processed' ? 'processed_before' : claim.status,
      retryAfterSeconds: claim.retryAfterSeconds,
    });
  }

  let settlement: VoiceSettlement;
  try {
    settlement = await settle(admin, receipt, { voiceEventId: claim.eventId });
  } catch (error) {
    const failure = await store.fail(claim, 'voice_receipt_handler_threw', true);
    return Object.freeze({
      status: failure.status === 'retryable' ? 'retryable_failure' : 'terminal_failure',
      reason: 'voice_receipt_handler_threw',
      retryAfterSeconds: failure.retryAfterSeconds,
      error,
      minutes: null,
    });
  }

  if (settlement.reconcile) {
    const failure = await store.fail(
      claim,
      settlement.reconcile,
      settlement.reconcile === 'settlement_failed',
    );
    return Object.freeze({
      status: failure.status === 'retryable' ? 'retryable_failure' : 'terminal_failure',
      reason: settlement.reconcile,
      retryAfterSeconds: failure.retryAfterSeconds,
      error: null,
      minutes: settlement.minutes,
    });
  }
  // Completion is deliberately outside the settlement catch. If its response
  // is lost, a second failure CAS would be just as ambiguous; leave the lease to
  // expire and let the idempotent settlement replay under a new token instead.
  await store.complete(claim);
  return Object.freeze({ status: 'processed' as const, minutes: settlement.minutes });
}
