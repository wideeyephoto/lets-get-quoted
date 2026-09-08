import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/auth';
import { signalWireVoiceScope } from '@/lib/voice/auth';
import { processVoiceReceipt, type VoiceReceiptProcessingResult } from '@/lib/voice/receipt-processing';
import { signalwireVoiceProvider } from '@/lib/voice/signalwire';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 5;
type Scope = { projectId: string; spaceId: string };
type RecoveryResult = { status: 'ready' | 'needs_review' | 'not_pending'; reason?: string }
  | VoiceReceiptProcessingResult;

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/**
 * Resume a recent, already-projected receipt under the same database lease and
 * idempotency keys as a provider retry. Immutable events intentionally omit the
 * transcript, so never replay one alone: doing so erases history and changes
 * the inferred outcome. Missing projection requires provider/operator review.
 */
export async function recoverVoiceReceipt(
  admin: SupabaseClient,
  eventId: string,
  options: { scope: Scope; apply?: boolean; now?: number },
  process = processVoiceReceipt,
): Promise<RecoveryResult> {
  if (!UUID.test(eventId)) throw new Error('Invalid voice recovery event ID.');
  const now = options.now ?? Date.now();
  const { data: event, error: eventError } = await admin.from('voice_events')
    .select('id, provider, provider_call_id, account_id, provider_project_id, provider_space_id, payload, processing_status, received_at')
    .eq('id', eventId).maybeSingle();
  if (eventError) throw new Error('Voice recovery event read failed.');
  if (!event) return { status: 'needs_review', reason: 'missing_event' };
  if (!['received', 'processing', 'failed'].includes(event.processing_status)) return { status: 'not_pending' };
  const received = Date.parse(event.received_at);
  if (!Number.isFinite(received) || received > now || now - received >= MAX_AGE_MS) {
    return { status: 'needs_review', reason: 'outside_automatic_recovery_window' };
  }
  if (event.provider !== 'signalwire' || !UUID.test(event.account_id ?? '')
    || !options.scope.projectId || !options.scope.spaceId
    || event.provider_project_id !== options.scope.projectId || event.provider_space_id !== options.scope.spaceId) {
    return { status: 'needs_review', reason: 'scope_mismatch' };
  }
  const payload = object(event.payload);
  if (!payload) return { status: 'needs_review', reason: 'invalid_payload' };
  const { data: admission, error: admissionError } = await admin.from('voice_call_admissions')
    .select('account_id').eq('provider', event.provider).eq('provider_call_id', event.provider_call_id).maybeSingle();
  if (admissionError) throw new Error('Voice recovery admission read failed.');
  if (admission?.account_id !== event.account_id) return { status: 'needs_review', reason: 'admission_mismatch' };
  const { data: call, error: callError } = await admin.from('voice_calls')
    .select('voice_event_id, transcript, is_provisional, ended_at')
    .eq('account_id', event.account_id).eq('provider', event.provider)
    .eq('provider_call_id', event.provider_call_id).maybeSingle();
  if (callError) throw new Error('Voice recovery projection read failed.');
  if (!call || call.voice_event_id !== event.id || call.is_provisional || !call.ended_at || !Array.isArray(call.transcript)) {
    return { status: 'needs_review', reason: 'missing_complete_projection' };
  }
  const parsed = signalwireVoiceProvider.parseReceipt({
    ...payload,
    call_log: call.transcript,
    post_prompt_data: { substituted: payload.summary, parsed: object(payload.structured_post_prompt) },
  });
  if (!parsed.ok || parsed.receipt.providerCallId !== event.provider_call_id
    || parsed.receipt.projectId !== options.scope.projectId || parsed.receipt.spaceId !== options.scope.spaceId) {
    return { status: 'needs_review', reason: 'payload_scope_mismatch' };
  }
  if (!options.apply) return { status: 'ready' };
  // The atomic claim rechecks backoff, terminal states, active leases, and the
  // attempt limit. Never reset counters or fabricate a new receipt to retry.
  return process(admin, event.id, parsed.receipt);
}

export async function runVoiceReceiptRecovery(dependencies: {
  admin?: SupabaseClient; scope?: Scope; now?: number; recover?: typeof recoverVoiceReceipt;
} = {}) {
  const scope = dependencies.scope ?? signalWireVoiceScope();
  if (!scope) throw new Error('Voice receipt recovery scope is not configured.');
  const admin = dependencies.admin ?? createAdminClient();
  const now = dependencies.now ?? Date.now();
  const nowIso = new Date(now).toISOString();
  const { data: events, error } = await admin.from('voice_events').select('id')
    .eq('provider', 'signalwire').not('account_id', 'is', null)
    .gte('received_at', new Date(now - MAX_AGE_MS).toISOString())
    .or(`and(processing_status.eq.failed,next_attempt_at.lte.${nowIso}),and(processing_status.eq.processing,processing_lease_expires_at.lte.${nowIso})`)
    .order('received_at', { ascending: true }).limit(BATCH_SIZE);
  if (error) throw new Error('Voice receipt recovery queue read failed.');
  const summary = { considered: 0, processed: 0, skipped: 0, failed: 0, needsReview: 0, truncated: (events?.length ?? 0) === BATCH_SIZE };
  const recover = dependencies.recover ?? recoverVoiceReceipt;
  for (const event of events ?? []) {
    summary.considered += 1;
    try {
      const result = await recover(admin, event.id, { scope, now, apply: true });
      if (result.status === 'processed' || result.status === 'processed_before') summary.processed += 1;
      else if (result.status === 'needs_review') { summary.needsReview += 1; summary.failed += 1; }
      else if (['retryable_failure', 'terminal_failure', 'exhausted'].includes(result.status)) summary.failed += 1;
      else summary.skipped += 1;
    } catch {
      summary.failed += 1;
      // The event/claim holds the durable diagnosis. Do not log caller content.
      console.error('Voice receipt recovery failed for event', event.id);
    }
  }
  return summary;
}
