import type { SupabaseClient } from '@supabase/supabase-js';
import { sendCallerVoicePostCallFollowupSms, ensureSmsConsentBaseline } from '@/lib/sms';
import { normalizeUsPhone } from '@/lib/phone';

export type VoiceFollowupOptions = {
  callerName?: string | null;
  scheduledTime?: string | null;
  portalUrl?: string | null;
  issueSummary?: string | null;
  postCallSmsEnabled?: boolean;
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

  // If explicitly passed, honor caller's check
  if (options.postCallSmsEnabled === false) {
    return { ok: true, skipped: true };
  }

  // Check voice_settings if not explicitly provided
  if (options.postCallSmsEnabled === undefined) {
    try {
      const { data: settings, error: settingsError } = await _supabase
        .from('voice_settings')
        .select('post_call_sms_enabled')
        .eq('account_id', accountId)
        .maybeSingle();

      if (settingsError) return { ok: false, error: 'Post-call SMS settings unavailable' };
      if (settings && settings.post_call_sms_enabled === false) {
        return { ok: true, skipped: true };
      }
    } catch (err) {
      return { ok: false, error: 'Post-call SMS settings unavailable' };
    }
  }

  const idempotencyKey = `voice-post-call-followup-${callId}`;

  try {
    const normalizedPhone = normalizeUsPhone(callerPhone);
    if (!normalizedPhone) return { ok: false, error: 'Invalid or missing caller phone' };
    // The atomic boundary preserves STOP and reports both false and storage errors.
    // Never replace it with partial, best-effort writes to the consent tables.
    const consent = await ensureSmsConsentBaseline(
      accountId, normalizedPhone, 'missed_call_text_back', _supabase,
    );
    if (!consent) return { ok: true, skipped: true };

    const result = await sendCallerVoicePostCallFollowupSms({
      accountId,
      callerPhone: normalizedPhone,
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
