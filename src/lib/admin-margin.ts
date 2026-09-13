import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

export const COGS_RATES = {
  SMS_SEGMENT_DOLLARS: 0.0079, // SignalWire baseline per outbound SMS segment
  VOICE_MINUTE_DOLLARS: 0.1666, // SignalWire telephony ($0.0166) + AI speech/audio pipeline ($0.15)
  AI_THREAD_DOLLARS: 0.0020, // Gemini multimodal inference token cost per interaction
} as const;

export type MarginRange = '30d' | '90d' | '12m';

export type AccountMarginProfile = {
  accountId: string;
  range: MarginRange;
  feeRevenueDollars: number;
  telephonyCostDollars: number;
  aiCostDollars: number;
  totalCogsDollars: number;
  netMarginDollars: number;
  marginPct: number | null;
  isUnprofitable: boolean;
  isDrain: boolean;
  usageBreakdown: {
    smsCount: number;
    smsCostDollars: number;
    voiceMinutes: number;
    voiceCostDollars: number;
    aiThreads: number;
    aiCostDollars: number;
  };
};

export type AccountMarginSummary = {
  feeRevenueDollars: number;
  totalCogsDollars: number;
  netMarginDollars: number;
  marginPct: number | null;
  isUnprofitable: boolean;
};

function rangeStartDate(range: MarginRange, now = new Date()): string {
  const d = new Date(now.getTime());
  if (range === '30d') d.setDate(d.getDate() - 30);
  else if (range === '90d') d.setDate(d.getDate() - 90);
  else d.setFullYear(d.getFullYear() - 1);
  return d.toISOString();
}

/**
 * Loads complete unit economics and margin breakdown for a single account.
 */
export async function getAccountUnitEconomics(
  admin: SupabaseClient,
  accountId: string,
  range: MarginRange = '30d',
  now = new Date(),
): Promise<AccountMarginProfile> {
  const sinceIso = rangeStartDate(range, now);

  const [paymentsRes, smsRes, voiceRes] = await Promise.all([
    admin
      .from('payments')
      .select('platform_fee, platform_fee_refunded, status')
      .eq('account_id', accountId)
      .is('test_marker', null)
      .in('status', ['paid', 'refunded', 'partially_refunded'])
      .gte('paid_at', sinceIso),
    admin
      .from('sms_events')
      .select('id, context')
      .eq('account_id', accountId)
      .is('test_marker', null)
      .in('status', ['sent', 'delivered'])
      .gte('occurred_at', sinceIso),
    admin
      .from('voice_calls')
      .select('id, billed_minutes, ai_seconds')
      .eq('account_id', accountId)
      .gte('started_at', sinceIso),
  ]);

  // 1. Fee Revenue
  let feeRevenue = 0;
  for (const row of paymentsRes.data ?? []) {
    const fee = Number(row.platform_fee) || 0;
    const refunded = Number(row.platform_fee_refunded) || 0;
    feeRevenue += Math.max(0, fee - refunded);
  }

  // 2. SMS Usage & Cost
  const smsRows = smsRes.data ?? [];
  const smsCount = smsRows.length;
  const smsCost = smsCount * COGS_RATES.SMS_SEGMENT_DOLLARS;

  // AI SMS threads (context = automation or intake)
  const aiThreads = smsRows.filter((r) => r.context === 'automation' || r.context === 'intake').length;
  const aiCost = aiThreads * COGS_RATES.AI_THREAD_DOLLARS;

  // 3. Voice Telephony Usage & Cost
  let voiceMinutes = 0;
  for (const row of voiceRes.data ?? []) {
    if (typeof row.billed_minutes === 'number' && row.billed_minutes > 0) {
      voiceMinutes += row.billed_minutes;
    } else if (typeof row.ai_seconds === 'number' && row.ai_seconds > 0) {
      voiceMinutes += Math.ceil(row.ai_seconds / 60);
    }
  }
  const voiceCost = voiceMinutes * COGS_RATES.VOICE_MINUTE_DOLLARS;

  // 4. Totals & Margins
  const telephonyCost = smsCost + voiceCost;
  const totalCogs = telephonyCost + aiCost;
  const netMargin = feeRevenue - totalCogs;
  const marginPct = feeRevenue > 0 ? Math.round((netMargin / feeRevenue) * 100) : (totalCogs > 0 ? -100 : null);
  const isUnprofitable = totalCogs > feeRevenue;
  const isDrain = feeRevenue === 0 && totalCogs >= 0.50;

  return {
    accountId,
    range,
    feeRevenueDollars: Number(feeRevenue.toFixed(2)),
    telephonyCostDollars: Number(telephonyCost.toFixed(2)),
    aiCostDollars: Number(aiCost.toFixed(2)),
    totalCogsDollars: Number(totalCogs.toFixed(2)),
    netMarginDollars: Number(netMargin.toFixed(2)),
    marginPct,
    isUnprofitable,
    isDrain,
    usageBreakdown: {
      smsCount,
      smsCostDollars: Number(smsCost.toFixed(2)),
      voiceMinutes,
      voiceCostDollars: Number(voiceCost.toFixed(2)),
      aiThreads,
      aiCostDollars: Number(aiCost.toFixed(2)),
    },
  };
}

/**
 * Batches unit economics hydration for an array of account IDs.
 * Uses 3 grouped queries rather than N roundtrips.
 */
export async function batchGetAccountMargins(
  admin: SupabaseClient,
  accountIds: string[],
  range: MarginRange = '30d',
  now = new Date(),
): Promise<Map<string, AccountMarginSummary>> {
  const result = new Map<string, AccountMarginSummary>();
  if (!accountIds.length) return result;

  const sinceIso = rangeStartDate(range, now);

  const [paymentsRes, smsRes, voiceRes] = await Promise.all([
    admin
      .from('payments')
      .select('account_id, platform_fee, platform_fee_refunded')
      .in('account_id', accountIds)
      .is('test_marker', null)
      .in('status', ['paid', 'refunded', 'partially_refunded'])
      .gte('paid_at', sinceIso),
    admin
      .from('sms_events')
      .select('account_id')
      .in('account_id', accountIds)
      .is('test_marker', null)
      .in('status', ['sent', 'delivered'])
      .gte('occurred_at', sinceIso),
    admin
      .from('voice_calls')
      .select('account_id, billed_minutes, ai_seconds')
      .in('account_id', accountIds)
      .gte('started_at', sinceIso),
  ]);

  const revenueMap = new Map<string, number>();
  for (const row of paymentsRes.data ?? []) {
    const aid = row.account_id;
    if (!aid) continue;
    const fee = Number(row.platform_fee) || 0;
    const refunded = Number(row.platform_fee_refunded) || 0;
    revenueMap.set(aid, (revenueMap.get(aid) ?? 0) + Math.max(0, fee - refunded));
  }

  const smsMap = new Map<string, number>();
  for (const row of smsRes.data ?? []) {
    const aid = row.account_id;
    if (!aid) continue;
    smsMap.set(aid, (smsMap.get(aid) ?? 0) + 1);
  }

  const voiceMap = new Map<string, number>();
  for (const row of voiceRes.data ?? []) {
    const aid = row.account_id;
    if (!aid) continue;
    const mins = typeof row.billed_minutes === 'number' && row.billed_minutes > 0
      ? row.billed_minutes
      : typeof row.ai_seconds === 'number' && row.ai_seconds > 0
        ? Math.ceil(row.ai_seconds / 60)
        : 0;
    voiceMap.set(aid, (voiceMap.get(aid) ?? 0) + mins);
  }

  for (const accountId of accountIds) {
    const revenue = revenueMap.get(accountId) ?? 0;
    const sms = smsMap.get(accountId) ?? 0;
    const voice = voiceMap.get(accountId) ?? 0;

    const cogs = (sms * COGS_RATES.SMS_SEGMENT_DOLLARS) + (voice * COGS_RATES.VOICE_MINUTE_DOLLARS);
    const net = revenue - cogs;
    const marginPct = revenue > 0 ? Math.round((net / revenue) * 100) : (cogs > 0 ? -100 : null);
    const isUnprofitable = cogs > revenue;

    result.set(accountId, {
      feeRevenueDollars: Number(revenue.toFixed(2)),
      totalCogsDollars: Number(cogs.toFixed(2)),
      netMarginDollars: Number(net.toFixed(2)),
      marginPct,
      isUnprofitable,
    });
  }

  return result;
}

/**
 * Platform-wide margin summary across all accounts for the Money page.
 */
export async function getPlatformMarginSummary(
  admin: SupabaseClient,
  range: MarginRange = '30d',
  now = new Date(),
): Promise<{
  grossPlatformFees: number;
  totalTelephonyAndAiCogs: number;
  netPlatformTake: number;
  platformMarginPct: number | null;
}> {
  const sinceIso = rangeStartDate(range, now);

  const [paymentsRes, smsRes, voiceRes] = await Promise.all([
    admin
      .from('payments')
      .select('platform_fee, platform_fee_refunded')
      .is('test_marker', null)
      .in('status', ['paid', 'refunded', 'partially_refunded'])
      .gte('paid_at', sinceIso),
    admin
      .from('sms_events')
      .select('id')
      .is('test_marker', null)
      .in('status', ['sent', 'delivered'])
      .gte('occurred_at', sinceIso),
    admin
      .from('voice_calls')
      .select('billed_minutes, ai_seconds')
      .gte('started_at', sinceIso),
  ]);

  let grossFees = 0;
  for (const r of paymentsRes.data ?? []) {
    grossFees += Math.max(0, (Number(r.platform_fee) || 0) - (Number(r.platform_fee_refunded) || 0));
  }

  const smsCount = (smsRes.data ?? []).length;
  const smsCost = smsCount * COGS_RATES.SMS_SEGMENT_DOLLARS;

  let voiceMins = 0;
  for (const r of voiceRes.data ?? []) {
    voiceMins += typeof r.billed_minutes === 'number' && r.billed_minutes > 0
      ? r.billed_minutes
      : typeof r.ai_seconds === 'number' && r.ai_seconds > 0
        ? Math.ceil(r.ai_seconds / 60)
        : 0;
  }
  const voiceCost = voiceMins * COGS_RATES.VOICE_MINUTE_DOLLARS;

  const totalCogs = smsCost + voiceCost;
  const netTake = grossFees - totalCogs;
  const marginPct = grossFees > 0 ? Math.round((netTake / grossFees) * 100) : null;

  return {
    grossPlatformFees: Number(grossFees.toFixed(2)),
    totalTelephonyAndAiCogs: Number(totalCogs.toFixed(2)),
    netPlatformTake: Number(netTake.toFixed(2)),
    platformMarginPct: marginPct,
  };
}

/**
 * Returns account IDs where trailing 30-day telephony/AI COGS exceeded platform fee revenue.
 */
export async function getUnprofitableAccountIds(
  admin: SupabaseClient,
  sinceIso?: string,
): Promise<string[]> {
  const d = sinceIso || rangeStartDate('30d');

  const [smsRes, voiceRes] = await Promise.all([
    admin
      .from('sms_events')
      .select('account_id')
      .is('test_marker', null)
      .not('account_id', 'is', null)
      .gte('occurred_at', d)
      .limit(1000),
    admin
      .from('voice_calls')
      .select('account_id')
      .not('account_id', 'is', null)
      .gte('started_at', d)
      .limit(1000),
  ]);

  const candidateIds = new Set<string>();
  for (const r of smsRes.data ?? []) {
    if (r.account_id) candidateIds.add(r.account_id);
  }
  for (const r of voiceRes.data ?? []) {
    if (r.account_id) candidateIds.add(r.account_id);
  }

  if (!candidateIds.size) return [];

  const margins = await batchGetAccountMargins(admin, [...candidateIds], '30d');
  const unprofitableIds: string[] = [];
  for (const [id, m] of margins.entries()) {
    if (m.isUnprofitable) {
      unprofitableIds.push(id);
    }
  }

  return unprofitableIds;
}
