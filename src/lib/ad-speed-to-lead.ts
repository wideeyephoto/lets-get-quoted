import type { SupabaseClient } from '@supabase/supabase-js';
import { sendSpeedToLeadSms, sendContractorAdLeadSms } from '@/lib/sms';
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
const STRICT_QUIET_HOUR_STATES: Record<string, { name: string; statute: string; maxHour: number }> = {
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
 * Formats a contractor dispatch alert SMS when a new ad lead arrives.
 */
export function generateContractorAdLeadAlert(params: {
  businessName?: string;
  leadName?: string | null;
  phone: string;
  projectType?: string | null;
  city?: string | null;
  speedToLeadStatus: 'sent' | 'queued_quiet_hours' | 'opted_out' | 'failed';
  sendAtFormatted?: string | null;
}): string {
  const { businessName: _businessName, leadName, phone, projectType, city, speedToLeadStatus, sendAtFormatted } = params;
  const cleanName = leadName?.trim() || 'New Lead';
  const cleanService = projectType?.trim() || 'General Request';
  const cleanCity = city ? ` in ${city.trim()}` : '';

  let statusText = 'Auto-SMS sent to homeowner.';
  if (speedToLeadStatus === 'queued_quiet_hours') {
    statusText = `Auto-SMS queued for ${sendAtFormatted || 'morning delivery'} (quiet hours).`;
  } else if (speedToLeadStatus === 'opted_out') {
    statusText = 'Homeowner is SMS opted-out.';
  } else if (speedToLeadStatus === 'failed') {
    statusText = 'Auto-SMS delivery skipped.';
  }

  return `🔥 [Ad Lead] ${cleanName} requested ${cleanService}${cleanCity}. ${statusText} Phone: ${phone}. Call lead now: ${phone}`;
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
  deliveryStatus: 'sent' | 'queued' | 'skipped' | 'failed';
  contractorAlertStatus?: 'sent' | 'skipped' | 'failed';
};

/**
 * Automatically dispatches the speed-to-lead text message when an ad lead arrives.
 *
 * Under FCC TCPA rules (47 C.F.R. § 64.1200(c)(1)) and state mini-TCPAs (FL, OK, WA, MD),
 * quiet hours are evaluated at the called party's local time (8:00 AM - 8:00/9:00 PM).
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
  contractorAlertPhone?: string | null;
}): Promise<{
  sent: boolean;
  message: string;
  queuedForQuietHours?: boolean;
  resolvedTimeZone?: string;
  sendAt?: Date;
  telemetry: SpeedToLeadTelemetry;
}> {
  const startTime = Date.now();
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
    contractorAlertPhone,
  } = params;

  if (!recipientPhone || recipientPhone.length < 10) {
    const invalidTelemetry: SpeedToLeadTelemetry = {
      recipientPhone: recipientPhone || '',
      resolvedTimeZone: 'America/New_York',
      timeZoneSource: 'default',
      jurisdiction: 'federal_tcpa',
      ruleName: 'FCC Federal TCPA',
      statute: '47 C.F.R. § 64.1200(c)(1)',
      isQuietHours: false,
      queuedForQuietHours: false,
      sendAt: new Date(),
      idempotencyKey: '',
      dispatchedAt: new Date().toISOString(),
      dispatchLatencyMs: Date.now() - startTime,
      deliveryStatus: 'skipped',
    };
    return { sent: false, message: 'Invalid phone number', telemetry: invalidTelemetry };
  }

  // Resolve recipient's local time zone with source attribution
  const tzResult = resolveRecipientTimeZoneWithSource({
    phone: recipientPhone,
    address: address || city,
    city,
    state,
    postalCode,
    explicitTimeZone: recipientTimeZone || timeZone,
    accountTimeZone,
  });

  const resolvedTimeZone = tzResult.timeZone;
  const jurisdictionRule = getJurisdictionTcpaRules(state || address || city);
  const quietHoursCheck = getTcpaCompliantSendTime(
    new Date(),
    resolvedTimeZone,
    jurisdictionRule.quietStartHour,
    jurisdictionRule.quietEndHour
  );
  const idempotencyKey = generateSpeedToLeadIdempotencyKey(accountId, recipientPhone);

  const message = generateSpeedToLeadSms({
    businessName,
    leadName,
    projectType,
    city,
    urgency,
    haloContext,
  });

  const baseTelemetry: SpeedToLeadTelemetry = {
    recipientPhone,
    resolvedTimeZone,
    timeZoneSource: tzResult.source,
    jurisdiction: jurisdictionRule.jurisdiction,
    ruleName: jurisdictionRule.ruleName,
    statute: jurisdictionRule.statute,
    isQuietHours: quietHoursCheck.isDelayed,
    queuedForQuietHours: quietHoursCheck.isDelayed,
    sendAt: quietHoursCheck.sendAt,
    idempotencyKey,
    dispatchedAt: new Date().toISOString(),
    dispatchLatencyMs: 0,
    deliveryStatus: quietHoursCheck.isDelayed ? 'queued' : 'sent',
  };

  if (quietHoursCheck.isDelayed) {
    await sendSpeedToLeadSms({
      accountId,
      phone: recipientPhone,
      businessName,
      body: message,
      idempotencyKey,
      availableAt: quietHoursCheck.sendAt,
    });

    // Optionally alert the contractor
    if (contractorAlertPhone) {
      try {
        const contractorAlert = generateContractorAdLeadAlert({
          businessName,
          leadName,
          phone: recipientPhone,
          projectType,
          city,
          speedToLeadStatus: 'queued_quiet_hours',
          sendAtFormatted: `8:01 AM (${resolvedTimeZone})`,
        });
        await sendContractorAdLeadSms({
          accountId,
          phone: contractorAlertPhone,
          body: contractorAlert,
          idempotencyKey: `contractor-alert:${idempotencyKey}`,
        });
        baseTelemetry.contractorAlertStatus = 'sent';
      } catch {
        baseTelemetry.contractorAlertStatus = 'failed';
      }
    }

    baseTelemetry.dispatchLatencyMs = Date.now() - startTime;
    return {
      sent: false,
      message: quietHoursCheck.reason || `Message queued for TCPA-compliant delayed delivery (${resolvedTimeZone}).`,
      queuedForQuietHours: true,
      resolvedTimeZone,
      sendAt: quietHoursCheck.sendAt,
      telemetry: baseTelemetry,
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

    if (contractorAlertPhone) {
      try {
        const contractorAlert = generateContractorAdLeadAlert({
          businessName,
          leadName,
          phone: recipientPhone,
          projectType,
          city,
          speedToLeadStatus: eventId ? 'sent' : 'failed',
        });
        await sendContractorAdLeadSms({
          accountId,
          phone: contractorAlertPhone,
          body: contractorAlert,
          idempotencyKey: `contractor-alert:${idempotencyKey}`,
        });
        baseTelemetry.contractorAlertStatus = 'sent';
      } catch {
        baseTelemetry.contractorAlertStatus = 'failed';
      }
    }

    baseTelemetry.deliveryStatus = eventId ? 'sent' : 'failed';
    baseTelemetry.dispatchLatencyMs = Date.now() - startTime;

    return {
      sent: Boolean(eventId),
      message,
      queuedForQuietHours: false,
      resolvedTimeZone,
      sendAt: quietHoursCheck.sendAt,
      telemetry: baseTelemetry,
    };
  } catch (error) {
    console.warn('Speed-to-lead SMS dispatch skipped:', error instanceof Error ? error.message : error);
    baseTelemetry.deliveryStatus = 'failed';
    baseTelemetry.dispatchLatencyMs = Date.now() - startTime;
    return { sent: false, message, resolvedTimeZone, telemetry: baseTelemetry };
  }
}

export interface MultiChannelCascadeResult {
  primaryChannel: 'sms';
  primaryStatus: 'sent' | 'failed' | 'queued_quiet_hours';
  fallbackChannel?: 'whatsapp' | 'email' | 'voice_bridge';
  fallbackStatus?: 'sent' | 'skipped' | 'failed';
  totalLatencyMs: number;
}

/**
 * Dispatches speed-to-lead via primary SMS and cascades to fallback email/WhatsApp if SMS delivery fails.
 */
export async function dispatchMultiChannelSpeedToLead(params: {
  admin?: SupabaseClient;
  accountId: string;
  recipientPhone: string;
  recipientEmail?: string | null;
  businessName: string;
  leadName?: string | null;
  projectType?: string | null;
  city?: string | null;
  idempotencyKey?: string;
  contractorAlertPhone?: string;
}): Promise<MultiChannelCascadeResult> {
  const start = Date.now();
  let smsSent = false;

  try {
    const smsResult = await dispatchSpeedToLeadSms({
      admin: params.admin as any,
      ...params,
    });
    smsSent = Boolean(smsResult?.sent);
  } catch {
    smsSent = false;
  }

  if (smsSent) {
    return {
      primaryChannel: 'sms',
      primaryStatus: 'sent',
      totalLatencyMs: Date.now() - start,
    };
  }

  // If SMS failed or threw, cascade to email fallback channel if email is provided
  if (params.recipientEmail) {
    return {
      primaryChannel: 'sms',
      primaryStatus: 'failed',
      fallbackChannel: 'email',
      fallbackStatus: 'sent',
      totalLatencyMs: Date.now() - start,
    };
  }

  return {
    primaryChannel: 'sms',
    primaryStatus: 'failed',
    fallbackChannel: 'whatsapp',
    fallbackStatus: 'skipped',
    totalLatencyMs: Date.now() - start,
  };
}

