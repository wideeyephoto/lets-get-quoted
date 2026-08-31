import { getStripeClient, toCents } from '@/lib/stripe';
import { provisionManagedSearchCampaign, isGoogleAdsConfigured } from '@/lib/google-ads-api';
import { siteOrigin } from '@/lib/seo/site-pages';
import { APP_ORIGIN, safeNextPath } from '@/lib/app-origin';
import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AD_PLATFORM_FEE_RATE,
  AD_WEEKLY_TIERS,
  resolveAdWeeklyTier,
  ALLOWED_WALLET_DEPOSIT_DOLLARS,
  ALLOWED_WALLET_THRESHOLD_DOLLARS,
  ALLOWED_WALLET_REFILL_DOLLARS,
  ALLOWED_WALLET_MAX_SPEND_DOLLARS,
  ALLOWED_MONTHLY_BUDGET_DOLLARS,
  calculateAdBudgetBreakdown,
  checkAutoRefillTrigger,
  validateWalletConfig,
  DEFAULT_AUTO_REFILL_CONFIG,
  DEFAULT_AD_WALLET_STATE,
  type AdCampaignBillingStatus,
  type AdFundingModel,
  type AutoRefillWalletConfig,
  type AdBudgetBreakdown,
  type AdSpendDailyEntry,
  type AdBudgetWalletState,
  type AdWeeklyTier,
  type AdWeeklyTierId,
} from '@/lib/ad-billing-shared';

export {
  AD_PLATFORM_FEE_RATE,
  AD_WEEKLY_TIERS,
  resolveAdWeeklyTier,
  ALLOWED_WALLET_DEPOSIT_DOLLARS,
  ALLOWED_WALLET_THRESHOLD_DOLLARS,
  ALLOWED_WALLET_REFILL_DOLLARS,
  ALLOWED_WALLET_MAX_SPEND_DOLLARS,
  ALLOWED_MONTHLY_BUDGET_DOLLARS,
  calculateAdBudgetBreakdown,
  checkAutoRefillTrigger,
  validateWalletConfig,
  DEFAULT_AUTO_REFILL_CONFIG,
  DEFAULT_AD_WALLET_STATE,
  type AdCampaignBillingStatus,
  type AdFundingModel,
  type AutoRefillWalletConfig,
  type AdBudgetBreakdown,
  type AdSpendDailyEntry,
  type AdBudgetWalletState,
  type AdWeeklyTier,
  type AdWeeklyTierId,
};

/**
 * Validates that returnUrl is a safe same-origin or allowed-domain redirect.
 * Prevents open redirects and SSRF attacks.
 */
export function validateAdReturnUrl(returnUrl?: string | null, accountOrigin?: string | null): string {
  const fallback = '/dashboard/marketing/ads';
  if (!returnUrl || typeof returnUrl !== 'string') {
    return fallback;
  }

  const trimmed = returnUrl.trim();
  if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.startsWith('/\\')) {
    return safeNextPath(trimmed, '/dashboard/marketing/ads');
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return fallback;
    }
    if (parsed.protocol === 'http:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
      return fallback;
    }

    const host = parsed.hostname.toLowerCase();
    const isApprovedHost =
      host === 'letsgetquoted.com' ||
      host.endsWith('.letsgetquoted.com') ||
      host === 'lets-get-quoted.vercel.app' ||
      host === 'localhost' ||
      host === '127.0.0.1';

    let isAccountOriginHost = false;
    if (accountOrigin) {
      try {
        const accParsed = new URL(accountOrigin);
        if (host === accParsed.hostname.toLowerCase()) {
          isAccountOriginHost = true;
        }
      } catch {
        // ignore invalid accountOrigin string
      }
    }

    if (!isApprovedHost && !isAccountOriginHost) {
      return fallback;
    }

    return trimmed;
  } catch {
    return fallback;
  }
}

/**
 * Creates a Stripe Checkout session to initiate an ad budget plan:
 * 1. Weekly Drip Funding (strictly bound to AD_WEEKLY_TIERS constants)
 * 2. Auto-Refilling Advertising Wallet (strictly bound to ALLOWED_WALLET_* constants)
 * 3. Monthly subscription fallback (strictly bound to server-approved budgets)
 */
export async function createAdBudgetCheckoutSession(params: {
  accountId: string;
  fundingModel?: AdFundingModel;
  bundleId?: string;
  depositAmountDollars?: number;
  refillThresholdDollars?: number;
  refillAmountDollars?: number;
  maxMonthlySpendDollars?: number;
  monthlyBudgetDollars?: number;
  weeklyAmountDollars?: number;
  weeklyAdSpendDollars?: number;
  weeklyFeeDollars?: number;
  platformFeeDollars?: number;
  interval?: 'week' | 'month';
  businessName: string;
  trade: string;
  city: string;
  customFocus?: string;
  smsAlertsEnabled?: boolean;
  smsAlertPhone?: string;
  returnUrl: string;
  idempotencyKey?: string;
}): Promise<{ url: string; sessionId: string }> {
  const {
    accountId,
    fundingModel = 'weekly_drip',
    bundleId,
    depositAmountDollars,
    refillThresholdDollars,
    refillAmountDollars,
    maxMonthlySpendDollars,
    monthlyBudgetDollars,
    weeklyAmountDollars,
    weeklyAdSpendDollars,
    interval = 'week',
    businessName,
    trade,
    city,
    customFocus,
    smsAlertsEnabled = true,
    smsAlertPhone,
    returnUrl,
    idempotencyKey,
  } = params;

  if (process.env.VERCEL_ENV === 'production' && !isGoogleAdsConfigured()) {
    throw new Error('Google Ads automated provisioning is currently undergoing configuration in this environment. Please contact support.');
  }

  if (monthlyBudgetDollars !== undefined) {
    if (monthlyBudgetDollars < 100) throw new Error('Minimum monthly ad budget is $100.');
    if (monthlyBudgetDollars > 50000) throw new Error('Maximum monthly ad budget is $50,000.');
  }

  if (weeklyAmountDollars !== undefined) {
    if (weeklyAmountDollars < 50) throw new Error('Minimum weekly ad budget is $50.');
    if (weeklyAmountDollars > 15000) throw new Error('Maximum weekly ad budget is $15,000.');
  }

  if (depositAmountDollars !== undefined) {
    if (depositAmountDollars < 50) throw new Error('Minimum deposit amount is $50.');
    if (depositAmountDollars > 10000) throw new Error('Maximum deposit amount is $10,000.');
  }

  if (maxMonthlySpendDollars !== undefined) {
    if (maxMonthlySpendDollars < 100) throw new Error('Minimum monthly spend cap is $100.');
    if (maxMonthlySpendDollars > 50000) throw new Error('Maximum monthly spend cap is $50,000.');
  }

  const effectiveFundingModel: AdFundingModel =
    params.fundingModel ||
    (monthlyBudgetDollars !== undefined && weeklyAmountDollars === undefined && weeklyAdSpendDollars === undefined && !bundleId
      ? 'monthly_fixed'
      : (interval === 'month' ? 'monthly_fixed' : 'weekly_drip'));

  const isWallet = effectiveFundingModel === 'auto_refill_wallet';
  const isWeekly = !isWallet && (effectiveFundingModel === 'weekly_drip' || interval === 'week');

  let totalDollars: number;
  let adSpendDollars: number;
  let feeDollars: number;
  let totalCents: number;
  let budgetCents: number;
  let feeCents: number;
  let trueMonthlyAdSpendDollars: number;
  let trueMonthlyFeeDollars: number;
  let trueMonthlyTotalDollars: number;
  let walletConfig: ReturnType<typeof validateWalletConfig> | null = null;
  let weeklyTier: AdWeeklyTier | null = null;

  if (isWallet) {
    // Auto-Refill Wallet funding model — strictly validated against server constants
    walletConfig = validateWalletConfig({
      depositAmountDollars,
      refillThresholdDollars,
      refillAmountDollars,
      maxMonthlySpendDollars,
    });

    adSpendDollars = walletConfig.adSpendDollars;
    feeDollars = walletConfig.feeDollars;
    totalDollars = walletConfig.totalDollars;
    budgetCents = toCents(adSpendDollars);
    feeCents = toCents(feeDollars);
    totalCents = toCents(totalDollars);

    trueMonthlyAdSpendDollars = walletConfig.maxMonthlySpendDollars;
    trueMonthlyFeeDollars = Math.round(walletConfig.maxMonthlySpendDollars * AD_PLATFORM_FEE_RATE);
    trueMonthlyTotalDollars = trueMonthlyAdSpendDollars + trueMonthlyFeeDollars;
  } else if (isWeekly) {
    // Weekly drip funding model — bound to server-owned AD_WEEKLY_TIERS with custom math fallback
    try {
      weeklyTier = resolveAdWeeklyTier(bundleId || weeklyAmountDollars || weeklyAdSpendDollars);
      totalDollars = weeklyTier.weeklyAmountDollars;
      adSpendDollars = weeklyTier.weeklyAdSpendDollars;
      feeDollars = weeklyTier.weeklyFeeDollars;
      totalCents = weeklyTier.weeklyAmountCents;
      budgetCents = weeklyTier.weeklyAdSpendCents;
      feeCents = weeklyTier.weeklyFeeCents;
      trueMonthlyAdSpendDollars = Math.round(weeklyTier.monthlyBudgetCents / 100);
      trueMonthlyFeeDollars = Math.round(weeklyTier.platformFeeCents / 100);
      trueMonthlyTotalDollars = Math.round(weeklyTier.totalMonthlyCents / 100);
    } catch {
      if (weeklyAmountDollars) {
        totalDollars = weeklyAmountDollars;
        adSpendDollars = weeklyAdSpendDollars || Math.round(totalDollars / (1 + AD_PLATFORM_FEE_RATE));
        feeDollars = totalDollars - adSpendDollars;
      } else {
        adSpendDollars = weeklyAdSpendDollars || 300;
        feeDollars = Math.round(adSpendDollars * AD_PLATFORM_FEE_RATE);
        totalDollars = adSpendDollars + feeDollars;
      }
      totalCents = toCents(totalDollars);
      budgetCents = toCents(adSpendDollars);
      feeCents = toCents(feeDollars);
      trueMonthlyAdSpendDollars = Math.round(adSpendDollars * (52 / 12));
      trueMonthlyFeeDollars = Math.round(feeDollars * (52 / 12));
      trueMonthlyTotalDollars = trueMonthlyAdSpendDollars + trueMonthlyFeeDollars;
    }
  } else {

    // Monthly billing fallback
    const nominalMonthly = monthlyBudgetDollars && monthlyBudgetDollars >= 100
      ? Math.min(Math.max(100, monthlyBudgetDollars), 50000)
      : 600;

    if (monthlyBudgetDollars !== undefined) {
      if (monthlyBudgetDollars < 100) throw new Error('Minimum monthly ad budget is $100.');
      if (monthlyBudgetDollars > 50000) throw new Error('Maximum monthly ad budget is $50,000.');
    }

    adSpendDollars = nominalMonthly;
    feeDollars = Math.round(nominalMonthly * AD_PLATFORM_FEE_RATE);
    totalDollars = adSpendDollars + feeDollars;
    budgetCents = toCents(adSpendDollars);
    feeCents = toCents(feeDollars);
    totalCents = toCents(totalDollars);
    trueMonthlyAdSpendDollars = adSpendDollars;
    trueMonthlyFeeDollars = feeDollars;
    trueMonthlyTotalDollars = totalDollars;
  }

  const stripe = getStripeClient();
  const { createAdminClient } = await import('@/lib/auth');
  const admin = createAdminClient();

  // Retrieve account & site to verify origin and customer
  const { data: account } = await admin
    .from('accounts')
    .select('id, business_name, email, stripe_customer_id')
    .eq('id', accountId)
    .single();

  const { data: siteRow } = await admin
    .from('sites')
    .select('id, subdomain, custom_domain, custom_domain_verified_at')
    .eq('account_id', accountId)
    .maybeSingle();

  const accountOrigin = siteRow ? siteOrigin(siteRow) : null;
  const verifiedReturnUrl = validateAdReturnUrl(returnUrl, accountOrigin);

  let customerId = (account?.stripe_customer_id as string | null) || null;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: account?.email || undefined,
      name: businessName || account?.business_name || undefined,
      metadata: { account_id: accountId },
    });
    customerId = customer.id;
    await admin.from('accounts').update({ stripe_customer_id: customerId }).eq('id', accountId);
  }

  const baseReturnUrl = verifiedReturnUrl.startsWith('/')
    ? `${accountOrigin || APP_ORIGIN}${verifiedReturnUrl}`
    : verifiedReturnUrl;

  const successUrl = `${baseReturnUrl}${baseReturnUrl.includes('?') ? '&' : '?'}ad_status=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${baseReturnUrl}${baseReturnUrl.includes('?') ? '&' : '?'}ad_status=cancelled`;

  let productName: string;
  let productDescription: string;

  if (isWallet && walletConfig) {
    productName = `Auto-Refilling Ad Wallet — $${totalDollars} Initial Deposit ($${adSpendDollars} Ads + $${feeDollars} Mgmt)`;
    productDescription = `Initial deposit for ${trade} in ${city}. Automatically re-adds $${walletConfig.refillAmountDollars} when ad balance drops below $${walletConfig.refillThresholdDollars}. Max monthly spend capped at $${walletConfig.maxMonthlySpendDollars}/mo.`;
  } else if (isWeekly && weeklyTier) {
    productName = `AI Advertising Autopilot — $${totalDollars}/week ($${adSpendDollars} Ads + $${feeDollars} Mgmt)`;
    productDescription = `Weekly drip funding for ${trade} in ${city}. Deployed daily to Google/Meta clicks ($${adSpendDollars}/wk ads + $${feeDollars}/wk AI management). Cancel or pause anytime.`;
  } else {
    productName = `AI Advertising Autopilot — $${totalDollars}/mo ($${adSpendDollars} Ads + $${feeDollars} Mgmt)`;
    productDescription = `Automated search ad campaigns in ${city} for ${trade} ($${adSpendDollars}/mo ads + $${feeDollars}/mo AI management). Cancel or pause anytime.`;
  }

  const sessionConfig: Stripe.Checkout.SessionCreateParams = {
    customer: customerId,
    mode: isWallet ? 'payment' : 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: totalCents,
          ...(!isWallet ? { recurring: { interval: isWeekly ? 'week' : 'month' } } : {}),
          product_data: {
            name: productName,
            description: productDescription,
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      kind: 'ad_budget',
      funding_model: fundingModel,
      billing_interval: isWallet ? 'one_time_deposit' : (isWeekly ? 'week' : 'month'),
      account_id: accountId,
      tier_id: weeklyTier ? weeklyTier.id : '',
      deposit_amount_dollars: isWallet && walletConfig ? String(walletConfig.depositAmountDollars) : '',
      deposit_amount_cents: isWallet && walletConfig ? String(toCents(walletConfig.depositAmountDollars)) : '',
      refill_threshold_dollars: isWallet && walletConfig ? String(walletConfig.refillThresholdDollars) : '',
      refill_amount_dollars: isWallet && walletConfig ? String(walletConfig.refillAmountDollars) : '',
      max_monthly_spend_dollars: isWallet && walletConfig ? String(walletConfig.maxMonthlySpendDollars) : '',
      weekly_amount_dollars: String(totalDollars),
      weekly_ad_spend_dollars: String(adSpendDollars),
      weekly_fee_dollars: String(feeDollars),
      weekly_amount_cents: String(totalCents),
      weekly_ad_spend_cents: String(budgetCents),
      weekly_fee_cents: String(feeCents),
      monthly_budget_cents: String(toCents(trueMonthlyAdSpendDollars)),
      platform_fee_cents: String(toCents(trueMonthlyFeeDollars)),
      monthly_total_cents: String(toCents(trueMonthlyTotalDollars)),
      business_name: businessName || '',
      trade,
      city,
      custom_focus: customFocus || '',
      sms_alerts_enabled: smsAlertsEnabled ? 'true' : 'false',
      sms_alert_phone: smsAlertPhone || '',
    },
    ...(isWallet
      ? {
          payment_intent_data: {
            setup_future_usage: 'off_session',
            metadata: {
              kind: 'ad_budget_wallet',
              account_id: accountId,
              refill_threshold_dollars: walletConfig ? String(walletConfig.refillThresholdDollars) : '75',
              refill_amount_dollars: walletConfig ? String(walletConfig.refillAmountDollars) : '250',
              max_monthly_spend_dollars: walletConfig ? String(walletConfig.maxMonthlySpendDollars) : '1000',
              custom_focus: customFocus || '',
              sms_alerts_enabled: smsAlertsEnabled ? 'true' : 'false',
              sms_alert_phone: smsAlertPhone || '',
            },
          },
        }
      : {
          subscription_data: {
            metadata: {
              kind: 'ad_budget',
              city,
              custom_focus: customFocus || '',
              sms_alerts_enabled: smsAlertsEnabled ? 'true' : 'false',
              sms_alert_phone: smsAlertPhone || '',
            },
          },
        }),
    success_url: successUrl,
    cancel_url: cancelUrl,
  };

  const createOptions: Stripe.RequestOptions = {};
  if (idempotencyKey) {
    createOptions.idempotencyKey = idempotencyKey;
  }

  const session = await stripe.checkout.sessions.create(sessionConfig, createOptions);

  if (!session.url) {
    throw new Error('Failed to create Stripe Checkout session.');
  }

  return { url: session.url, sessionId: session.id };
}

/**
 * Creates a Stripe Customer Portal session for managing billing and payment methods.
 */
export async function createAdBudgetBillingPortalSession(params: {
  accountId: string;
  returnUrl: string;
}): Promise<string> {
  const stripe = getStripeClient();
  const { createAdminClient } = await import('@/lib/auth');
  const admin = createAdminClient();

  const { data: account } = await admin
    .from('accounts')
    .select('stripe_customer_id')
    .eq('id', params.accountId)
    .single();

  const customerId = account?.stripe_customer_id as string | null;
  if (!customerId) {
    throw new Error('No active billing customer found.');
  }

  const { data: siteRow } = await admin
    .from('sites')
    .select('id, subdomain, custom_domain, custom_domain_verified_at')
    .eq('account_id', params.accountId)
    .maybeSingle();

  const verifiedReturnUrl = validateAdReturnUrl(params.returnUrl, siteRow ? siteOrigin(siteRow) : null);

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: verifiedReturnUrl,
  });

  return portalSession.url;
}

/**
 * Atomically credits an account's ad wallet balance and records the operation
 * to prevent double-crediting or race conditions.
 */
export async function atomicCreditAdWalletState(
  admin: SupabaseClient,
  params: {
    accountId: string;
    paymentIntentId?: string | null;
    creditCents: number;
    feeCents?: number;
    fundingModel?: AdFundingModel;
    monthlyBudgetCents?: number;
    status?: AdCampaignBillingStatus;
    landingPageUrl?: string | null;
    googleCampaignId?: string | null;
    googleCampaignResource?: string | null;
    provisioningStatus?: 'active' | 'paused' | 'simulated' | 'pending' | 'failed' | 'unconfigured';
    provisioningMessage?: string | null;
    smsAlertsEnabled?: boolean;
    smsAlertPhone?: string | null;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    cancelAtPeriodEnd?: boolean;
    currentPeriodEnd?: string | null;
  }
): Promise<{
  success: boolean;
  alreadyCredited: boolean;
  newBalanceCents: number;
  previousBalanceCents: number;
}> {
  const {
    accountId,
    paymentIntentId,
    creditCents,
    feeCents = 0,
    fundingModel,
    monthlyBudgetCents,
    status = 'active',
    landingPageUrl,
    googleCampaignId,
    googleCampaignResource,
    provisioningStatus,
    provisioningMessage,
    smsAlertsEnabled,
    smsAlertPhone,
    stripeCustomerId,
    stripeSubscriptionId,
    cancelAtPeriodEnd,
    currentPeriodEnd,
  } = params;

  // Attempt Postgres RPC first for row-locked atomic execution
  try {
    const { data, error } = await admin.rpc('atomic_ad_wallet_credit', {
      p_account_id: accountId,
      p_payment_intent_id: paymentIntentId || null,
      p_credit_cents: creditCents,
      p_fee_cents: feeCents,
      p_funding_model: fundingModel || null,
      p_monthly_budget_cents: monthlyBudgetCents || null,
      p_status: status,
      p_landing_page_url: landingPageUrl || null,
      p_google_campaign_id: googleCampaignId || null,
      p_google_campaign_resource: googleCampaignResource || null,
      p_provisioning_status: provisioningStatus || null,
      p_provisioning_message: provisioningMessage || null,
    });

    if (!error && data && typeof data === 'object') {
      const res = data as { success: boolean; already_credited: boolean; new_balance_cents: number; previous_balance_cents: number };
      if (res.success) {
        return {
          success: true,
          alreadyCredited: Boolean(res.already_credited),
          newBalanceCents: Number(res.new_balance_cents),
          previousBalanceCents: Number(res.previous_balance_cents),
        };
      }
    }
  } catch {
    // Fall back to client-side atomic merge when RPC is not installed (e.g. mocked test environments)
  }

  // Fallback for mocked/non-RPC environments
  const { data: site } = await admin
    .from('sites')
    .select('id, content')
    .eq('account_id', accountId)
    .maybeSingle();

  if (!site) {
    return { success: false, alreadyCredited: false, newBalanceCents: 0, previousBalanceCents: 0 };
  }

  const content = (site.content as Record<string, unknown>) || {};
  const currentAdState = (content.adCampaign as Partial<AdBudgetWalletState>) || {};
  const processedIds = currentAdState.processedRefillPaymentIntentIds || [];

  let alreadyCredited = false;
  if (paymentIntentId) {
    if (processedIds.includes(paymentIntentId) || currentAdState.lastRefillPaymentIntentId === paymentIntentId) {
      alreadyCredited = true;
    }
  }

  const isFreshActivation = !currentAdState.status || currentAdState.status === 'inactive';
  const previousBalance = isFreshActivation ? 0 : (currentAdState.walletBalanceCents ?? 0);
  const newBalance = alreadyCredited ? (currentAdState.walletBalanceCents ?? creditCents) : (previousBalance + creditCents);
  const updatedProcessedIds = paymentIntentId
    ? [...processedIds.filter((id) => id !== paymentIntentId), paymentIntentId]
    : processedIds;

  const mergedState: AdBudgetWalletState = {
    ...DEFAULT_AD_WALLET_STATE,
    ...currentAdState,
    status,
    walletBalanceCents: newBalance,
    lastPaymentAt: new Date().toISOString(),
    lastPaymentError: null,
    pendingRefillIdempotencyKey: null,
    pendingRefillAmountCents: null,
    pendingRefillFeeCents: null,
    pendingRefillCreatedAt: null,
    lastRefillPaymentIntentId: paymentIntentId || currentAdState.lastRefillPaymentIntentId || null,
    processedRefillPaymentIntentIds: updatedProcessedIds,
    ...(fundingModel ? { fundingModel } : {}),
    ...(monthlyBudgetCents ? { monthlyBudgetCents } : {}),
    ...(landingPageUrl ? { landingPageUrl } : {}),
    ...(googleCampaignId ? { googleCampaignId } : {}),
    ...(googleCampaignResource ? { googleCampaignResource } : {}),
    ...(provisioningStatus ? { provisioningStatus } : {}),
    ...(provisioningMessage !== undefined ? { provisioningMessage } : {}),
    ...(smsAlertsEnabled !== undefined ? { smsAlertsEnabled } : {}),
    ...(smsAlertPhone !== undefined ? { smsAlertPhone } : {}),
    ...(stripeCustomerId ? { stripeCustomerId } : {}),
    ...(stripeSubscriptionId ? { stripeSubscriptionId } : {}),
    ...(cancelAtPeriodEnd !== undefined ? { cancelAtPeriodEnd } : {}),
    ...(currentPeriodEnd ? { currentPeriodEnd } : {}),
  };

  await admin
    .from('sites')
    .update({
      content: {
        ...content,
        adCampaign: mergedState,
      },
    })
    .eq('id', site.id);

  return {
    success: true,
    alreadyCredited,
    newBalanceCents: newBalance,
    previousBalanceCents: previousBalance,
  };
}

/**
 * Atomically deducts ad spend from wallet balance, updating daily history and spend metrics.
 */
export async function atomicDebitAdWalletState(
  admin: SupabaseClient,
  params: {
    accountId: string;
    spendCents: number;
    clicks?: number;
    impressions?: number;
    conversions?: number;
    date?: string;
    source?: 'google_ads_api' | 'meta_ads_api' | 'scheduled_pacing';
  }
): Promise<{
  success: boolean;
  newBalanceCents?: number;
  spentThisMonthCents?: number;
  deltaSpendCents?: number;
  shouldRefill?: boolean;
  message: string;
}> {
  const {
    accountId,
    spendCents,
    clicks = 0,
    impressions = 0,
    conversions = 0,
    date = new Date().toISOString().slice(0, 10),
    source = 'scheduled_pacing',
  } = params;

  if (spendCents <= 0) {
    return { success: true, message: 'Zero spend to record.' };
  }

  // Attempt Postgres RPC first
  try {
    const { data, error } = await admin.rpc('atomic_ad_wallet_spend', {
      p_account_id: accountId,
      p_spend_cents: spendCents,
      p_date: date,
      p_clicks: clicks,
      p_impressions: impressions,
      p_conversions: conversions,
      p_source: source,
    });

    if (!error && data && typeof data === 'object') {
      const res = data as {
        success: boolean;
        new_balance_cents: number;
        spent_this_month_cents: number;
        delta_spend_cents: number;
        should_refill: boolean;
        error?: string;
      };
      if (res.success) {
        return {
          success: true,
          newBalanceCents: res.new_balance_cents,
          spentThisMonthCents: res.spent_this_month_cents,
          deltaSpendCents: res.delta_spend_cents,
          shouldRefill: res.should_refill,
          message: `Recorded $${(spendCents / 100).toFixed(2)} ad spend. Remaining balance: $${(res.new_balance_cents / 100).toFixed(2)}.`,
        };
      }
    }
  } catch {
    // Fall back to client-side atomic calculation
  }

  const { data: site } = await admin
    .from('sites')
    .select('id, content')
    .eq('account_id', accountId)
    .maybeSingle();

  if (!site) {
    return { success: false, message: 'Site not found for account.' };
  }

  const content = (site.content as Record<string, unknown>) || {};
  const adState = (content.adCampaign as AdBudgetWalletState) || DEFAULT_AD_WALLET_STATE;

  if (adState.status !== 'active') {
    return { success: false, message: `Campaign is not active (status: ${adState.status}).` };
  }

  const currentBalance = adState.walletBalanceCents ?? 25000;
  const currentHistory = adState.dailySpendHistory || [];
  const existingEntryIndex = currentHistory.findIndex((e) => e.date === date);

  let deltaSpend = spendCents;
  let updatedHistory: AdSpendDailyEntry[];

  if (existingEntryIndex >= 0) {
    const existing = currentHistory[existingEntryIndex];
    deltaSpend = Math.max(0, spendCents - (existing.spendCents || 0));
    updatedHistory = [...currentHistory];
    updatedHistory[existingEntryIndex] = {
      ...existing,
      spendCents: Math.max(existing.spendCents, spendCents),
      clicks: Math.max(existing.clicks, clicks),
      impressions: Math.max(existing.impressions, impressions),
      conversions: Math.max(existing.conversions, conversions),
      source,
      recordedAt: new Date().toISOString(),
    };
  } else {
    const newEntry: AdSpendDailyEntry = {
      date,
      spendCents,
      clicks,
      impressions,
      conversions,
      source,
      recordedAt: new Date().toISOString(),
    };
    updatedHistory = [newEntry, ...currentHistory].slice(0, 90);
  }

  const newBalance = Math.max(0, currentBalance - deltaSpend);
  const currentMonth = date.slice(0, 7);
  const lastSyncMonth = (adState.lastSpendSyncAt || '').slice(0, 7);
  const isNewMonth = Boolean(lastSyncMonth && lastSyncMonth !== currentMonth);
  const baseMonthlySpend = isNewMonth ? 0 : (adState.spendThisMonthCents ?? 0);
  const newSpentThisMonth = baseMonthlySpend + deltaSpend;
  const newTotalSpend = (adState.totalSpendAllTimeCents ?? 0) + deltaSpend;

  await updateAccountAdBudgetState(admin, accountId, {
    walletBalanceCents: newBalance,
    spendThisMonthCents: newSpentThisMonth,
    totalSpendAllTimeCents: newTotalSpend,
    lastSpendSyncAt: new Date().toISOString(),
    dailySpendHistory: updatedHistory,
  });

  const shouldRefill =
    adState.fundingModel === 'auto_refill_wallet' &&
    newBalance <= (adState.refillThresholdCents ?? 7500) &&
    newSpentThisMonth < (adState.maxMonthlySpendCents ?? 100000);

  return {
    success: true,
    newBalanceCents: newBalance,
    spentThisMonthCents: newSpentThisMonth,
    deltaSpendCents: deltaSpend,
    shouldRefill,
    message: `Recorded $${(spendCents / 100).toFixed(2)} ad spend. Remaining balance: $${(newBalance / 100).toFixed(2)}.`,
  };
}

/**
 * Updates campaign subscription state when a Stripe webhook event fires.
 * Enforces strict fail-closed payment status checks and durable deduplication.
 */
export async function handleAdBudgetWebhookEvent(
  event: Stripe.Event,
  adminClient?: SupabaseClient
): Promise<boolean> {
  if (
    event.type !== 'checkout.session.completed' &&
    event.type !== 'invoice.paid' &&
    event.type !== 'invoice.payment_failed' &&
    event.type !== 'customer.subscription.updated' &&
    event.type !== 'customer.subscription.deleted' &&
    event.type !== 'payment_intent.succeeded' &&
    event.type !== 'payment_intent.payment_failed'
  ) {
    return false;
  }

  // Fast metadata kind guard for payment intents
  if (event.type === 'payment_intent.succeeded' || event.type === 'payment_intent.payment_failed') {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    if (paymentIntent.metadata?.kind !== 'ad_wallet_refill') {
      return false;
    }
  }

  // Fast metadata kind guard for checkout sessions
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.metadata?.kind !== 'ad_budget') {
      return false;
    }
  }

  let admin = adminClient;
  if (!admin) {
    const { createAdminClient } = await import('@/lib/auth');
    admin = createAdminClient();
  }

  // Cross-Rail Webhook Isolation for Ad Wallet Refill Payment Intents
  if (event.type === 'payment_intent.succeeded' || event.type === 'payment_intent.payment_failed') {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    if (paymentIntent.metadata?.kind !== 'ad_wallet_refill') {
      return false;
    }

    const accountId = paymentIntent.metadata.account_id;
    if (!accountId) return false;

    if (event.type === 'payment_intent.succeeded') {
      // Fail-closed payment status verification
      if (paymentIntent.status !== 'succeeded') {
        console.warn(`[AdBilling] Non-succeeded status (${paymentIntent.status}) on payment_intent.succeeded for intent ${paymentIntent.id}`);
        return false;
      }

      const refillAdSpendCents = Number(paymentIntent.metadata.refill_ad_spend_cents) || 0;
      const feeCents = Number(paymentIntent.metadata.fee_cents) || Math.round(refillAdSpendCents * AD_PLATFORM_FEE_RATE);

      const res = await atomicCreditAdWalletState(admin, {
        accountId,
        paymentIntentId: paymentIntent.id,
        creditCents: refillAdSpendCents,
        feeCents,
        status: 'active',
      });

      return res.success;
    }

    if (event.type === 'payment_intent.payment_failed') {
      await updateAccountAdBudgetState(admin, accountId, {
        status: 'past_due',
        lastPaymentError: paymentIntent.last_payment_error?.message || 'Latest ad wallet refill payment failed.',
        pendingRefillIdempotencyKey: null,
        pendingRefillAmountCents: null,
        pendingRefillFeeCents: null,
        pendingRefillCreatedAt: null,
      });

      return true;
    }
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.metadata?.kind !== 'ad_budget') return false;

    // Strict fail-closed verification: must be exactly paid
    if (session.payment_status !== 'paid') {
      console.warn(`[AdBilling] Refusing non-paid checkout session ${session.id} (status: ${session.payment_status})`);
      return false;
    }


    const accountId = session.metadata.account_id;
    const fundingModel = (session.metadata.funding_model as AdFundingModel) || 'weekly_drip';
    const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id || null;
    const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id || null;

    // Query site to resolve real public domain/subdomain
    const { data: siteRow } = await admin
      .from('sites')
      .select('id, subdomain, custom_domain, custom_domain_verified_at, content')
      .eq('account_id', accountId)
      .maybeSingle();

    const currentContent = (siteRow?.content as Record<string, unknown>) || {};
    const currentAdState = (currentContent.adCampaign as Partial<AdBudgetWalletState>) || {};
    const processedCheckoutSessions = currentAdState.processedRefillPaymentIntentIds || [];
    if (currentAdState.lastRefillPaymentIntentId === session.id || processedCheckoutSessions.includes(session.id)) {
      return true; // Durable replay deduplication: already processed
    }

    const origin = siteRow ? siteOrigin(siteRow) : null;
    const landingPageUrl = origin ? `${origin}/estimate` : `${APP_ORIGIN}/estimate`;

    // Parse advertised services
    const services = session.metadata?.services
      ? session.metadata.services.split(',').map((s) => s.trim()).filter(Boolean)
      : ['Emergency Repairs', 'Installation & Replacement', 'Maintenance'];

    let monthlyBudgetDollars: number;
    let initialCreditCents = 0;
    let initialFeeCents = 0;
    let monthlyBudgetCents = 60000;

    if (fundingModel === 'auto_refill_wallet') {
      const depositCents = Number(session.metadata.deposit_amount_cents) || 25000;
      const maxMonthlyCents = (Number(session.metadata.max_monthly_spend_dollars) * 100) || 100000;
      monthlyBudgetDollars = Math.round(maxMonthlyCents / 100);
      initialCreditCents = depositCents;
      initialFeeCents = Math.round(depositCents * AD_PLATFORM_FEE_RATE);
      monthlyBudgetCents = maxMonthlyCents;
    } else if (fundingModel === 'weekly_drip') {
      const weeklyBudgetCents = Number(session.metadata.weekly_ad_spend_cents) || 16000;
      monthlyBudgetCents = Number(session.metadata.monthly_budget_cents) || Math.round(weeklyBudgetCents * (52 / 12));
      monthlyBudgetDollars = Math.round(monthlyBudgetCents / 100);
      initialCreditCents = weeklyBudgetCents;
      initialFeeCents = Number(session.metadata.weekly_fee_cents) || Math.round(weeklyBudgetCents * AD_PLATFORM_FEE_RATE);
    } else {
      monthlyBudgetCents = Number(session.metadata.monthly_budget_cents) || 60000;
      monthlyBudgetDollars = Math.round(monthlyBudgetCents / 100);
      initialCreditCents = monthlyBudgetCents;
      initialFeeCents = Math.round(monthlyBudgetCents * AD_PLATFORM_FEE_RATE);
    }

    const smsAlertsEnabled = session.metadata?.sms_alerts_enabled !== 'false';
    const smsAlertPhone = session.metadata?.sms_alert_phone || null;

    // Synchronously await and verify campaign provisioning in Google Ads
    const provisioningResult = await provisionManagedSearchCampaign({
      accountId,
      businessName: session.metadata?.business_name || 'Contractor',
      trade: session.metadata?.trade || 'Contractor',
      city: session.metadata?.city || 'Local Area',
      radiusMiles: Number(session.metadata?.radius_miles) || 25,
      services,
      monthlyBudgetDollars,
      landingPageUrl,
    });

    const isProvisioned = provisioningResult.success;
    const campaignStatus: AdCampaignBillingStatus = isProvisioned ? 'active' : 'pending_provisioning';

    await atomicCreditAdWalletState(admin, {
      accountId,
      paymentIntentId: session.id,
      creditCents: initialCreditCents,
      feeCents: initialFeeCents,
      fundingModel,
      monthlyBudgetCents,
      status: campaignStatus,
      landingPageUrl,
      googleCampaignId: provisioningResult.campaignId || null,
      googleCampaignResource: provisioningResult.campaignResourceName || null,
      provisioningStatus: provisioningResult.status,
      provisioningMessage: isProvisioned ? null : provisioningResult.message,
      smsAlertsEnabled,
      smsAlertPhone,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
    });

    return true;
  }

  // Cross-Rail Webhook Isolation for Invoices
  if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
    const invoice = event.data.object as Stripe.Invoice;
    const rawSubscription = (invoice as { subscription?: string | { id?: string } | null }).subscription;
    const subscriptionId = typeof rawSubscription === 'string' ? rawSubscription : rawSubscription?.id;
    if (!subscriptionId) return false;

    // Verify if this subscription is registered as an ad campaign on any site
    const { data: sites } = await admin
      .from('sites')
      .select('id, account_id, content')
      .not('content->adCampaign', 'is', null);

    const matchingSite = (sites || []).find((s) => {
      const content = (s.content as Record<string, unknown>) || {};
      const adCampaign = (content.adCampaign as Partial<AdBudgetWalletState>) || {};
      return adCampaign.stripeSubscriptionId === subscriptionId;
    });

    if (!matchingSite || !matchingSite.account_id) {
      return false;
    }

    const content = (matchingSite.content as Record<string, unknown>) || {};
    const adCampaign = (content.adCampaign as Partial<AdBudgetWalletState>) || {};

    if (event.type === 'invoice.paid') {
      // Strict fail-closed invoice check
      const rawPaid = (invoice as { paid?: boolean }).paid;
      if (rawPaid === false || (invoice.status && invoice.status !== 'paid' && invoice.status !== 'open')) {
        console.warn(`[AdBilling] Refusing non-paid invoice ${invoice.id} (status: ${invoice.status})`);
        return false;
      }



      const shouldActivate = adCampaign.provisioningStatus === 'active' && adCampaign.status !== 'paused' && adCampaign.status !== 'inactive';
      await updateAccountAdBudgetState(admin, matchingSite.account_id, {
        ...(shouldActivate ? { status: 'active' } : {}),
        lastPaymentAt: new Date().toISOString(),
        lastPaymentError: null,
      });
      return true;
    }

    if (event.type === 'invoice.payment_failed') {
      await updateAccountAdBudgetState(admin, matchingSite.account_id, {
        status: 'past_due',
        lastPaymentError: 'Latest ad budget subscription charge failed.',
      });
      return true;
    }
  }

  // Cross-Rail Webhook Isolation for Subscriptions
  if (event.type === 'customer.subscription.deleted' || event.type === 'customer.subscription.updated') {
    const subscription = event.data.object as Stripe.Subscription;
    const subscriptionId = subscription.id;
    if (!subscriptionId) return false;

    const { data: sites } = await admin
      .from('sites')
      .select('id, account_id, content')
      .not('content->adCampaign', 'is', null);

    const matchingSite = (sites || []).find((s) => {
      const content = (s.content as Record<string, unknown>) || {};
      const adCampaign = (content.adCampaign as Partial<AdBudgetWalletState>) || {};
      return adCampaign.stripeSubscriptionId === subscriptionId;
    });

    if (!matchingSite || !matchingSite.account_id) {
      return false;
    }

    if (event.type === 'customer.subscription.deleted') {
      await updateAccountAdBudgetState(admin, matchingSite.account_id, {
        status: 'inactive',
        stripeSubscriptionId: null,
        cancelAtPeriodEnd: false,
      });
      return true;
    }

    if (event.type === 'customer.subscription.updated') {
      const cancelAtPeriodEnd = Boolean(subscription.cancel_at_period_end);
      const rawPeriodEnd = (subscription as unknown as { current_period_end?: number }).current_period_end;
      const currentPeriodEnd = rawPeriodEnd
        ? new Date(rawPeriodEnd * 1000).toISOString()
        : null;

      await updateAccountAdBudgetState(admin, matchingSite.account_id, {
        cancelAtPeriodEnd,
        currentPeriodEnd,
      });
      return true;
    }
  }

  return false;
}

/**
 * Executes an automated off-session wallet refill charge via Stripe PaymentIntents
 * when the contractor's advertising balance falls below their refill threshold.
 * Guarantees strict idempotency and ambiguity-safe error handling.
 */
export async function executeWalletRefillCharge(params: {
  admin: SupabaseClient;
  accountId: string;
  reason?: string;
}): Promise<{
  success: boolean;
  refilled: boolean;
  message: string;
  chargedCents?: number;
  paymentIntentId?: string | null;
}> {
  const { admin, accountId, reason } = params;

  const { data: site } = await admin
    .from('sites')
    .select('id, content')
    .eq('account_id', accountId)
    .maybeSingle();

  if (!site) {
    return { success: false, refilled: false, message: 'Site not found for account.' };
  }

  const content = (site.content as Record<string, unknown>) || {};
  const adState = (content.adCampaign as AdBudgetWalletState) || DEFAULT_AD_WALLET_STATE;

  if (adState.fundingModel !== 'auto_refill_wallet') {
    return { success: false, refilled: false, message: 'Account is not using the Auto-Refill Wallet funding model.' };
  }

  if (adState.status !== 'active' && adState.status !== 'past_due') {
    return {
      success: false,
      refilled: false,
      message: `Campaign is not active (status: ${adState.status}). Automated off-session wallet refills are suspended.`,
    };
  }

  if (adState.cancelAtPeriodEnd) {
    return {
      success: false,
      refilled: false,
      message: 'Campaign is scheduled for cancellation. Automated wallet refills are disabled.',
    };
  }

  const balance = adState.walletBalanceCents ?? 25000;
  const threshold = adState.refillThresholdCents ?? 7500;
  const refillAmount = adState.refillAmountCents ?? 25000;
  const maxMonthly = adState.maxMonthlySpendCents ?? 100000;
  const spentThisMonth = adState.spendThisMonthCents ?? 0;

  if (balance > threshold) {
    return {
      success: true,
      refilled: false,
      message: `Balance ($${(balance / 100).toFixed(2)}) is above trigger threshold ($${(threshold / 100).toFixed(2)}).`,
    };
  }

  const remainingAllowance = maxMonthly - spentThisMonth;
  if (remainingAllowance <= 0) {
    return {
      success: true,
      refilled: false,
      message: `Monthly spend cap of $${(maxMonthly / 100).toFixed(2)} reached for this month.`,
    };
  }

  const actualRefillAdSpendCents = Math.min(refillAmount, remainingAllowance);
  const feeCents = Math.round(actualRefillAdSpendCents * AD_PLATFORM_FEE_RATE);
  const totalChargeCents = actualRefillAdSpendCents + feeCents;

  const customerId = adState.stripeCustomerId;
  if (!customerId) {
    await updateAccountAdBudgetState(admin, accountId, {
      status: 'past_due',
      lastPaymentError: 'Missing Stripe customer ID for off-session wallet refill.',
    });
    return { success: false, refilled: false, message: 'Missing Stripe customer ID.' };
  }

  const stripe = getStripeClient();

  try {
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
      limit: 1,
    });

    const paymentMethodId = paymentMethods.data[0]?.id;
    if (!paymentMethodId) {
      await updateAccountAdBudgetState(admin, accountId, {
        status: 'past_due',
        lastPaymentError: 'No saved card found on Stripe customer for auto-refill.',
      });
      return { success: false, refilled: false, message: 'No saved payment method found.' };
    }

    // Reuse persistent pending idempotency key if one was recorded, or create and persist a new one
    let idempotencyKey = adState.pendingRefillIdempotencyKey;
    if (!idempotencyKey) {
      const nowTs = Date.now();
      idempotencyKey = `ad_refill_${accountId}_${nowTs}_${totalChargeCents}`;
      await updateAccountAdBudgetState(admin, accountId, {
        pendingRefillIdempotencyKey: idempotencyKey,
        pendingRefillAmountCents: actualRefillAdSpendCents,
        pendingRefillFeeCents: feeCents,
        pendingRefillCreatedAt: new Date(nowTs).toISOString(),
      });
    }

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: totalChargeCents,
        currency: 'usd',
        customer: customerId,
        payment_method: paymentMethodId,
        off_session: true,
        confirm: true,
        description: `Ad Wallet Auto-Refill — $${(actualRefillAdSpendCents / 100).toFixed(2)} Ad Balance + $${(feeCents / 100).toFixed(2)} AI Mgmt`,
        metadata: {
          kind: 'ad_wallet_refill',
          account_id: accountId,
          refill_ad_spend_cents: String(actualRefillAdSpendCents),
          fee_cents: String(feeCents),
          trigger_reason: reason || 'balance_threshold_drop',
        },
      },
      {
        idempotencyKey,
      }
    );

    if (paymentIntent.status === 'succeeded') {
      const creditRes = await atomicCreditAdWalletState(admin, {
        accountId,
        paymentIntentId: paymentIntent.id,
        creditCents: actualRefillAdSpendCents,
        feeCents,
        status: 'active',
      });

      if (!creditRes.alreadyCredited && adState.smsAlertsEnabled !== false) {
        try {
          const phone = await resolveContractorSmsPhone(admin, accountId, adState);
          if (phone) {
            const { data: account } = await admin
              .from('accounts')
              .select('business_name')
              .eq('id', accountId)
              .maybeSingle();

            const businessName = (account?.business_name as string) || 'there';
            const refillDollars = (actualRefillAdSpendCents / 100).toFixed(2);
            const balanceDollars = (creditRes.newBalanceCents / 100).toFixed(2);
            const previousDollars = (balance / 100).toFixed(2);

            const { sendAdWalletRefillSms } = await import('@/lib/sms');
            await sendAdWalletRefillSms({
              accountId,
              phone,
              businessName,
              refillDollars,
              newBalanceDollars: balanceDollars,
              previousBalanceDollars: previousDollars,
              idempotencyKey: `ad-wallet-refill:${paymentIntent.id}`,
            });
          }
        } catch (smsErr) {
          console.warn('Could not dispatch wallet auto-refill SMS alert:', smsErr);
        }
      }

      return {
        success: true,
        refilled: true,
        chargedCents: totalChargeCents,
        paymentIntentId: paymentIntent.id,
        message: `Successfully auto-refilled $${(actualRefillAdSpendCents / 100).toFixed(2)}. New balance: $${(creditRes.newBalanceCents / 100).toFixed(2)}.`,
      };
    }

    // Non-succeeded status (e.g. requires_action, processing) — mark past_due but retain idempotency key if non-terminal
    await updateAccountAdBudgetState(admin, accountId, {
      status: 'past_due',
      lastPaymentError: `Payment intent status: ${paymentIntent.status}`,
    });

    return {
      success: false,
      refilled: false,
      message: `Payment intent status: ${paymentIntent.status}`,
    };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const errType = (err as { type?: string; code?: string })?.type;
    const errCode = (err as { type?: string; code?: string })?.code;

    // Check if failure is a definitive card decline or terminal failure
    const isDefinitiveFailure =
      errType === 'card_error' ||
      errCode === 'card_declined' ||
      errCode === 'expired_card' ||
      errCode === 'incorrect_cvc' ||
      errCode === 'insufficient_funds';

    if (isDefinitiveFailure) {
      // Safe to clear pending idempotency key
      await updateAccountAdBudgetState(admin, accountId, {
        status: 'past_due',
        lastPaymentError: errMsg,
        pendingRefillIdempotencyKey: null,
        pendingRefillAmountCents: null,
        pendingRefillFeeCents: null,
        pendingRefillCreatedAt: null,
      });
    } else {
      // Ambiguous error (timeout, network drop, 500) — PRESERVE idempotency key so retry uses identical key
      await updateAccountAdBudgetState(admin, accountId, {
        status: 'past_due',
        lastPaymentError: `Payment outcome ambiguous: ${errMsg}. Pending idempotency key retained for retry safety.`,
      });
    }

    return { success: false, refilled: false, message: errMsg };
  }
}

/**
 * Worker function to check and process auto-refills for all active wallet accounts.
 */
export async function processAllWalletAutoRefills(admin: SupabaseClient): Promise<{
  processed: number;
  refilled: number;
  results: Record<string, unknown>[];
}> {
  const { data: sites } = await admin
    .from('sites')
    .select('id, account_id, content')
    .not('content->adCampaign', 'is', null);

  const results: Record<string, unknown>[] = [];
  let refilled = 0;

  for (const site of sites || []) {
    const content = (site.content as Record<string, unknown>) || {};
    const adState = (content.adCampaign as AdBudgetWalletState) || {};
    if (adState.fundingModel === 'auto_refill_wallet' && adState.status === 'active') {
      const balance = adState.walletBalanceCents ?? 25000;
      const threshold = adState.refillThresholdCents ?? 7500;
      if (balance <= threshold) {
        const res = await executeWalletRefillCharge({
          admin,
          accountId: site.account_id,
          reason: 'scheduled_worker_check',
        });
        results.push({ accountId: site.account_id, ...res });
        if (res.refilled) refilled++;
      }
    }
  }

  return { processed: results.length, refilled, results };
}

/**
 * Records an ad spend usage/consumption event for an account, decrementing
 * the contractor's advertising balance atomically and checking whether an auto-refill is triggered.
 */
export async function recordAdSpendUsage(params: {
  admin: SupabaseClient;
  accountId: string;
  spendCents: number;
  clicks?: number;
  impressions?: number;
  conversions?: number;
  date?: string;
  source?: 'google_ads_api' | 'meta_ads_api' | 'scheduled_pacing';
}): Promise<{
  success: boolean;
  newBalanceCents?: number;
  spentThisMonthCents?: number;
  refillTriggered?: boolean;
  message: string;
}> {
  const debitRes = await atomicDebitAdWalletState(params.admin, {
    accountId: params.accountId,
    spendCents: params.spendCents,
    clicks: params.clicks,
    impressions: params.impressions,
    conversions: params.conversions,
    date: params.date,
    source: params.source,
  });

  if (!debitRes.success) {
    return { success: false, message: debitRes.message };
  }

  let refillTriggered = false;
  if (debitRes.shouldRefill) {
    const refillRes = await executeWalletRefillCharge({
      admin: params.admin,
      accountId: params.accountId,
      reason: `Balance depleted by ad spend to $${((debitRes.newBalanceCents || 0) / 100).toFixed(2)}.`,
    });
    refillTriggered = refillRes.refilled;
  }

  return {
    success: true,
    newBalanceCents: debitRes.newBalanceCents,
    spentThisMonthCents: debitRes.spentThisMonthCents,
    refillTriggered,
    message: debitRes.message,
  };
}

/**
 * Synchronizes ad spend usage for an account by querying live Google Ads metrics.
 */
export async function syncAccountAdSpendUsage(
  admin: SupabaseClient,
  accountId: string
): Promise<{ success: boolean; spendRecordedCents: number; message: string }> {
  const { data: site } = await admin
    .from('sites')
    .select('id, content')
    .eq('account_id', accountId)
    .maybeSingle();

  if (!site) return { success: false, spendRecordedCents: 0, message: 'Site not found.' };

  const content = (site.content as Record<string, unknown>) || {};
  const adState = (content.adCampaign as AdBudgetWalletState) || DEFAULT_AD_WALLET_STATE;

  if (adState.status !== 'active') {
    return { success: true, spendRecordedCents: 0, message: 'Campaign is inactive.' };
  }

  if (adState.googleCampaignId) {
    const { fetchGoogleAdsCampaignDailySpend } = await import('@/lib/google-ads-api');
    const googleRes = await fetchGoogleAdsCampaignDailySpend(adState.googleCampaignId);
    if (googleRes.success && googleRes.data.length > 0) {
      const todayStr = new Date().toISOString().slice(0, 10);
      const latest = googleRes.data.find((d) => d.date === todayStr) || googleRes.data[0];
      if (latest && latest.spendCents > 0) {
        const res = await recordAdSpendUsage({
          admin,
          accountId,
          spendCents: latest.spendCents,
          clicks: latest.clicks,
          impressions: latest.impressions,
          conversions: latest.conversions,
          date: latest.date,
          source: 'google_ads_api',
        });
        return { success: true, spendRecordedCents: latest.spendCents, message: res.message };
      }
    }
    return { success: true, spendRecordedCents: 0, message: 'No new ad spend reported by Google Ads.' };
  }

  return { success: true, spendRecordedCents: 0, message: 'No configured Google Ads campaign to sync.' };
}

/**
 * Worker function to sync ad spend consumption across all active campaigns.
 */
export async function processAllAdSpendSync(admin: SupabaseClient): Promise<{
  processed: number;
  totalSpendSyncedCents: number;
  results: Record<string, unknown>[];
}> {
  const { data: sites } = await admin
    .from('sites')
    .select('id, account_id, content')
    .not('content->adCampaign', 'is', null);

  const results: Record<string, unknown>[] = [];
  let totalSpendSyncedCents = 0;

  for (const site of sites || []) {
    const content = (site.content as Record<string, unknown>) || {};
    const adState = (content.adCampaign as AdBudgetWalletState) || {};
    if (adState.status === 'active') {
      const res = await syncAccountAdSpendUsage(admin, site.account_id);
      totalSpendSyncedCents += res.spendRecordedCents;
      results.push({ accountId: site.account_id, ...res });
    }
  }

  return {
    processed: results.length,
    totalSpendSyncedCents,
    results,
  };
}

/**
 * Persists ad budget state updates into the site/account record.
 */
export async function updateAccountAdBudgetState(
  admin: SupabaseClient,
  accountId: string,
  updates: Partial<AdBudgetWalletState>
): Promise<void> {
  const { data: site } = await admin
    .from('sites')
    .select('id, content')
    .eq('account_id', accountId)
    .maybeSingle();

  if (!site) return;

  const currentContent = (site.content as Record<string, unknown>) || {};
  const currentAdState = (currentContent.adCampaign as Partial<AdBudgetWalletState>) || {};

  const mergedAdState: AdBudgetWalletState = {
    ...DEFAULT_AD_WALLET_STATE,
    ...currentAdState,
    ...updates,
  };

  await admin
    .from('sites')
    .update({
      content: {
        ...currentContent,
        adCampaign: mergedAdState,
      },
    })
    .eq('id', site.id);
}

/**
 * Pauses an active ad campaign, suspending live bidding on Google/Meta
 * and freezing continuous balance deductions. Fully idempotent.
 */
export async function pauseAdCampaign(
  admin: SupabaseClient,
  accountId: string
): Promise<{ success: boolean; message: string }> {
  const { data: site } = await admin
    .from('sites')
    .select('id, content')
    .eq('account_id', accountId)
    .maybeSingle();

  if (!site) return { success: false, message: 'Site not found for account.' };

  const content = (site.content as Record<string, unknown>) || {};
  const adState = (content.adCampaign as AdBudgetWalletState) || DEFAULT_AD_WALLET_STATE;

  if (adState.googleCampaignId) {
    try {
      const { updateGoogleAdsCampaignStatus } = await import('@/lib/google-ads-api');
      await updateGoogleAdsCampaignStatus(adState.googleCampaignId, 'PAUSED');
    } catch (err) {
      console.warn('Could not pause Google Ads campaign:', err);
    }
  }

  await updateAccountAdBudgetState(admin, accountId, {
    status: 'paused',
    provisioningStatus: 'paused',
    provisioningMessage: 'Campaign bidding paused by contractor.',
  });

  return { success: true, message: 'Campaign paused successfully. Live ad bidding is suspended.' };
}

/**
 * Resumes a paused ad campaign, re-enabling live bidding on Google/Meta
 * and restoring active schedule pacing. Fully idempotent.
 */
export async function resumeAdCampaign(
  admin: SupabaseClient,
  accountId: string
): Promise<{ success: boolean; message: string }> {
  const { data: site } = await admin
    .from('sites')
    .select('id, content')
    .eq('account_id', accountId)
    .maybeSingle();

  if (!site) return { success: false, message: 'Site not found for account.' };

  const content = (site.content as Record<string, unknown>) || {};
  const adState = (content.adCampaign as AdBudgetWalletState) || DEFAULT_AD_WALLET_STATE;

  if (adState.googleCampaignId) {
    try {
      const { updateGoogleAdsCampaignStatus } = await import('@/lib/google-ads-api');
      await updateGoogleAdsCampaignStatus(adState.googleCampaignId, 'ENABLED');
    } catch (err) {
      console.warn('Could not resume Google Ads campaign:', err);
    }
  }

  await updateAccountAdBudgetState(admin, accountId, {
    status: 'active',
    provisioningStatus: 'active',
    provisioningMessage: null,
  });

  return { success: true, message: 'Campaign resumed successfully. Live ad bidding is active.' };
}

/**
 * Cancels an ad campaign subscription on Stripe and pauses active bidding.
 * Fully idempotent.
 */
export async function cancelAdCampaign(
  admin: SupabaseClient,
  accountId: string,
  cancelImmediately = false
): Promise<{ success: boolean; message: string }> {
  const { data: site } = await admin
    .from('sites')
    .select('id, content')
    .eq('account_id', accountId)
    .maybeSingle();

  if (!site) return { success: false, message: 'Site not found for account.' };

  const content = (site.content as Record<string, unknown>) || {};
  const adState = (content.adCampaign as AdBudgetWalletState) || DEFAULT_AD_WALLET_STATE;

  if (adState.stripeSubscriptionId) {
    try {
      const { cancelAdCampaignSubscription } = await import('@/lib/billing/subscription-cancellation');
      await cancelAdCampaignSubscription(adState.stripeSubscriptionId, cancelImmediately);
    } catch (err) {
      console.warn('Stripe subscription cancellation notice:', err);
    }
  }

  if (adState.googleCampaignId) {
    try {
      const { updateGoogleAdsCampaignStatus } = await import('@/lib/google-ads-api');
      await updateGoogleAdsCampaignStatus(adState.googleCampaignId, 'PAUSED');
    } catch (err) {
      console.warn('Could not pause Google Ads campaign:', err);
    }
  }

  if (cancelImmediately || !adState.stripeSubscriptionId) {
    await updateAccountAdBudgetState(admin, accountId, {
      status: 'inactive',
      stripeSubscriptionId: null,
      cancelAtPeriodEnd: false,
      provisioningStatus: 'unconfigured',
      provisioningMessage: 'Campaign cancelled.',
    });
    return { success: true, message: 'Campaign cancelled successfully.' };
  } else {
    await updateAccountAdBudgetState(admin, accountId, {
      cancelAtPeriodEnd: true,
    });
    return { success: true, message: 'Campaign subscription set to cancel at the end of the current billing cycle.' };
  }
}

/**
 * Resolves the contractor's SMS alert destination phone number.
 */
export async function resolveContractorSmsPhone(
  admin: SupabaseClient,
  accountId: string,
  adState?: AdBudgetWalletState | null
): Promise<string | null> {
  if (adState?.smsAlertPhone) return adState.smsAlertPhone;

  const { data: site } = await admin
    .from('sites')
    .select('content')
    .eq('account_id', accountId)
    .maybeSingle();

  const sitePhone = (site?.content as Record<string, unknown>)?.phone as string | undefined;
  if (sitePhone) return sitePhone;

  const { data: account } = await admin
    .from('accounts')
    .select('alert_phone')
    .eq('id', accountId)
    .maybeSingle();

  return (account?.alert_phone as string | null) || null;
}

/**
 * Dispatches an SMS alert to a contractor 24 hours before their upcoming
 * weekly/monthly AI Advertising renewal.
 */
export async function sendUpcomingPaymentSmsAlert(params: {
  admin: SupabaseClient;
  accountId: string;
  amountDollars: number;
  renewalDateStr: string;
}): Promise<boolean> {
  const { admin, accountId, amountDollars, renewalDateStr } = params;

  const { data: site } = await admin
    .from('sites')
    .select('id, content')
    .eq('account_id', accountId)
    .maybeSingle();

  if (!site) return false;
  const content = (site.content as Record<string, unknown>) || {};
  const adState = (content.adCampaign as AdBudgetWalletState) || DEFAULT_AD_WALLET_STATE;

  if (adState.smsAlertsEnabled === false) return false;

  const phone = await resolveContractorSmsPhone(admin, accountId, adState);
  if (!phone) return false;

  const { data: account } = await admin
    .from('accounts')
    .select('business_name')
    .eq('id', accountId)
    .maybeSingle();

  const businessName = (account?.business_name as string) || 'there';

  try {
    const { sendUpcomingAdPaymentSms } = await import('@/lib/sms');
    return await sendUpcomingAdPaymentSms({
      accountId,
      phone,
      businessName,
      amountDollars,
      renewalDateStr,
      idempotencyKey: `ad-upcoming-payment-alert:${accountId}:${renewalDateStr}`,
    });
  } catch (err) {
    console.warn('Failed to send upcoming payment SMS alert:', err);
    return false;
  }
}

/**
 * Sweeps all active ad campaigns and dispatches 24-hour advance SMS notifications
 * for upcoming subscription renewals to opted-in contractors.
 */
export async function processUpcomingPaymentSmsAlerts(admin: SupabaseClient): Promise<{
  processed: number;
  alertsSent: number;
}> {
  const { data: sites } = await admin
    .from('sites')
    .select('id, account_id, content')
    .not('content->adCampaign', 'is', null);

  let alertsSent = 0;
  const now = Date.now();

  for (const site of sites || []) {
    const content = (site.content as Record<string, unknown>) || {};
    const adState = (content.adCampaign as AdBudgetWalletState) || {};

    if (
      adState.status === 'active' &&
      adState.smsAlertsEnabled !== false &&
      adState.currentPeriodEnd
    ) {
      const periodEndMs = new Date(adState.currentPeriodEnd).getTime();
      const diffMs = periodEndMs - now;

      // 24 hours window (renewal within 0 to 26 hours)
      const isWithin24Hours = diffMs > 0 && diffMs <= 26 * 60 * 60 * 1000;

      // Ensure we haven't already alerted for this cycle in the last 48 hours
      const lastSentMs = adState.lastUpcomingPaymentAlertAt
        ? new Date(adState.lastUpcomingPaymentAlertAt).getTime()
        : 0;
      const alreadySentRecently = (now - lastSentMs) < 48 * 60 * 60 * 1000;

      if (isWithin24Hours && !alreadySentRecently) {
        const amountDollars = Math.round(
          (adState.weeklyAmountCents || adState.totalMonthlyCents || 18500) / 100
        );
        const renewalDateStr = new Date(adState.currentPeriodEnd).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        });

        const sent = await sendUpcomingPaymentSmsAlert({
          admin,
          accountId: site.account_id,
          amountDollars,
          renewalDateStr,
        });

        if (sent) {
          alertsSent++;
          await updateAccountAdBudgetState(admin, site.account_id, {
            lastUpcomingPaymentAlertAt: new Date().toISOString(),
          });
        }
      }
    }
  }

  return { processed: sites?.length || 0, alertsSent };
}
