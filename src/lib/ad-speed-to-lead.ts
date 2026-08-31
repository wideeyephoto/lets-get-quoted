import type { SupabaseClient } from '@supabase/supabase-js';
import { sendSpeedToLeadSms } from '@/lib/sms';
import { withOptOut } from '@/lib/sms-templates';
import {
  resolveRecipientTimeZone,
  isWithinTcpaQuietHours,
  getTcpaCompliantSendTime,
  getTimeZoneFromPhone,
  getTimeZoneFromLocation,
  isValidTimeZone,
} from '@/lib/phone-timezone';

export {
  resolveRecipientTimeZone,
  isWithinTcpaQuietHours,
  getTcpaCompliantSendTime,
  getTimeZoneFromPhone,
  getTimeZoneFromLocation,
  isValidTimeZone,
};

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
 *
 * Under FCC TCPA rules (47 C.F.R. § 64.1200(c)(1)), quiet hours are evaluated
 * at the called party's (recipient's) local time (8:00 AM - 9:00 PM).
 * The recipient's local time zone is resolved hierarchically:
 * 1. Explicit recipient time zone
 * 2. Recipient phone number area code (NPA)
 * 3. Recipient address / city / state
 * 4. Account local operating time zone
 * 5. Default fallback to America/New_York
 */
export async function dispatchSpeedToLeadSms(params: {
  admin: SupabaseClient;
  accountId: string;
  recipientPhone: string;
  businessName: string;
  leadName?: string | null;
  projectType?: string | null;
  city?: string | null;
  address?: string | null;
  state?: string | null;
  postalCode?: string | null;
  urgency?: 'emergency' | 'high' | 'standard';
  haloContext?: HaloLeadContext | null;
  timeZone?: string;
  recipientTimeZone?: string | null;
  accountTimeZone?: string | null;
}): Promise<{
  sent: boolean;
  message: string;
  queuedForQuietHours?: boolean;
  resolvedTimeZone?: string;
  sendAt?: Date;
}> {
  const {
    admin: _admin,
    accountId,
    recipientPhone,
    businessName,
    leadName,
    projectType,
    city,
    address,
    state,
    postalCode,
    urgency,
    haloContext,
    timeZone,
    recipientTimeZone,
    accountTimeZone,
  } = params;

  if (!recipientPhone || recipientPhone.length < 10) {
    return { sent: false, message: 'Invalid phone number' };
  }

  // Resolve recipient's / called party's local time zone
  const resolvedTimeZone = resolveRecipientTimeZone({
    phone: recipientPhone,
    address: address || city,
    city,
    state,
    postalCode,
    explicitTimeZone: recipientTimeZone || timeZone,
    accountTimeZone,
  });

  const quietHoursCheck = getTcpaCompliantSendTime(new Date(), resolvedTimeZone);
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
      message: quietHoursCheck.reason || `Message held during FCC TCPA quiet hours (${resolvedTimeZone}).`,
      queuedForQuietHours: true,
      resolvedTimeZone,
      sendAt: quietHoursCheck.sendAt,
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
    return {
      sent: Boolean(eventId),
      message,
      queuedForQuietHours: false,
      resolvedTimeZone,
      sendAt: quietHoursCheck.sendAt,
    };
  } catch (error) {
    console.warn('Speed-to-lead SMS dispatch skipped:', error instanceof Error ? error.message : error);
    return { sent: false, message, resolvedTimeZone };
  }
}
