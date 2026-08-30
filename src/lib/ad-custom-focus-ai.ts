/**
 * AI Smart Field Comprehension Engine for Custom Contractor Ad Campaigns.
 *
 * Allows contractors to specify a custom promotion, niche service, brand, or offer
 * (e.g. "Generac Whole-Home Generators", "$1,500 Off Roof Replacement", "Tankless Water Heater Rebates").
 * Verifies intent before running ads to prevent bidding on unintended search terms.
 */

import { clampText } from './google-ads-generator';

export type CustomAdFocusAnalysis = {
  rawInput: string;
  isCustom: boolean;
  clarityScore: number; // 0-100
  clarityVerdict: 'ready' | 'needs_clarification' | 'too_broad';
  interpretedIntent: 'specific_service' | 'special_promotion' | 'brand_product' | 'emergency_niche' | 'general';
  aiUnderstandingSummary: string;
  targetBuyerSearches: string[];
  customNegativeFilters: string[];
  customHeadlines: string[];
  customDescriptions: string[];
  customMetaHeadline: string;
  customMetaPrimaryText: string;
  customRetargetingBadge: string;
  aiSuggestions: string[];
};

export function analyzeCustomAdFocus(params: {
  customFocus?: string | null;
  trade: string;
  city: string;
  businessName?: string;
}): CustomAdFocusAnalysis {
  const { customFocus, trade, city, businessName = 'Our Team' } = params;
  const input = (customFocus || '').trim();
  const cleanCity = (city || 'Local Area').replace(/,\s*[A-Z]{2}$/i, '').trim();

  if (!input) {
    return {
      rawInput: '',
      isCustom: false,
      clarityScore: 100,
      clarityVerdict: 'ready',
      interpretedIntent: 'general',
      aiUnderstandingSummary: `Defaulting to full multi-channel ${trade} campaign across ${cleanCity}.`,
      targetBuyerSearches: [
        `${trade.toLowerCase()} near me`,
        `best ${trade.toLowerCase()} in ${cleanCity.toLowerCase()}`,
        `${trade.toLowerCase()} contractor estimate`,
      ],
      customNegativeFilters: ['diy', 'jobs', 'salary', 'free', 'cheap', 'youtube'],
      customHeadlines: [
        clampText(`Top-Rated ${trade}`, 30),
        clampText(`${trade} in ${cleanCity}`, 30),
      ],
      customDescriptions: [
        clampText(`Licensed & insured ${trade.toLowerCase()} in ${cleanCity}. Get your fast free quote today!`, 90),
      ],
      customMetaHeadline: `Top-Rated ${trade} in ${cleanCity}`,
      customMetaPrimaryText: `Looking for reliable ${trade.toLowerCase()} services in ${cleanCity}? Contact ${businessName} for upfront pricing!`,
      customRetargetingBadge: '$250 Off Signed Estimate',
      aiSuggestions: [
        'Tip: Want to feature a specific high-margin service or seasonal discount? Enter it above (e.g. "Generac Generators" or "$1,000 Off Full Replacements").',
      ],
    };
  }

  // Detect discount / dollar / percentage promo
  const hasPromo = /\$\d+|\d+%\s*off|discount|rebate|special|coupon|save\s*\$/i.test(input);
  // Detect emergency niche
  const hasEmergency = /emergency|24\/7|urgent|burst|leak|freeze|flood|same\s*day/i.test(input);
  // Detect brand / specific product
  const hasBrand = /generac|trane|carrier|lennox|gaf|owens|certainteed|kohler|moen|rheem|navien|mitsubishi|tesla|bosch/i.test(input);
  // Detect specific service
  const isSpecific = input.split(/\s+/).length >= 2;

  let intent: CustomAdFocusAnalysis['interpretedIntent'] = 'specific_service';
  if (hasPromo) intent = 'special_promotion';
  else if (hasEmergency) intent = 'emergency_niche';
  else if (hasBrand) intent = 'brand_product';
  else if (!isSpecific) intent = 'general';

  // Calculate clarity score
  let clarityScore = 85;
  let clarityVerdict: CustomAdFocusAnalysis['clarityVerdict'] = 'ready';
  const aiSuggestions: string[] = [];

  if (input.length < 4 || (input.split(/\s+/).length === 1 && !hasBrand)) {
    clarityScore = 55;
    clarityVerdict = 'too_broad';
    aiSuggestions.push(
      `"${input}" is very broad. Consider adding a specific outcome or customer type (e.g. "Tankless ${input} Installation" or "Emergency ${input} Repairs").`
    );
  } else if (hasPromo) {
    clarityScore = 98;
    clarityVerdict = 'ready';
  } else if (hasBrand) {
    clarityScore = 95;
    clarityVerdict = 'ready';
  }

  // Generate AI Understanding Summary
  let summary = '';
  if (intent === 'special_promotion') {
    summary = `🎯 AI Confirmed: Featuring your special promotion ("${input}") for ${businessName ? `${businessName}'s ` : ''}${trade} in ${cleanCity}. Ads will highlight this limited-time savings to drive immediate consultation bookings.`;
  } else if (intent === 'brand_product') {
    summary = `🎯 AI Confirmed: Targeting homeowners specifically searching for authorized ${input} installation, repair, and certified dealer services from ${businessName} in ${cleanCity}.`;
  } else if (intent === 'emergency_niche') {
    summary = `🎯 AI Confirmed: Bidding with high-urgency multipliers for homeowners facing immediate ${input} situations calling ${businessName} in ${cleanCity}.`;
  } else {
    summary = `🎯 AI Confirmed: Focusing campaign bids exclusively on verified buyer searches for "${input}" with ${businessName} in ${cleanCity} while blocking non-related traffic.`;
  }

  // Generate Target Buyer Searches
  const targetBuyerSearches = [
    `"${input.toLowerCase()} in ${cleanCity.toLowerCase()}"`,
    `"${input.toLowerCase()} near me"`,
    `best ${input.toLowerCase()} ${cleanCity.toLowerCase()}`,
    `${input.toLowerCase()} contractor`,
    `cost of ${input.toLowerCase()} ${cleanCity.toLowerCase()}`,
    `[${input.toLowerCase()} service]`,
  ];

  // Custom Negative Filters
  const customNegativeFilters = [
    'diy',
    'how to',
    'tutorial',
    'used',
    'craigslist',
    'jobs',
    'salary',
    'apprentice',
    ...(hasBrand ? ['recall', 'manual pdf', 'troubleshooting guide'] : []),
  ];

  // Custom Headlines (≤30 characters)
  const customHeadlines = [
    clampText(input, 30),
    clampText(`${input} in ${cleanCity}`, 30),
    clampText(hasPromo ? input : `Expert ${input}`, 30),
    clampText(businessName || `${trade} Pros`, 30),
    clampText('Fast Free Estimates', 30),
    clampText('Licensed & Top-Rated', 30),
  ];

  // Custom Descriptions (≤90 characters)
  const customDescriptions = [
    clampText(`Looking for ${input.toLowerCase()} in ${cleanCity}? ${businessName} provides expert local service. Get a quote!`, 90),
    clampText(`Top-rated ${trade.toLowerCase()} specialists. Upfront honest pricing & guaranteed warranty on ${input.toLowerCase()}.`, 90),
  ];

  // Custom Meta copy
  const customMetaHeadline = clampText(`${input} · ${cleanCity}`, 45);
  const customMetaPrimaryText = hasPromo
    ? `🔥 Special Limited-Time Offer: ${input} in ${cleanCity}! ${businessName} is offering exclusive seasonal savings for local homeowners. Claim your estimate before slots fill up!`
    : `Looking for professional ${input.toLowerCase()} in ${cleanCity}? ${businessName} delivers 5-star quality, transparent pricing, and fast scheduling. Tap below to get your free estimate!`;

  const customRetargetingBadge = hasPromo ? input : `$250 Off ${input}`;

  return {
    rawInput: input,
    isCustom: true,
    clarityScore,
    clarityVerdict,
    interpretedIntent: intent,
    aiUnderstandingSummary: summary,
    targetBuyerSearches,
    customNegativeFilters,
    customHeadlines,
    customDescriptions,
    customMetaHeadline,
    customMetaPrimaryText,
    customRetargetingBadge,
    aiSuggestions,
  };
}
