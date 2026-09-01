export type AdCampaignBillingStatus =
  | 'inactive'
  | 'active'
  | 'paused'
  | 'past_due'
  | 'pending_provisioning'
  | 'failed';

export const AD_PLATFORM_FEE_RATE = 0.10; // 10% Platform Management Fee

export type AdWeeklyTierId = 'launch' | 'growth' | 'scale';

export type AdWeeklyTier = {
  id: AdWeeklyTierId;
  name: string;
  weeklyAmountDollars: number;
  weeklyAdSpendDollars: number;
  weeklyFeeDollars: number;
  weeklyAmountCents: number;
  weeklyAdSpendCents: number;
  weeklyFeeCents: number;
  monthlyBudgetCents: number;
  platformFeeCents: number;
  totalMonthlyCents: number;
  leadMin: number;
  leadMax: number;
  features: string[];
};

export const AD_WEEKLY_TIERS: Record<AdWeeklyTierId, AdWeeklyTier> = {
  launch: {
    id: 'launch',
    name: 'Launch Plan',
    weeklyAmountDollars: 176,
    weeklyAdSpendDollars: 160,
    weeklyFeeDollars: 16,
    weeklyAmountCents: 17600,
    weeklyAdSpendCents: 16000,
    weeklyFeeCents: 1600,
    monthlyBudgetCents: 69300,
    platformFeeCents: 6900,
    totalMonthlyCents: 76200,
    leadMin: 4,
    leadMax: 8,
    features: [
      'Google Search Ads (PPC)',
      '100+ Negative Waste Filters',
      'AI Smart Bidding & Geofencing',
      'Speed-to-Lead Auto-SMS',
    ],
  },
  growth: {
    id: 'growth',
    name: 'Growth Engine',
    weeklyAmountDollars: 330,
    weeklyAdSpendDollars: 300,
    weeklyFeeDollars: 30,
    weeklyAmountCents: 33000,
    weeklyAdSpendCents: 30000,
    weeklyFeeCents: 3000,
    monthlyBudgetCents: 130000,
    platformFeeCents: 13000,
    totalMonthlyCents: 143000,
    leadMin: 10,
    leadMax: 18,
    features: [
      'Google Search Ads (PPC)',
      'Lost Visitor Retargeting (Display)',
      '$250 Off Re-engagement Offer',
      'Weather Surge Radar Protection',
      'Neighborhood Halo 1-Mile Micro-Ads',
      'Speed-to-Lead Auto-SMS',
    ],
  },
  scale: {
    id: 'scale',
    name: 'Scale & Dominate',
    weeklyAmountDollars: 616,
    weeklyAdSpendDollars: 560,
    weeklyFeeDollars: 56,
    weeklyAmountCents: 61600,
    weeklyAdSpendCents: 56000,
    weeklyFeeCents: 5600,
    monthlyBudgetCents: 242700,
    platformFeeCents: 24300,
    totalMonthlyCents: 267000,
    leadMin: 22,
    leadMax: 38,
    features: [
      'Google Search Ads (PPC)',
      'Facebook & Instagram Feed Ads',
      'Lost Visitor Retargeting',
      'Neighborhood Halo 1-Mile Micro-Ads',
      'Priority Multi-Channel Bidding',
      'Closed-Loop Offline Revenue Sync',
    ],
  },
};

export function resolveAdWeeklyTier(tierOrAmount: string | number | undefined): AdWeeklyTier {
  if (typeof tierOrAmount === 'string') {
    const normalized = tierOrAmount.toLowerCase().trim();
    if (normalized === 'launch' || normalized === 'starter') return AD_WEEKLY_TIERS.launch;
    if (normalized === 'growth' || normalized === 'standard') return AD_WEEKLY_TIERS.growth;
    if (normalized === 'scale' || normalized === 'dominate') return AD_WEEKLY_TIERS.scale;
  }
  if (typeof tierOrAmount === 'number') {
    if (tierOrAmount === 176 || tierOrAmount === 160 || tierOrAmount === 185) return AD_WEEKLY_TIERS.launch;
    if (tierOrAmount === 330 || tierOrAmount === 300 || tierOrAmount === 345) return AD_WEEKLY_TIERS.growth;
    if (tierOrAmount === 616 || tierOrAmount === 560 || tierOrAmount === 645) return AD_WEEKLY_TIERS.scale;
  }
  // Default to Growth Engine if unspecified
  if (tierOrAmount === undefined || tierOrAmount === '') {
    return AD_WEEKLY_TIERS.growth;
  }
  throw new Error(`Invalid weekly ad budget tier: ${tierOrAmount}. Allowed tiers: launch ($176/wk), growth ($330/wk), scale ($616/wk).`);
}

export const ALLOWED_WALLET_DEPOSIT_DOLLARS = [250, 500, 1000] as const;
export const ALLOWED_WALLET_THRESHOLD_DOLLARS = [50, 75, 100, 150, 300] as const;
export const ALLOWED_WALLET_REFILL_DOLLARS = [250, 500, 1000] as const;
export const ALLOWED_WALLET_MAX_SPEND_DOLLARS = [750, 1000, 1500, 2500, 5000] as const;

export const ALLOWED_MONTHLY_BUDGET_DOLLARS = [600, 1200, 2500, 5000] as const;

export type AdBudgetBreakdown = {
  adSpendDollars: number;
  platformFeeDollars: number;
  totalMonthlyDollars: number;
  feeRatePct: number;
};

export function calculateAdBudgetBreakdown(adSpendDollars: number): AdBudgetBreakdown {
  const adSpend = Math.max(100, adSpendDollars);
  const platformFeeDollars = Math.round(adSpend * AD_PLATFORM_FEE_RATE);
  return {
    adSpendDollars: adSpend,
    platformFeeDollars,
    totalMonthlyDollars: adSpend + platformFeeDollars,
    feeRatePct: 10,
  };
}

export type AdFundingModel = 'weekly_drip' | 'auto_refill_wallet' | 'monthly_fixed';

export type AutoRefillWalletConfig = {
  depositAmountDollars: number;
  refillThresholdDollars: number;
  refillAmountDollars: number;
  maxMonthlySpendDollars: number;
};

export const DEFAULT_AUTO_REFILL_CONFIG: AutoRefillWalletConfig = {
  depositAmountDollars: 250,
  refillThresholdDollars: 75,
  refillAmountDollars: 250,
  maxMonthlySpendDollars: 1000,
};

export function validateWalletConfig(params: {
  depositAmountDollars?: number;
  refillThresholdDollars?: number;
  refillAmountDollars?: number;
  maxMonthlySpendDollars?: number;
}): {
  depositAmountDollars: number;
  refillThresholdDollars: number;
  refillAmountDollars: number;
  maxMonthlySpendDollars: number;
  adSpendDollars: number;
  feeDollars: number;
  totalDollars: number;
} {
  const deposit = params.depositAmountDollars !== undefined ? params.depositAmountDollars : DEFAULT_AUTO_REFILL_CONFIG.depositAmountDollars;
  const threshold = params.refillThresholdDollars !== undefined ? params.refillThresholdDollars : DEFAULT_AUTO_REFILL_CONFIG.refillThresholdDollars;
  const refill = params.refillAmountDollars !== undefined ? params.refillAmountDollars : DEFAULT_AUTO_REFILL_CONFIG.refillAmountDollars;
  const maxMonthly = params.maxMonthlySpendDollars !== undefined ? params.maxMonthlySpendDollars : DEFAULT_AUTO_REFILL_CONFIG.maxMonthlySpendDollars;

  if (!ALLOWED_WALLET_DEPOSIT_DOLLARS.includes(deposit as (typeof ALLOWED_WALLET_DEPOSIT_DOLLARS)[number])) {
    throw new Error(`Invalid deposit amount: $${deposit}. Allowed: ${ALLOWED_WALLET_DEPOSIT_DOLLARS.join(', ')}.`);
  }
  if (!ALLOWED_WALLET_THRESHOLD_DOLLARS.includes(threshold as (typeof ALLOWED_WALLET_THRESHOLD_DOLLARS)[number])) {
    throw new Error(`Invalid refill threshold: $${threshold}. Allowed: ${ALLOWED_WALLET_THRESHOLD_DOLLARS.join(', ')}.`);
  }
  if (!ALLOWED_WALLET_REFILL_DOLLARS.includes(refill as (typeof ALLOWED_WALLET_REFILL_DOLLARS)[number])) {
    throw new Error(`Invalid refill amount: $${refill}. Allowed: ${ALLOWED_WALLET_REFILL_DOLLARS.join(', ')}.`);
  }
  if (!ALLOWED_WALLET_MAX_SPEND_DOLLARS.includes(maxMonthly as (typeof ALLOWED_WALLET_MAX_SPEND_DOLLARS)[number])) {
    throw new Error(`Invalid max monthly spend cap: $${maxMonthly}. Allowed: ${ALLOWED_WALLET_MAX_SPEND_DOLLARS.join(', ')}.`);
  }


  const feeDollars = Math.round(deposit * AD_PLATFORM_FEE_RATE);
  const totalDollars = deposit + feeDollars;

  return {
    depositAmountDollars: deposit,
    refillThresholdDollars: threshold,
    refillAmountDollars: refill,
    maxMonthlySpendDollars: maxMonthly,
    adSpendDollars: deposit,
    feeDollars,
    totalDollars,
  };
}

export function checkAutoRefillTrigger(params: {
  currentBalanceDollars: number;
  spentThisMonthDollars: number;
  config: AutoRefillWalletConfig;
  nextRefillRetryAt?: string | null;
}): {
  shouldRefill: boolean;
  reason?: string;
  refillAmountDollars: number;
} {
  const { currentBalanceDollars, spentThisMonthDollars, config, nextRefillRetryAt } = params;

  if (nextRefillRetryAt && new Date(nextRefillRetryAt).getTime() > Date.now()) {
    return {
      shouldRefill: false,
      reason: `Automated refill retry is paced until ${nextRefillRetryAt} after previous payment failure.`,
      refillAmountDollars: 0,
    };
  }

  if (currentBalanceDollars > config.refillThresholdDollars) {
    return {
      shouldRefill: false,
      reason: `Balance ($${currentBalanceDollars.toFixed(2)}) is above trigger threshold ($${config.refillThresholdDollars}).`,
      refillAmountDollars: 0,
    };
  }

  const remainingMonthlyAllowance = config.maxMonthlySpendDollars - spentThisMonthDollars;
  if (remainingMonthlyAllowance <= 0) {
    return {
      shouldRefill: false,
      reason: `Max monthly spend cap of $${config.maxMonthlySpendDollars} reached for this month.`,
      refillAmountDollars: 0,
    };
  }

  const refillAmount = Math.min(config.refillAmountDollars, remainingMonthlyAllowance);
  return {
    shouldRefill: true,
    reason: `Balance ($${currentBalanceDollars.toFixed(2)}) dropped below $${config.refillThresholdDollars}. Auto-refilling $${refillAmount}.`,
    refillAmountDollars: refillAmount,
  };
}

/**
 * Enforces the contractor's explicit monthly spend cap circuit breaker.
 * If spend this month reaches or exceeds the cap, bidding is automatically paused.
 */
export function enforceMonthlySpendHardCap(params: {
  spentThisMonthDollars: number;
  maxMonthlySpendDollars: number;
}): {
  isHardCapReached: boolean;
  remainingAllowanceDollars: number;
  reason?: string;
} {
  const { spentThisMonthDollars, maxMonthlySpendDollars } = params;
  const remainingAllowanceDollars = Math.max(0, maxMonthlySpendDollars - spentThisMonthDollars);
  const isHardCapReached = spentThisMonthDollars >= maxMonthlySpendDollars;

  return {
    isHardCapReached,
    remainingAllowanceDollars,
    reason: isHardCapReached
      ? `Monthly ad spend hard-cap of $${maxMonthlySpendDollars.toFixed(2)} has been reached ($${spentThisMonthDollars.toFixed(2)} spent this month). Campaign bidding paused.`
      : undefined,
  };
}

export type TradeBiddingProfile = {
  trade: string;
  targetCpaDollars: number;
  minCpcDollars: number;
  maxCpcDollars: number;
  avgCpcDollars: number;
  expectedConvRatePct: number;
  highIntentSearchTerms: string[];
};

export function getTradeBiddingProfile(trade?: string | null): TradeBiddingProfile {
  const normalized = (trade || '').toLowerCase().trim();
  if (normalized.includes('roof')) {
    return {
      trade: 'Roofing',
      targetCpaDollars: 75,
      minCpcDollars: 6.5,
      maxCpcDollars: 14.0,
      avgCpcDollars: 8.5,
      expectedConvRatePct: 11.3,
      highIntentSearchTerms: ['roof replacement cost', 'emergency roof leak repair', 'best roofer near me'],
    };
  }
  if (normalized.includes('plumb')) {
    return {
      trade: 'Plumbing',
      targetCpaDollars: 45,
      minCpcDollars: 5.0,
      maxCpcDollars: 11.5,
      avgCpcDollars: 7.2,
      expectedConvRatePct: 16.0,
      highIntentSearchTerms: ['emergency plumber near me', 'water heater replacement', 'clogged drain repair'],
    };
  }
  if (normalized.includes('hvac') || normalized.includes('heat') || normalized.includes('air') || normalized.includes('cool')) {
    return {
      trade: 'HVAC',
      targetCpaDollars: 55,
      minCpcDollars: 5.5,
      maxCpcDollars: 12.0,
      avgCpcDollars: 8.0,
      expectedConvRatePct: 14.5,
      highIntentSearchTerms: ['ac repair service', 'furnace installation quote', 'hvac replacement cost'],
    };
  }
  if (normalized.includes('electr')) {
    return {
      trade: 'Electrical',
      targetCpaDollars: 40,
      minCpcDollars: 4.5,
      maxCpcDollars: 9.5,
      avgCpcDollars: 6.5,
      expectedConvRatePct: 16.2,
      highIntentSearchTerms: ['licensed electrician near me', 'panel upgrade cost', 'emergency electrical repair'],
    };
  }
  if (normalized.includes('paint')) {
    return {
      trade: 'Painting',
      targetCpaDollars: 35,
      minCpcDollars: 3.0,
      maxCpcDollars: 7.0,
      avgCpcDollars: 4.5,
      expectedConvRatePct: 12.8,
      highIntentSearchTerms: ['exterior house painter', 'interior painting estimate', 'cabinet painting cost'],
    };
  }
  if (normalized.includes('landscap') || normalized.includes('lawn') || normalized.includes('tree')) {
    return {
      trade: 'Landscaping & Tree Care',
      targetCpaDollars: 30,
      minCpcDollars: 2.5,
      maxCpcDollars: 5.5,
      avgCpcDollars: 3.5,
      expectedConvRatePct: 11.7,
      highIntentSearchTerms: ['tree removal service', 'lawn care maintenance', 'hardscape patio contractor'],
    };
  }
  if (normalized.includes('concrete') || normalized.includes('paving') || normalized.includes('mason')) {
    return {
      trade: 'Concrete & Masonry',
      targetCpaDollars: 60,
      minCpcDollars: 4.5,
      maxCpcDollars: 10.0,
      avgCpcDollars: 6.8,
      expectedConvRatePct: 11.3,
      highIntentSearchTerms: ['driveway replacement cost', 'concrete patio contractor', 'retaining wall installation'],
    };
  }
  return {
    trade: trade || 'Contractor',
    targetCpaDollars: 50,
    minCpcDollars: 4.0,
    maxCpcDollars: 9.0,
    avgCpcDollars: 6.0,
    expectedConvRatePct: 12.0,
    highIntentSearchTerms: ['contractor near me', 'free estimate contractor', 'licensed local contractor'],
  };
}

export type MultiChannelBudgetAllocation = {
  totalMonthlyBudgetDollars: number;
  googleSearchPpcDollars: number;
  metaRetargetingDollars: number;
  neighborhoodMicroAdsDollars: number;
  googleSearchPpcPct: number;
  metaRetargetingPct: number;
  neighborhoodMicroAdsPct: number;
};

export function calculateMultiChannelAllocation(monthlyBudgetDollars: number): MultiChannelBudgetAllocation {
  const total = Math.max(100, monthlyBudgetDollars);
  const googleSearchPpcDollars = Math.round(total * 0.70);
  const metaRetargetingDollars = Math.round(total * 0.20);
  const neighborhoodMicroAdsDollars = total - googleSearchPpcDollars - metaRetargetingDollars;

  return {
    totalMonthlyBudgetDollars: total,
    googleSearchPpcDollars,
    metaRetargetingDollars,
    neighborhoodMicroAdsDollars,
    googleSearchPpcPct: 70,
    metaRetargetingPct: 20,
    neighborhoodMicroAdsPct: 10,
  };
}

export type AdSpendDailyEntry = {
  date: string; // YYYY-MM-DD
  spendCents: number;
  clicks: number;
  impressions: number;
  conversions: number;
  source: 'google_ads_api' | 'meta_ads_api' | 'scheduled_pacing';
  recordedAt: string;
};

export type AdBudgetWalletState = {
  status: AdCampaignBillingStatus;
  fundingModel?: AdFundingModel;
  monthlyBudgetCents: number;
  platformFeeCents: number;
  totalMonthlyCents: number;
  weeklyBudgetCents?: number;
  weeklyAmountCents?: number;
  walletBalanceCents?: number;
  refillThresholdCents?: number;
  refillAmountCents?: number;
  maxMonthlySpendCents?: number;
  targetCpaDollars?: number;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  lastPaymentAt: string | null;
  lastPaymentError: string | null;
  failedRefillAttempts?: number;
  nextRefillRetryAt?: string | null;
  recoveryUrl?: string | null;
  spendThisMonthCents: number;
  totalSpendAllTimeCents?: number;
  lastSpendSyncAt?: string | null;
  dailySpendHistory?: AdSpendDailyEntry[];
  smsAlertsEnabled?: boolean;
  smsAlertPhone?: string | null;
  lastUpcomingPaymentAlertAt?: string | null;
  googleCampaignId?: string | null;
  googleCampaignResource?: string | null;
  provisioningStatus?: 'active' | 'paused' | 'simulated' | 'pending' | 'failed' | 'unconfigured';
  provisioningMessage?: string | null;
  landingPageUrl?: string | null;
  pendingRefillIdempotencyKey?: string | null;
  pendingRefillAmountCents?: number | null;
  pendingRefillFeeCents?: number | null;
  pendingRefillCreatedAt?: string | null;
  lastRefillPaymentIntentId?: string | null;
  processedRefillPaymentIntentIds?: string[];
};

export const DEFAULT_AD_WALLET_STATE: AdBudgetWalletState = {
  status: 'inactive',
  fundingModel: 'weekly_drip',
  monthlyBudgetCents: 60000, // $600/mo
  platformFeeCents: 0, // Zero fee default
  totalMonthlyCents: 60000,
  weeklyBudgetCents: 16000,
  weeklyAmountCents: 17600,
  walletBalanceCents: 25000,
  refillThresholdCents: 7500,
  refillAmountCents: 25000,
  maxMonthlySpendCents: 100000,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  lastPaymentAt: null,
  lastPaymentError: null,
  spendThisMonthCents: 0,
  totalSpendAllTimeCents: 0,
  lastSpendSyncAt: null,
  dailySpendHistory: [],
  smsAlertsEnabled: true,
  smsAlertPhone: null,
  lastUpcomingPaymentAlertAt: null,
  googleCampaignId: null,
  googleCampaignResource: null,
  provisioningStatus: 'pending',
  provisioningMessage: null,
  landingPageUrl: null,
  pendingRefillIdempotencyKey: null,
  pendingRefillAmountCents: null,
  pendingRefillFeeCents: null,
  pendingRefillCreatedAt: null,
  lastRefillPaymentIntentId: null,
  processedRefillPaymentIntentIds: [],
};

/**
 * Validates and sanitizes a return URL, ensuring it is either a relative path
 * (e.g. /dashboard/marketing/ads) or belongs strictly to an authorized origin.
 * Rejects external / untrusted / protocol-relative URLs.
 */
export function validateAdReturnUrl(returnUrl?: string): string {
  const fallback = '/dashboard/marketing/ads';
  if (!returnUrl || typeof returnUrl !== 'string') return fallback;
  const trimmed = returnUrl.trim();
  if (!trimmed) return fallback;

  // Relative paths starting with / (excluding protocol-relative //)
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return trimmed;
  }

  // Absolute URLs matching allowed hosts
  try {
    const parsed = new URL(trimmed);
    const allowedHosts = [
      'app.letsgetquoted.com',
      'letsgetquoted.com',
      'www.letsgetquoted.com',
      'localhost',
      '127.0.0.1',
    ];
    if (process.env.NEXT_PUBLIC_APP_URL) {
      try {
        allowedHosts.push(new URL(process.env.NEXT_PUBLIC_APP_URL).hostname);
      } catch {
        // ignore malformed env URL
      }
    }
    if (
      allowedHosts.includes(parsed.hostname) ||
      parsed.hostname.endsWith('.letsgetquoted.com')
    ) {
      return trimmed;
    }
  } catch {
    return fallback;
  }

  return fallback;
}

/**
 * Sanitizes and validates phone numbers for ad alerts, stripping non-numeric
 * characters while preserving leading + and enforcing 10 to 16 digit limits.
 */
export function sanitizeAdAlertPhone(phone?: string | null): string | null {
  if (!phone || typeof phone !== 'string') return null;
  const cleaned = phone.replace(/[^\d+]/g, '');
  const digitsOnly = cleaned.replace(/\D/g, '');
  if (digitsOnly.length < 10 || digitsOnly.length > 15) return null;
  return cleaned;
}

