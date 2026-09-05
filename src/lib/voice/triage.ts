import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { enqueueSmsDelivery } from '@/lib/sms-delivery';
import { normalizeUsPhone } from '@/lib/phone';
import { ownerVoiceEmergencyAlertText, ownerVoiceCallNotificationText } from '@/lib/sms-templates';

export type EmergencyDetectionResult = {
  isEmergency: boolean;
  hazardType: string | null;
  severity: 'critical' | 'high' | 'normal';
  reason: string;
};

const EMERGENCY_PATTERNS = [
  { type: 'water_leak_flooding', regex: /\b(burst pipe|flooding|water leaking|gushing water|pipe broke|water main|flooded basement|water pouring)\b/i, severity: 'critical' as const },
  { type: 'gas_leak_hazard', regex: /\b(gas leak|smell gas|gas odor|carbon monoxide|hissing gas|gas line)\b/i, severity: 'critical' as const },
  { type: 'electrical_fire_hazard', regex: /\b(sparking|electrical fire|burning smell|smoke coming from|outlet burning|panel smoking)\b/i, severity: 'critical' as const },
  { type: 'no_heat_winter', regex: /\b(no heat|furnace broke|freezing inside|boiler out|heater stopped working|pipes freezing)\b/i, severity: 'high' as const },
  { type: 'sewer_backup', regex: /\b(sewer backup|sewage backing up|toilet overflowing|raw sewage|drain backing up)\b/i, severity: 'high' as const },
  { type: 'ac_failure_extreme', regex: /\b(ac out|no ac|no air conditioning|elderly heat|dangerously hot)\b/i, severity: 'high' as const },
];

/**
 * Evaluates the call summary and transcript for high-urgency homeowner emergencies.
 */
export function detectCallEmergency(summary: string, transcriptText?: string): EmergencyDetectionResult {
  const combined = `${summary} ${transcriptText || ''}`.toLowerCase();

  for (const pattern of EMERGENCY_PATTERNS) {
    if (pattern.regex.test(combined)) {
      return {
        isEmergency: true,
        hazardType: pattern.type,
        severity: pattern.severity,
        reason: `Detected urgent situation: ${pattern.type.replace(/_/g, ' ')}`,
      };
    }
  }

  // Check for generic emergency declaration
  if (/\b(emergency|urgent|need someone immediately|as soon as possible today|right away)\b/i.test(combined)) {
    return {
      isEmergency: true,
      hazardType: 'general_urgent',
      severity: 'high',
      reason: 'Caller expressed immediate emergency urgency',
    };
  }

  return {
    isEmergency: false,
    hazardType: null,
    severity: 'normal',
    reason: 'Standard customer inquiry or estimate request',
  };
}

/**
 * Dispatches an urgent SMS alert to the contractor when an incoming call reports an emergency.
 */
export async function notifyEmergencyCall(
  admin: SupabaseClient,
  accountId: string,
  callerPhone: string | null,
  summary: string,
  emergency: EmergencyDetectionResult,
  callId?: string | null,
): Promise<boolean> {
  if (!emergency.isEmergency) return false;

  // Find account alert phone or transfer number or phone
  const { data: account, error: accountError } = await admin
    .from('accounts')
    .select('company_name, business_name, alert_phone, phone, call_forward_number')
    .eq('id', accountId)
    .maybeSingle();

  const { data: voiceSettings, error: settingsError } = await admin
    .from('voice_settings')
    .select('transfer_number')
    .eq('account_id', accountId)
    .maybeSingle();

  if (accountError || settingsError) throw new Error('Voice notification settings read failed');

  const targetPhone = normalizeUsPhone(
    account?.alert_phone || voiceSettings?.transfer_number || account?.call_forward_number || account?.phone || '',
  );

  if (!targetPhone) {
    console.warn(`[AI Voice Emergency] No valid destination phone for emergency alert on account ${accountId}`);
    return false;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.letsgetquoted.com';
  const dashboardUrl = callId
    ? `${appUrl}/dashboard/voice-calls/${callId}`
    : `${appUrl}/dashboard/voice-calls`;
  const callerDisplay = callerPhone || 'Unknown caller';
  const businessName = account?.business_name || account?.company_name || 'Your Business';
  const hazardSummary = summary.slice(0, 140) || emergency.reason;

  const alertText = ownerVoiceEmergencyAlertText({
    businessName,
    callerNumber: callerDisplay,
    hazardSummary,
    dashboardUrl,
  });

  try {
    const queued = await enqueueSmsDelivery({
      accountId,
      phoneNumber: targetPhone,
      body: alertText,
      messageKind: 'owner-voice-emergency-alert',
      billingCategory: 'owner_alert',
      context: 'owner',
      senderPurpose: 'lgq_dispatch',
      idempotencyKey: callId ? `voice-emergency:${accountId}:${callId}` : undefined,
    }, admin);
    if (!queued?.eventId) throw new Error('Voice notification was not durably queued');
    return true;
  } catch (error) {
    console.error('[AI Voice Emergency] Failed to queue emergency SMS alert:', error);
    throw error;
  }
}

/**
 * Dispatches an SMS alert to the contractor when an incoming call is answered and summarized.
 */
export async function notifyOrdinaryCall(
  admin: SupabaseClient,
  accountId: string,
  callerPhone: string | null,
  summary: string,
  callerName?: string | null,
  callId?: string | null,
): Promise<boolean> {
  const { data: voiceSettings, error: settingsError } = await admin
    .from('voice_settings')
    .select('transfer_number, contractor_notifications_enabled, contractor_notification_channel')
    .eq('account_id', accountId)
    .maybeSingle();

  if (settingsError) throw new Error('Voice notification settings read failed');
  if (voiceSettings && voiceSettings.contractor_notifications_enabled === false) {
    return false;
  }

  const { data: account, error: accountError } = await admin
    .from('accounts')
    .select('company_name, business_name, alert_phone, phone, call_forward_number')
    .eq('id', accountId)
    .maybeSingle();

  if (accountError || settingsError) throw new Error('Voice notification settings read failed');

  const targetPhone = normalizeUsPhone(
    account?.alert_phone || voiceSettings?.transfer_number || account?.call_forward_number || account?.phone || '',
  );

  if (!targetPhone) {
    return false;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.letsgetquoted.com';
  const dashboardUrl = callId
    ? `${appUrl}/dashboard/voice-calls/${callId}`
    : `${appUrl}/dashboard/voice-calls`;
  const businessName = account?.business_name || account?.company_name || 'Your Business';

  const alertText = ownerVoiceCallNotificationText({
    businessName,
    callerName,
    callerNumber: callerPhone,
    summary,
    dashboardUrl,
  });

  try {
    const queued = await enqueueSmsDelivery({
      accountId,
      phoneNumber: targetPhone,
      body: alertText,
      messageKind: 'owner-voice-call-notification',
      billingCategory: 'owner_alert',
      context: 'owner',
      senderPurpose: 'lgq_dispatch',
      idempotencyKey: callId ? `voice-call-notify:${accountId}:${callId}` : undefined,
    }, admin);
    if (!queued?.eventId) throw new Error('Voice notification was not durably queued');
    return true;
  } catch (error) {
    console.error('[AI Voice Notification] Failed to queue ordinary call SMS notification:', error);
    throw error;
  }
}
