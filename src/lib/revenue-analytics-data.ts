import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllPages } from '@/lib/pagination';
import { toCents, fromCents } from '@/lib/stripe';

export type RevenueDataPoint = {
  dateKey: string;
  label: string;
  gross: number;
  net: number;
  fees: number;
  count: number;
};

export type RevenueStreamBreakdown = {
  name: string;
  key: string;
  amount: number;
  percentage: number;
  count: number;
  color: string;
};

export type PaymentMethodDistribution = {
  method: string;
  label: string;
  amount: number;
  percentage: number;
  count: number;
  feePercent: number;
};

export type TopClientRevenue = {
  clientName: string;
  totalPaid: number;
  jobCount: number;
};

export type RevenueAnalyticsData = {
  trendDaily: RevenueDataPoint[];
  trendMonthly: RevenueDataPoint[];
  streams: RevenueStreamBreakdown[];
  methods: PaymentMethodDistribution[];
  topClients: TopClientRevenue[];
  totalGross: number;
  totalNet: number;
  totalFees: number;
  achSavings: number;
  available: boolean;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

type DbAnalyticsPaymentRow = {
  id: string;
  job_id: string;
  kind: string;
  label: string | null;
  amount: number | string;
  status: string;
  platform_fee: number | string | null;
  refunded_amount: number | string | null;
  charge_model: string | null;
  paid_at: string | null;
  requested_at: string;
};

type DbAnalyticsJobRow = {
  id: string;
  client_name: string | null;
};

export async function loadRevenueAnalyticsData(
  supabase: SupabaseClient,
  accountId: string,
): Promise<RevenueAnalyticsData> {
  try {
    const oneYearAgo = new Date();
    oneYearAgo.setUTCFullYear(oneYearAgo.getUTCFullYear() - 1);
    oneYearAgo.setUTCHours(0, 0, 0, 0);

    const [payments, jobsRes] = await Promise.all([
      fetchAllPages<DbAnalyticsPaymentRow>((from, to) =>
        supabase
          .from('payments')
          .select('id, job_id, kind, label, amount, status, platform_fee, refunded_amount, charge_model, paid_at, requested_at')
          .eq('account_id', accountId)
          .in('status', ['paid', 'refunded'])
          .gte('paid_at', oneYearAgo.toISOString())
          .order('paid_at', { ascending: true })
          .range(from, to),
      ),
      fetchAllPages<DbAnalyticsJobRow>((from, to) =>
        supabase
          .from('jobs')
          .select('id, client_name')
          .eq('account_id', accountId)
          .range(from, to),
      ),
    ]);

    const jobClientMap = new Map<string, string>();
    for (const j of jobsRes) {
      jobClientMap.set(j.id, j.client_name ?? 'Customer');
    }

    let totalGrossCents = 0;
    let totalNetCents = 0;
    let totalFeesCents = 0;
    let achSavingsCents = 0;

    const dailyMap = new Map<string, { grossCents: number; netCents: number; feesCents: number; count: number }>();
    const monthlyMap = new Map<string, { grossCents: number; netCents: number; feesCents: number; count: number }>();

    const streamBuckets: Record<string, { name: string; amountCents: number; count: number; color: string }> = {
      deposit: { name: 'Initial Deposits', amountCents: 0, count: 0, color: '#3b82f6' },
      milestone: { name: 'Milestone Draws', amountCents: 0, count: 0, color: '#10b981' },
      final: { name: 'Final Invoices', amountCents: 0, count: 0, color: '#8b5cf6' },
      quick_stop: { name: 'Quick Stop / Service', amountCents: 0, count: 0, color: '#f59e0b' },
      manual: { name: 'Offline / Manual', amountCents: 0, count: 0, color: '#64748b' },
      other: { name: 'Other Payments', amountCents: 0, count: 0, color: '#06b6d4' },
    };

    const methodBuckets: Record<string, { label: string; amountCents: number; count: number }> = {
      card: { label: 'Credit / Debit Card', amountCents: 0, count: 0 },
      ach: { label: 'ACH Bank Transfer', amountCents: 0, count: 0 },
      apple_pay: { label: 'Apple Pay', amountCents: 0, count: 0 },
      google_pay: { label: 'Google Pay', amountCents: 0, count: 0 },
      manual: { label: 'Manual (Cash / Check)', amountCents: 0, count: 0 },
    };

    const clientTotalsMap = new Map<string, { totalPaidCents: number; jobIds: Set<string> }>();

    const thirtyDaysAgoMs = Date.now() - 30 * 86400000;

    for (const p of payments) {
      const grossCents = toCents(Number(p.amount) || 0);
      const feeCents = toCents(Number(p.platform_fee) || 0);
      const refundedCents = toCents(Number(p.refunded_amount) || (p.status === 'refunded' ? Number(p.amount) || 0 : 0));
      const netCents = Math.max(0, grossCents - feeCents - refundedCents);
      const paidDate = p.paid_at ? new Date(p.paid_at) : new Date(p.requested_at);
      const paidMs = paidDate.getTime();

      totalGrossCents += grossCents;
      totalNetCents += netCents;
      totalFeesCents += feeCents;

      if (p.charge_model === 'ach' || (grossCents >= 50000 && p.charge_model !== 'card')) {
        const estCardFeeCents = Math.round(grossCents * 0.029) + 30;
        achSavingsCents += Math.max(0, estCardFeeCents - 500);
      }

      const kindKey = p.kind in streamBuckets ? p.kind : 'other';
      streamBuckets[kindKey].amountCents += grossCents;
      streamBuckets[kindKey].count++;

      let mKey = 'card';
      if (p.charge_model === 'manual') mKey = 'manual';
      else if (p.charge_model === 'ach') mKey = 'ach';
      else if (p.charge_model === 'apple_pay') mKey = 'apple_pay';
      else if (p.charge_model === 'google_pay') mKey = 'google_pay';
      methodBuckets[mKey].amountCents += grossCents;
      methodBuckets[mKey].count++;

      if (paidMs >= thirtyDaysAgoMs) {
        const dayKey = paidDate.toISOString().slice(0, 10);
        const existingDay = dailyMap.get(dayKey) || { grossCents: 0, netCents: 0, feesCents: 0, count: 0 };
        existingDay.grossCents += grossCents;
        existingDay.netCents += netCents;
        existingDay.feesCents += feeCents;
        existingDay.count++;
        dailyMap.set(dayKey, existingDay);
      }

      const monthKey = paidDate.toISOString().slice(0, 7);
      const existingMonth = monthlyMap.get(monthKey) || { grossCents: 0, netCents: 0, feesCents: 0, count: 0 };
      existingMonth.grossCents += grossCents;
      existingMonth.netCents += netCents;
      existingMonth.feesCents += feeCents;
      existingMonth.count++;
      monthlyMap.set(monthKey, existingMonth);

      if (p.job_id) {
        const clientName = jobClientMap.get(p.job_id) || 'Direct Customer';
        const clientStat = clientTotalsMap.get(clientName) || { totalPaidCents: 0, jobIds: new Set<string>() };
        clientStat.totalPaidCents += grossCents;
        clientStat.jobIds.add(p.job_id);
        clientTotalsMap.set(clientName, clientStat);
      }
    }

    const trendDaily: RevenueDataPoint[] = [];
    const sortedDays = [...dailyMap.keys()].sort();
    for (const dKey of sortedDays) {
      const val = dailyMap.get(dKey)!;
      const d = new Date(`${dKey}T12:00:00Z`);
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
      trendDaily.push({
        dateKey: dKey,
        label,
        gross: fromCents(val.grossCents),
        net: fromCents(val.netCents),
        fees: fromCents(val.feesCents),
        count: val.count,
      });
    }

    const trendMonthly: RevenueDataPoint[] = [];
    const sortedMonths = [...monthlyMap.keys()].sort();
    for (const mKey of sortedMonths) {
      const val = monthlyMap.get(mKey)!;
      const [y, m] = mKey.split('-').map(Number);
      const d = new Date(Date.UTC(y, m - 1, 1));
      const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
      trendMonthly.push({
        dateKey: mKey,
        label,
        gross: fromCents(val.grossCents),
        net: fromCents(val.netCents),
        fees: fromCents(val.feesCents),
        count: val.count,
      });
    }

    const streams: RevenueStreamBreakdown[] = Object.entries(streamBuckets)
      .filter(([_, b]) => b.amountCents > 0)
      .map(([key, b]) => ({
        key,
        name: b.name,
        amount: fromCents(b.amountCents),
        percentage: totalGrossCents > 0 ? round2((b.amountCents / totalGrossCents) * 100) : 0,
        count: b.count,
        color: b.color,
      }))
      .sort((a, b) => b.amount - a.amount);

    const methods: PaymentMethodDistribution[] = Object.entries(methodBuckets)
      .filter(([_, m]) => m.amountCents > 0)
      .map(([method, m]) => ({
        method,
        label: m.label,
        amount: fromCents(m.amountCents),
        percentage: totalGrossCents > 0 ? round2((m.amountCents / totalGrossCents) * 100) : 0,
        count: m.count,
        feePercent: method === 'ach' ? 0.5 : method === 'manual' ? 0 : 2.9,
      }))
      .sort((a, b) => b.amount - a.amount);

    const topClients: TopClientRevenue[] = [...clientTotalsMap.entries()]
      .map(([clientName, stat]) => ({
        clientName,
        totalPaid: fromCents(stat.totalPaidCents),
        jobCount: stat.jobIds.size,
      }))
      .sort((a, b) => b.totalPaid - a.totalPaid)
      .slice(0, 8);

    return {
      trendDaily,
      trendMonthly,
      streams,
      methods,
      topClients,
      totalGross: fromCents(totalGrossCents),
      totalNet: fromCents(totalNetCents),
      totalFees: fromCents(totalFeesCents),
      achSavings: fromCents(achSavingsCents),
      available: true,
    };
  } catch (error) {
    console.error('Failed to load revenue analytics data:', error);
    return {
      trendDaily: [],
      trendMonthly: [],
      streams: [],
      methods: [],
      topClients: [],
      totalGross: 0,
      totalNet: 0,
      totalFees: 0,
      achSavings: 0,
      available: false,
    };
  }
}
