import {
  calculateNeighborClusterDiscount,
  extractStreetAndNeighborhood,
  type ClusterDiscountResult,
} from './neighborhood-halo';

export type RoofPitch = 'flat' | '4/12' | '6/12' | '8/12' | '10/12' | '12/12';

export const ROOF_PITCH_MULTIPLIERS: Record<RoofPitch, number> = {
  flat: 1.0,
  '4/12': 1.054,
  '6/12': 1.118,
  '8/12': 1.202,
  '10/12': 1.302,
  '12/12': 1.414,
};

export type SatellitePropertyDimensions = {
  footprintSqFt: number;
  stories: number;
  roofPitch: RoofPitch;
  pitchMultiplier: number;
  wasteFactorPct: number;
  roofSquares: number; // 1 square = 100 sq ft
  roofSqFt: number;
  perimeterLinearFt: number;
  gutterLinearFt: number;
  sidingWallSqFt: number;
  livingAreaSqFt: number;
  hvacRecommendedTons: number;
  confidence: 'high_satellite' | 'medium_records' | 'estimated_fallback';
  isEstimatedFallback: boolean;
};

/**
 * Calculates property geometry and building envelope dimensions from aerial footprint data.
 */
export function calculateSatellitePropertyDimensions(params: {
  footprintSqFt?: number;
  stories?: number;
  roofPitch?: RoofPitch | string;
  wasteFactorPct?: number;
  knownLivingAreaSqFt?: number;
  confidence?: 'high_satellite' | 'medium_records' | 'estimated_fallback';
}): SatellitePropertyDimensions {
  const isEstimatedFallback = params.footprintSqFt == null;
  const footprintSqFt = params.footprintSqFt ?? 1800;
  const stories = params.stories ?? 1.5;
  const roofPitch = params.roofPitch ?? '6/12';
  const wasteFactorPct = params.wasteFactorPct ?? 12;
  const knownLivingAreaSqFt = params.knownLivingAreaSqFt;

  const validPitch: RoofPitch = (ROOF_PITCH_MULTIPLIERS[roofPitch as RoofPitch] !== undefined)
    ? (roofPitch as RoofPitch)
    : '6/12';

  const pitchMultiplier = ROOF_PITCH_MULTIPLIERS[validPitch];
  const wasteMultiplier = 1 + wasteFactorPct / 100;

  // Roof Area = Footprint * Pitch Multiplier * (1 + Overhang ~10%) * Waste
  const trueRoofSqFt = Math.round(footprintSqFt * 1.1 * pitchMultiplier * wasteMultiplier);
  const roofSquares = Math.round((trueRoofSqFt / 100) * 10) / 10;

  // Approximate perimeter based on rectangular aspect ratio ~1:1.5
  // Width * 1.5Width = footprint -> Width = sqrt(footprint / 1.5)
  const width = Math.sqrt(footprintSqFt / 1.5);
  const length = width * 1.5;
  const perimeterLinearFt = Math.round(2 * (width + length));
  const gutterLinearFt = Math.round(perimeterLinearFt * 0.85); // gutters along eave lines

  // Siding wall surface = perimeter * (wall height ~9ft per story) - window deduction ~15%
  const sidingWallSqFt = Math.round(perimeterLinearFt * (stories * 9) * 0.85);

  // Living area = footprint * stories
  const livingAreaSqFt = knownLivingAreaSqFt || Math.round(footprintSqFt * Math.max(1, stories * 0.9));

  // HVAC sizing ~ 1 ton per 500-600 sq ft in conditioned climate
  const hvacTons = Math.round((livingAreaSqFt / 550) * 2) / 2; // round to nearest 0.5 ton

  const resolvedConfidence = params.confidence ?? (isEstimatedFallback ? 'estimated_fallback' : 'high_satellite');

  return {
    footprintSqFt,
    stories,
    roofPitch: validPitch,
    pitchMultiplier,
    wasteFactorPct,
    roofSquares,
    roofSqFt: trueRoofSqFt,
    perimeterLinearFt,
    gutterLinearFt,
    sidingWallSqFt,
    livingAreaSqFt,
    hvacRecommendedTons: Math.max(1.5, hvacTons),
    confidence: resolvedConfidence,
    isEstimatedFallback,
  };
}

/**
 * Derives property sizing directly from a resolved PropertyIntelligence or summary object,
 * grounding dimensions in Google Solar building insights or parcel specs.
 */
export function calculateSatellitePropertyDimensionsFromIntel(params: {
  groundFootprintSqFt?: number;
  totalRoofAreaSqFt?: number;
  dominantPitch?: string;
  stories?: number;
  livingAreaSqFt?: number;
  hasSolarCoverage?: boolean;
}): SatellitePropertyDimensions {
  const footprint = params.groundFootprintSqFt || (params.livingAreaSqFt && params.stories ? Math.round(params.livingAreaSqFt / Math.max(1, params.stories)) : undefined);
  const confidence: 'high_satellite' | 'medium_records' | 'estimated_fallback' = params.groundFootprintSqFt
    ? 'high_satellite'
    : (params.livingAreaSqFt ? 'medium_records' : 'estimated_fallback');

  return calculateSatellitePropertyDimensions({
    footprintSqFt: footprint,
    roofPitch: params.dominantPitch,
    stories: params.stories,
    knownLivingAreaSqFt: params.livingAreaSqFt,
    confidence,
  });
}

export type SatelliteEstimateBracket = {
  trade: string;
  lowDollars: number;
  highDollars: number;
  unitOfMeasurement: string;
  quantity: number;
  unitPriceRange: { low: number; high: number };
  dimensionSummary: string;
};

/**
 * Computes an instant estimated price range using satellite measurements.
 */
export function calculateSatelliteInstantEstimateBracket(
  trade: string,
  dimensions: SatellitePropertyDimensions
): SatelliteEstimateBracket {
  const normTrade = (trade || '').toLowerCase().trim();

  // 1. Roofing (Price per square: $425 – $650)
  if (normTrade.includes('roof')) {
    const low = Math.round(dimensions.roofSquares * 425);
    const high = Math.round(dimensions.roofSquares * 650);
    return {
      trade: 'Roof Replacement',
      lowDollars: low,
      highDollars: high,
      unitOfMeasurement: 'squares (100 sq ft)',
      quantity: dimensions.roofSquares,
      unitPriceRange: { low: 425, high: 650 },
      dimensionSummary: `${dimensions.roofSquares} squares (${dimensions.roofSqFt.toLocaleString()} sq ft) · ${dimensions.roofPitch} pitch`,
    };
  }

  // 2. Siding (Price per sq ft: $8.50 – $14.00)
  if (normTrade.includes('siding')) {
    const low = Math.round(dimensions.sidingWallSqFt * 8.5);
    const high = Math.round(dimensions.sidingWallSqFt * 14.0);
    return {
      trade: 'Siding Replacement',
      lowDollars: low,
      highDollars: high,
      unitOfMeasurement: 'sq ft exterior wall',
      quantity: dimensions.sidingWallSqFt,
      unitPriceRange: { low: 8.5, high: 14.0 },
      dimensionSummary: `${dimensions.sidingWallSqFt.toLocaleString()} sq ft exterior wall area (${dimensions.stories} stories)`,
    };
  }

  // 3. Gutters (Price per linear ft: $12 – $22)
  if (normTrade.includes('gutter')) {
    const low = Math.round(dimensions.gutterLinearFt * 12);
    const high = Math.round(dimensions.gutterLinearFt * 22);
    return {
      trade: 'Seamless Gutters & Guards',
      lowDollars: low,
      highDollars: high,
      unitOfMeasurement: 'linear ft',
      quantity: dimensions.gutterLinearFt,
      unitPriceRange: { low: 12, high: 22 },
      dimensionSummary: `${dimensions.gutterLinearFt} linear ft eave perimeter`,
    };
  }

  // 4. HVAC (Price per ton: $2,400 – $3,800)
  if (normTrade.includes('hvac') || normTrade.includes('heat') || normTrade.includes('cool') || normTrade.includes('air')) {
    const low = Math.round(dimensions.hvacRecommendedTons * 2400);
    const high = Math.round(dimensions.hvacRecommendedTons * 3800);
    return {
      trade: 'HVAC Complete System Replacement',
      lowDollars: low,
      highDollars: high,
      unitOfMeasurement: 'tons cooling/heating capacity',
      quantity: dimensions.hvacRecommendedTons,
      unitPriceRange: { low: 2400, high: 3800 },
      dimensionSummary: `${dimensions.hvacRecommendedTons}-Ton System (${dimensions.livingAreaSqFt.toLocaleString()} sq ft conditioned living area)`,
    };
  }

  // 5. Default trade estimate (living area based)
  const low = Math.round(dimensions.livingAreaSqFt * 3.5);
  const high = Math.round(dimensions.livingAreaSqFt * 6.5);
  return {
    trade: `${trade} Project`,
    lowDollars: low,
    highDollars: high,
    unitOfMeasurement: 'sq ft',
    quantity: dimensions.livingAreaSqFt,
    unitPriceRange: { low: 3.5, high: 6.5 },
    dimensionSummary: `${dimensions.livingAreaSqFt.toLocaleString()} sq ft living area`,
  };
}

export type InstantAiEstimateResult = {
  headline: string;
  summaryMarkdown: string;
  dimensions: SatellitePropertyDimensions;
  estimateBracket: SatelliteEstimateBracket;
  clusterDiscount: {
    activeDiscountDollars: number;
    nextDiscountDollars: number;
    nextMilestoneHomes: number;
    bonusDollars: number;
    tierBadge: string;
  };
  viralShare: {
    streetName: string;
    shareLink: string;
    smsText: string;
    hoaPostText: string;
  };
  sameDayBatching: {
    isAvailable: boolean;
    streetName: string;
    batchDate: string;
    slotsRemaining: number;
    callout: string;
  };
};

/**
 * Generates the complete instant AI estimate with satellite sizing, active street cluster discount,
 * viral sharing link, and same-day street batching options.
 */
export function generateInstantAiEstimateWithClusterDiscount(params: {
  address: string;
  trade: string;
  businessName: string;
  customerName?: string;
  subdivisionName?: string;
  footprintSqFt?: number;
  roofPitch?: RoofPitch | string;
  stories?: number;
  activeClusterHomes?: number; // e.g. 1 if this is the first neighbor on street
  domainUrl?: string;
  batchDate?: string;
}): InstantAiEstimateResult {
  const {
    address,
    trade,
    businessName,
    customerName,
    subdivisionName,
    footprintSqFt,
    roofPitch,
    stories,
    activeClusterHomes = 1,
    domainUrl = 'apexroofing.com',
    batchDate = 'Thursday',
  } = params;

  const addrInfo = extractStreetAndNeighborhood(address, subdivisionName);
  const firstName = (customerName || '').trim().split(' ')[0] || 'there';

  // 1. Calculate Satellite Dimensions & Estimate Bracket
  const dimensions = calculateSatellitePropertyDimensions({
    footprintSqFt,
    roofPitch,
    stories,
  });

  const bracket = calculateSatelliteInstantEstimateBracket(trade, dimensions);

  // 2. Calculate Cluster Group Discount on Street
  const clusterResult: ClusterDiscountResult = calculateNeighborClusterDiscount(activeClusterHomes);
  const activeDiscount = clusterResult.discountDollars;
  const nextDiscount = clusterResult.nextTier ? clusterResult.nextTier.discountDollars : activeDiscount;
  const nextMilestoneHomes = clusterResult.homesNeededForNextTier;
  const bonusDollars = clusterResult.nextTierSavingsBonus;

  // 3. Build Viral Street Sharing Link
  const safeStreetSlug = addrInfo.streetName.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const shareLink = `https://${domainUrl}/street/${safeStreetSlug}?ref=neighbor_cluster`;

  const smsText = `Hey neighbor! We just got our preliminary ${trade.toLowerCase()} estimate from ${businessName} on ${addrInfo.streetName}. If you book a free inspection on ${batchDate} with our estimator, we both get $${nextDiscount} off our projects! Here is the street booking link: ${shareLink}`;

  const hoaPostText = `Hey ${addrInfo.neighborhoodName} neighbors! 👋\nOur estimator from ${businessName} will be on ${addrInfo.streetName} this ${batchDate} providing free ${trade.toLowerCase()} inspections. Because they can batch multiple homes in one trip, everyone on our street gets a group discount of $${nextDiscount} OFF. Tap here to grab one of the remaining slots: ${shareLink}`;

  // 4. Same-Day Batching Callout
  const batchingCallout = `📍 Estimator Scheduled on ${addrInfo.streetName} this ${batchDate}: 2 same-day estimate slots available.`;

  // 5. Conversational Markdown Response
  const formattedLow = `$${bracket.lowDollars.toLocaleString()}`;
  const formattedHigh = `$${bracket.highDollars.toLocaleString()}`;
  const discountedLow = `$${Math.max(0, bracket.lowDollars - (activeDiscount || 100)).toLocaleString()}`;
  const discountedHigh = `$${Math.max(0, bracket.highDollars - (activeDiscount || 100)).toLocaleString()}`;

  const summaryMarkdown = [
    dimensions.isEstimatedFallback
      ? `### 📐 Estimated Property Sizing for ${addrInfo.streetName}`
      : `### 🛰️ Instant Aerial Satellite Sizing for ${addrInfo.streetName}`,
    dimensions.isEstimatedFallback
      ? `Hi ${firstName}, based on standard property estimation models for your property in **${addrInfo.neighborhoodName}**:`
      : `Hi ${firstName}, based on aerial satellite measurements for your property in **${addrInfo.neighborhoodName}**:`,
    `- **Property Sizing:** ${bracket.dimensionSummary}`,
    `- **Preliminary Estimate Bracket:** **${formattedLow} – ${formattedHigh}**`,
    '',
    `---`,
    '',
    `### 🎁 Active Street Cluster Group Pricing`,
    `Because our crews & estimators are already active on **${addrInfo.streetName}**, your home qualifies for our **Street Cluster Rate**:`,
    `- **Current Street Rate:** **${discountedLow} – ${discountedHigh}** *(Includes $${activeDiscount || 100} Neighbor Credit)*`,
    `- **Unlock $${nextDiscount} Total Savings:** If **${nextMilestoneHomes === 1 ? '1 more neighbor' : `${nextMilestoneHomes} neighbors`}** on ${addrInfo.streetName} books a free inspection on **${batchDate}**, everyone's savings automatically increases to **$${nextDiscount} OFF**!`,
    '',
    `**📲 Share with your neighbors on ${addrInfo.streetName}:**`,
    `[${shareLink}](${shareLink})`,
    '',
    `> 🗓️ **${batchingCallout}**`,
  ].join('\n');

  return {
    headline: `Instant ${trade} Estimate for ${addrInfo.streetName}: ${discountedLow} – ${discountedHigh}`,
    summaryMarkdown,
    dimensions,
    estimateBracket: bracket,
    clusterDiscount: {
      activeDiscountDollars: activeDiscount || 100,
      nextDiscountDollars: nextDiscount,
      nextMilestoneHomes,
      bonusDollars,
      tierBadge: clusterResult.badge,
    },
    viralShare: {
      streetName: addrInfo.streetName,
      shareLink,
      smsText,
      hoaPostText,
    },
    sameDayBatching: {
      isAvailable: true,
      streetName: addrInfo.streetName,
      batchDate,
      slotsRemaining: 2,
      callout: batchingCallout,
    },
  };
}
