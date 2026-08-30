import type { SupabaseClient } from '@supabase/supabase-js';
import { sendSpeedToLeadSms } from '@/lib/sms';

export type SpeedToLeadParams = {
  businessName: string;
  leadName?: string | null;
  projectType?: string | null;
  city?: string | null;
  urgency?: 'emergency' | 'high' | 'standard';
};

/**
 * Generates an instant, personalized, high-converting SMS response for ad-acquired leads.
 */
export function generateSpeedToLeadSms(params: SpeedToLeadParams): string {
  const { businessName, leadName, projectType, city, urgency = 'standard' } = params;
  const firstName = (leadName || '').trim().split(' ')[0] || 'there';
  const cleanService = (projectType || 'estimate request').trim();
  const cleanCity = (city || '').replace(/,\s*[A-Z]{2}$/i, '').trim();
  const locationSuffix = cleanCity ? ` in ${cleanCity}` : '';

  if (urgency === 'emergency' || urgency === 'high') {
    return `Hi ${firstName}, this is ${businessName}. We received your urgent request for ${cleanService}${locationSuffix}. Our dispatch team is on standby — are you available for a quick 2-minute call to confirm details?`;
  }

  return `Hi ${firstName}, thanks for reaching out to ${businessName} regarding your ${cleanService}${locationSuffix}! When is the best time for our estimator to take a quick look — tomorrow morning or afternoon?`;
}

/**
 * Automatically dispatches the speed-to-lead text message when an ad lead arrives.
 */
export async function dispatchSpeedToLeadSms(params: {
  admin: SupabaseClient;
  accountId: string;
  recipientPhone: string;
  businessName: string;
  leadName?: string | null;
  projectType?: string | null;
  city?: string | null;
  urgency?: 'emergency' | 'high' | 'standard';
}): Promise<{ sent: boolean; message: string }> {
  const { admin: _admin, accountId, recipientPhone, businessName, leadName, projectType, city, urgency } = params;

  if (!recipientPhone || recipientPhone.length < 10) {
    return { sent: false, message: 'Invalid phone number' };
  }

  const message = generateSpeedToLeadSms({
    businessName,
    leadName,
    projectType,
    city,
    urgency,
  });

  try {
    const eventId = await sendSpeedToLeadSms({
      accountId,
      phone: recipientPhone,
      businessName,
      body: message,
      idempotencyKey: `speed-to-lead:${accountId}:${recipientPhone}:${Date.now().toString().slice(0, 8)}`,
    });
    return { sent: Boolean(eventId), message };
  } catch (error) {
    console.warn('Speed-to-lead SMS dispatch skipped:', error instanceof Error ? error.message : error);
    return { sent: false, message };
  }
}

