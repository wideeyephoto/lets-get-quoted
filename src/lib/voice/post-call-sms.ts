import type { SupabaseClient } from '@supabase/supabase-js';
import { sendCallerVoicePostCallFollowupSms } from '@/lib/sms';

export type VoiceFollowupOptions = {
  callerName?: string | null;
  scheduledTime?: string | null;
  portalUrl?: string | null;
  issueSummary?: string | null;
};

/**
 * Triggers an automated post-call follow-up SMS to a caller after an AI voice call completes.
 *
 * Guaranteed at-most-once delivery per call via idempotencyKey: `voice-post-call-followup-${callId}`.
 */
export async function triggerVoicePostCallFollowup(
  _supabase: SupabaseClient,
  accountId: string,
  callId: string,
  callerPhone: string,
  options: VoiceFollowupOptions = {}
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  if (!callerPhone || callerPhone.trim().length < 7) {
    return { ok: false, error: 'Invalid or missing caller phone' };
  }

  const idempotencyKey = `voice-post-call-followup-${callId}`;

  try {
    const result = await sendCallerVoicePostCallFollowupSms({
      accountId,
      callerPhone,
      callerName: options.callerName,
      scheduledTime: options.scheduledTime,
      portalUrl: options.portalUrl,
      issueSummary: options.issueSummary,
      idempotencyKey,
    });

    return result;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Trigger voice post-call follow-up failed:', msg);
    return { ok: false, error: msg };
  }
}
