import { matchTradeFamilies, type TradeFamily } from '@/lib/property-intel/profile';
import type { PropertyIntelligenceSummary } from '@/lib/property-intel';

export type JobMilestoneGoal = {
  name: string;
  targetCompletionPct: number;
  targetHourOffset: number;
  note: string;
};

export type JobProfitabilityGoals = {
  tradeFamily: TradeFamily;
  targetMarginPct: number;
  minAcceptableMarginPct: number;
  targetLaborHours: number;
  recommendedCrewSize: number;
  materialCostCap: number | null;
  contingencyBufferPct: number;
  targetProfitAmount: number;
  estimatedRevenue: number;
  confidenceScore: number; // 0 - 100
  reasoning: string;
  milestones: JobMilestoneGoal[];
  pacingAlertFloorMarginPct: number;
};

export type JobPacingEvaluation = {
  isLaborPacingHealthy: boolean;
  isMarginPacingHealthy: boolean;
  consumedLaborHoursPct: number;
  jobProgressPct: number;
  projectedFinalMarginPct: number;
  alertMessage: string | null;
  severity: 'healthy' | 'warning' | 'critical';
};

/**
 * Standard industry & platform target gross margin benchmarks by trade family.
 */
const TRADE_TARGET_MARGINS: Record<TradeFamily, { targetPct: number; minFloorPct: number }> = {
  roofing: { targetPct: 38, minFloorPct: 28 },
  siding: { targetPct: 36, minFloorPct: 26 },
  solar: { targetPct: 32, minFloorPct: 24 },
  plumbing: { targetPct: 52, minFloorPct: 38 },
  hvac: { targetPct: 45, minFloorPct: 32 },
  electrical: { targetPct: 48, minFloorPct: 35 },
  finishing: { targetPct: 46, minFloorPct: 34 },
  flooring: { targetPct: 38, minFloorPct: 28 },
  insulation: { targetPct: 44, minFloorPct: 30 },
  window_installation: { targetPct: 38, minFloorPct: 28 },
  outdoor_maintenance: { targetPct: 55, minFloorPct: 40 },
  landscaping: { targetPct: 45, minFloorPct: 32 },
  general: { targetPct: 35, minFloorPct: 25 },
  unknown: { targetPct: 40, minFloorPct: 30 },
};

/**
 * Derives comprehensive AI profitability and execution targets for a job.
 */
export function recommendJobProfitabilityGoals(params: {
  trade?: string | null;
  scope?: string | null;
  estimatedRevenue?: number | null;
  estimatedHours?: number | null;
  historicalMarginPct?: number | null;
  propertyIntel?: PropertyIntelligenceSummary | null;
  yearBuilt?: number | null;
}): JobProfitabilityGoals {
  const {
    trade,
    scope = '',
    estimatedRevenue = 0,
    estimatedHours,
    historicalMarginPct,
    propertyIntel,
    yearBuilt: directYearBuilt,
  } = params;

  const matchedFamilies = matchTradeFamilies(trade);
  const tradeFamily = matchedFamilies[0] || 'unknown';
  const tradeBenchmark = TRADE_TARGET_MARGINS[tradeFamily] || TRADE_TARGET_MARGINS.unknown;

  // 1. Target Margin Calculation (blend historical performance with trade benchmark)
  let targetMarginPct = tradeBenchmark.targetPct;
  if (historicalMarginPct && Number.isFinite(historicalMarginPct) && historicalMarginPct > 0) {
    // 70% contractor historical habit + 30% trade benchmark
    targetMarginPct = Math.round(historicalMarginPct * 0.7 + tradeBenchmark.targetPct * 0.3);
  }

  // 2. Year Built & Pre-1978 Contingency Buffer
  const effectiveYear = directYearBuilt ?? (propertyIntel?.yearBuilt ? Number(propertyIntel.yearBuilt) : null);
  const isOlderStructure = Boolean(effectiveYear && effectiveYear < 1978);
  const isVeryOldStructure = Boolean(effectiveYear && effectiveYear < 1950);

  let contingencyBufferPct = 5;
  if (isVeryOldStructure) {
    contingencyBufferPct = 12;
  } else if (isOlderStructure) {
    contingencyBufferPct = 8;
  }

  // Scope complexity indicators
  const lowerScope = (scope || '').toLowerCase();
  const isEmergency = lowerScope.includes('emergency') || lowerScope.includes('burst') || lowerScope.includes('leak');
  const isCompleteRemodel = lowerScope.includes('full') || lowerScope.includes('remodel') || lowerScope.includes('replacement');

  if (isEmergency) {
    targetMarginPct += 5; // Premium emergency service margin
  }

  // 3. Labor Hours & Crew Sizing Heuristics
  const targetLaborHours = estimatedHours && estimatedHours > 0 ? estimatedHours : 8;
  let recommendedCrewSize = 1;

  if (isCompleteRemodel || targetLaborHours > 24) {
    recommendedCrewSize = 3;
  } else if (targetLaborHours > 12) {
    recommendedCrewSize = 2;
  }

  // 4. Financial Targets
  const rev = Math.max(0, Number(estimatedRevenue) || 0);
  const targetProfitAmount = Math.round(rev * (targetMarginPct / 100));
  const maxTotalCost = Math.max(0, rev - targetProfitAmount);
  
  // Approximate 50/50 split between labor burden and materials if unspecified
  const materialCostCap = rev > 0 ? Math.round(maxTotalCost * 0.55) : null;

  // 5. Milestones
  const milestones: JobMilestoneGoal[] = [
    {
      name: 'Site Prep & Teardown',
      targetCompletionPct: 20,
      targetHourOffset: Math.round(targetLaborHours * 0.2),
      note: 'Protect surroundings, staging materials, and initial demo',
    },
    {
      name: 'Core Rough-in & Installation',
      targetCompletionPct: 70,
      targetHourOffset: Math.round(targetLaborHours * 0.7),
      note: 'Main trade execution and preliminary quality check',
    },
    {
      name: 'Finish & Final Client Walkthrough',
      targetCompletionPct: 100,
      targetHourOffset: targetLaborHours,
      note: 'Detailed clean-up, system testing, and digital sign-off',
    },
  ];

  // 6. Confidence and Grounding Reasoning
  let confidenceScore = 80;
  const reasons: string[] = [];

  reasons.push(`${tradeFamily.toUpperCase()} trade benchmark targets ${tradeBenchmark.targetPct}% margin`);
  if (historicalMarginPct) {
    reasons.push(`weighted with your actual ${historicalMarginPct}% past average`);
    confidenceScore += 10;
  }
  if (isOlderStructure) {
    reasons.push(`Includes ${contingencyBufferPct}% contingency buffer for pre-1978 structure`);
  }
  if (isEmergency) {
    reasons.push('Includes emergency premium service margin');
  }

  return {
    tradeFamily,
    targetMarginPct,
    minAcceptableMarginPct: tradeBenchmark.minFloorPct,
    targetLaborHours,
    recommendedCrewSize,
    materialCostCap,
    contingencyBufferPct,
    targetProfitAmount,
    estimatedRevenue: rev,
    confidenceScore: Math.min(100, confidenceScore),
    reasoning: reasons.join('. ') + '.',
    milestones,
    pacingAlertFloorMarginPct: tradeBenchmark.minFloorPct,
  };
}

/**
 * Real-time job pacing evaluation to alert contractors when labor/cost consumption exceeds progress.
 */
export function evaluateJobPacing(params: {
  loggedLaborHours: number;
  totalCostsSoFar: number;
  quotedRevenue: number;
  targetGoals: Pick<JobProfitabilityGoals, 'targetLaborHours' | 'targetMarginPct' | 'minAcceptableMarginPct'>;
  currentProgressPct: number; // 0 - 100
}): JobPacingEvaluation {
  const { loggedLaborHours, totalCostsSoFar, quotedRevenue, targetGoals, currentProgressPct } = params;

  const targetHours = Math.max(1, targetGoals.targetLaborHours);
  const consumedLaborHoursPct = Math.round((loggedLaborHours / targetHours) * 100);
  const rev = Math.max(0, quotedRevenue);

  // Projected margin calculation
  const currentProfit = rev - totalCostsSoFar;
  const currentMarginPct = rev > 0 ? Math.round((currentProfit / rev) * 100) : 0;

  // Pacing health checks
  const laborDrift = consumedLaborHoursPct - currentProgressPct;
  const isLaborPacingHealthy = laborDrift <= 15; // Within 15% tolerance
  const isMarginPacingHealthy = currentMarginPct >= targetGoals.minAcceptableMarginPct;

  let alertMessage: string | null = null;
  let severity: 'healthy' | 'warning' | 'critical' = 'healthy';

  if (currentMarginPct < targetGoals.minAcceptableMarginPct) {
    severity = 'critical';
    alertMessage = `Gross margin (${currentMarginPct}%) has dipped below the ${targetGoals.minAcceptableMarginPct}% floor.`;
  } else if (!isLaborPacingHealthy && consumedLaborHoursPct >= 75) {
    severity = 'warning';
    alertMessage = `Labor usage is at ${consumedLaborHoursPct}% of budget while job progress is reported at ${currentProgressPct}%.`;
  }

  return {
    isLaborPacingHealthy,
    isMarginPacingHealthy,
    consumedLaborHoursPct,
    jobProgressPct: currentProgressPct,
    projectedFinalMarginPct: currentMarginPct,
    alertMessage,
    severity,
  };
}
