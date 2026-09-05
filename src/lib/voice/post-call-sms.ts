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

  const normalizedPhone = normalizeUsPhone(callerPhone);
  if (normalizedPhone) {
    const nowIso = new Date().toISOString();
    try {
      if (typeof _supabase?.rpc === 'function') {
        await _supabase.rpc('ensure_sms_consent_baseline_scope', {
          p_account_id: accountId,
          p_phone_number: normalizedPhone,
          p_source: 'missed_call_text_back',
        });
      } else {
        await ensureSmsConsentBaseline(accountId, normalizedPhone, 'missed_call_text_back');
      }
    } catch (err) {
      console.warn('[triggerVoicePostCallFollowup] Error logging consent baseline via rpc:', err);
    }

    if (typeof _supabase?.from === 'function') {
      try {
        const consentTable = _supabase.from('sms_consent');
        if (typeof consentTable?.insert === 'function') {
          await consentTable.insert({
            account_id: accountId,
            phone_number: normalizedPhone,
            status: 'opted_in',
            source: 'missed_call_text_back',
            consented_at: nowIso,
            updated_at: nowIso,
          });
        }

        const scopeTable = _supabase.from('sms_consent_scopes');
        if (typeof scopeTable?.insert === 'function') {
          await scopeTable.insert({
            account_id: accountId,
            phone_number: normalizedPhone,
            consent_scope: 'customer',
            evidence_source: 'missed_call_text_back',
            established_at: nowIso,
          });
        }
      } catch (err) {
        console.warn('[triggerVoicePostCallFollowup] Error in fallback consent table insert:', err);
      }
    }
  }

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
