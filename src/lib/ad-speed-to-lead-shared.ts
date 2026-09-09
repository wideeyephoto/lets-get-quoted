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
 * State mini-TCPA rules that enforce stricter 8:00 PM quiet hour cutoffs (instead of 9:00 PM).
 */
export const STRICT_QUIET_HOUR_STATES: Record<string, { name: string; statute: string; maxHour: number }> = {
  FL: { name: 'Florida FTSA', statute: 'Fla. Stat. § 501.059', maxHour: 20 },
  OK: { name: 'Oklahoma OTA', statute: '15 O.S. § 775C.3', maxHour: 20 },
  WA: { name: 'Washington Commercial Solicitations', statute: 'Wash. Rev. Code § 80.36.390', maxHour: 20 },
  MD: { name: 'Maryland Stop the Spam Calls Act', statute: 'Md. Code, Com. Law § 14-4501', maxHour: 20 },
};

/**
 * Extracts a 2-letter state code from address/city/state strings.
 */
export function extractUsStateCode(input?: string | null): string | null {
  if (!input) return null;
  const match = input.toUpperCase().match(/\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/);
  return match ? match[1] : null;
}

export type JurisdictionTcpaRules = {
  jurisdiction: 'federal_tcpa' | 'state_mini_tcpa';
  stateCode: string | null;
  ruleName: string;
  statute: string;
  quietStartHour: number; // 20 (8:00 PM) or 21 (9:00 PM)
  quietEndHour: number;   // 8 (8:00 AM)
};

/**
 * Resolves the applicable TCPA / Mini-TCPA quiet hours rule for a lead location.
 */
export function getJurisdictionTcpaRules(locationOrState?: string | null): JurisdictionTcpaRules {
  const stateCode = extractUsStateCode(locationOrState);
  if (stateCode && STRICT_QUIET_HOUR_STATES[stateCode]) {
    const stateRule = STRICT_QUIET_HOUR_STATES[stateCode];
    return {
      jurisdiction: 'state_mini_tcpa',
      stateCode,
      ruleName: stateRule.name,
      statute: stateRule.statute,
      quietStartHour: stateRule.maxHour,
      quietEndHour: 8,
    };
  }

  return {
    jurisdiction: 'federal_tcpa',
    stateCode,
    ruleName: 'FCC Federal TCPA',
    statute: '47 C.F.R. § 64.1200(c)(1)',
    quietStartHour: 21,
    quietEndHour: 8,
  };
}

/**
 * Resolves recipient time zone with source attribution for auditing and telemetry.
 */
export function resolveRecipientTimeZoneWithSource(params: {
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  explicitTimeZone?: string | null;
  accountTimeZone?: string | null;
}): {
  timeZone: string;
  source: 'explicit' | 'phone_npa' | 'location' | 'account' | 'default';
  stateCode: string | null;
} {
  const { phone, address, city, state, postalCode, explicitTimeZone, accountTimeZone } = params;

  if (explicitTimeZone && isValidTimeZone(explicitTimeZone)) {
    return {
      timeZone: explicitTimeZone,
      source: 'explicit',
      stateCode: extractUsStateCode(state || address || city),
    };
  }

  if (phone) {
    const fromPhone = getTimeZoneFromPhone(phone);
    if (fromPhone) {
      return {
        timeZone: fromPhone,
        source: 'phone_npa',
        stateCode: extractUsStateCode(state || address || city),
      };
    }
  }

  const locationStr = [address, city, state, postalCode].filter(Boolean).join(', ');
  if (locationStr) {
    const fromLocation = getTimeZoneFromLocation(locationStr);
    if (fromLocation) {
      return {
        timeZone: fromLocation,
        source: 'location',
        stateCode: extractUsStateCode(locationStr),
      };
    }
  }

  if (accountTimeZone && isValidTimeZone(accountTimeZone)) {
    return {
      timeZone: accountTimeZone,
      source: 'account',
      stateCode: extractUsStateCode(state || address || city),
    };
  }

  return {
    timeZone: 'America/New_York',
    source: 'default',
    stateCode: extractUsStateCode(state || address || city),
  };
}

/**
 * Acknowledges an ad lead and asks for preferences. Availability and staffing
 * are not inputs, so this cannot offer specific slots or promise a live team.
 */
export function generateSpeedToLeadSms(params: SpeedToLeadParams): string {
  const { businessName, leadName, projectType, city, urgency = 'standard', haloContext } = params;
  const firstName = (leadName || '').trim().split(' ')[0] || 'there';
  const cleanService = (projectType || 'estimate request').trim();
  const cleanCity = (city || '').replace(/,\s*[A-Z]{2}$/i, '').trim();
  const locationSuffix = cleanCity ? ` in ${cleanCity}` : '';

  // Halo-Aware Neighbor Lead Personalization
  if (urgency === 'standard' && haloContext?.isNeighborLead && haloContext.streetName) {
    const street = haloContext.streetName.trim();
    const neighborhood = haloContext.neighborhoodName ? ` in ${haloContext.neighborhoodName.trim()}` : '';
    const cluster = haloContext.clusterOffer ? ` Ask us about the ${haloContext.clusterOffer}.` : '';

    return withOptOut(
      `Hi ${firstName}, ${businessName} here. We received your request for ${cleanService} near ${street}${neighborhood}.${cluster} What day works for an estimate? We'll confirm availability.`,
    );
  }

  if (urgency === 'emergency' || urgency === 'high') {
    return withOptOut(
      `Hi ${firstName}, ${businessName} here. We received your urgent request for ${cleanService}${locationSuffix}. What time can we call to discuss it? Availability is not yet confirmed.`,
    );
  }

  return withOptOut(
    `Hi ${firstName}, ${businessName} here. We received your request for ${cleanService}${locationSuffix}. What day works for an estimate? We'll confirm availability.`,
  );
}

/**
 * Formats a contractor dispatch alert SMS when a new ad lead arrives.
 */
export function generateContractorAdLeadAlert(params: {
  businessName?: string;
  leadName?: string | null;
  phone: string;
  projectType?: string | null;
  city?: string | null;
  speedToLeadStatus: 'sent' | 'queued_quiet_hours' | 'opted_out' | 'failed' | 'deferred' | 'queued';
  sendAtFormatted?: string | null;
}): string {
  const { businessName: _businessName, leadName, phone, projectType, city, speedToLeadStatus, sendAtFormatted } = params;
  const cleanName = leadName?.trim() || 'New Lead';
  const cleanService = projectType?.trim() || 'General Request';
  const cleanCity = city ? ` in ${city.trim()}` : '';

  let statusText = 'Auto-SMS sent to homeowner.';
  if (speedToLeadStatus === 'queued_quiet_hours') {
    statusText = `Auto-SMS queued for ${sendAtFormatted || 'morning delivery'} (quiet hours).`;
  } else if (speedToLeadStatus === 'deferred') {
    statusText = 'Auto-SMS deferred (no dedicated sender).';
  } else if (speedToLeadStatus === 'queued') {
    statusText = 'Auto-SMS queued for delivery.';
  } else if (speedToLeadStatus === 'opted_out') {
    statusText = 'Homeowner is SMS opted-out.';
  } else if (speedToLeadStatus === 'failed') {
    statusText = 'Auto-SMS delivery skipped.';
  }

  return `[Ad Lead] ${cleanName} requested ${cleanService}${cleanCity}. ${statusText} Phone: ${phone}. Call lead now: ${phone}`;
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

export type SpeedToLeadTelemetry = {
  recipientPhone: string;
  resolvedTimeZone: string;
  timeZoneSource: 'explicit' | 'phone_npa' | 'location' | 'account' | 'default';
  jurisdiction: string;
  ruleName: string;
  statute: string;
  isQuietHours: boolean;
  queuedForQuietHours: boolean;
  sendAt: Date;
  idempotencyKey: string;
  dispatchedAt: string;
  dispatchLatencyMs: number;
  deliveryStatus: 'sent' | 'queued' | 'skipped' | 'failed' | 'deferred';
  contractorAlertStatus?: 'sent' | 'skipped' | 'failed';
};

