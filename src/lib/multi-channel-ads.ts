export const AD_PLATFORM_FEE_RATE = 0.15; // 15% Platform Management Fee

export type MetaAdCopy = {
  primaryText: string;
  headline: string;
  description: string;
  callToAction: 'Get Quote' | 'Book Now' | 'Claim Offer' | 'Contact Us';
  visualHook: string;
};

export type RetargetingAdCopy = {
  headline: string;
  description: string;
  offerBadge: string;
  cta: string;
};

export type MultiChannelBudget = {
  searchSpendDollars: number;
  retargetingSpendDollars: number;
  metaSpendDollars: number;
  totalAdSpendDollars: number;
  platformFeeDollars: number;
  totalMonthlyDollars: number;
  activeChannels: ('google_search' | 'google_retargeting' | 'meta_social')[];
};

export type SmartBundleId = 'launch' | 'growth' | 'scale' | 'starter' | 'dominate';

export type SmartBundle = {
  id: SmartBundleId;
  name: string;
  badge?: string;
  weeklyAmountDollars: number;
  weeklyAdSpendDollars: number;
  weeklyFeeDollars: number;
  monthlyAverageDollars: number;
  monthlyAdSpendDollars: number;
  monthlyFeeDollars: number;
  totalMonthlyDollars: number;
  adSpendDollars: number;
  platformFeeDollars: number;
  searchSpendDollars: number;
  retargetingSpendDollars: number;
  metaSpendDollars: number;
  estimatedLeadsRange: string;
  leadMin: number;
  leadMax: number;
  features: string[];
  channels: ('google_search' | 'google_retargeting' | 'meta_social')[];
};

export const SMART_BUNDLES: SmartBundle[] = [
  {
    id: 'launch',
    name: 'Launch Plan',
    weeklyAmountDollars: 185,
    weeklyAdSpendDollars: 160,
    weeklyFeeDollars: 25,
    monthlyAverageDollars: 802,
    monthlyAdSpendDollars: 693,
    monthlyFeeDollars: 109,
    totalMonthlyDollars: 802,
    adSpendDollars: 693,
    platformFeeDollars: 109,
    searchSpendDollars: 693,
    retargetingSpendDollars: 0,
    metaSpendDollars: 0,
    estimatedLeadsRange: '4–8 Qualified Leads / mo (~1–2 / wk)',
    leadMin: 4,
    leadMax: 8,
    features: [
      'Google Search Ads (PPC)',
      '100+ Negative Waste Filters',
      'AI Smart Bidding & Geofencing',
      'Speed-to-Lead Auto-SMS',
    ],
    channels: ['google_search'],
  },
  {
    id: 'growth',
    name: 'Growth Engine',
    badge: '⭐ Most Popular',
    weeklyAmountDollars: 345,
    weeklyAdSpendDollars: 300,
    weeklyFeeDollars: 45,
    monthlyAverageDollars: 1495,
    monthlyAdSpendDollars: 1300,
    monthlyFeeDollars: 195,
    totalMonthlyDollars: 1495,
    adSpendDollars: 1300,
    platformFeeDollars: 195,
    searchSpendDollars: 1100,
    retargetingSpendDollars: 200,
    metaSpendDollars: 0,
    estimatedLeadsRange: '10–18 Qualified Leads / mo (~2–4 / wk)',
    leadMin: 10,
    leadMax: 18,
    features: [
      'Google Search Ads (PPC)',
      'Lost Visitor Retargeting (Display)',
      '$250 Off Re-engagement Offer',
      'Weather Surge Radar Protection',
      'Speed-to-Lead Auto-SMS',
    ],
    channels: ['google_search', 'google_retargeting'],
  },
  {
    id: 'scale',
    name: 'Scale & Dominate',
    badge: '🚀 Max Volume',
    weeklyAmountDollars: 645,
    weeklyAdSpendDollars: 560,
    weeklyFeeDollars: 85,
    monthlyAverageDollars: 2795,
    monthlyAdSpendDollars: 2427,
    monthlyFeeDollars: 368,
    totalMonthlyDollars: 2795,
    adSpendDollars: 2427,
    platformFeeDollars: 368,
    searchSpendDollars: 1800,
    retargetingSpendDollars: 200,
    metaSpendDollars: 427,
    estimatedLeadsRange: '22–38 Qualified Leads / mo (~5–9 / wk)',
    leadMin: 22,
    leadMax: 38,
    features: [
      'Google Search Ads (PPC)',
      'Facebook & Instagram Feed Ads',
      'Lost Visitor Retargeting',
      'Priority Multi-Channel Bidding',
      'Closed-Loop Offline Revenue Sync',
    ],
    channels: ['google_search', 'google_retargeting', 'meta_social'],
  },
];

export function getSmartBundle(bundleId: string): SmartBundle {
  if (bundleId === 'starter' || bundleId === 'launch') return SMART_BUNDLES[0];
  if (bundleId === 'dominate' || bundleId === 'scale') return SMART_BUNDLES[2];
  return SMART_BUNDLES.find((b) => b.id === bundleId) || SMART_BUNDLES[1];
}

/**
 * Generates high-converting Meta (Facebook & Instagram) Feed ad copy for trade contractors.
 */
export function generateMetaAdCopy(params: {
  businessName: string;
  trade: string;
  city: string;
  services: string[];
  seasonalAngle?: 'standard' | 'emergency' | 'storm_seasonal' | 'peak_renovation';
}): MetaAdCopy {
  const { businessName, trade, city, services = [], seasonalAngle = 'standard' } = params;
  const cleanCity = (city || 'your area').replace(/,\s*[A-Z]{2}$/i, '').trim();
  const primaryService = services[0] || `${trade} service`;

  if (seasonalAngle === 'storm_seasonal') {
    return {
      primaryText: `⛈️ Severe weather in ${cleanCity}? Don't wait for minor storm damage to turn into costly structural leaks. ${businessName} provides fast, comprehensive storm assessments and direct insurance claim assistance.`,
      headline: `Storm Damage ${trade} in ${cleanCity} · Free Inspection`,
      description: `Locally Owned · 5-Star Rated · Fast Same-Day Dispatch`,
      callToAction: 'Claim Offer',
      visualHook: 'Before & After Storm Restoration Photos',
    };
  }

  if (seasonalAngle === 'emergency') {
    return {
      primaryText: `🚨 Need urgent ${trade.toLowerCase()} assistance in ${cleanCity}? ${businessName} is on standby with 24/7 emergency dispatch. Upfront pricing, licensed technicians, and zero hidden fees.`,
      headline: `24/7 Emergency ${trade} · Fast Local Response`,
      description: `Immediate Dispatch in ${cleanCity} & Surrounding Areas`,
      callToAction: 'Get Quote',
      visualHook: 'Rapid Dispatch Van & Verified Credentials',
    };
  }

  if (seasonalAngle === 'peak_renovation') {
    return {
      primaryText: `✨ Upgrade your home with ${cleanCity}'s premier ${trade.toLowerCase()} team. From initial design to final walkthrough, ${businessName} delivers craftsmanship backed by industry-leading warranties.`,
      headline: `Transform Your Home with ${businessName}`,
      description: `Free 3D Design & Transparent Estimate · Flexible Financing`,
      callToAction: 'Get Quote',
      visualHook: 'Stunning Completed Remodel Gallery',
    };
  }

  // Default Standard Local Trust Angle
  return {
    primaryText: `Looking for reliable, top-rated ${primaryService.toLowerCase()} in ${cleanCity}? ${businessName} has served hundreds of local homeowners with quality craftsmanship, upfront pricing, and 5-star customer service. Tap below for your instant free quote!`,
    headline: `Top-Rated ${trade} in ${cleanCity} | Free Estimates`,
    description: `★★★★★ 4.9 Stars · Licensed, Insured & Locally Owned`,
    callToAction: 'Get Quote',
    visualHook: 'Recent Verified Project in Your Neighborhood',
  };
}

/**
 * Generates banner copy for Google Display / YouTube Retargeting to recover bounced website visitors.
 */
export function generateRetargetingAdCopy(params: {
  businessName: string;
  trade: string;
  city: string;
}): RetargetingAdCopy {
  const { businessName, trade, city } = params;
  const cleanCity = (city || 'your area').replace(/,\s*[A-Z]{2}$/i, '').trim();

  return {
    headline: `Still Need ${trade} in ${cleanCity}?`,
    description: `Complete your estimate with ${businessName} this week and save. Guaranteed upfront pricing.`,
    offerBadge: '$250 Off Signed Estimate',
    cta: 'Claim Your Estimate',
  };
}

/**
 * Calculates total multi-channel budget with 15% platform management fee.
 */
export function calculateMultiChannelBudget(params: {
  searchSpendDollars: number;
  retargetingEnabled?: boolean;
  retargetingSpendDollars?: number;
  metaEnabled?: boolean;
  metaSpendDollars?: number;
}): MultiChannelBudget {
  const {
    searchSpendDollars = 600,
    retargetingEnabled = false,
    retargetingSpendDollars = 100,
    metaEnabled = false,
    metaSpendDollars = 200,
  } = params;

  const activeChannels: MultiChannelBudget['activeChannels'] = ['google_search'];
  let totalAdSpend = Math.max(100, searchSpendDollars);

  let activeRetargetingSpend = 0;
  if (retargetingEnabled) {
    activeRetargetingSpend = retargetingSpendDollars;
    totalAdSpend += activeRetargetingSpend;
    activeChannels.push('google_retargeting');
  }

  let activeMetaSpend = 0;
  if (metaEnabled) {
    activeMetaSpend = metaSpendDollars;
    totalAdSpend += activeMetaSpend;
    activeChannels.push('meta_social');
  }

  const platformFeeDollars = Math.round(totalAdSpend * AD_PLATFORM_FEE_RATE);
  const totalMonthlyDollars = totalAdSpend + platformFeeDollars;

  return {
    searchSpendDollars,
    retargetingSpendDollars: activeRetargetingSpend,
    metaSpendDollars: activeMetaSpend,
    totalAdSpendDollars: totalAdSpend,
    platformFeeDollars,
    totalMonthlyDollars,
    activeChannels,
  };
}
