export type HaloCampaignStatus = 'draft' | 'active' | 'completed' | 'paused' | 'failed';

export type HaloGeofenceZone = {
  centerLat: number;
  centerLng: number;
  radiusMiles: number;
  bounds: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  };
};

export type HaloAdCopyPackage = {
  headline: string;
  subheadline: string;
  primaryText: string;
  callToAction: string;
  visualHook: string;
  neighborhoodHook: string;
  incentiveBadge: string;
};

export type NeighborhoodHaloCampaign = {
  id: string;
  accountId: string;
  jobId: string;
  clientName?: string;
  rawAddress: string;
  sanitizedAddress: string;
  streetName: string;
  neighborhoodName: string;
  city: string;
  state: string;
  zip: string;
  geofence: HaloGeofenceZone;
  budgetDollars: number;
  durationDays: number;
  status: HaloCampaignStatus;
  adCopy: HaloAdCopyPackage;
  beforePhotoUrl?: string;
  afterPhotoUrl?: string;
  targetLandingUrl: string;
  metrics: {
    impressions: number;
    clicks: number;
    leads: number;
    spendDollars: number;
  };
  createdAt: string;
  expiresAt: string;
};

export type HaloBudgetConfig = {
  defaultBudgetDollars: number;
  defaultDurationDays: number;
  maxMonthlyHaloSpendDollars: number;
};

export const DEFAULT_HALO_CONFIG: HaloBudgetConfig = {
  defaultBudgetDollars: 25,
  defaultDurationDays: 5,
  maxMonthlyHaloSpendDollars: 250,
};

export type ExtractedAddressInfo = {
  rawAddress: string;
  sanitizedAddress: string;
  streetName: string;
  neighborhoodName: string;
  city: string;
  state: string;
  zip: string;
};

/**
 * Parses an address into components and strips exact street numbers for public privacy.
 * E.g., "1428 Maple Ave, Rochester, MI 48307" -> streetName: "Maple Ave", sanitizedAddress: "Maple Ave, Rochester, MI"
 */
export function extractStreetAndNeighborhood(address: string, subdivisionName?: string): ExtractedAddressInfo {
  const clean = (address || '').trim();
  if (!clean) {
    return {
      rawAddress: '',
      sanitizedAddress: 'Your Neighborhood',
      streetName: 'Local Area',
      neighborhoodName: subdivisionName || 'Your Neighborhood',
      city: '',
      state: '',
      zip: '',
    };
  }

  // Split by comma
  const parts = clean.split(',').map((p) => p.trim()).filter(Boolean);
  
  // Find state/zip part (usually last part)
  let state = '';
  let zip = '';
  let cityPart = '';
  let streetPart = '';

  const isSuiteOrUnit = (p: string) => /^(Apt|Suite|Unit|Ste|Bldg|#)\s*#?\d+[-\w]*/i.test(p);
  const isStateZip = (p: string) => /^[A-Za-z]{2}\s*(\d{5}(-\d{4})?)?$/.test(p.trim());

  if (parts.length >= 3 && isStateZip(parts[parts.length - 1])) {
    const stateZipMatch = parts[parts.length - 1].match(/([A-Za-z]{2})\s*(\d{5}(-\d{4})?)?/);
    if (stateZipMatch) {
      state = stateZipMatch[1]?.toUpperCase() || '';
      zip = stateZipMatch[2] || '';
    }
    cityPart = parts[parts.length - 2];

    const precedingParts = parts.slice(0, parts.length - 2);
    // Find the part with the street address
    streetPart = precedingParts.find((p) => !isSuiteOrUnit(p)) || precedingParts[0] || '';
  } else if (parts.length === 3) {
    streetPart = parts[0];
    cityPart = parts[1];
    const stateZipMatch = parts[2].match(/([A-Za-z]{2})\s*(\d{5}(-\d{4})?)?/);
    if (stateZipMatch) {
      state = stateZipMatch[1]?.toUpperCase() || '';
      zip = stateZipMatch[2] || '';
    }
  } else {
    streetPart = parts[0] || '';
    cityPart = parts[1] || '';
  }

  // Extract street name by stripping leading house/unit numbers
  let streetName = streetPart
    .replace(/^#?\d+[-\w]*\s+/, '')
    .replace(/^(Apt|Suite|Unit|Ste|Bldg)\s*#?\d+\s*/i, '')
    .replace(/\s+(Apt|Suite|Unit|Ste|Bldg)\s*#?\d+[-\w]*/i, '')
    .trim();

  if (!streetName) {
    streetName = streetPart || 'Local Street';
  }

  const neighborhoodName = subdivisionName ? subdivisionName.trim() : (cityPart ? `${cityPart} Area` : 'Your Neighborhood');
  
  const sanitizedSegments = [streetName, cityPart, state].filter(Boolean);
  const sanitizedAddress = sanitizedSegments.join(', ');

  return {
    rawAddress: clean,
    sanitizedAddress,
    streetName,
    neighborhoodName,
    city: cityPart,
    state,
    zip,
  };
}

/**
 * Calculates bounding box and radius for 1-mile (or custom) geofencing.
 * 1 degree latitude ~= 69 miles
 * 1 degree longitude ~= 69 * cos(lat) miles
 */
export function calculateHaloGeofence(latitude: number, longitude: number, radiusMiles = 1.0): HaloGeofenceZone {
  const safeRadius = Math.max(0.25, Math.min(5.0, radiusMiles));
  const latDelta = safeRadius / 69.0;
  const latRad = (latitude * Math.PI) / 180.0;
  const lonDelta = safeRadius / (69.0 * Math.max(0.1, Math.cos(latRad)));

  return {
    centerLat: latitude,
    centerLng: longitude,
    radiusMiles: safeRadius,
    bounds: {
      minLat: latitude - latDelta,
      maxLat: latitude + latDelta,
      minLng: longitude - lonDelta,
      maxLng: longitude + lonDelta,
    },
  };
}

export type HaloJobInput = {
  id: string;
  status: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  scopeSummary?: string | null;
  photoUrls?: string[] | null;
  beforePhotoUrl?: string | null;
  afterPhotoUrl?: string | null;
  allowMarketingShowcase?: boolean | null;
};

export type HaloQualificationResult = {
  qualified: boolean;
  reason: string;
  hasPhotos: boolean;
  hasCoordinates: boolean;
  optedOut?: boolean;
};

/**
 * Checks whether a job satisfies requirements for a Neighborhood Halo ad campaign.
 */
export function qualifyJobForNeighborhoodHalo(job: HaloJobInput): HaloQualificationResult {
  // Layer 1: Client Opt-Out Gate
  if (job.allowMarketingShowcase === false) {
    return {
      qualified: false,
      reason: 'Customer has opted out of marketing showcases for this address.',
      hasPhotos: Boolean((job.photoUrls && job.photoUrls.length > 0) || job.beforePhotoUrl || job.afterPhotoUrl),
      hasCoordinates: typeof job.latitude === 'number' && typeof job.longitude === 'number',
      optedOut: true,
    };
  }

  const isCompleted = ['completed', 'complete', 'invoiced', 'paid'].includes(
    (job.status || '').toLowerCase().trim()
  );

  const hasPhotos = Boolean(
    (job.photoUrls && job.photoUrls.length > 0) ||
    job.beforePhotoUrl ||
    job.afterPhotoUrl
  );

  const hasCoordinates =
    typeof job.latitude === 'number' &&
    typeof job.longitude === 'number' &&
    !Number.isNaN(job.latitude) &&
    !Number.isNaN(job.longitude) &&
    job.latitude !== 0 &&
    job.longitude !== 0;

  if (!isCompleted) {
    return {
      qualified: false,
      reason: 'Job must be marked completed before launching a Neighborhood Halo campaign.',
      hasPhotos,
      hasCoordinates,
    };
  }

  if (!hasCoordinates) {
    return {
      qualified: false,
      reason: 'Job must have verified GPS / Geocoded coordinates for 1-mile radius targeting.',
      hasPhotos,
      hasCoordinates,
    };
  }

  if (!hasPhotos) {
    return {
      qualified: false,
      reason: 'Job requires at least 1 completed craftsmanship photo to generate ad visuals.',
      hasPhotos,
      hasCoordinates,
    };
  }

  return {
    qualified: true,
    reason: 'Job is fully qualified for an automated Neighborhood Halo campaign.',
    hasPhotos: true,
    hasCoordinates: true,
  };
}

/**
 * Allocates micro-budget from active wallet while respecting monthly ceilings.
 */
export function allocateHaloMicroBudget(params: {
  currentWalletBalanceDollars: number;
  haloSpendThisMonthDollars: number;
  config?: Partial<HaloBudgetConfig>;
}): {
  canLaunch: boolean;
  allocatedBudgetDollars: number;
  durationDays: number;
  reason: string;
} {
  const config = { ...DEFAULT_HALO_CONFIG, ...(params.config || {}) };
  const { currentWalletBalanceDollars, haloSpendThisMonthDollars } = params;

  if (haloSpendThisMonthDollars >= config.maxMonthlyHaloSpendDollars) {
    return {
      canLaunch: false,
      allocatedBudgetDollars: 0,
      durationDays: config.defaultDurationDays,
      reason: `Monthly Neighborhood Halo budget cap ($${config.maxMonthlyHaloSpendDollars}) reached.`,
    };
  }

  const remainingMonthlyCap = config.maxMonthlyHaloSpendDollars - haloSpendThisMonthDollars;
  const targetBudget = Math.min(config.defaultBudgetDollars, remainingMonthlyCap);

  if (currentWalletBalanceDollars < targetBudget) {
    return {
      canLaunch: false,
      allocatedBudgetDollars: 0,
      durationDays: config.defaultDurationDays,
      reason: `Insufficient ad wallet balance ($${currentWalletBalanceDollars.toFixed(2)} vs required $${targetBudget.toFixed(2)}).`,
    };
  }

  return {
    canLaunch: true,
    allocatedBudgetDollars: targetBudget,
    durationDays: config.defaultDurationDays,
    reason: `Allocated $${targetBudget.toFixed(2)} for a ${config.defaultDurationDays}-day hyper-local halo.`,
  };
}

/**
 * Generates deterministic fallback ad copy packages for instant rendering.
 */
export function generateDeterministicHaloCopy(params: {
  trade: string;
  businessName: string;
  streetName: string;
  neighborhoodName: string;
  scopeSummary?: string;
}): HaloAdCopyPackage {
  const { trade, businessName, streetName, neighborhoodName, scopeSummary } = params;
  const effectiveTrade = trade || 'Home Improvement';
  const cleanScope = scopeSummary ? scopeSummary.trim() : `${effectiveTrade} Project`;
  const companyLead = businessName ? `Our team at ${businessName}` : 'Our crews';

  return {
    headline: `Just Completed on ${streetName}!`,
    subheadline: `Quality ${effectiveTrade} Craftsmanship in ${neighborhoodName}`,
    primaryText: `${companyLead} just wrapped up a high-quality ${cleanScope.toLowerCase()} near ${streetName}. While our trucks are in the area this week, neighbors can claim priority scheduling and a free estimate.`,
    callToAction: 'Claim Neighbor Offer',
    visualHook: `📍 Recently Completed on ${streetName}`,
    neighborhoodHook: `Working in ${neighborhoodName} this week`,
    incentiveBadge: '⭐ Exclusive Neighbor Offer',
  };
}

/**
 * Constructs the targeted dynamic landing page URL for neighbors.
 */
export function buildHaloLandingPageUrl(baseDomain: string, haloId: string, tradeSlug: string): string {
  const protocol = baseDomain.includes('localhost') ? 'http' : 'https';
  const domain = baseDomain.replace(/^https?:\/\//, '');
  return `${protocol}://${domain}/showcase/${tradeSlug}?halo=${encodeURIComponent(haloId)}&ref=halo_ad`;
}

export type NeighborClusterTier = {
  minHomes: number;
  discountDollars: number;
  badge: string;
  description: string;
};

export const DEFAULT_CLUSTER_TIERS: NeighborClusterTier[] = [
  {
    minHomes: 2,
    discountDollars: 100,
    badge: '🏘️ 2-Neighbor Duo ($100 Off Each)',
    description: '$100 off per home when 2 neighbors book on the same street',
  },
  {
    minHomes: 3,
    discountDollars: 250,
    badge: '🌟 3-Neighbor Street Cluster ($250 Off Each)',
    description: '$250 off per home when 3 neighbors book on the same street',
  },
  {
    minHomes: 5,
    discountDollars: 500,
    badge: '🏆 5+ Home HOA Group Special ($500 Off Each)',
    description: '$500 off per home for whole-block or subdivision bookings',
  },
];

export type ClusterDiscountResult = {
  activeHomes: number;
  discountDollars: number;
  activeTier: NeighborClusterTier | null;
  nextTier: NeighborClusterTier | null;
  homesNeededForNextTier: number;
  nextTierSavingsBonus: number;
  badge: string;
};

/**
 * Evaluates current street cluster participation and calculates unlocked neighbor discounts.
 */
export function calculateNeighborClusterDiscount(
  activeHomesCount: number,
  customTiers: NeighborClusterTier[] = DEFAULT_CLUSTER_TIERS
): ClusterDiscountResult {
  const sortedTiers = [...customTiers].sort((a, b) => a.minHomes - b.minHomes);
  const count = Math.max(0, activeHomesCount);

  let activeTier: NeighborClusterTier | null = null;
  let nextTier: NeighborClusterTier | null = null;

  for (const tier of sortedTiers) {
    if (count >= tier.minHomes) {
      activeTier = tier;
    } else if (!nextTier) {
      nextTier = tier;
    }
  }

  const discountDollars = activeTier ? activeTier.discountDollars : 0;
  const homesNeededForNextTier = nextTier ? Math.max(0, nextTier.minHomes - count) : 0;
  const nextTierSavingsBonus = nextTier ? nextTier.discountDollars - discountDollars : 0;
  const badge = activeTier ? activeTier.badge : (nextTier ? `Book with a neighbor for $${nextTier.discountDollars} off` : 'Standard Neighbor Rate');

  return {
    activeHomes: count,
    discountDollars,
    activeTier,
    nextTier,
    homesNeededForNextTier,
    nextTierSavingsBonus,
    badge,
  };
}

/**
 * Generates viral copy for homeowners to post into their HOA Facebook group or text thread.
 */
export function generateNeighborClusterShareText(params: {
  businessName: string;
  trade: string;
  streetName: string;
  neighborhoodName: string;
  clusterResult: ClusterDiscountResult;
}): string {
  const { businessName, trade, streetName, neighborhoodName, clusterResult } = params;
  const { nextTier, homesNeededForNextTier } = clusterResult;

  if (nextTier) {
    return [
      `Hey neighbors on ${streetName}! 👋`,
      `We're working with ${businessName} on our ${trade.toLowerCase()} project in ${neighborhoodName}.`,
      `If ${homesNeededForNextTier === 1 ? '1 more neighbor' : `${homesNeededForNextTier} more neighbors`} on our street book a project this month, everyone unlocks an extra $${nextTier.discountDollars} group cluster discount!`,
      `Tap here to see their recent before/after photos and claim the group rate:`,
    ].join('\n');
  }

  return [
    `Hey ${neighborhoodName} neighbors! 👋`,
    `We just completed our ${trade.toLowerCase()} project with ${businessName} on ${streetName}.`,
    `They are offering an exclusive $${clusterResult.discountDollars} neighbor cluster discount for homeowners on our street this week! Check out the results here:`,
  ].join('\n');
}

/**
 * Calculates geographical distance between two lat/lng pairs using the Haversine formula.
 */
export function calculateHaversineDistanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Finds existing active halo campaigns that overlap with a new candidate location to prevent self-competing ad spend.
 */
export function findOverlappingHaloCampaigns(
  newLat: number,
  newLng: number,
  activeHalos: NeighborhoodHaloCampaign[],
  thresholdMiles = 0.75
): NeighborhoodHaloCampaign[] {
  return activeHalos.filter((halo) => {
    if (halo.status !== 'active') return false;
    const distance = calculateHaversineDistanceMiles(newLat, newLng, halo.geofence.centerLat, halo.geofence.centerLng);
    return distance <= thresholdMiles;
  });
}

/**
 * Daily micro-pacing guard to prevent ad networks from burning entire multi-day halo budgets in hours.
 */
export function checkHaloDailyPacingLimit(
  spentTodayDollars: number,
  maxDailyPaceDollars = 5.0
): { canSpend: boolean; remainingDailyAllowanceDollars: number; reason: string } {
  const safeSpent = Math.max(0, spentTodayDollars);
  const remaining = Math.max(0, maxDailyPaceDollars - safeSpent);

  if (remaining <= 0) {
    return {
      canSpend: false,
      remainingDailyAllowanceDollars: 0,
      reason: `Daily halo spend pace cap ($${maxDailyPaceDollars.toFixed(2)}) reached for today.`,
    };
  }

  return {
    canSpend: true,
    remainingDailyAllowanceDollars: remaining,
    reason: `$${remaining.toFixed(2)} remaining in daily spend pace allowance.`,
  };
}

/**
 * Evaluates whether an underperforming halo campaign should be killed and its remaining balance refunded to core search.
 */
export function evaluateHaloAutoKillCriteria(campaign: NeighborhoodHaloCampaign): {
  shouldKill: boolean;
  reason: string;
  unspentBudgetDollars: number;
} {
  const now = Date.now();
  const created = new Date(campaign.createdAt).getTime();
  const ageHours = (now - created) / (1000 * 60 * 60);

  // If active for >= 72h, with >= 150 impressions and 0 clicks -> kill and refund unspent
  if (ageHours >= 72 && campaign.metrics.impressions >= 150 && campaign.metrics.clicks === 0) {
    const unspent = Math.max(0, campaign.budgetDollars - campaign.metrics.spendDollars);
    return {
      shouldKill: true,
      reason: `Underperforming halo: 0 clicks from ${campaign.metrics.impressions} impressions over ${Math.round(ageHours)} hours. Auto-reallocating $${unspent.toFixed(2)} back to Google Search.`,
      unspentBudgetDollars: unspent,
    };
  }

  return {
    shouldKill: false,
    reason: 'Campaign performance is healthy within normal variance.',
    unspentBudgetDollars: 0,
  };
}

/**
 * Cluster discount margin floor protector: prevents discounts from eroding margins on small tickets.
 */
export function applyClusterDiscountWithMarginFloor(
  jobTotalDollars: number,
  requestedDiscountDollars: number,
  maxDiscountPercentage = 10
): {
  appliedDiscountDollars: number;
  effectiveDiscountPercentage: number;
  cappedByMarginFloor: boolean;
  message: string;
} {
  const safeJobTotal = Math.max(0, jobTotalDollars);
  const maxAllowedDiscount = Math.round((safeJobTotal * maxDiscountPercentage) / 100);

  if (safeJobTotal <= 0 || requestedDiscountDollars <= 0) {
    return {
      appliedDiscountDollars: 0,
      effectiveDiscountPercentage: 0,
      cappedByMarginFloor: false,
      message: 'No discount applied.',
    };
  }

  if (requestedDiscountDollars > maxAllowedDiscount) {
    return {
      appliedDiscountDollars: maxAllowedDiscount,
      effectiveDiscountPercentage: maxDiscountPercentage,
      cappedByMarginFloor: true,
      message: `Requested $${requestedDiscountDollars} discount capped at $${maxAllowedDiscount} (${maxDiscountPercentage}% margin floor) to protect job profitability.`,
    };
  }

  const effectivePct = Math.round((requestedDiscountDollars / safeJobTotal) * 100);
  return {
    appliedDiscountDollars: requestedDiscountDollars,
    effectiveDiscountPercentage: effectivePct,
    cappedByMarginFloor: false,
    message: `Applied full $${requestedDiscountDollars} neighbor cluster discount (${effectivePct}% of job total).`,
  };
}

export type HaloMediaQualityResult = {
  valid: boolean;
  warnings: string[];
  errors: string[];
  transcodeRequired: boolean;
  recommendedFormat: 'webp' | 'mp4';
};

/**
 * Validates photo and video resolution, brightness, blurriness, and codec formats.
 */
export function validateHaloMediaQuality(mediaInput: {
  width?: number;
  height?: number;
  brightness?: number; // 0 to 255 (normal is 60 - 200)
  isBlurry?: boolean;
  format?: string; // e.g. "heic", "hevc", "mov", "jpg", "png", "webp"
}): HaloMediaQualityResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  let transcodeRequired = false;

  const { width = 1200, height = 900, brightness = 128, isBlurry = false, format = 'jpg' } = mediaInput;
  const cleanFormat = format.toLowerCase().replace(/^\./, '').trim();

  // Resolution checks
  if (width < 600 || height < 450) {
    errors.push(`Resolution (${width}x${height}) is too low for ad networks. Minimum required is 600x450.`);
  } else if (width < 800 || height < 600) {
    warnings.push(`Resolution (${width}x${height}) is below optimal (1200x900). Image may appear soft on high-DPI retina screens.`);
  }

  // Blurriness check
  if (isBlurry) {
    errors.push('Image appears blurry or out of focus. Please select a sharper job site photo.');
  }

  // Brightness check (0-255 scale)
  if (brightness < 45) {
    warnings.push('Image is very dark / underexposed. We recommend retaking with daylight or applying auto-lighting enhancement.');
  } else if (brightness > 225) {
    warnings.push('Image appears overexposed / washed out with harsh glare.');
  }

  // Codec / format checks
  if (['heic', 'heif'].includes(cleanFormat)) {
    transcodeRequired = true;
    warnings.push('Apple HEIC format detected. Auto-transcoding to high-efficiency WebP.');
  } else if (['hevc', 'mov'].includes(cleanFormat)) {
    transcodeRequired = true;
    warnings.push('Apple MOV / HEVC video detected. Auto-transcoding to H.264 MP4 for mobile ad network compatibility.');
  }

  const valid = errors.length === 0;

  return {
    valid,
    warnings,
    errors,
    transcodeRequired,
    recommendedFormat: ['mov', 'hevc', 'mp4', 'webm'].includes(cleanFormat) ? 'mp4' : 'webp',
  };
}


