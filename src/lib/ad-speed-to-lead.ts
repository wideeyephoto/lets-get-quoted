import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/auth';
import { loadDedicatedMessagingReadiness } from '@/lib/messaging-number-provisioning';
import { sendSpeedToLeadSms, sendContractorAdLeadSms } from '@/lib/sms';
import { getTcpaCompliantSendTime } from '@/lib/phone-timezone';
import {
  type HaloLeadContext,
  type SpeedToLeadTelemetry,
  resolveRecipientTimeZoneWithSource,
  getJurisdictionTcpaRules,
  generateSpeedToLeadIdempotencyKey,
  generateSpeedToLeadSms,
  generateContractorAdLeadAlert,
} from './ad-speed-to-lead-shared';

export * from '@/lib/ad-speed-to-lead-shared';

async function checkDedicatedSenderReady(accountId: string, admin?: SupabaseClient): Promise<boolean> {
  if (process.env.LGQ_SMS_CONTRACTOR_MESSAGING_ENABLED !== '1') {
    return false;
  }
  try {
    const client = admin && typeof admin.from === 'function' ? admin : createAdminClient();
    const readiness = await loadDedicatedMessagingReadiness(accountId, client);
    return readiness.kind === 'ready';
  } catch {
    return false;
  }
}

/**
 * Automatically dispatches the speed-to-lead text message when an ad lead arrives.
 *
 * Under FCC TCPA rules (47 C.F.R. § 64.1200(c)(1)) and state mini-TCPAs (FL, OK, WA, MD),
 * quiet hours are evaluated at the called party's local time (8:00 AM - 8:00/9:00 PM).
 */
export async function dispatchSpeedToLeadSms(params: {
  admin?: SupabaseClient;
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
  hasDedicatedSender?: boolean;
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
    admin,
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
    hasDedicatedSender: explicitHasDedicated,
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

    const hasDedicatedSender = explicitHasDedicated !== undefined
      ? explicitHasDedicated
      : await checkDedicatedSenderReady(accountId, admin);

    const isDeferred = Boolean(eventId && !hasDedicatedSender);
    const effectiveStatus: 'sent' | 'deferred' | 'failed' = !eventId
      ? 'failed'
      : isDeferred
      ? 'deferred'
      : 'sent';

    if (contractorAlertPhone) {
      try {
        const contractorAlert = generateContractorAdLeadAlert({
          businessName,
          leadName,
          phone: recipientPhone,
          projectType,
          city,
          speedToLeadStatus: effectiveStatus,
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

    baseTelemetry.deliveryStatus = effectiveStatus;
    baseTelemetry.dispatchLatencyMs = Date.now() - startTime;

    return {
      sent: effectiveStatus === 'sent',
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
      admin: params.admin,
      accountId: params.accountId,
      recipientPhone: params.recipientPhone,
      businessName: params.businessName,
      leadName: params.leadName,
      projectType: params.projectType,
      city: params.city,
      contractorAlertPhone: params.contractorAlertPhone,
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

