import { matchTradeFamilies, type TradeFamily } from '@/lib/property-intel/profile';

export type CampaignPacingAction =
  | 'scale'
  | 'maintain'
  | 'throttle_for_capacity'
  | 'pause_high_cpl';

export type CampaignAiGoals = {
  tradeFamily: TradeFamily;
  targetCostPerLead: number;
  maxAcceptableCpl: number;
  targetMonthlyBookedJobs: number;
  targetMonthlyAdSpend: number;
  minimumTicketFilter: number;
  targetRoas: number;
  pacingAction: CampaignPacingAction;
  capacityUtilizationPct: number;
  confidenceScore: number;
  recommendationNote: string;
};

export type CampaignPerformanceEvaluation = {
  actualCpl: number;
  leadVolumePacingPct: number;
  roasEstimate: number;
  action: CampaignPacingAction;
  status: 'optimal' | 'warning' | 'alert';
  headline: string;
  advice: string;
};

type TradeCampaignBenchmark = {
  baseCpl: number;
  maxCpl: number;
  minTicket: number;
  targetRoas: number;
  avgJobsPerCrewMonth: number;
};

const TRADE_CAMPAIGN_BENCHMARKS: Record<TradeFamily, TradeCampaignBenchmark> = {
  roofing: { baseCpl: 95, maxCpl: 150, minTicket: 2500, targetRoas: 6.5, avgJobsPerCrewMonth: 12 },
  siding: { baseCpl: 85, maxCpl: 135, minTicket: 3000, targetRoas: 6.0, avgJobsPerCrewMonth: 10 },
  solar: { baseCpl: 160, maxCpl: 240, minTicket: 10000, targetRoas: 5.0, avgJobsPerCrewMonth: 8 },
  plumbing: { baseCpl: 45, maxCpl: 80, minTicket: 350, targetRoas: 5.5, avgJobsPerCrewMonth: 35 },
  hvac: { baseCpl: 65, maxCpl: 110, minTicket: 800, targetRoas: 5.5, avgJobsPerCrewMonth: 25 },
  electrical: { baseCpl: 50, maxCpl: 90, minTicket: 400, targetRoas: 5.0, avgJobsPerCrewMonth: 30 },
  finishing: { baseCpl: 55, maxCpl: 95, minTicket: 1200, targetRoas: 4.5, avgJobsPerCrewMonth: 16 },
  flooring: { baseCpl: 60, maxCpl: 100, minTicket: 1500, targetRoas: 5.0, avgJobsPerCrewMonth: 14 },
  insulation: { baseCpl: 70, maxCpl: 115, minTicket: 1800, targetRoas: 5.0, avgJobsPerCrewMonth: 18 },
  window_installation: { baseCpl: 75, maxCpl: 125, minTicket: 2000, targetRoas: 5.5, avgJobsPerCrewMonth: 12 },
  outdoor_maintenance: { baseCpl: 30, maxCpl: 55, minTicket: 200, targetRoas: 4.0, avgJobsPerCrewMonth: 50 },
  landscaping: { baseCpl: 40, maxCpl: 70, minTicket: 500, targetRoas: 4.5, avgJobsPerCrewMonth: 28 },
  general: { baseCpl: 65, maxCpl: 110, minTicket: 1000, targetRoas: 5.0, avgJobsPerCrewMonth: 15 },
  unknown: { baseCpl: 50, maxCpl: 90, minTicket: 500, targetRoas: 5.0, avgJobsPerCrewMonth: 20 },
};

/**
 * Recommends intelligent campaign targets grounded in trade benchmarks and real-time crew capacity.
 */
export function recommendCampaignGoals(params: {
  trade?: string | null;
  activeCrews?: number;
  availableDaysNextFortnight?: number; // 0 to 14 days
  monthlyBudgetCap?: number | null;
  customFocusNiche?: string | null;
}): CampaignAiGoals {
  const {
    trade,
    activeCrews = 1,
    availableDaysNextFortnight = 6,
    monthlyBudgetCap,
    customFocusNiche,
  } = params;

  const matchedFamilies = matchTradeFamilies(trade);
  const tradeFamily = matchedFamilies[0] || 'unknown';
  const benchmark = TRADE_CAMPAIGN_BENCHMARKS[tradeFamily] || TRADE_CAMPAIGN_BENCHMARKS.unknown;

  // Capacity calculation (14 days total, availableDays determines schedule fullness)
  const bookedDays = Math.max(0, 14 - availableDaysNextFortnight);
  const capacityUtilizationPct = Math.round((bookedDays / 14) * 100);

  // Target Booked Jobs (calibrated to team size)
  const crewCount = Math.max(1, activeCrews);
  let targetMonthlyBookedJobs = Math.round(benchmark.avgJobsPerCrewMonth * crewCount);

  // Determine pacing action based on schedule load
  let pacingAction: CampaignPacingAction = 'maintain';
  let note = `Targeting ${benchmark.baseCpl} CPL for ${tradeFamily}. Schedule is stably paced at ${capacityUtilizationPct}% capacity.`;

  if (capacityUtilizationPct >= 85) {
    pacingAction = 'throttle_for_capacity';
    targetMonthlyBookedJobs = Math.round(targetMonthlyBookedJobs * 0.6);
    note = `Schedule is nearly full (${capacityUtilizationPct}% utilized). AI recommends throttling ad bids to maintain quality without overbooking crews.`;
  } else if (capacityUtilizationPct < 45) {
    pacingAction = 'scale';
    targetMonthlyBookedJobs = Math.round(targetMonthlyBookedJobs * 1.3);
    note = `Open schedule capacity detected (${availableDaysNextFortnight} free days in next 2 weeks). Recommend scaling lead acquisition.`;
  }

  // Estimated close rate ~30% from qualified leads to booked jobs
  const targetLeads = Math.round(targetMonthlyBookedJobs / 0.3);
  const suggestedMonthlySpend = targetLeads * benchmark.baseCpl;
  const targetMonthlyAdSpend = monthlyBudgetCap && monthlyBudgetCap > 0 ? monthlyBudgetCap : suggestedMonthlySpend;

  // Adjust for custom niche (e.g., Generac Generators, Emergency Burst Pipes)
  let targetCpl = benchmark.baseCpl;
  let minTicket = benchmark.minTicket;
  if (customFocusNiche) {
    const lowerNiche = customFocusNiche.toLowerCase();
    if (lowerNiche.includes('generator') || lowerNiche.includes('solar') || lowerNiche.includes('remodel')) {
      targetCpl = Math.round(targetCpl * 1.25);
      minTicket = Math.max(minTicket, 3500);
    } else if (lowerNiche.includes('drain') || lowerNiche.includes('gutter') || lowerNiche.includes('tune-up')) {
      targetCpl = Math.round(targetCpl * 0.85);
      minTicket = Math.min(minTicket, 199);
    }
  }

  return {
    tradeFamily,
    targetCostPerLead: targetCpl,
    maxAcceptableCpl: benchmark.maxCpl,
    targetMonthlyBookedJobs,
    targetMonthlyAdSpend,
    minimumTicketFilter: minTicket,
    targetRoas: benchmark.targetRoas,
    pacingAction,
    capacityUtilizationPct,
    confidenceScore: 85,
    recommendationNote: note,
  };
}

/**
 * Live evaluation of ad campaign performance against AI goals.
 */
export function evaluateCampaignPacing(params: {
  actualSpend: number;
  leadsGenerated: number;
  bookedJobRevenue: number;
  goals: CampaignAiGoals;
}): CampaignPerformanceEvaluation {
  const { actualSpend, leadsGenerated, bookedJobRevenue, goals } = params;

  const actualCpl = leadsGenerated > 0 ? Math.round(actualSpend / leadsGenerated) : actualSpend;
  const roasEstimate = actualSpend > 0 ? Number((bookedJobRevenue / actualSpend).toFixed(2)) : 0;
  const leadVolumePacingPct = goals.targetMonthlyBookedJobs > 0
    ? Math.round(((leadsGenerated * 0.3) / goals.targetMonthlyBookedJobs) * 100)
    : 100;

  if (actualSpend > goals.targetCostPerLead * 3 && leadsGenerated === 0) {
    return {
      actualCpl,
      leadVolumePacingPct: 0,
      roasEstimate,
      action: 'pause_high_cpl',
      status: 'alert',
      headline: 'High spend with zero lead conversions',
      advice: 'Ad spend has passed 3x target CPL without conversions. Review landing page and keyword match filters.',
    };
  }

  if (actualCpl > goals.maxAcceptableCpl) {
    return {
      actualCpl,
      leadVolumePacingPct,
      roasEstimate,
      action: 'throttle_for_capacity',
      status: 'warning',
      headline: `CPL ($${actualCpl}) exceeds maximum threshold ($${goals.maxAcceptableCpl})`,
      advice: 'Narrow geographic radius or add negative search keywords to lower acquisition costs.',
    };
  }

  return {
    actualCpl,
    leadVolumePacingPct,
    roasEstimate,
    action: goals.pacingAction,
    status: 'optimal',
    headline: `Healthy lead pacing at $${actualCpl}/lead`,
    advice: `Campaign is tracking within the $${goals.targetCostPerLead} target with an estimated ${roasEstimate}x ROAS.`,
  };
}
