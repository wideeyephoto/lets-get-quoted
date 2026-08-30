export type MessageMatchResult = {
  isMatch: boolean;
  headline: string;
  subheadline: string;
  trustBadge: string;
  detectedIntent?: string;
};

export type MessageMatchInput = {
  trade: string;
  city?: string | null;
  businessName: string;
  utmTerm?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  defaultHeadline?: string;
  defaultSubheadline?: string;
};

/**
 * Dynamically resolves landing page hero headlines based on Google search intent
 * to achieve 100% Message Match, higher Quality Score, and higher conversion rates.
 */
export function resolveMessageMatchHero(input: MessageMatchInput): MessageMatchResult {
  const {
    trade,
    city,
    businessName,
    utmTerm = '',
    utmCampaign = '',
    utmContent = '',
    defaultHeadline = `Professional ${trade} in ${city || 'Your Area'}`,
    defaultSubheadline = `Fast estimates, licensed technicians, and guaranteed workmanship from ${businessName}.`,
  } = input;

  const rawQuery = `${utmTerm || ''} ${utmCampaign || ''} ${utmContent || ''}`.toLowerCase().trim();
  const cleanCity = (city || '').replace(/,\s*[A-Z]{2}$/i, '').trim();
  const locationSuffix = cleanCity ? ` in ${cleanCity}` : '';

  if (!rawQuery) {
    return {
      isMatch: false,
      headline: defaultHeadline,
      subheadline: defaultSubheadline,
      trustBadge: '⭐ Verified Local Contractor',
    };
  }

  // 1. Emergency intent
  if (rawQuery.includes('emergency') || rawQuery.includes('urgent') || rawQuery.includes('leak') || rawQuery.includes('burst')) {
    return {
      isMatch: true,
      headline: `24/7 Emergency ${trade}${locationSuffix}`,
      subheadline: `Immediate dispatch across ${cleanCity || 'your local area'}. Upfront pricing and zero hidden overtime fees from ${businessName}.`,
      trustBadge: '🚨 24/7 Fast Local Dispatch',
      detectedIntent: 'emergency',
    };
  }

  // 2. Storm damage / leak repair
  if (rawQuery.includes('storm') || rawQuery.includes('hail') || rawQuery.includes('wind') || rawQuery.includes('tarp')) {
    return {
      isMatch: true,
      headline: `Storm Damage & Leak Repair${locationSuffix}`,
      subheadline: `Free comprehensive storm inspection and direct insurance claim assistance from ${businessName}.`,
      trustBadge: '⛈️ Storm & Leak Specialists',
      detectedIntent: 'storm_damage',
    };
  }

  // 3. Replacement / New Installation
  if (rawQuery.includes('replace') || rawQuery.includes('install') || rawQuery.includes('new ') || rawQuery.includes('cost')) {
    return {
      isMatch: true,
      headline: `Free ${trade} Estimate${locationSuffix}`,
      subheadline: `Transparent upfront pricing, flexible financing, and industry-leading warranties from ${businessName}.`,
      trustBadge: '🏷️ Free 15-Minute Written Estimate',
      detectedIntent: 'replacement',
    };
  }

  // 4. General Repair / Maintenance
  if (rawQuery.includes('repair') || rawQuery.includes('fix') || rawQuery.includes('service')) {
    return {
      isMatch: true,
      headline: `Top-Rated ${trade} Repair${locationSuffix}`,
      subheadline: `Fast, reliable repairs backed by 5-star customer ratings. Schedule your visit with ${businessName} today.`,
      trustBadge: '★★★★★ 4.9-Star Rated Local Service',
      detectedIntent: 'repair',
    };
  }

  // 5. Default matched query
  return {
    isMatch: true,
    headline: `Top-Rated ${trade}${locationSuffix}`,
    subheadline: `Trusted by hundreds of local homeowners. Get a fast, accurate estimate from ${businessName}.`,
    trustBadge: '🛡️ Licensed, Insured & Locally Owned',
    detectedIntent: 'general',
  };
}
