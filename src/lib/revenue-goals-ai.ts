import { matchTradeFamilies, type TradeFamily } from '@/lib/property-intel/profile';

export type RevenuePacingStatus = 'ahead' | 'on_track' | 'behind' | 'needs_attention';

export type BusinessRevenueGoals = {
  tradeFamily: TradeFamily;
  suggestedMonthlyRevenue: number;
  currentGrossRevenue: number;
  pacingPct: number;
  projectedMonthEndGross: number;
  pacingStatus: RevenuePacingStatus;
  targetQuoteWinRatePct: number;
  recommendedAverageTicket: number;
  activeCrewCount: number;
  seasonalityMultiplier: number;
  aiGrowthTip: string;
};

const TRADE_REVENUE_BENCHMARKS: Record<
  TradeFamily,
  { avgTicket: number; targetWinRate: number; defaultMonthlyCrewCapacity: number }
> = {
  roofing: { avgTicket: 11500, targetWinRate: 35, defaultMonthlyCrewCapacity: 38000 },
  siding: { avgTicket: 12000, targetWinRate: 32, defaultMonthlyCrewCapacity: 36000 },
  solar: { avgTicket: 22000, targetWinRate: 25, defaultMonthlyCrewCapacity: 45000 },
  plumbing: { avgTicket: 650, targetWinRate: 55, defaultMonthlyCrewCapacity: 28000 },
  hvac: { avgTicket: 2400, targetWinRate: 45, defaultMonthlyCrewCapacity: 34000 },
  electrical: { avgTicket: 950, targetWinRate: 50, defaultMonthlyCrewCapacity: 30000 },
  finishing: { avgTicket: 3200, targetWinRate: 42, defaultMonthlyCrewCapacity: 25000 },
  flooring: { avgTicket: 4500, targetWinRate: 38, defaultMonthlyCrewCapacity: 28000 },
  insulation: { avgTicket: 2800, targetWinRate: 40, defaultMonthlyCrewCapacity: 32000 },
  window_installation: { avgTicket: 5500, targetWinRate: 35, defaultMonthlyCrewCapacity: 30000 },
  outdoor_maintenance: { avgTicket: 400, targetWinRate: 60, defaultMonthlyCrewCapacity: 22000 },
  landscaping: { avgTicket: 1200, targetWinRate: 48, defaultMonthlyCrewCapacity: 26000 },
  general: { avgTicket: 3500, targetWinRate: 40, defaultMonthlyCrewCapacity: 30000 },
  unknown: { avgTicket: 2000, targetWinRate: 45, defaultMonthlyCrewCapacity: 25000 },
};

/**
 * Returns seasonal trade volume multiplier based on month (0 = Jan, 11 = Dec).
 */
export function getTradeSeasonalityMultiplier(tradeFamily: TradeFamily, monthIndex: number): number {
  // Peak summer exterior trades (May - August)
  if (['roofing', 'siding', 'landscaping', 'outdoor_maintenance'].includes(tradeFamily)) {
    if (monthIndex >= 4 && monthIndex <= 8) return 1.3;
    if (monthIndex === 11 || monthIndex === 0 || monthIndex === 1) return 0.75;
    return 1.0;
  }

  // Peak HVAC weather extremes (Summer heat & Winter freeze)
  if (tradeFamily === 'hvac') {
    if (monthIndex === 5 || monthIndex === 6 || monthIndex === 7 || monthIndex === 0 || monthIndex === 1) return 1.25;
    return 0.95;
  }

  // Steady indoor trades
  return 1.0;
}

/**
 * Calculates adaptive monthly revenue goals and real-time pacing diagnostics.
 */
export function recommendBusinessRevenueGoals(params: {
  trade?: string | null;
  activeCrewCount?: number;
  currentGrossRevenue?: number;
  dayOfMonth?: number; // 1 - 31
  daysInMonth?: number; // 28 - 31
  historicalMonthlyAverages?: number[]; // e.g. [$32000, $35000, $38000]
  actualWinRatePct?: number | null;
  currentMonthIndex?: number; // 0 - 11
}): BusinessRevenueGoals {
  const {
    trade,
    activeCrewCount = 1,
    currentGrossRevenue = 0,
    dayOfMonth = 15,
    daysInMonth = 30,
    historicalMonthlyAverages = [],
    actualWinRatePct,
    currentMonthIndex = new Date().getMonth(),
  } = params;

  const matchedFamilies = matchTradeFamilies(trade);
  const tradeFamily = matchedFamilies[0] || 'general';
  const benchmark = TRADE_REVENUE_BENCHMARKS[tradeFamily] || TRADE_REVENUE_BENCHMARKS.general;

  const crews = Math.max(1, activeCrewCount);
  const seasonality = getTradeSeasonalityMultiplier(tradeFamily, currentMonthIndex);

  // Baseline target from crew capacity and seasonality
  const capacityBaseline = Math.round(benchmark.defaultMonthlyCrewCapacity * crews * seasonality);

  // Blend with historical actuals if present
  let suggestedMonthlyRevenue = capacityBaseline;
  if (historicalMonthlyAverages.length > 0) {
    const validAvgs = historicalMonthlyAverages.filter((n) => Number.isFinite(n) && n > 0);
    if (validAvgs.length > 0) {
      const avg = validAvgs.reduce((a, b) => a + b, 0) / validAvgs.length;
      // 60% historical momentum + 40% capacity/seasonality
      suggestedMonthlyRevenue = Math.round(avg * 0.6 + capacityBaseline * 0.4);
    }
  }

  // Pacing calculations
  const safeGoal = Math.max(1, suggestedMonthlyRevenue);
  const pacingPct = Math.min(100, Math.round((currentGrossRevenue / safeGoal) * 100));

  const monthProgressFraction = Math.min(1, Math.max(0.05, dayOfMonth / daysInMonth));
  const projectedMonthEndGross = Math.round(currentGrossRevenue / monthProgressFraction);
  const expectedPacingPctAtThisDay = Math.round(monthProgressFraction * 100);

  let pacingStatus: RevenuePacingStatus = 'on_track';
  if (pacingPct >= expectedPacingPctAtThisDay + 10) {
    pacingStatus = 'ahead';
  } else if (pacingPct <= expectedPacingPctAtThisDay - 15) {
    pacingStatus = 'behind';
  }

  // Diagnostic AI Growth Tips
  let tip = `Pacing is on track to hit $${suggestedMonthlyRevenue.toLocaleString()} this month with ${crews} active crew(s).`;

  if (pacingStatus === 'behind') {
    tip = `Currently tracking behind month-to-date pace ($${currentGrossRevenue.toLocaleString()} vs expected $${Math.round(safeGoal * monthProgressFraction).toLocaleString()}). Consider sending follow-ups on pending quotes.`;
  } else if (pacingStatus === 'ahead') {
    tip = `Pacing ahead of target at ${pacingPct}% with projected $${projectedMonthEndGross.toLocaleString()} month-end. Ideal time to line up next month's material orders early.`;
  }

  if (actualWinRatePct && actualWinRatePct > benchmark.targetWinRate + 20) {
    tip += ` Your win rate (${actualWinRatePct}%) is significantly higher than trade standard (${benchmark.targetWinRate}%). You may have room to increase quote margins by 5-10%.`;
  }

  return {
    tradeFamily,
    suggestedMonthlyRevenue,
    currentGrossRevenue,
    pacingPct,
    projectedMonthEndGross,
    pacingStatus,
    targetQuoteWinRatePct: benchmark.targetWinRate,
    recommendedAverageTicket: benchmark.avgTicket,
    activeCrewCount: crews,
    seasonalityMultiplier: seasonality,
    aiGrowthTip: tip,
  };
}
