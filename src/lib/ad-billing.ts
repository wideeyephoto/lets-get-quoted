import { getStripeClient, toCents } from '@/lib/stripe';
import { provisionManagedSearchCampaign, isGoogleAdsConfigured } from '@/lib/google-ads-api';
import { siteOrigin } from '@/lib/seo/site-pages';
import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';

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

/**
 * Creates a Stripe Checkout session to initiate an ad budget plan:
 * 1. Weekly Drip Funding ($185/wk, $345/wk, $645/wk)
 * 2. Auto-Refilling Advertising Wallet (Deposit $250 today, auto-refill $250 below $75, max monthly spend cap)
 * 3. Monthly subscription
 */
export async function createAdBudgetCheckoutSession(params: {
  accountId: string;
  fundingModel?: AdFundingModel;
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
}): Promise<{ url: string; sessionId: string }> {
  const {
    accountId,
    fundingModel = 'weekly_drip',
    depositAmountDollars,
    refillThresholdDollars,
    refillAmountDollars,
    maxMonthlySpendDollars,
    monthlyBudgetDollars,
    weeklyAmountDollars,
    weeklyAdSpendDollars,
    weeklyFeeDollars,
    platformFeeDollars,
    interval = 'week',
    businessName,
    trade,
    city,
    customFocus,
    smsAlertsEnabled = true,
    smsAlertPhone,
    returnUrl,
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

  const isWallet = fundingModel === 'auto_refill_wallet';
  const isWeekly = !isWallet && (fundingModel === 'weekly_drip' || interval === 'week');

  let totalDollars: number;
  let adSpendDollars: number;
  let feeDollars: number;
  let trueMonthlyAdSpendDollars: number;
  let trueMonthlyFeeDollars: number;
  let trueMonthlyTotalDollars: number;

  if (isWallet) {
    // Auto-Refill Wallet funding model
    const deposit = depositAmountDollars || DEFAULT_AUTO_REFILL_CONFIG.depositAmountDollars;
    adSpendDollars = deposit;
    feeDollars = platformFeeDollars !== undefined ? platformFeeDollars : Math.round(deposit * AD_PLATFORM_FEE_RATE);
    totalDollars = adSpendDollars + feeDollars;

    const maxCap = maxMonthlySpendDollars || DEFAULT_AUTO_REFILL_CONFIG.maxMonthlySpendDollars;
    trueMonthlyAdSpendDollars = maxCap;
    trueMonthlyFeeDollars = Math.round(maxCap * AD_PLATFORM_FEE_RATE);
    trueMonthlyTotalDollars = trueMonthlyAdSpendDollars + trueMonthlyFeeDollars;
  } else if (isWeekly) {
    // Weekly drip funding model
    if (weeklyAmountDollars) {
      totalDollars = weeklyAmountDollars;
      adSpendDollars = weeklyAdSpendDollars || Math.round(totalDollars * (1 - AD_PLATFORM_FEE_RATE));
      feeDollars = weeklyFeeDollars !== undefined ? weeklyFeeDollars : totalDollars - adSpendDollars;
    } else if (weeklyAdSpendDollars) {
      adSpendDollars = weeklyAdSpendDollars;
      feeDollars = weeklyFeeDollars !== undefined ? weeklyFeeDollars : Math.round(adSpendDollars * AD_PLATFORM_FEE_RATE);
      totalDollars = adSpendDollars + feeDollars;
    } else {
      // Default to standard Growth bundle weekly
      totalDollars = 330;
      adSpendDollars = 300;
      feeDollars = 30;
    }

    // Convert weekly ad spend to true monthly rate (52 weeks / 12 months = 4.333x)
    trueMonthlyAdSpendDollars = Math.round(adSpendDollars * (52 / 12));
    trueMonthlyFeeDollars = Math.round(feeDollars * (52 / 12));
    trueMonthlyTotalDollars = trueMonthlyAdSpendDollars + trueMonthlyFeeDollars;
  } else {
    // Monthly billing fallback
    const nominalMonthly = monthlyBudgetDollars || 600;
    const breakdown = calculateAdBudgetBreakdown(nominalMonthly);
    adSpendDollars = nominalMonthly;
    feeDollars = platformFeeDollars !== undefined ? platformFeeDollars : breakdown.platformFeeDollars;
    totalDollars = adSpendDollars + feeDollars;
    trueMonthlyAdSpendDollars = adSpendDollars;
    trueMonthlyFeeDollars = feeDollars;
    trueMonthlyTotalDollars = totalDollars;
  }

  const budgetCents = toCents(adSpendDollars);
  const feeCents = toCents(feeDollars);
  const totalCents = toCents(totalDollars);

  const stripe = getStripeClient();
  const { createAdminClient } = await import('@/lib/auth');
  const admin = createAdminClient();

  // Retrieve or create Stripe customer
  const { data: account } = await admin
    .from('accounts')
    .select('id, business_name, email, stripe_customer_id')
    .eq('id', accountId)
    .single();

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

  const successUrl = `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}ad_status=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}ad_status=cancelled`;

  const threshold = refillThresholdDollars || DEFAULT_AUTO_REFILL_CONFIG.refillThresholdDollars;
  const refill = refillAmountDollars || DEFAULT_AUTO_REFILL_CONFIG.refillAmountDollars;
  const maxMonthly = maxMonthlySpendDollars || DEFAULT_AUTO_REFILL_CONFIG.maxMonthlySpendDollars;

  let productName: string;
  let productDescription: string;

  if (isWallet) {
    productName = `Auto-Refilling Ad Wallet — $${totalDollars} Initial Deposit ($${adSpendDollars} Ads + $${feeDollars} Mgmt)`;
    productDescription = `Initial deposit for ${trade} in ${city}. Automatically re-adds $${refill} when ad balance drops below $${threshold}. Max monthly spend capped at $${maxMonthly}/mo.`;
  } else if (isWeekly) {
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
      deposit_amount_dollars: isWallet ? String(adSpendDollars) : '',
      deposit_amount_cents: isWallet ? String(budgetCents) : '',
      refill_threshold_dollars: isWallet ? String(threshold) : '',
      refill_amount_dollars: isWallet ? String(refill) : '',
      max_monthly_spend_dollars: isWallet ? String(maxMonthly) : '',
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
              refill_threshold_dollars: String(threshold),
              refill_amount_dollars: String(refill),
              max_monthly_spend_dollars: String(maxMonthly),
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

  const session = await stripe.checkout.sessions.create(sessionConfig);

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

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: params.returnUrl,
  });

  return portalSession.url;
}

/**
 * Updates campaign subscription state when a Stripe webhook event fires.
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
    event.type !== 'customer.subscription.deleted'
  ) {
    return false;
  }

  let admin = adminClient;
  if (!admin) {
    const { createAdminClient } = await import('@/lib/auth');
    admin = createAdminClient();
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.metadata?.kind !== 'ad_budget') return false;

    const accountId = session.metadata.account_id;
    const fundingModel = (session.metadata.funding_model as AdFundingModel) || 'weekly_drip';
    const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id || null;
    const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id || null;

    // Query site to resolve real public domain/subdomain
    const { data: siteRow } = await admin
      .from('sites')
      .select('id, subdomain, custom_domain, custom_domain_verified_at')
      .eq('account_id', accountId)
      .maybeSingle();

    const origin = siteRow ? siteOrigin(siteRow) : null;
    const landingPageUrl = origin ? `${origin}/estimate` : 'https://app.letsgetquoted.com/estimate';

    // Parse advertised services
    const services = session.metadata?.services
      ? session.metadata.services.split(',').map((s) => s.trim()).filter(Boolean)
      : ['Emergency Repairs', 'Installation & Replacement', 'Maintenance'];

    let monthlyBudgetDollars: number;
    let statePayload: Partial<AdBudgetWalletState>;

    if (fundingModel === 'auto_refill_wallet') {
      const depositCents = Number(session.metadata.deposit_amount_cents) || 25000;
      const thresholdCents = (Number(session.metadata.refill_threshold_dollars) * 100) || 7500;
      const refillCents = (Number(session.metadata.refill_amount_dollars) * 100) || 25000;
      const maxMonthlyCents = (Number(session.metadata.max_monthly_spend_dollars) * 100) || 100000;
      monthlyBudgetDollars = Math.round(maxMonthlyCents / 100);

      statePayload = {
        fundingModel: 'auto_refill_wallet',
        walletBalanceCents: depositCents,
        refillThresholdCents: thresholdCents,
        refillAmountCents: refillCents,
        maxMonthlySpendCents: maxMonthlyCents,
        monthlyBudgetCents: maxMonthlyCents,
        platformFeeCents: Math.round(depositCents * AD_PLATFORM_FEE_RATE),
        totalMonthlyCents: maxMonthlyCents,
        spendThisMonthCents: 0,
        stripeSubscriptionId: null,
        stripeCustomerId: customerId,
      };
    } else if (fundingModel === 'weekly_drip') {
      const weeklyBudgetCents = Number(session.metadata.weekly_ad_spend_cents) || 16000;
      const weeklyAmountCents = Number(session.metadata.weekly_amount_cents) || 17600;
      const monthlyBudgetCents = Number(session.metadata.monthly_budget_cents) || Math.round(weeklyBudgetCents * (52 / 12));
      const platformFeeCents = Number(session.metadata.platform_fee_cents) || Math.round(monthlyBudgetCents * AD_PLATFORM_FEE_RATE);
      const totalMonthlyCents = Number(session.metadata.monthly_total_cents) || (monthlyBudgetCents + platformFeeCents);
      monthlyBudgetDollars = Math.round(monthlyBudgetCents / 100);

      statePayload = {
        fundingModel: 'weekly_drip',
        weeklyBudgetCents,
        weeklyAmountCents,
        monthlyBudgetCents,
        platformFeeCents,
        totalMonthlyCents,
        stripeSubscriptionId: subscriptionId,
        stripeCustomerId: customerId,
      };
    } else {
      const monthlyBudgetCents = Number(session.metadata.monthly_budget_cents) || 60000;
      monthlyBudgetDollars = Math.round(monthlyBudgetCents / 100);
      const platformFeeCents = Math.round(monthlyBudgetCents * AD_PLATFORM_FEE_RATE);

      statePayload = {
        fundingModel: 'monthly_fixed',
        monthlyBudgetCents,
        platformFeeCents,
        totalMonthlyCents: monthlyBudgetCents + platformFeeCents,
        stripeSubscriptionId: subscriptionId,
        stripeCustomerId: customerId,
      };
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

    await updateAccountAdBudgetState(admin, accountId, {
      ...statePayload,
      smsAlertsEnabled,
      smsAlertPhone,
      status: campaignStatus,
      lastPaymentAt: new Date().toISOString(),
      lastPaymentError: isProvisioned ? null : provisioningResult.message,
      googleCampaignId: provisioningResult.campaignId || null,
      googleCampaignResource: provisioningResult.campaignResourceName || null,
      provisioningStatus: provisioningResult.status,
      provisioningMessage: provisioningResult.message,
      landingPageUrl,
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
      // Unrelated Stripe invoice (e.g. core SaaS plan, estimate invoice) — allow other handlers to run
      return false;
    }

    const content = (matchingSite.content as Record<string, unknown>) || {};
    const adCampaign = (content.adCampaign as Partial<AdBudgetWalletState>) || {};

    if (event.type === 'invoice.paid') {
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
      // Unrelated Stripe subscription — allow other handlers to run
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

    const dateHourBucket = new Date().toISOString().slice(0, 13);
    const idempotencyKey = `ad_refill_${accountId}_${dateHourBucket}_${totalChargeCents}`;

    const paymentIntent = await stripe.paymentIntents.create({
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
    }, {
      idempotencyKey,
    });

    if (paymentIntent.status === 'succeeded') {
      const newBalance = balance + actualRefillAdSpendCents;

      await updateAccountAdBudgetState(admin, accountId, {
        status: 'active',
        walletBalanceCents: newBalance,
        lastPaymentAt: new Date().toISOString(),
        lastPaymentError: null,
      });

      if (adState.smsAlertsEnabled !== false) {
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
            const balanceDollars = (newBalance / 100).toFixed(2);
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
        message: `Successfully auto-refilled $${(actualRefillAdSpendCents / 100).toFixed(2)}. New balance: $${(newBalance / 100).toFixed(2)}.`,
      };
    }

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
    await updateAccountAdBudgetState(admin, accountId, {
      status: 'past_due',
      lastPaymentError: errMsg,
    });
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
 * the contractor's advertising balance, incrementing periodic spend totals,
 * and checking whether an automated wallet refill is triggered.
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
  const {
    admin,
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
    updatedHistory = [newEntry, ...currentHistory].slice(0, 90); // Retain last 90 days
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

  let refillTriggered = false;
  if (adState.fundingModel === 'auto_refill_wallet' && newBalance <= (adState.refillThresholdCents ?? 7500)) {
    const refillRes = await executeWalletRefillCharge({
      admin,
      accountId,
      reason: `Balance ($${(newBalance / 100).toFixed(2)}) depleted by ad spend below threshold ($${((adState.refillThresholdCents ?? 7500) / 100).toFixed(2)}).`,
    });
    refillTriggered = refillRes.refilled;
  }

  return {
    success: true,
    newBalanceCents: newBalance,
    spentThisMonthCents: newSpentThisMonth,
    refillTriggered,
    message: `Recorded $${(spendCents / 100).toFixed(2)} ad spend. Remaining balance: $${(newBalance / 100).toFixed(2)}.`,
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
 * and freezing continuous balance deductions.
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
    const { updateGoogleAdsCampaignStatus } = await import('@/lib/google-ads-api');
    await updateGoogleAdsCampaignStatus(adState.googleCampaignId, 'PAUSED');
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
 * and restoring active schedule pacing.
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
    const { updateGoogleAdsCampaignStatus } = await import('@/lib/google-ads-api');
    await updateGoogleAdsCampaignStatus(adState.googleCampaignId, 'ENABLED');
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
      console.error('Could not update Stripe subscription cancellation:', err);
      return {
        success: false,
        message: `Failed to cancel subscription with billing provider: ${err instanceof Error ? err.message : 'Stripe error'}`,
      };
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



