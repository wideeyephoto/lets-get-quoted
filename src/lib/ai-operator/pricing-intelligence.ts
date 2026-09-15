import type { SupabaseClient } from '@supabase/supabase-js';

export interface TradePricingBenchmark {
  trade: string;
  region: string;
  averagePricePerUnit: number;
  unit: string;
  lowRangePerUnit: number;
  highRangePerUnit: number;
  averageQuoteTotalDollars: number;
  materialPercent: number;
  laborPercent: number;
  /** Whether this benchmark is derived from real platform data vs static estimates */
  source: 'platform_data' | 'static_estimate';
  sampleSize?: number;
}

export const REGIONAL_PRICING_BENCHMARKS: Record<string, TradePricingBenchmark> = {
  'roofing_tx': {
    trade: 'Roofing',
    region: 'Texas (Austin / Dallas / Houston)',
    averagePricePerUnit: 425,
    unit: 'per square (100 sq ft)',
    lowRangePerUnit: 350,
    highRangePerUnit: 550,
    averageQuoteTotalDollars: 9800,
    materialPercent: 45,
    laborPercent: 55,
    source: 'static_estimate',
  },
  'painting_tx': {
    trade: 'Painting',
    region: 'Texas (Austin / Dallas / Houston)',
    averagePricePerUnit: 3.5,
    unit: 'per sq ft',
    lowRangePerUnit: 2.5,
    highRangePerUnit: 5.0,
    averageQuoteTotalDollars: 4200,
    materialPercent: 25,
    laborPercent: 75,
    source: 'static_estimate',
  },
  'plumbing_tx': {
    trade: 'Plumbing',
    region: 'Texas (Austin / Dallas / Houston)',
    averagePricePerUnit: 145,
    unit: 'per labor hour',
    lowRangePerUnit: 110,
    highRangePerUnit: 185,
    averageQuoteTotalDollars: 2400,
    materialPercent: 40,
    laborPercent: 60,
    source: 'static_estimate',
  },
};

/**
 * Returns regional trade pricing intelligence to benchmark contractor quotes against market averages
 */
export function getRegionalPricingIntelligence(trade: string, state = 'TX'): TradePricingBenchmark {
  const key = `${trade.toLowerCase()}_${state.toLowerCase()}`;
  return REGIONAL_PRICING_BENCHMARKS[key] || {
    trade,
    region: `${state.toUpperCase()} General Market`,
    averagePricePerUnit: 125,
    unit: 'per hour / unit',
    lowRangePerUnit: 95,
    highRangePerUnit: 165,
    averageQuoteTotalDollars: 3500,
    materialPercent: 35,
    laborPercent: 65,
    source: 'static_estimate',
  };
}

export interface PlatformPricingInsights {
  totalQuotesAnalyzed: number;
  averageQuoteTotalDollars: number;
  medianQuoteTotalDollars: number;
  p10QuoteDollars: number;
  p90QuoteDollars: number;
  byTrade: Array<{
    trade: string;
    quoteCount: number;
    avgTotalDollars: number;
    minTotalDollars: number;
    maxTotalDollars: number;
  }>;
  queryTimestamp: string;
}

/**
 * Aggregates actual quote pricing data from the platform to produce real
 * trade-level benchmarks. Falls back to static estimates when insufficient data exists.
 */
export async function getPlatformPricingInsights(
  supabase: SupabaseClient,
): Promise<PlatformPricingInsights> {
  const insights: PlatformPricingInsights = {
    totalQuotesAnalyzed: 0,
    averageQuoteTotalDollars: 0,
    medianQuoteTotalDollars: 0,
    p10QuoteDollars: 0,
    p90QuoteDollars: 0,
    byTrade: [],
    queryTimestamp: new Date().toISOString(),
  };

  try {
    // Get aggregate quote pricing across all non-test accounts
    const { data: quoteRows } = await supabase
      .from('jobs')
      .select('quoted_amount, account_id, accounts!inner(trade, test_marker)')
      .is('accounts.test_marker', null)
      .not('quoted_amount', 'is', null)
      .gt('quoted_amount', 0)
      .order('created_at', { ascending: false })
      .limit(500);

    if (!quoteRows || quoteRows.length === 0) {
      return insights;
    }

    const amounts = quoteRows
      .map((q: any) => Number(q.quoted_amount))
      .filter((a: number) => a > 0 && a < 1_000_000) // Filter outliers
      .sort((a: number, b: number) => a - b);

    if (amounts.length === 0) return insights;

    insights.totalQuotesAnalyzed = amounts.length;
    insights.averageQuoteTotalDollars = Math.round(amounts.reduce((s: number, a: number) => s + a, 0) / amounts.length);
    insights.medianQuoteTotalDollars = amounts[Math.floor(amounts.length / 2)];
    insights.p10QuoteDollars = amounts[Math.floor(amounts.length * 0.1)];
    insights.p90QuoteDollars = amounts[Math.floor(amounts.length * 0.9)];

    // Aggregate by trade
    const byTrade = new Map<string, number[]>();
    for (const q of quoteRows) {
      const trade = (q as any).accounts?.trade || 'Unknown';
      const amount = Number((q as any).quoted_amount);
      if (amount > 0 && amount < 1_000_000) {
        const existing = byTrade.get(trade) || [];
        existing.push(amount);
        byTrade.set(trade, existing);
      }
    }

    for (const [trade, tradeAmounts] of byTrade.entries()) {
      if (tradeAmounts.length < 2) continue; // Need at least 2 data points
      const sorted = tradeAmounts.sort((a, b) => a - b);
      insights.byTrade.push({
        trade,
        quoteCount: sorted.length,
        avgTotalDollars: Math.round(sorted.reduce((s, a) => s + a, 0) / sorted.length),
        minTotalDollars: sorted[0],
        maxTotalDollars: sorted[sorted.length - 1],
      });
    }

    // Sort by quote count descending
    insights.byTrade.sort((a, b) => b.quoteCount - a.quoteCount);
  } catch {
    // Graceful degradation — return empty insights
  }

  return insights;
}
