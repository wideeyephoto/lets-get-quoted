import { getStripeClient, toCents } from '@/lib/stripe';
import { createAdminClient } from '@/lib/auth';
import { provisionManagedSearchCampaign } from '@/lib/google-ads-api';
import type Stripe from 'stripe';

export type AdCampaignBillingStatus = 'inactive' | 'active' | 'paused' | 'past_due';

export const AD_PLATFORM_FEE_RATE = 0.15; // 15% Platform Management Fee

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
    feeRatePct: 15,
  };
}

export type AdBudgetWalletState = {
  status: AdCampaignBillingStatus;
  monthlyBudgetCents: number;
  platformFeeCents: number;
  totalMonthlyCents: number;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  lastPaymentAt: string | null;
  lastPaymentError: string | null;
  spendThisMonthCents: number;
};

export const DEFAULT_AD_WALLET_STATE: AdBudgetWalletState = {
  status: 'inactive',
  monthlyBudgetCents: 60000, // $600/mo
  platformFeeCents: 0, // Zero fee default
  totalMonthlyCents: 60000,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  lastPaymentAt: null,
  lastPaymentError: null,
  spendThisMonthCents: 0,
};

/**
 * Creates a Stripe Checkout session to initiate a monthly ad budget subscription.
 */
export async function createAdBudgetCheckoutSession(params: {
  accountId: string;
  monthlyBudgetDollars: number;
  platformFeeDollars?: number;
  businessName: string;
  trade: string;
  city: string;
  returnUrl: string;
}): Promise<{ url: string; sessionId: string }> {
  const { accountId, monthlyBudgetDollars, platformFeeDollars, businessName, trade, city, returnUrl } = params;

  if (monthlyBudgetDollars < 100) {
    throw new Error('Minimum monthly ad budget is $100.');
  }

  const stripe = getStripeClient();
  const admin = createAdminClient();

  const breakdown = calculateAdBudgetBreakdown(monthlyBudgetDollars);
  const feeDollars = platformFeeDollars !== undefined ? platformFeeDollars : breakdown.platformFeeDollars;
  const budgetCents = toCents(monthlyBudgetDollars);
  const feeCents = toCents(feeDollars);
  const totalCents = budgetCents + feeCents;

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

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: totalCents,
          recurring: { interval: 'month' },
          product_data: {
            name: `Managed Google Search Ads — $${monthlyBudgetDollars}/mo Budget`,
            description: `Automated search ad campaigns in ${city} for ${trade}. 100% applied to Google search clicks.`,
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      kind: 'ad_budget',
      account_id: accountId,
      monthly_budget_cents: String(budgetCents),
      platform_fee_cents: String(feeCents),
      business_name: businessName || '',
      trade,
      city,
    },
    subscription_data: {
      metadata: {
        kind: 'ad_budget',
        account_id: accountId,
        monthly_budget_cents: String(budgetCents),
        business_name: businessName || '',
        trade,
        city,
      },
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

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
  adminClient?: any
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

  const admin = adminClient ?? createAdminClient();

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.metadata?.kind !== 'ad_budget') return false;

    const accountId = session.metadata.account_id;
    const budgetCents = Number(session.metadata.monthly_budget_cents) || 60000;
    const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id || null;
    const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id || null;

    await updateAccountAdBudgetState(admin, accountId, {
      status: 'active',
      monthlyBudgetCents: budgetCents,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: customerId,
      lastPaymentAt: new Date().toISOString(),
      lastPaymentError: null,
    });

    // Automatically provision search campaigns in Master Google Ads MCC
    const services = session.metadata?.services
      ? session.metadata.services.split(',').map((s) => s.trim()).filter(Boolean)
      : ['Emergency Repairs', 'Installation & Replacement', 'Maintenance'];

    provisionManagedSearchCampaign({
      accountId,
      businessName: session.metadata?.business_name || 'Contractor',
      trade: session.metadata?.trade || 'Contractor',
      city: session.metadata?.city || 'Local Area',
      radiusMiles: Number(session.metadata?.radius_miles) || 25,
      services,
      monthlyBudgetDollars: Math.round(budgetCents / 100),
      landingPageUrl: `https://${accountId}.letsgetquoted.com/estimate`,
    }).catch((err: unknown) => {
      console.warn('Google Ads MCC campaign auto-provisioning log:', err);
    });

    return true;
  }

  if (event.type === 'invoice.paid') {
    const invoice = event.data.object as Stripe.Invoice;
    const rawSubscription = (invoice as { subscription?: string | { id?: string } | null }).subscription;
    const subscriptionId = typeof rawSubscription === 'string' ? rawSubscription : rawSubscription?.id;
    if (!subscriptionId) return false;

    // Find account by customer or subscription
    const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
    if (!customerId) return false;

    const { data: account } = await admin
      .from('accounts')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();

    if (account?.id) {
      await updateAccountAdBudgetState(admin, account.id, {
        status: 'active',
        lastPaymentAt: new Date().toISOString(),
        lastPaymentError: null,
      });
      return true;
    }
  }

  if (event.type === 'invoice.payment_failed') {
    const invoice = event.data.object as Stripe.Invoice;
    const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
    if (!customerId) return false;

    const { data: account } = await admin
      .from('accounts')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();

    if (account?.id) {
      await updateAccountAdBudgetState(admin, account.id, {
        status: 'past_due',
        lastPaymentError: 'Latest monthly ad budget charge failed.',
      });
      return true;
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
    if (!customerId) return false;

    const { data: account } = await admin
      .from('accounts')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();

    if (account?.id) {
      await updateAccountAdBudgetState(admin, account.id, {
        status: 'inactive',
        stripeSubscriptionId: null,
        cancelAtPeriodEnd: false,
      });
      return true;
    }
  }

  return false;
}

/**
 * Persists ad budget state updates into the site/account record.
 */
export async function updateAccountAdBudgetState(
  admin: ReturnType<typeof createAdminClient>,
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
