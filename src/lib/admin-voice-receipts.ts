import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { signalWireVoiceScope } from '@/lib/voice/auth';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DAY_MS = 24 * 60 * 60 * 1000;
const LIMIT = 100;
const COLUMNS = 'id,account_id,provider_call_id,processing_status,attempt_count,received_at,next_attempt_at,processing_lease_expires_at,last_error';

export type PendingVoiceReceipt = {
  id: string;
  account_id: string | null;
  provider_call_id: string;
  processing_status: string;
  attempt_count: number;
  received_at: string;
  next_attempt_at: string | null;
  processing_lease_expires_at: string | null;
  last_error: string | null;
};

export function voiceReceiptRetryState(row: PendingVoiceReceipt, now: number) {
  const received = Date.parse(row.received_at);
  const review = { label: 'Needs review', retry: false, at: null as string | null };
  if (!UUID.test(row.account_id ?? '') || !Number.isFinite(received) || received > now || now - received >= DAY_MS) return review;
  if (row.processing_status === 'processing') {
    const lease = Date.parse(row.processing_lease_expires_at ?? '');
    if (!Number.isFinite(lease)) return review;
    if (lease > now) return { label: 'Processing', retry: false, at: row.processing_lease_expires_at };
  }
  if (!Number.isSafeInteger(row.attempt_count) || row.attempt_count < 0 || row.attempt_count >= 5) return review;
  if (row.processing_status === 'received' && now - received < 5 * 60 * 1000) {
    return { label: 'Waiting for processing', retry: false, at: new Date(received + 5 * 60 * 1000).toISOString() };
  }
  if (row.processing_status === 'failed') {
    const next = Date.parse(row.next_attempt_at ?? '');
    if (!Number.isFinite(next)) return review;
    if (next > now) return { label: 'Retry scheduled', retry: false, at: row.next_attempt_at };
  }
  return ['received', 'failed', 'processing'].includes(row.processing_status)
    ? { label: 'Ready for retry', retry: true, at: null as string | null }
    : { label: 'Complete', retry: false, at: null as string | null };
}

/** Only known operational codes reach the UI; raw provider errors can contain PII. */
export function voiceReceiptFailureStage(code: string | null): string {
  switch (code) {
    case 'voice_receipt_handler_threw': return 'Post-call processing';
    case 'settlement_failed': return 'Usage settlement';
    case 'no_admission': return 'Admission matching';
    case 'unbillable_receipt': return 'Duration verification';
    case 'voice_recovery_requires_review': return 'Receipt reconstruction';
    case 'voice_processing_attempts_exhausted': return 'Retry limit reached';
    case null: return 'Awaiting processing';
    default: return 'Unclassified processing failure';
  }
}

export function safeVoiceReference(value: string | null): string | null {
  return value && UUID.test(value) ? value : null;
}

export async function loadPendingVoiceReceipts(admin: SupabaseClient) {
  const unavailable = { available: false as const, rows: [] as PendingVoiceReceipt[], total: null };
  const scope = signalWireVoiceScope();
  if (!scope) return unavailable;
  try {
    const { data, count, error } = await admin.from('voice_events').select(COLUMNS, { count: 'exact' })
      .eq('provider', 'signalwire').eq('provider_project_id', scope.projectId).eq('provider_space_id', scope.spaceId)
      .in('processing_status', ['received', 'processing', 'failed'])
      .order('received_at', { ascending: true }).order('id', { ascending: true })
      .limit(LIMIT).abortSignal(AbortSignal.timeout(4000));
    if (error || !Array.isArray(data) || count === null) return unavailable;
    return { available: true as const, rows: data as PendingVoiceReceipt[], total: count };
  } catch {
    return unavailable;
  }
}
