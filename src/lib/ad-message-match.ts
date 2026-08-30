export type MessageMatchResult = {
  isMatch: boolean;
  headline: string;
  subheadline: string;
  trustBadge: string;
  ctaLabel: string;
  detectedIntent:
    | 'emergency'
    | 'storm_damage'
    | 'replacement'
    | 'repair'
    | 'promo'
    | 'neighborhood'
    | 'financing'
    | 'general';
  offerHighlight?: string;
  preselectedService?: string;
};

export type MessageMatchInput = {
  trade: string;
  city?: string | null;
  businessName: string;
  utmTerm?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmSource?: string | null;
  keyword?: string | null;
  focus?: string | null;
  intent?: string | null;
  promo?: string | null;
  service?: string | null;
  offer?: string | null;
  gclid?: string | null;
  defaultHeadline?: string;
  defaultSubheadline?: string;
  defaultCtaLabel?: string;
};

/**
 * Dynamically resolves landing page hero headlines, trust badges, and CTA hooks
 * based on Google/Meta search intent to achieve 100% Message Match, higher Quality Score,
 * and maximized landing page conversion rates (CRO).
 */
export function resolveMessageMatchHero(input: MessageMatchInput): MessageMatchResult {
  const {
    trade,
    city,
    businessName,
    utmTerm = '',
    utmCampaign = '',
    utmContent = '',
    utmSource = '',
    keyword = '',
    focus = '',
    intent = '',
    promo = '',
    service = '',
    offer = '',
    gclid = '',
    defaultHeadline = `Professional ${trade} in ${city || 'Your Area'}`,
    defaultSubheadline = `Fast estimates, licensed technicians, and guaranteed workmanship from ${businessName}.`,
    defaultCtaLabel = 'Start My Free Estimate',
  } = input;

  const rawQuery = `${utmTerm || ''} ${utmCampaign || ''} ${utmContent || ''} ${utmSource || ''} ${keyword || ''} ${focus || ''} ${intent || ''} ${promo || ''} ${service || ''} ${offer || ''}`.toLowerCase().trim();
  const cleanCity = (city || '').replace(/,\s*[A-Z]{2}$/i, '').trim();
  const locationSuffix = cleanCity ? ` in ${cleanCity}` : '';

  if (!rawQuery && !gclid) {
    return {
      isMatch: false,
      headline: defaultHeadline,
      subheadline: defaultSubheadline,
      trustBadge: '⭐ Verified Local Contractor',
      ctaLabel: defaultCtaLabel,
      detectedIntent: 'general',
    };
  }

  // 1. Emergency / Urgent Repair intent
  if (
    rawQuery.includes('emergency') ||
    rawQuery.includes('urgent') ||
    rawQuery.includes('leak') ||
    rawQuery.includes('burst') ||
    rawQuery.includes('flood') ||
    rawQuery.includes('broken') ||
    rawQuery.includes('24/7') ||
    rawQuery.includes('same day') ||
    intent === 'emergency'
  ) {
    return {
      isMatch: true,
      headline: `24/7 Emergency ${trade}${locationSuffix}`,
      subheadline: `Immediate local dispatch across ${cleanCity || 'your area'}. Upfront pricing and zero hidden overtime fees from ${businessName}.`,
      trustBadge: '🚨 24/7 Fast Local Dispatch',
      ctaLabel: 'Request Emergency Tech Dispatch ⚡',
      detectedIntent: 'emergency',
      preselectedService: 'Emergency Repairs',
      offerHighlight: 'Zero Overtime Fees · Same-Day Arrival',
    };
  }

  // 2. Storm damage / insurance inspection intent
  if (
    rawQuery.includes('storm') ||
    rawQuery.includes('hail') ||
    rawQuery.includes('wind') ||
    rawQuery.includes('tarp') ||
    rawQuery.includes('insurance claim') ||
    intent === 'storm_seasonal'
  ) {
    return {
      isMatch: true,
      headline: `Storm Damage & Leak Inspection${locationSuffix}`,
      subheadline: `Free comprehensive storm damage inspection and direct insurance claim assistance from ${businessName}.`,
      trustBadge: '⛈️ Storm & Leak Specialists',
      ctaLabel: 'Book Free Storm Inspection ➔',
      detectedIntent: 'storm_damage',
      preselectedService: 'Storm Damage Inspection',
      offerHighlight: 'Free Storm & Leak Inspection',
    };
  }

  // 3. Special promotional / Discount offer (Specific Offer Intent)
  if (
    Boolean(promo || offer) ||
    rawQuery.includes('promo') ||
    rawQuery.includes('discount') ||
    rawQuery.includes('coupon') ||
    rawQuery.includes('$') ||
    rawQuery.includes('% off') ||
    rawQuery.includes('special offer') ||
    intent === 'promo'
  ) {
    const customPromo = promo || offer || (rawQuery.includes('$1,500') || rawQuery.includes('1500') ? '$1,500 Off Full Replacement' : '$250 Off Project Quote');
    return {
      isMatch: true,
      headline: `${customPromo}${locationSuffix}`,
      subheadline: `Limited-time homeowner promotion from ${businessName}. Lock in your special rate with a free written estimate today.`,
      trustBadge: '🎁 Verified Special Offer Applied',
      ctaLabel: 'Claim Offer & Get Estimate 🏷️',
      detectedIntent: 'promo',
      offerHighlight: customPromo,
    };
  }

  // 4. Neighborhood Halo micro-intent
  if (
    rawQuery.includes('neighbor') ||
    rawQuery.includes('neighborhood') ||
    rawQuery.includes('street') ||
    rawQuery.includes('halo') ||
    intent === 'neighborhood'
  ) {
    return {
      isMatch: true,
      headline: `Recent Projects Completed in Your Neighborhood`,
      subheadline: `See verified before & after transformations in ${cleanCity || 'your area'} and claim exclusive neighbor rates from ${businessName}.`,
      trustBadge: '🏡 Neighborhood Project Special Active',
      ctaLabel: 'Claim Neighbor Rate & Get Quote ⚡',
      detectedIntent: 'neighborhood',
      offerHighlight: 'Exclusive Neighbor Rate Available',
    };
  }

  // 5. Financing & Low Monthly Payments
  if (
    rawQuery.includes('financ') ||
    rawQuery.includes('monthly payment') ||
    rawQuery.includes('zero down') ||
    rawQuery.includes('0% apr') ||
    rawQuery.includes('payment plan')
  ) {
    return {
      isMatch: true,
      headline: `Flexible Financing & $0 Down for ${trade}${locationSuffix}`,
      subheadline: `Upgrade your home today with low monthly payment options and fast approval from ${businessName}.`,
      trustBadge: '💳 $0 Down Flexible Financing Available',
      ctaLabel: 'Explore Financing & Get Quote ➔',
      detectedIntent: 'financing',
      offerHighlight: '$0 Down · Flexible Monthly Payments',
    };
  }

  // 6. Replacement / New Installation (High-Ticket Intent)
  if (
    rawQuery.includes('replace') ||
    rawQuery.includes('install') ||
    rawQuery.includes('new ') ||
    rawQuery.includes('cost') ||
    rawQuery.includes('quote') ||
    rawQuery.includes('upgrade') ||
    rawQuery.includes('remodel') ||
    intent === 'replacement'
  ) {
    return {
      isMatch: true,
      headline: `Free ${trade} Estimate${locationSuffix}`,
      subheadline: `Transparent upfront pricing, flexible financing, and industry-leading warranties from ${businessName}.`,
      trustBadge: '🏷️ Free 15-Minute Written Estimate',
      ctaLabel: 'Get Instant Project Price Range ➔',
      detectedIntent: 'replacement',
      preselectedService: 'Installation & Replacement',
      offerHighlight: '10-Year Workmanship Warranty Included',
    };
  }

  // 7. General Repair / Maintenance
  if (
    rawQuery.includes('repair') ||
    rawQuery.includes('fix') ||
    rawQuery.includes('service') ||
    rawQuery.includes('tune up') ||
    rawQuery.includes('maintenance') ||
    intent === 'maintenance'
  ) {
    return {
      isMatch: true,
      headline: `Top-Rated ${trade} Repair${locationSuffix}`,
      subheadline: `Fast, reliable repairs backed by 5-star customer ratings. Schedule your visit with ${businessName} today.`,
      trustBadge: '★★★★★ 4.9-Star Rated Local Service',
      ctaLabel: 'Book Diagnostic & Repair ➔',
      detectedIntent: 'repair',
      preselectedService: 'Repairs & Maintenance',
      offerHighlight: 'Upfront Pricing Guarantee',
    };
  }

  // 8. Default Matched Query (UTM / GCLID present)
  return {
    isMatch: true,
    headline: `Top-Rated ${trade}${locationSuffix}`,
    subheadline: `Trusted by hundreds of local homeowners. Get a fast, accurate estimate from ${businessName}.`,
    trustBadge: '🛡️ Licensed, Insured & Locally Owned',
    ctaLabel: 'Start My Free Estimate ➔',
    detectedIntent: 'general',
    offerHighlight: '100% Free Transparent Quote',
  };
}
