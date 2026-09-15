import 'server-only';
import { createAdminClient } from '@/lib/auth';
import type { SupabaseClient } from '@supabase/supabase-js';

export const CARRIER_CAPS = {
  MAX_ASSIGNED_NUMBERS_PER_CAMPAIGN: 49,
  ATT_SMS_PER_MINUTE_CAP: 75,
  ATT_MMS_PER_MINUTE_CAP: 50,
  TMOBILE_DAILY_BRAND_CAP: 2000,
  WARNING_THRESHOLD_PERCENT: 80,
} as const;

export interface CarrierThroughputMetrics {
  lastMinuteSmsCount: number;
  last24HoursTotalCount: number;
  assignedNumbersCount: number;
  campaignRenewalAt: string | null;
  brandRevetAt: string | null;
  renewalWarning: boolean;
  nearAssignedNumbersCeiling: boolean;
  nearDailyCap: boolean;
}

/**
 * Checks whether assigning another number to the campaign would violate the 49-number ceiling.
 * Throws if the ceiling is reached.
 */
export async function assertCampaignNumberCeiling(
  campaignId: string,
  admin: SupabaseClient = createAdminClient(),
): Promise<{ count: number; maxAllowed: number }> {
  const { count, error } = await admin
    .from('sms_sender_numbers')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .eq('assignment_state', 'assigned')
    .is('suspended_at', null);

  if (error) {
    console.error('Failed to check campaign assigned numbers count:', error);
    return { count: 0, maxAllowed: CARRIER_CAPS.MAX_ASSIGNED_NUMBERS_PER_CAMPAIGN };
  }

  const currentCount = count ?? 0;
  if (currentCount >= CARRIER_CAPS.MAX_ASSIGNED_NUMBERS_PER_CAMPAIGN) {
    throw new Error(
      `Campaign ${campaignId} has reached the approved ceiling of ${CARRIER_CAPS.MAX_ASSIGNED_NUMBERS_PER_CAMPAIGN} assigned numbers. A separate campaign registration is required.`,
    );
  }

  return { count: currentCount, maxAllowed: CARRIER_CAPS.MAX_ASSIGNED_NUMBERS_PER_CAMPAIGN };
}

/**
 * Checks recent throughput against approved carrier caps (75 AT&T SMS/min, 2,000 T-Mobile msgs/day).
 */
export async function checkCarrierOutboundAllowance(
  admin: SupabaseClient = createAdminClient(),
): Promise<{ allowed: boolean; reason?: string; metrics: { lastMinuteSms: number; lastDayMsgs: number } }> {
  const now = new Date();
  const oneMinuteAgo = new Date(now.getTime() - 60 * 1000).toISOString();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const [lastMinuteRes, lastDayRes] = await Promise.all([
    admin
      .from('sms_events')
      .select('id', { count: 'exact', head: true })
      .gte('send_started_at', oneMinuteAgo),
    admin
      .from('sms_events')
      .select('id', { count: 'exact', head: true })
      .gte('send_started_at', oneDayAgo),
  ]);

  const lastMinuteSms = lastMinuteRes.count ?? 0;
  const lastDayMsgs = lastDayRes.count ?? 0;

  if (lastMinuteSms >= CARRIER_CAPS.ATT_SMS_PER_MINUTE_CAP) {
    return {
      allowed: false,
      reason: `Platform outbound reached AT&T carrier throughput cap (${lastMinuteSms}/${CARRIER_CAPS.ATT_SMS_PER_MINUTE_CAP} SMS/min).`,
      metrics: { lastMinuteSms, lastDayMsgs },
    };
  }

  if (lastDayMsgs >= CARRIER_CAPS.TMOBILE_DAILY_BRAND_CAP) {
    return {
      allowed: false,
      reason: `Platform outbound reached T-Mobile brand daily cap (${lastDayMsgs}/${CARRIER_CAPS.TMOBILE_DAILY_BRAND_CAP} msgs/day).`,
      metrics: { lastMinuteSms, lastDayMsgs },
    };
  }

  return {
    allowed: true,
    metrics: { lastMinuteSms, lastDayMsgs },
  };
}

/**
 * Inspects a campaign registration application and returns lifecycle and threshold warnings.
 */
export function getCampaignLifecycleWarnings(app: {
  campaignRenewalAt?: string | null;
  brandRevetAt?: string | null;
  assignedNumbersCount?: number;
}): {
  renewalImminent: boolean;
  daysUntilRenewal: number | null;
  nearNumberCap: boolean;
  warningMessages: string[];
} {
  const warningMessages: string[] = [];
  let renewalImminent = false;
  let daysUntilRenewal: number | null = null;

  if (app.campaignRenewalAt) {
    const renewalDate = new Date(app.campaignRenewalAt);
    const diffMs = renewalDate.getTime() - Date.now();
    daysUntilRenewal = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
    if (daysUntilRenewal <= 30) {
      renewalImminent = true;
      warningMessages.push(
        daysUntilRenewal <= 0
          ? 'TCR Campaign renewal is overdue! Carrier re-vetting required immediately.'
          : `TCR Campaign renewal is due in ${daysUntilRenewal} days.`,
      );
    }
  }

  const assignedCount = app.assignedNumbersCount ?? 0;
  const nearNumberCap = assignedCount >= 45;
  if (nearNumberCap) {
    warningMessages.push(
      `Campaign has ${assignedCount}/${CARRIER_CAPS.MAX_ASSIGNED_NUMBERS_PER_CAMPAIGN} assigned numbers (approaching hard carrier ceiling).`,
    );
  }

  return {
    renewalImminent,
    daysUntilRenewal,
    nearNumberCap,
    warningMessages,
  };
}
