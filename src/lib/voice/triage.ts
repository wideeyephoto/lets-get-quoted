import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { enqueueSmsDelivery } from '@/lib/sms-delivery';
import { normalizeUsPhone } from '@/lib/phone';

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
): Promise<boolean> {
  if (!emergency.isEmergency) return false;

  // Find account transfer number or business owner phone
  const { data: voiceSettings } = await admin
    .from('voice_settings')
    .select('transfer_number')
    .eq('account_id', accountId)
    .maybeSingle();

  const { data: account } = await admin
    .from('accounts')
    .select('company_name, phone, call_forward_number')
    .eq('id', accountId)
    .maybeSingle();

  const targetPhone = normalizeUsPhone(
    voiceSettings?.transfer_number || account?.call_forward_number || account?.phone || '',
  );

  if (!targetPhone) {
    console.warn(`[AI Voice Emergency] No valid destination phone for emergency alert on account ${accountId}`);
    return false;
  }

  const callerDisplay = callerPhone || 'Caller number unavailable';
  const alertText = `🚨 URGENT CALL ALERT: ${emergency.reason.toUpperCase()}\n`
    + `Caller: ${callerDisplay}\n`
    + `Summary: ${summary.slice(0, 140)}\n`
    + `Open Let's Get Quoted to view transcript & callback.`;

  try {
    const queued = await enqueueSmsDelivery({
      accountId,
      phoneNumber: targetPhone,
      body: alertText,
      messageKind: 'voice_emergency_alert',
      billingCategory: 'owner_alert',
      context: 'owner',
      senderPurpose: 'lgq_dispatch',
    });
    return Boolean(queued?.eventId);
  } catch (error) {
    console.error('[AI Voice Emergency] Failed to send emergency SMS alert:', error);
    return false;
  }
}
