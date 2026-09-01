import { matchTradeFamilies, type TradeFamily } from '@/lib/property-intel/profile';
import { parseQuoteItems } from '@/lib/jobs';

export type HistoricalPricingJob = {
  id?: string;
  scope: string | null;
  quotedAmount: number;
  quoteItems?: unknown;
  status?: string | null;
  address?: string | null;
  zip?: string | null;
  createdAt?: string | null;
  lines?: Array<{ label: string; amount: number }>;
};

export type ZipPricingIntelligence = {
  targetZip: string | null;
  sampleCount: number;
  wonCount: number;
  closeRatePct: number | null;
  avgQuotedAmount: number | null;
  avgWonAmount: number | null;
  accountAvgAmount: number | null;
  priceDeltaPctVsAccountAvg: number | null;
  isTargetZipMatch: boolean;
  summary: string;
};

export type SeasonDemandPosture = 'peak' | 'shoulder' | 'standard' | 'off_peak';

export type SeasonPricingIntelligence = {
  currentSeason: 'spring' | 'summer' | 'fall' | 'winter';
  currentMonthName: string;
  currentMonthIndex: number;
  tradeFamily: TradeFamily;
  demandPosture: SeasonDemandPosture;
  seasonalMultiplier: number;
  guidance: string;
  historicalSeasonalJobsCount: number;
  historicalSeasonalAvgWonAmount: number | null;
  historicalSeasonalCloseRatePct: number | null;
};

export type PriceBandCloseRate = {
  label: string;
  min: number;
  max: number;
  total: number;
  won: number;
  closeRatePct: number;
};

export type CloseRatePricingIntelligence = {
  totalQuotedCount: number;
  wonCount: number;
  overallCloseRatePct: number;
  avgWonTicket: number;
  avgLostTicket: number;
  sweetSpotRange: {
    label: string;
    min: number;
    max: number;
    closeRatePct: number;
    wonCount: number;
  } | null;
  priceBands: PriceBandCloseRate[];
  recommendedPricingPosture: 'premium_margins' | 'balanced_growth' | 'competitive_volume';
  pricingTip: string;
};

export type AccountPricingIntelligence = {
  zipIntel: ZipPricingIntelligence | null;
  seasonIntel: SeasonPricingIntelligence;
  closeRateIntel: CloseRatePricingIntelligence;
  summaryLines: string[];
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

/**
 * Extract 5-digit US ZIP code from address or string.
 */
export function extractZipFromAddress(address: string | null | undefined): string | null {
  if (!address || typeof address !== 'string') return null;
  const match = address.match(/\b(\d{5})(?:-\d{4})?\b/);
  return match ? match[1] : null;
}

/**
 * Identify if a historical job was closed / won.
 */
export function isJobWon(status: string | null | undefined): boolean {
  if (!status) return false;
  const s = status.toLowerCase().trim();
  return s === 'complete' || s === 'in_progress' || s === 'completed' || s === 'scheduled';
}

/**
 * Identify if a historical job was lost or declined.
 */
export function isJobLost(status: string | null | undefined): boolean {
  if (!status) return false;
  const s = status.toLowerCase().trim();
  return s === 'archived' || s === 'declined' || s === 'lost' || s === 'cancelled';
}

/**
 * Determine seasonal quarter from 0-indexed month.
 */
export function getSeasonForMonth(monthIndex: number): 'spring' | 'summer' | 'fall' | 'winter' {
  if (monthIndex >= 2 && monthIndex <= 4) return 'spring';
  if (monthIndex >= 5 && monthIndex <= 7) return 'summer';
  if (monthIndex >= 8 && monthIndex <= 10) return 'fall';
  return 'winter';
}

/**
 * Resolve trade-specific demand posture and pricing multiplier based on season.
 */
export function resolveTradeDemandPosture(
  tradeFamily: TradeFamily,
  monthIndex: number,
): { demandPosture: SeasonDemandPosture; seasonalMultiplier: number; guidance: string } {
  // Exterior & Weather-Dependent trades (Roofing, Siding, Landscaping, Outdoor)
  if (['roofing', 'siding', 'landscaping', 'outdoor_maintenance'].includes(tradeFamily)) {
    if (monthIndex >= 3 && monthIndex <= 7) {
      return {
        demandPosture: 'peak',
        seasonalMultiplier: 1.2,
        guidance: 'Peak season demand: schedule is in high demand; hold firm on standard margins and price book rates without discounting.',
      };
    }
    if (monthIndex >= 8 && monthIndex <= 10) {
      return {
        demandPosture: 'shoulder',
        seasonalMultiplier: 1.0,
        guidance: 'Fall shoulder season: balance full-rate critical repairs with competitive packages to keep crews booked into late season.',
      };
    }
    return {
      demandPosture: 'off_peak',
      seasonalMultiplier: 0.85,
      guidance: 'Winter off-peak season: structure tight, high-conversion base quotes with optional winterization add-ons.',
    };
  }

  // HVAC (Dual peak: Summer extreme cooling + Winter heating freeze)
  if (tradeFamily === 'hvac') {
    if (monthIndex >= 5 && monthIndex <= 7) {
      return {
        demandPosture: 'peak',
        seasonalMultiplier: 1.25,
        guidance: 'Summer cooling surge: maximum emergency and replacement demand; quote full value with premium response times.',
      };
    }
    if (monthIndex === 11 || monthIndex === 0 || monthIndex === 1) {
      return {
        demandPosture: 'peak',
        seasonalMultiplier: 1.2,
        guidance: 'Winter heating peak: furnace and heat pump demand high; prioritize essential heat restoration base items.',
      };
    }
    return {
      demandPosture: 'shoulder',
      seasonalMultiplier: 0.95,
      guidance: 'Spring/Fall shoulder season: optimize quote conversion with maintenance tune-ups and multi-tier replacement options.',
    };
  }

  // Solar & Window installation (Spring/Summer installation peak)
  if (['solar', 'window_installation'].includes(tradeFamily)) {
    if (monthIndex >= 3 && monthIndex <= 8) {
      return {
        demandPosture: 'peak',
        seasonalMultiplier: 1.15,
        guidance: 'High solar/window installation window: prioritize turn-key system pricing and complete material packages.',
      };
    }
    return {
      demandPosture: 'shoulder',
      seasonalMultiplier: 0.95,
      guidance: 'Off-peak solar/window season: emphasize energy payback calculations and flexible base tiers.',
    };
  }

  // Interior trades (Flooring, Painting/Finishing) - steady with slight winter indoor emphasis
  if (['flooring', 'finishing'].includes(tradeFamily)) {
    if (monthIndex >= 9 || monthIndex <= 1) {
      return {
        demandPosture: 'standard',
        seasonalMultiplier: 1.05,
        guidance: 'Interior renovation peak window: steady indoor project demand; price standard room takeoffs confidently.',
      };
    }
    return {
      demandPosture: 'standard',
      seasonalMultiplier: 1.0,
      guidance: 'Steady interior demand: snap to verified room takeoffs and standard price-book square footage rates.',
    };
  }

  // Plumbing, Electrical, and General - Year-round resilience
  return {
    demandPosture: 'standard',
    seasonalMultiplier: 1.0,
    guidance: 'Year-round core service demand: rely on proven account historical rates and itemized component breakdowns.',
  };
}

/**
 * Adaptive ZIP pricing intelligence calculator.
 */
export function computeZipPricingIntelligence(
  jobs: HistoricalPricingJob[],
  targetAddress?: string | null,
): ZipPricingIntelligence | null {
  const targetZip = extractZipFromAddress(targetAddress);
  if (!targetZip) return null;

  const validJobs = jobs.filter((j) => Number.isFinite(j.quotedAmount) && j.quotedAmount > 0);
  if (validJobs.length === 0) {
    return {
      targetZip,
      sampleCount: 0,
      wonCount: 0,
      closeRatePct: null,
      avgQuotedAmount: null,
      avgWonAmount: null,
      accountAvgAmount: null,
      priceDeltaPctVsAccountAvg: null,
      isTargetZipMatch: false,
      summary: `Target ZIP: ${targetZip} (no historical jobs recorded in this ZIP yet).`,
    };
  }

  const accountAvg = Math.round(validJobs.reduce((sum, j) => sum + j.quotedAmount, 0) / validJobs.length);

  const zipJobs = validJobs.filter((j) => {
    const jobZip = j.zip || extractZipFromAddress(j.address);
    return jobZip === targetZip;
  });

  if (zipJobs.length === 0) {
    return {
      targetZip,
      sampleCount: 0,
      wonCount: 0,
      closeRatePct: null,
      avgQuotedAmount: null,
      avgWonAmount: null,
      accountAvgAmount: accountAvg,
      priceDeltaPctVsAccountAvg: null,
      isTargetZipMatch: false,
      summary: `Target ZIP: ${targetZip} (new market area; baseline account avg is $${accountAvg.toLocaleString()}).`,
    };
  }

  const zipTotal = zipJobs.reduce((sum, j) => sum + j.quotedAmount, 0);
  const avgQuoted = Math.round(zipTotal / zipJobs.length);

  const wonJobs = zipJobs.filter((j) => isJobWon(j.status));
  const wonCount = wonJobs.length;
  const closeRatePct = Math.round((wonCount / zipJobs.length) * 100);

  const avgWon = wonCount > 0
    ? Math.round(wonJobs.reduce((sum, j) => sum + j.quotedAmount, 0) / wonCount)
    : null;

  const deltaPct = accountAvg > 0
    ? Math.round(((avgQuoted - accountAvg) / accountAvg) * 100)
    : 0;

  const deltaSign = deltaPct > 0 ? `+${deltaPct}%` : `${deltaPct}%`;
  const summary = `ZIP ${targetZip}: ${zipJobs.length} past quote${zipJobs.length === 1 ? '' : 's'} (${closeRatePct}% win rate, avg won $${(avgWon ?? avgQuoted).toLocaleString()}, ${deltaSign} vs account avg).`;

  return {
    targetZip,
    sampleCount: zipJobs.length,
    wonCount,
    closeRatePct,
    avgQuotedAmount: avgQuoted,
    avgWonAmount: avgWon,
    accountAvgAmount: accountAvg,
    priceDeltaPctVsAccountAvg: deltaPct,
    isTargetZipMatch: true,
    summary,
  };
}

/**
 * Adaptive Seasonality pricing intelligence calculator.
 */
export function computeSeasonPricingIntelligence(
  jobs: HistoricalPricingJob[],
  trade?: string | null,
  referenceDate: Date = new Date(),
): SeasonPricingIntelligence {
  const currentMonthIndex = referenceDate.getMonth();
  const currentMonthName = MONTH_NAMES[currentMonthIndex];
  const currentSeason = getSeasonForMonth(currentMonthIndex);

  const matchedFamilies = matchTradeFamilies(trade);
  const tradeFamily = matchedFamilies[0] || 'general';

  const { demandPosture, seasonalMultiplier, guidance } = resolveTradeDemandPosture(tradeFamily, currentMonthIndex);

  // Analyze historical jobs created in this same season
  const seasonalJobs = jobs.filter((j) => {
    if (!j.createdAt || !Number.isFinite(j.quotedAmount) || j.quotedAmount <= 0) return false;
    const date = new Date(j.createdAt);
    if (Number.isNaN(date.getTime())) return false;
    return getSeasonForMonth(date.getMonth()) === currentSeason;
  });

  let historicalSeasonalAvgWonAmount: number | null = null;
  let historicalSeasonalCloseRatePct: number | null = null;

  if (seasonalJobs.length > 0) {
    const wonSeasonal = seasonalJobs.filter((j) => isJobWon(j.status));
    historicalSeasonalCloseRatePct = Math.round((wonSeasonal.length / seasonalJobs.length) * 100);
    if (wonSeasonal.length > 0) {
      historicalSeasonalAvgWonAmount = Math.round(
        wonSeasonal.reduce((sum, j) => sum + j.quotedAmount, 0) / wonSeasonal.length,
      );
    }
  }

  return {
    currentSeason,
    currentMonthName,
    currentMonthIndex,
    tradeFamily,
    demandPosture,
    seasonalMultiplier,
    guidance,
    historicalSeasonalJobsCount: seasonalJobs.length,
    historicalSeasonalAvgWonAmount,
    historicalSeasonalCloseRatePct,
  };
}

/**
 * Adaptive Close-Rate & Win-Loss learning engine calculator.
 */
export function computeCloseRatePricingIntelligence(
  jobs: HistoricalPricingJob[],
): CloseRatePricingIntelligence {
  const validJobs = jobs.filter((j) => Number.isFinite(j.quotedAmount) && j.quotedAmount > 0);

  if (validJobs.length === 0) {
    return {
      totalQuotedCount: 0,
      wonCount: 0,
      overallCloseRatePct: 0,
      avgWonTicket: 0,
      avgLostTicket: 0,
      sweetSpotRange: null,
      priceBands: [],
      recommendedPricingPosture: 'balanced_growth',
      pricingTip: 'No quote history recorded yet. Start with standard price book items to build your close-rate profile.',
    };
  }

  const wonJobs = validJobs.filter((j) => isJobWon(j.status));
  const lostJobs = validJobs.filter((j) => isJobLost(j.status));

  const totalQuotedCount = validJobs.length;
  const wonCount = wonJobs.length;
  const overallCloseRatePct = Math.round((wonCount / totalQuotedCount) * 100);

  const avgWonTicket = wonJobs.length > 0
    ? Math.round(wonJobs.reduce((sum, j) => sum + j.quotedAmount, 0) / wonJobs.length)
    : 0;

  const avgLostTicket = lostJobs.length > 0
    ? Math.round(lostJobs.reduce((sum, j) => sum + j.quotedAmount, 0) / lostJobs.length)
    : 0;

  // Segment jobs into dynamic pricing bands
  const BANDS: Array<{ label: string; min: number; max: number }> = [
    { label: 'Under $500', min: 0, max: 500 },
    { label: '$500 – $1,500', min: 500, max: 1500 },
    { label: '$1,500 – $3,500', min: 1500, max: 3500 },
    { label: '$3,500 – $7,500', min: 3500, max: 7500 },
    { label: '$7,500 – $15,000', min: 7500, max: 15000 },
    { label: '$15,000+', min: 15000, max: Number.POSITIVE_INFINITY },
  ];

  const priceBands: PriceBandCloseRate[] = BANDS.map((band) => {
    const inBand = validJobs.filter((j) => j.quotedAmount >= band.min && j.quotedAmount < band.max);
    const bandWon = inBand.filter((j) => isJobWon(j.status)).length;
    const closeRatePct = inBand.length > 0 ? Math.round((bandWon / inBand.length) * 100) : 0;
    return {
      label: band.label,
      min: band.min,
      max: band.max,
      total: inBand.length,
      won: bandWon,
      closeRatePct,
    };
  }).filter((b) => b.total > 0);

  // Identify "Sweet Spot" price band: band with highest win rate having >= 2 quotes, or highest won count
  const viableBands = priceBands.filter((b) => b.total >= 2 && b.won > 0);
  let sweetSpotRange: CloseRatePricingIntelligence['sweetSpotRange'] = null;

  if (viableBands.length > 0) {
    const bestBand = [...viableBands].sort((a, b) => {
      if (b.closeRatePct !== a.closeRatePct) return b.closeRatePct - a.closeRatePct;
      return b.won - a.won;
    })[0];

    sweetSpotRange = {
      label: bestBand.label,
      min: bestBand.min,
      max: bestBand.max,
      closeRatePct: bestBand.closeRatePct,
      wonCount: bestBand.won,
    };
  } else if (priceBands.length > 0 && wonJobs.length > 0) {
    const bestBand = [...priceBands].sort((a, b) => b.won - a.won)[0];
    if (bestBand.won > 0) {
      sweetSpotRange = {
        label: bestBand.label,
        min: bestBand.min,
        max: bestBand.max,
        closeRatePct: bestBand.closeRatePct,
        wonCount: bestBand.won,
      };
    }
  }

  // Determine recommended pricing posture
  let recommendedPricingPosture: CloseRatePricingIntelligence['recommendedPricingPosture'] = 'balanced_growth';
  let pricingTip = '';

  if (overallCloseRatePct >= 65) {
    recommendedPricingPosture = 'premium_margins';
    pricingTip = `Strong win rate (${overallCloseRatePct}%). You have pricing power—quote full price-book rates and include high-value add-ons.`;
  } else if (overallCloseRatePct >= 40 || totalQuotedCount < 4) {
    recommendedPricingPosture = 'balanced_growth';
    pricingTip = `Balanced win rate (${overallCloseRatePct}%). Keep essential base lines aligned with proven won averages ($${(avgWonTicket || 1500).toLocaleString()}) and place upgrades in optional add-on lines.`;
  } else {
    recommendedPricingPosture = 'competitive_volume';
    pricingTip = `Win rate is ${overallCloseRatePct}%. Anchor base lines competitively around your sweet spot (${sweetSpotRange?.label ?? 'standard rates'}) to boost conversion.`;
  }

  return {
    totalQuotedCount,
    wonCount,
    overallCloseRatePct,
    avgWonTicket,
    avgLostTicket,
    sweetSpotRange,
    priceBands,
    recommendedPricingPosture,
    pricingTip,
  };
}

/**
 * Master synthesis function for Account-Specific Pricing Intelligence.
 */
export function computeAccountPricingIntelligence(params: {
  jobs: HistoricalPricingJob[];
  targetAddress?: string | null;
  trade?: string | null;
  referenceDate?: Date;
}): AccountPricingIntelligence {
  const { jobs, targetAddress, trade, referenceDate = new Date() } = params;

  const zipIntel = computeZipPricingIntelligence(jobs, targetAddress);
  const seasonIntel = computeSeasonPricingIntelligence(jobs, trade, referenceDate);
  const closeRateIntel = computeCloseRatePricingIntelligence(jobs);

  const summaryLines: string[] = ['ACCOUNT-SPECIFIC PRICING INTELLIGENCE & ADAPTIVE LEARNING:'];

  // Close rate insights
  if (closeRateIntel.totalQuotedCount > 0) {
    summaryLines.push(
      `- Close-Rate Intelligence: ${closeRateIntel.overallCloseRatePct}% win rate across ${closeRateIntel.totalQuotedCount} past quote${closeRateIntel.totalQuotedCount === 1 ? '' : 's'}` +
      (closeRateIntel.avgWonTicket > 0 ? ` (Avg Won: $${closeRateIntel.avgWonTicket.toLocaleString()}${closeRateIntel.avgLostTicket > 0 ? ` vs Avg Lost: $${closeRateIntel.avgLostTicket.toLocaleString()}` : ''})` : '') +
      '.'
    );
    if (closeRateIntel.sweetSpotRange) {
      summaryLines.push(
        `- Sweet-Spot Price Range: ${closeRateIntel.sweetSpotRange.label} yields your highest close rate (${closeRateIntel.sweetSpotRange.closeRatePct}% win rate, ${closeRateIntel.sweetSpotRange.wonCount} won).`
      );
    }
    summaryLines.push(`- Pricing Posture: ${closeRateIntel.pricingTip}`);
  }

  // Season insights
  const seasonLabel = seasonIntel.currentSeason.charAt(0).toUpperCase() + seasonIntel.currentSeason.slice(1);
  const demandLabel = seasonIntel.demandPosture.toUpperCase();
  summaryLines.push(
    `- Seasonal Posture (${seasonLabel} / ${seasonIntel.currentMonthName} — ${demandLabel} demand for ${seasonIntel.tradeFamily}): ${seasonIntel.guidance}`
  );
  if (seasonIntel.historicalSeasonalJobsCount > 0 && seasonIntel.historicalSeasonalCloseRatePct != null) {
    summaryLines.push(
      `- Historical ${seasonLabel} Performance: ${seasonIntel.historicalSeasonalJobsCount} past job${seasonIntel.historicalSeasonalJobsCount === 1 ? '' : 's'} (${seasonIntel.historicalSeasonalCloseRatePct}% win rate${seasonIntel.historicalSeasonalAvgWonAmount ? `, avg won $${seasonIntel.historicalSeasonalAvgWonAmount.toLocaleString()}` : ''}).`
    );
  }

  // ZIP insights
  if (zipIntel && zipIntel.targetZip) {
    if (zipIntel.isTargetZipMatch) {
      summaryLines.push(
        `- Localized ZIP Intelligence (${zipIntel.summary}) — prioritize comparable jobs from this area.`
      );
    } else {
      summaryLines.push(`- Target Geographic Area: ${zipIntel.summary}`);
    }
  }

  return {
    zipIntel,
    seasonIntel,
    closeRateIntel,
    summaryLines,
  };
}

/**
 * Format pricing intelligence block for model prompt injection.
 */
export function formatPricingIntelligenceForPrompt(intel?: AccountPricingIntelligence | null): string {
  if (!intel || intel.summaryLines.length <= 1) return '';
  return intel.summaryLines.join('\n');
}
