export type MaterialQualityTier = 'economy' | 'standard' | 'premium' | 'luxury';

export interface InstantEstimateRequest {
  trade: 'roofing' | 'painting' | 'flooring' | 'siding' | 'concrete' | 'fencing' | 'general';
  squareFootage: number;
  qualityTier: MaterialQualityTier;
  hasRemovalOldMaterial?: boolean;
  isMultiStory?: boolean;
}

export interface InstantEstimateResult {
  trade: string;
  squareFootage: number;
  qualityTier: MaterialQualityTier;
  estimatedPriceMin: number;
  estimatedPriceMax: number;
  estimatedDepositRequired: number;
  averageTimelineDays: string;
  lineItemsSummary: string[];
}

const TRADE_BASE_RATES_PER_SQFT: Record<string, { economy: number; standard: number; premium: number; luxury: number }> = {
  roofing: { economy: 4.5, standard: 6.0, premium: 8.5, luxury: 14.0 },
  painting: { economy: 2.2, standard: 3.5, premium: 5.0, luxury: 8.0 },
  flooring: { economy: 3.0, standard: 5.5, premium: 9.0, luxury: 16.0 },
  siding: { economy: 5.0, standard: 8.0, premium: 12.0, luxury: 18.0 },
  concrete: { economy: 6.0, standard: 9.0, premium: 14.0, luxury: 22.0 },
  fencing: { economy: 22.0, standard: 32.0, premium: 48.0, luxury: 75.0 }, // per linear foot
  general: { economy: 3.5, standard: 5.0, premium: 7.5, luxury: 12.0 },
};

/**
 * Calculates a dynamic, realistic instant estimate range for homeowner web calculators
 */
export function calculateInstantEstimate(req: InstantEstimateRequest): InstantEstimateResult {
  const sqft = Math.max(10, req.squareFootage);
  const tradeKey = req.trade.toLowerCase();
  const rates = TRADE_BASE_RATES_PER_SQFT[tradeKey] || TRADE_BASE_RATES_PER_SQFT.general;
  const baseRate = rates[req.qualityTier] || rates.standard;

  let multiplier = 1.0;
  if (req.hasRemovalOldMaterial) multiplier += 0.2;
  if (req.isMultiStory) multiplier += 0.15;

  const baseTotal = sqft * baseRate * multiplier;
  const estimatedPriceMin = Math.round(baseTotal * 0.9);
  const estimatedPriceMax = Math.round(baseTotal * 1.15);
  const estimatedDepositRequired = Math.round(estimatedPriceMin * 0.25); // 25% standard deposit

  let timeline = '1 - 2 Days';
  if (sqft > 3000 || baseTotal > 15000) {
    timeline = '4 - 7 Days';
  } else if (sqft > 1500 || baseTotal > 7000) {
    timeline = '2 - 4 Days';
  }

  const lineItemsSummary = [
    `${req.qualityTier.toUpperCase()} Grade Materials & Prep (${sqft} sq ft)`,
    req.hasRemovalOldMaterial ? 'Tear-Off, Removal & Environmental Disposal' : 'Surface Preparation & Priming',
    req.isMultiStory ? 'Multi-Story Staging & Safety Rigging' : 'Standard Field Labor & Execution',
    'Final Cleanup & Contractor Warranty Verification',
  ];

  return {
    trade: req.trade,
    squareFootage: sqft,
    qualityTier: req.qualityTier,
    estimatedPriceMin,
    estimatedPriceMax,
    estimatedDepositRequired,
    averageTimelineDays: timeline,
    lineItemsSummary,
  };
}
