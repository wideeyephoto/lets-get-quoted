import { describe, expect, it, vi } from 'vitest';
import { handleAdBudgetWebhookEvent } from '@/lib/ad-billing';
import type Stripe from 'stripe';

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { id: 'acc_test_weekly', stripe_customer_id: 'cus_mock_123', business_name: 'Apex Roofing' },
          }),
          maybeSingle: async () => ({
            data: { id: 'acc_test_weekly', stripe_customer_id: 'cus_mock_123', business_name: 'Apex Roofing' },
          }),
        }),
      }),
      update: () => ({
        eq: async () => ({ error: null }),
      }),
    }),
  }),
}));

describe('Ad Billing Synchronous Provisioning & Fulfillment', () => {
  it('synchronously awaits provisioning and resolves landing page from sites table on checkout completed', async () => {
    let updatedContent: Record<string, unknown> | null = null;

    const mockAdmin: any = {
      from: (table: string) => {
        if (table === 'sites') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: 'site_123',
                    subdomain: 'lonestar',
                    custom_domain: 'lonestarroofing.com',
                    custom_domain_verified_at: '2026-01-01T00:00:00Z',
                    content: {},
                  },
                }),
              }),
            }),
            update: (payload: any) => ({
              eq: async () => {
                updatedContent = payload.content;
                return { error: null };
              },
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null }),
            }),
          }),
        };
      },
    };

    const event: Stripe.Event = {
      id: 'evt_test_checkout',
      object: 'event',
      api_version: '2023-10-16',
      created: Date.now(),
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_123',
          object: 'checkout.session',
          subscription: 'sub_test_123',
          customer: 'cus_test_123',
          metadata: {
            kind: 'ad_budget',
            account_id: 'acc_test_456',
            monthly_budget_cents: '60000',
            business_name: 'Lone Star Roofing',
            trade: 'Roofing',
            city: 'Austin, TX',
            services: 'Roof Replacement, Leak Repair',
          },
        } as unknown as Stripe.Checkout.Session,
      },
      livemode: false,
      pending_webhooks: 0,
      request: null,
    };

    const handled = await handleAdBudgetWebhookEvent(event, mockAdmin);
    expect(handled).toBe(true);

    expect(updatedContent).not.toBeNull();
    const adCampaign = (updatedContent as any)?.adCampaign;
    expect(adCampaign).toBeDefined();
    expect(adCampaign.status).toBe('active');
    expect(adCampaign.landingPageUrl).toBe('https://lonestarroofing.com/estimate');
    expect(adCampaign.googleCampaignId).toBeTruthy();
    expect(adCampaign.provisioningStatus).toBe('simulated');
  });

  it('correctly creates weekly recurring checkout even when monthly equivalents are submitted', async () => {
    const { createAdBudgetCheckoutSession } = await import('@/lib/ad-billing');
    const { getStripeClient } = await import('@/lib/stripe');
    const stripe = getStripeClient();

    let createdSessionConfig: any = null;
    vi.spyOn(stripe.checkout.sessions, 'create').mockImplementationOnce(async (config: any) => {
      createdSessionConfig = config;
      return { id: 'cs_mock_weekly', url: 'https://checkout.stripe.com/mock' } as any;
    });

    const result = await createAdBudgetCheckoutSession({
      accountId: 'acc_test_weekly',
      fundingModel: 'weekly_drip',
      weeklyAmountDollars: 185,
      weeklyAdSpendDollars: 160,
      weeklyFeeDollars: 25,
      monthlyBudgetDollars: 696,
      platformFeeDollars: 106,
      interval: 'week',
      businessName: 'Apex Roofing',
      trade: 'Roofing',
      city: 'Austin',
      returnUrl: 'https://example.com',
    });

    expect(result.url).toBe('https://checkout.stripe.com/mock');
    expect(createdSessionConfig).not.toBeNull();
    expect(createdSessionConfig.mode).toBe('subscription');
    expect(createdSessionConfig.line_items[0].price_data.unit_amount).toBe(18500);
    expect(createdSessionConfig.line_items[0].price_data.recurring.interval).toBe('week');
    expect(createdSessionConfig.metadata.weekly_amount_cents).toBe('18500');
    expect(createdSessionConfig.metadata.weekly_ad_spend_cents).toBe('16000');
    expect(createdSessionConfig.metadata.monthly_budget_cents).toBe('69300'); // True monthly Google Ads rate ($693)
  });

  it('translates weekly ad spend to true monthly Google Ads budget during webhook provisioning', async () => {
    let updatedContent: Record<string, unknown> | null = null;

    const mockAdmin: any = {
      from: (table: string) => {
        if (table === 'sites') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: 'site_weekly_123',
                    subdomain: 'apexroofing',
                    custom_domain: null,
                    custom_domain_verified_at: null,
                    content: {},
                  },
                }),
              }),
            }),
            update: (payload: any) => ({
              eq: async () => {
                updatedContent = payload.content;
                return { error: null };
              },
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null }),
            }),
          }),
        };
      },
    };

    const event: Stripe.Event = {
      id: 'evt_test_weekly_checkout',
      object: 'event',
      api_version: '2023-10-16',
      created: Date.now(),
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_weekly_123',
          object: 'checkout.session',
          subscription: 'sub_test_weekly_123',
          customer: 'cus_test_123',
          metadata: {
            kind: 'ad_budget',
            funding_model: 'weekly_drip',
            account_id: 'acc_test_weekly_456',
            weekly_ad_spend_cents: '16000',
            weekly_amount_cents: '18500',
            monthly_budget_cents: '69300',
            business_name: 'Apex Roofing',
            trade: 'Roofing',
            city: 'Austin, TX',
            services: 'Roof Replacement',
          },
        } as unknown as Stripe.Checkout.Session,
      },
      livemode: false,
      pending_webhooks: 0,
      request: null,
    };

    const handled = await handleAdBudgetWebhookEvent(event, mockAdmin);
    expect(handled).toBe(true);

    const adCampaign = (updatedContent as any)?.adCampaign;
    expect(adCampaign).toBeDefined();
    expect(adCampaign.status).toBe('active');
    expect(adCampaign.fundingModel).toBe('weekly_drip');
    expect(adCampaign.weeklyBudgetCents).toBe(16000);
    expect(adCampaign.monthlyBudgetCents).toBe(69300); // Properly calibrated monthly Google budget
  });

  it('strictly isolates cross-rail webhooks and ignores unrelated SaaS subscriptions/invoices', async () => {
    const mockAdmin: any = {
      from: (table: string) => {
        if (table === 'sites') {
          return {
            select: () => ({
              not: () => ({
                data: [
                  {
                    id: 'site_ad_user',
                    account_id: 'acc_ad_user',
                    content: {
                      adCampaign: {
                        stripeSubscriptionId: 'sub_actual_ad_campaign_123',
                        status: 'active',
                      },
                    },
                  },
                ],
              }),
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: 'site_ad_user',
                    account_id: 'acc_ad_user',
                    content: {
                      adCampaign: {
                        stripeSubscriptionId: 'sub_actual_ad_campaign_123',
                        status: 'active',
                      },
                    },
                  },
                }),
              }),
            }),
            update: () => ({ eq: async () => ({ error: null }) }),
          };
        }
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: null }) }),
          }),
        };
      },
    };

    // Unrelated SaaS subscription invoice
    const unrelatedInvoiceEvent: Stripe.Event = {
      id: 'evt_test_saas_invoice',
      object: 'event',
      api_version: '2023-10-16',
      created: Date.now(),
      type: 'invoice.paid',
      data: {
        object: {
          id: 'in_saas_monthly_123',
          subscription: 'sub_unrelated_saas_plan_789',
          customer: 'cus_saas_customer',
        } as unknown as Stripe.Invoice,
      },
      livemode: false,
      pending_webhooks: 0,
      request: null,
    };

    const handledUnrelated = await handleAdBudgetWebhookEvent(unrelatedInvoiceEvent, mockAdmin);
    expect(handledUnrelated).toBe(false); // MUST NOT intercept unrelated invoices!

    // Actual Ad Campaign invoice
    const adCampaignInvoiceEvent: Stripe.Event = {
      id: 'evt_test_ad_invoice',
      object: 'event',
      api_version: '2023-10-16',
      created: Date.now(),
      type: 'invoice.paid',
      data: {
        object: {
          id: 'in_ad_monthly_123',
          subscription: 'sub_actual_ad_campaign_123',
          customer: 'cus_ad_customer',
        } as unknown as Stripe.Invoice,
      },
      livemode: false,
      pending_webhooks: 0,
      request: null,
    };

    const handledAd = await handleAdBudgetWebhookEvent(adCampaignInvoiceEvent, mockAdmin);
    expect(handledAd).toBe(true); // Properly handles registered ad campaign subscription
  });

  it('executes automated wallet refills with off-session Stripe charges and respects monthly caps', async () => {
    const { executeWalletRefillCharge } = await import('@/lib/ad-billing');
    const { getStripeClient } = await import('@/lib/stripe');
    const stripe = getStripeClient();

    let updatedAdCampaign: Record<string, unknown> | null = null;

    const mockAdmin: any = {
      from: (table: string) => {
        if (table === 'sites') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: 'site_wallet_user',
                    account_id: 'acc_wallet_user',
                    content: {
                      adCampaign: {
                        fundingModel: 'auto_refill_wallet',
                        status: 'active',
                        walletBalanceCents: 5000, // $50 (below $75 threshold)
                        refillThresholdCents: 7500, // $75
                        refillAmountCents: 25000, // $250
                        maxMonthlySpendCents: 100000, // $1,000
                        spendThisMonthCents: 25000, // $250 spent so far
                        stripeCustomerId: 'cus_wallet_123',
                      },
                    },
                  },
                }),
              }),
            }),
            update: (payload: any) => ({
              eq: async () => {
                updatedAdCampaign = payload.content?.adCampaign;
                return { error: null };
              },
            }),
          };
        }
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
        };
      },
    };

    vi.spyOn(stripe.paymentMethods, 'list').mockResolvedValueOnce({
      data: [{ id: 'pm_card_valid_123' }],
    } as any);

    vi.spyOn(stripe.paymentIntents, 'create').mockResolvedValueOnce({
      id: 'pi_refill_charge_123',
      status: 'succeeded',
    } as any);

    const refillResult = await executeWalletRefillCharge({
      admin: mockAdmin,
      accountId: 'acc_wallet_user',
      reason: 'balance_threshold_drop',
    });

    expect(refillResult.success).toBe(true);
    expect(refillResult.refilled).toBe(true);
    expect(refillResult.chargedCents).toBe(28750); // $250 ad spend + 15% platform fee ($37.50)
    expect(updatedAdCampaign).not.toBeNull();
    const campaignState = updatedAdCampaign as unknown as Record<string, unknown>;
    expect(campaignState.walletBalanceCents).toBe(30000); // $50 + $250 = $300
    expect(campaignState.spendThisMonthCents).toBe(50000); // $250 + $250 = $500
  });

  it('records continuous ad spend usage, decrements wallet balance, logs history, and triggers refill on threshold drop', async () => {
    const { recordAdSpendUsage } = await import('@/lib/ad-billing');
    const { getStripeClient } = await import('@/lib/stripe');
    const stripe = getStripeClient();

    let siteAdCampaignState: Record<string, unknown> = {
      fundingModel: 'auto_refill_wallet',
      status: 'active',
      walletBalanceCents: 9000, // $90 (above $75 threshold)
      refillThresholdCents: 7500, // $75
      refillAmountCents: 25000, // $250
      maxMonthlySpendCents: 100000,
      spendThisMonthCents: 10000, // $100 spent
      stripeCustomerId: 'cus_wallet_spend_user',
      dailySpendHistory: [],
    };

    const mockAdmin: any = {
      from: (table: string) => {
        if (table === 'sites') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: 'site_spend_user',
                    account_id: 'acc_spend_user',
                    content: {
                      adCampaign: { ...siteAdCampaignState },
                    },
                  },
                }),
              }),
            }),
            update: (payload: any) => ({
              eq: async () => {
                siteAdCampaignState = { ...payload.content?.adCampaign };
                return { error: null };
              },
            }),
          };
        }
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
        };
      },
    };

    vi.spyOn(stripe.paymentMethods, 'list').mockResolvedValue({
      data: [{ id: 'pm_card_valid_123' }],
    } as any);

    vi.spyOn(stripe.paymentIntents, 'create').mockResolvedValue({
      id: 'pi_auto_refill_from_spend',
      status: 'succeeded',
    } as any);

    // Spend $25 (drops balance from $90 to $65, which is < $75 threshold and triggers auto-refill of $250!)
    const spendResult = await recordAdSpendUsage({
      admin: mockAdmin,
      accountId: 'acc_spend_user',
      spendCents: 2500, // $25
      clicks: 3,
      impressions: 65,
      conversions: 1,
      date: '2026-08-30',
      source: 'google_ads_api',
    });

    expect(spendResult.success).toBe(true);
    expect(spendResult.refillTriggered).toBe(true); // Refill automatically triggered!
    expect(siteAdCampaignState.dailySpendHistory).toBeDefined();
    const history = siteAdCampaignState.dailySpendHistory as any[];
    expect(history.length).toBe(1);
    expect(history[0].spendCents).toBe(2500);
    expect(history[0].clicks).toBe(3);
    // New balance: $90 - $25 (spend) + $250 (refill) = $315 ($31500)
    expect(siteAdCampaignState.walletBalanceCents).toBe(31500);
  });

  it('supports pausing, resuming, and cancelling active ad campaigns', async () => {
    const { pauseAdCampaign, resumeAdCampaign, cancelAdCampaign } = await import('@/lib/ad-billing');
    const { getStripeClient } = await import('@/lib/stripe');
    const stripe = getStripeClient();

    let campaignState: Record<string, unknown> = {
      status: 'active',
      googleCampaignId: '123456789',
      stripeSubscriptionId: 'sub_test_pause_cancel',
      cancelAtPeriodEnd: false,
    };

    const mockAdmin: any = {
      from: (table: string) => {
        if (table === 'sites') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: 'site_test_pause',
                    account_id: 'acc_test_pause',
                    content: { adCampaign: { ...campaignState } },
                  },
                }),
              }),
            }),
            update: (payload: any) => ({
              eq: async () => {
                campaignState = { ...payload.content?.adCampaign };
                return { error: null };
              },
            }),
          };
        }
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
        };
      },
    };

    vi.spyOn(stripe.subscriptions, 'update').mockResolvedValue({
      id: 'sub_test_pause_cancel',
      cancel_at_period_end: true,
    } as any);

    // 1. Pause
    const pauseRes = await pauseAdCampaign(mockAdmin, 'acc_test_pause');
    expect(pauseRes.success).toBe(true);
    expect(campaignState.status).toBe('paused');

    // 2. Resume
    const resumeRes = await resumeAdCampaign(mockAdmin, 'acc_test_pause');
    expect(resumeRes.success).toBe(true);
    expect(campaignState.status).toBe('active');

    // 3. Cancel (at period end)
    const cancelRes = await cancelAdCampaign(mockAdmin, 'acc_test_pause', false);
    expect(cancelRes.success).toBe(true);
    expect(campaignState.cancelAtPeriodEnd).toBe(true);
  });

  it('sends 24-hour advance SMS notifications for upcoming renewals to opted-in contractors', async () => {
    const { processUpcomingPaymentSmsAlerts } = await import('@/lib/ad-billing');
    const smsModule = await import('@/lib/sms-provider');

    const sendSpy = vi.spyOn(smsModule, 'sendProviderMessage').mockResolvedValue('simulated_msg_123');
    vi.spyOn(smsModule, 'isSmsProviderConfigured').mockReturnValue(true);

    const renewalDate = new Date(Date.now() + 18 * 60 * 60 * 1000).toISOString(); // In 18 hours

    let siteState: Record<string, unknown> = {
      status: 'active',
      fundingModel: 'weekly_drip',
      weeklyAmountCents: 18500,
      currentPeriodEnd: renewalDate,
      smsAlertsEnabled: true,
      smsAlertPhone: '+15551234567',
    };

    const mockAdmin: any = {
      from: (table: string) => {
        if (table === 'sites') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: 'site_sms_user',
                    account_id: 'acc_sms_user',
                    content: { phone: '+15551234567', adCampaign: { ...siteState } },
                  },
                }),
              }),
              not: () => Promise.resolve({
                data: [
                  {
                    id: 'site_sms_user',
                    account_id: 'acc_sms_user',
                    content: { phone: '+15551234567', adCampaign: { ...siteState } },
                  },
                ],
              }),
            }),
            update: (payload: any) => ({
              eq: async () => {
                siteState = { ...payload.content?.adCampaign };
                return { error: null };
              },
            }),
          };
        }
        if (table === 'accounts') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { business_name: 'Apex Plumbing', alert_phone: '+15551234567' },
                }),
              }),
            }),
          };
        }
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
        };
      },
    };

    const res = await processUpcomingPaymentSmsAlerts(mockAdmin);
    expect(res.alertsSent).toBe(1);
    expect(sendSpy).toHaveBeenCalled();
    const calledArgs = sendSpy.mock.calls[0];
    expect(calledArgs[0]).toBe('+15551234567');
    expect(calledArgs[1]).toContain('$185');
    expect(calledArgs[1]).toContain('24 hours');
    expect(calledArgs[2].accountId).toBeNull(); // Guaranteed unmetered: 0 user text credits consumed
  });
});
