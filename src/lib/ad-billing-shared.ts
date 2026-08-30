export type AdCampaignBillingStatus =
  | 'inactive'
  | 'active'
  | 'paused'
  | 'past_due'
  | 'pending_provisioning'
  | 'failed';

export const AD_PLATFORM_FEE_RATE = 0.10; // 10% Platform Management Fee

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

export function checkAutoRefillTrigger(params: {
  currentBalanceDollars: number;
  spentThisMonthDollars: number;
  config: AutoRefillWalletConfig;
}): {
  shouldRefill: boolean;
  reason?: string;
  refillAmountDollars: number;
} {
  const { currentBalanceDollars, spentThisMonthDollars, config } = params;

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
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  lastPaymentAt: string | null;
  lastPaymentError: string | null;
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
};
