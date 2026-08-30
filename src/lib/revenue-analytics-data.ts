import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllPages } from '@/lib/pagination';

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
          .in('status', ['paid', 'refunded', 'partially_refunded'])
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

    let totalGross = 0;
    let totalNet = 0;
    let totalFees = 0;
    let achSavings = 0;

    // Buckets
    const dailyMap = new Map<string, { gross: number; net: number; fees: number; count: number }>();
    const monthlyMap = new Map<string, { gross: number; net: number; fees: number; count: number }>();

    // Streams
    const streamBuckets: Record<string, { name: string; amount: number; count: number; color: string }> = {
      deposit: { name: 'Initial Deposits', amount: 0, count: 0, color: '#3b82f6' },
      stage: { name: 'Progress Milestones', amount: 0, count: 0, color: '#8b5cf6' },
      final: { name: 'Final Balances', amount: 0, count: 0, color: '#10b981' },
      plan_installment: { name: 'Payment Plans', amount: 0, count: 0, color: '#f59e0b' },
      quick_stop: { name: 'Quick Stops', amount: 0, count: 0, color: '#ec4899' },
      other: { name: 'Standard Invoices & Other', amount: 0, count: 0, color: '#64748b' },
    };

    // Methods
    const methodBuckets: Record<string, { label: string; amount: number; count: number }> = {
      card: { label: 'Credit & Debit Card', amount: 0, count: 0 },
      ach: { label: 'ACH Bank Transfer', amount: 0, count: 0 },
      apple_pay: { label: 'Apple Pay', amount: 0, count: 0 },
      google_pay: { label: 'Google Pay', amount: 0, count: 0 },
      manual: { label: 'Manual (Cash / Check)', amount: 0, count: 0 },
    };

    const clientTotalsMap = new Map<string, { totalPaid: number; jobIds: Set<string> }>();

    const thirtyDaysAgoMs = Date.now() - 30 * 86400000;

    for (const p of payments) {
      const gross = Number(p.amount) || 0;
      const fee = Number(p.platform_fee) || 0;
      const refunded = Number(p.refunded_amount) || 0;
      const net = Math.max(0, gross - fee - refunded);
      const paidDate = p.paid_at ? new Date(p.paid_at) : new Date(p.requested_at);
      const paidMs = paidDate.getTime();

      totalGross += gross;
      totalNet += net;
      totalFees += fee;

      // Estimate ACH savings on payments >= $500: Card fee would be 2.9% + 30c, ACH is $5
      if (p.charge_model === 'ach' || (gross >= 500 && p.charge_model !== 'card')) {
        const estCardFee = gross * 0.029 + 0.30;
        achSavings += Math.max(0, estCardFee - 5.00);
      }

      // Stream categorization
      const kindKey = p.kind in streamBuckets ? p.kind : 'other';
      streamBuckets[kindKey].amount += gross;
      streamBuckets[kindKey].count++;

      // Method categorization
      let mKey = 'card';
      if (p.charge_model === 'manual') mKey = 'manual';
      else if (p.charge_model === 'ach') mKey = 'ach';
      else if (p.charge_model === 'apple_pay') mKey = 'apple_pay';
      else if (p.charge_model === 'google_pay') mKey = 'google_pay';
      methodBuckets[mKey].amount += gross;
      methodBuckets[mKey].count++;

      // Daily trends (last 30 days)
      if (paidMs >= thirtyDaysAgoMs) {
        const dayKey = paidDate.toISOString().slice(0, 10);
        const existingDay = dailyMap.get(dayKey) || { gross: 0, net: 0, fees: 0, count: 0 };
        existingDay.gross += gross;
        existingDay.net += net;
        existingDay.fees += fee;
        existingDay.count++;
        dailyMap.set(dayKey, existingDay);
      }

      // Monthly trends (last 12 months)
      const monthKey = paidDate.toISOString().slice(0, 7);
      const existingMonth = monthlyMap.get(monthKey) || { gross: 0, net: 0, fees: 0, count: 0 };
      existingMonth.gross += gross;
      existingMonth.net += net;
      existingMonth.fees += fee;
      existingMonth.count++;
      monthlyMap.set(monthKey, existingMonth);

      // Top clients
      if (p.job_id) {
        const clientName = jobClientMap.get(p.job_id) || 'Direct Customer';
        const clientStat = clientTotalsMap.get(clientName) || { totalPaid: 0, jobIds: new Set<string>() };
        clientStat.totalPaid += gross;
        clientStat.jobIds.add(p.job_id);
        clientTotalsMap.set(clientName, clientStat);
      }
    }

    // Build trendDaily sorted by date
    const trendDaily: RevenueDataPoint[] = [];
    const sortedDays = [...dailyMap.keys()].sort();
    for (const dKey of sortedDays) {
      const val = dailyMap.get(dKey)!;
      const d = new Date(`${dKey}T12:00:00Z`);
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
      trendDaily.push({
        dateKey: dKey,
        label,
        gross: round2(val.gross),
        net: round2(val.net),
        fees: round2(val.fees),
        count: val.count,
      });
    }

    // Build trendMonthly sorted
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
        gross: round2(val.gross),
        net: round2(val.net),
        fees: round2(val.fees),
        count: val.count,
      });
    }

    // Build streams array
    const streams: RevenueStreamBreakdown[] = Object.entries(streamBuckets)
      .filter(([_, b]) => b.amount > 0)
      .map(([key, b]) => ({
        key,
        name: b.name,
        amount: round2(b.amount),
        percentage: totalGross > 0 ? round2((b.amount / totalGross) * 100) : 0,
        count: b.count,
        color: b.color,
      }))
      .sort((a, b) => b.amount - a.amount);

    // Build methods array
    const methods: PaymentMethodDistribution[] = Object.entries(methodBuckets)
      .filter(([_, m]) => m.amount > 0)
      .map(([method, m]) => ({
        method,
        label: m.label,
        amount: round2(m.amount),
        percentage: totalGross > 0 ? round2((m.amount / totalGross) * 100) : 0,
        count: m.count,
        feePercent: method === 'ach' ? 0.5 : method === 'manual' ? 0 : 2.9,
      }))
      .sort((a, b) => b.amount - a.amount);

    // Build top clients array
    const topClients: TopClientRevenue[] = [...clientTotalsMap.entries()]
      .map(([clientName, stat]) => ({
        clientName,
        totalPaid: round2(stat.totalPaid),
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
      totalGross: round2(totalGross),
      totalNet: round2(totalNet),
      totalFees: round2(totalFees),
      achSavings: round2(achSavings),
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
