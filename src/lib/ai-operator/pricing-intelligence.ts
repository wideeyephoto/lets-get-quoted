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
  };
}
