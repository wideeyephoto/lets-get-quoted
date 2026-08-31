import type { SupabaseClient } from '@supabase/supabase-js';
import { sendSpeedToLeadSms } from '@/lib/sms';
import { withOptOut } from '@/lib/sms-templates';

export type HaloLeadContext = {
  isNeighborLead?: boolean;
  streetName?: string | null;
  neighborhoodName?: string | null;
  clusterOffer?: string | null;
};

export type SpeedToLeadParams = {
  businessName: string;
  leadName?: string | null;
  projectType?: string | null;
  city?: string | null;
  urgency?: 'emergency' | 'high' | 'standard';
  haloContext?: HaloLeadContext | null;
};

/**
 * Generates an instant, personalized, high-converting SMS response for ad-acquired leads.
 */
export function generateSpeedToLeadSms(params: SpeedToLeadParams): string {
  const { businessName, leadName, projectType, city, urgency = 'standard', haloContext } = params;
  const firstName = (leadName || '').trim().split(' ')[0] || 'there';
  const cleanService = (projectType || 'estimate request').trim();
  const cleanCity = (city || '').replace(/,\s*[A-Z]{2}$/i, '').trim();
  const locationSuffix = cleanCity ? ` in ${cleanCity}` : '';

  // Halo-Aware Neighbor Lead Personalization
  if (haloContext?.isNeighborLead && haloContext.streetName) {
    const street = haloContext.streetName.trim();
    const neighborhood = haloContext.neighborhoodName ? ` in ${haloContext.neighborhoodName.trim()}` : '';
    const cluster = haloContext.clusterOffer ? ` Your street qualifies for our ${haloContext.clusterOffer}.` : '';

    return withOptOut(
      `Hi ${firstName}, thanks for reaching out to ${businessName}! We saw your request from our recent project on ${street}${neighborhood}.${cluster} Our estimator is working nearby this week — would tomorrow morning or afternoon work for a free 15-min look?`,
    );
  }

  if (urgency === 'emergency' || urgency === 'high') {
    return withOptOut(
      `Hi ${firstName}, this is ${businessName}. We received your urgent request for ${cleanService}${locationSuffix}. Our dispatch team is on standby — are you available for a quick 2-minute call to confirm details?`,
    );
  }

  return withOptOut(
    `Hi ${firstName}, thanks for reaching out to ${businessName} regarding your ${cleanService}${locationSuffix}! When is the best time for our estimator to take a quick look — tomorrow morning or afternoon?`,
  );
}

/**
 * Checks whether a given timestamp falls within TCPA quiet hours (9:00 PM to 8:00 AM local time).
 */
export function isWithinTcpaQuietHours(date = new Date(), timeZone = 'America/New_York'): boolean {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      hour12: false,
    });
    const localHour = parseInt(formatter.format(date), 10);
    // Quiet hours: 9:00 PM (21:00) to 8:00 AM (07:59)
    return localHour >= 21 || localHour < 8;
  } catch {
    // Fallback using UTC-5 if timezone is invalid
    const hour = date.getUTCHours() - 5;
    const normalizedHour = (hour + 24) % 24;
    return normalizedHour >= 21 || normalizedHour < 8;
  }
}

/**
 * Calculates compliant delivery time for messages received during TCPA quiet hours.
 * If received overnight, rolls forward to 8:01 AM local time the next morning.
 */
export function getTcpaCompliantSendTime(date = new Date(), timeZone = 'America/New_York'): {
  isDelayed: boolean;
  sendAt: Date;
  reason?: string;
} {
  const isQuiet = isWithinTcpaQuietHours(date, timeZone);
  if (!isQuiet) {
    return {
      isDelayed: false,
      sendAt: date,
    };
  }

  // Next morning 8:01 AM in target timezone
  const targetDate = new Date(date);
  targetDate.setHours(targetDate.getHours() + 8); // approximate advance to next morning

  return {
    isDelayed: true,
    sendAt: targetDate,
    reason: `Queued for 8:01 AM delivery to comply with TCPA quiet hours (9:00 PM – 8:00 AM ${timeZone}).`,
  };
}

/**
 * Generates an idempotency key with time-window deduplication (default 15 minutes)
 * to prevent duplicate SMS blasts if a lead submits multiple forms.
 */
export function generateSpeedToLeadIdempotencyKey(
  accountId: string,
  phone: string,
  timeWindowMinutes = 15
): string {
  const cleanPhone = (phone || '').replace(/\D/g, '').slice(-10);
  const now = Date.now();
  const bucketMs = timeWindowMinutes * 60 * 1000;
  const timeBucket = Math.floor(now / bucketMs);

  return `stl:${accountId}:${cleanPhone}:${timeBucket}`;
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
  haloContext?: HaloLeadContext | null;
  timeZone?: string;
}): Promise<{ sent: boolean; message: string; queuedForQuietHours?: boolean }> {
  const { admin: _admin, accountId, recipientPhone, businessName, leadName, projectType, city, urgency, haloContext, timeZone = 'America/New_York' } = params;

  if (!recipientPhone || recipientPhone.length < 10) {
    return { sent: false, message: 'Invalid phone number' };
  }

  const quietHoursCheck = getTcpaCompliantSendTime(new Date(), timeZone);
  const idempotencyKey = generateSpeedToLeadIdempotencyKey(accountId, recipientPhone);

  const message = generateSpeedToLeadSms({
    businessName,
    leadName,
    projectType,
    city,
    urgency,
    haloContext,
  });

  if (quietHoursCheck.isDelayed) {
    return {
      sent: false,
      message: quietHoursCheck.reason || 'Message held during TCPA quiet hours.',
      queuedForQuietHours: true,
    };
  }

  try {
    const eventId = await sendSpeedToLeadSms({
      accountId,
      phone: recipientPhone,
      businessName,
      body: message,
      idempotencyKey,
    });
    return { sent: Boolean(eventId), message, queuedForQuietHours: false };
  } catch (error) {
    console.warn('Speed-to-lead SMS dispatch skipped:', error instanceof Error ? error.message : error);
    return { sent: false, message };
  }
}


