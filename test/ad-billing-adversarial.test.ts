import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  createAdBudgetCheckoutSession,
  handleAdBudgetWebhookEvent,
  executeWalletRefillCharge,
  recordAdSpendUsage,
  atomicCreditAdWalletState,
  atomicDebitAdWalletState,
  pauseAdCampaign,
  resumeAdCampaign,
  cancelAdCampaign,
  validateAdReturnUrl,
  AD_WEEKLY_TIERS,
  ALLOWED_WALLET_DEPOSIT_DOLLARS,
  ALLOWED_WALLET_THRESHOLD_DOLLARS,
  ALLOWED_WALLET_REFILL_DOLLARS,
  ALLOWED_WALLET_MAX_SPEND_DOLLARS,
  DEFAULT_AD_WALLET_STATE,
  type AdBudgetWalletState,
} from '@/lib/ad-billing';
import type Stripe from 'stripe';

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { id: 'acc_test_tamper', stripe_customer_id: 'cus_mock_123', business_name: 'Apex Roofing' },
          }),
          maybeSingle: async () => ({
            data: { id: 'acc_test_tamper', stripe_customer_id: 'cus_mock_123', business_name: 'Apex Roofing' },
          }),
        }),
      }),
      update: () => ({
        eq: async () => ({ error: null }),
      }),
    }),
  }),
}));

vi.mock('@/lib/sms', () => ({
  sendUpcomingAdPaymentSms: vi.fn().mockResolvedValue(true),
  sendAdWalletRefillSms: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/lib/google-ads-api', () => ({
  provisionManagedSearchCampaign: vi.fn().mockResolvedValue({
    success: true,
    campaignId: 'gads_mock_123456789',
    campaignResourceName: 'customers/123/campaigns/gads_mock_123456789',
    status: 'simulated',
    message: 'Campaign simulated successfully.',
  }),
  isGoogleAdsConfigured: vi.fn().mockReturnValue(true),
  updateGoogleAdsCampaignStatus: vi.fn().mockResolvedValue({ success: true }),
  fetchGoogleAdsCampaignDailySpend: vi.fn().mockResolvedValue({ success: true, data: [] }),
}));

vi.mock('@/lib/billing/subscription-cancellation', () => ({
  cancelAdCampaignSubscription: vi.fn().mockResolvedValue(undefined),
}));

describe('Managed Ads Money Movement Hardening (P0 Adversarial Suite)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { getStripeClient } = await import('@/lib/stripe');
    const stripe = getStripeClient();
    vi.spyOn(stripe.billingPortal.sessions, 'create').mockResolvedValue({
      url: 'https://billing.stripe.com/p/session/mock',
    } as any);
  });

  describe('1. Exact Fail-Closed Payment Status Checks', () => {
    function createMockAdmin(initialState: Partial<AdBudgetWalletState> = {}) {
      let state: AdBudgetWalletState = { ...DEFAULT_AD_WALLET_STATE, ...initialState };
      return {
        getState: () => state,
        from: (table: string) => {
          if (table === 'sites') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: 'site_123',
                      account_id: 'acc_123',
                      subdomain: 'apexroofing',
                      custom_domain: null,
                      content: { adCampaign: state },
                    },
                  }),
                }),
                not: () => ({
                  data: [
                    {
                      id: 'site_123',
                      account_id: 'acc_123',
                      content: { adCampaign: state },
                    },
                  ],
                }),
              }),
              update: (payload: any) => ({
                eq: async () => {
                  if (payload.content?.adCampaign) {
                    state = { ...state, ...payload.content.adCampaign };
                  }
                  return { error: null };
                },
              }),
            };
          }
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null }),
                single: async () => ({ data: null }),
              }),
            }),
          };
        },
      };
    }

    it('rejects checkout.session.completed when payment_status is unpaid', async () => {
      const mockAdmin = createMockAdmin();
      const event = {
        id: 'evt_unpaid',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_unpaid',
            payment_status: 'unpaid',
            metadata: { kind: 'ad_budget', account_id: 'acc_123' },
          },
        },
      } as unknown as Stripe.Event;

      const handled = await handleAdBudgetWebhookEvent(event, mockAdmin as any);
      expect(handled).toBe(false);
      expect(mockAdmin.getState().status).toBe('inactive');
    });

    it('rejects checkout.session.completed when payment_status is missing, null, or undefined', async () => {
      const mockAdmin = createMockAdmin();
      const eventMissing = {
        id: 'evt_missing',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_missing',
            metadata: { kind: 'ad_budget', account_id: 'acc_123' },
          },
        },
      } as unknown as Stripe.Event;

      const handled = await handleAdBudgetWebhookEvent(eventMissing, mockAdmin as any);
      expect(handled).toBe(false);
      expect(mockAdmin.getState().status).toBe('inactive');
    });

    it('rejects checkout.session.completed when payment_status is no_payment_required', async () => {
      const mockAdmin = createMockAdmin();
      const eventNoPayment = {
        id: 'evt_nopay',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_nopay',
            payment_status: 'no_payment_required',
            metadata: { kind: 'ad_budget', account_id: 'acc_123' },
          },
        },
      } as unknown as Stripe.Event;

      const handled = await handleAdBudgetWebhookEvent(eventNoPayment, mockAdmin as any);
      expect(handled).toBe(false);
      expect(mockAdmin.getState().status).toBe('inactive');
    });

    it('accepts and activates checkout.session.completed when payment_status is exactly paid', async () => {
      const mockAdmin = createMockAdmin();
      const eventPaid = {
        id: 'evt_paid',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_paid',
            payment_status: 'paid',
            metadata: {
              kind: 'ad_budget',
              account_id: 'acc_123',
              funding_model: 'weekly_drip',
              weekly_ad_spend_cents: '16000',
              weekly_amount_cents: '16800',
            },
          },
        },
      } as unknown as Stripe.Event;

      const handled = await handleAdBudgetWebhookEvent(eventPaid, mockAdmin as any);
      expect(handled).toBe(true);
      expect(mockAdmin.getState().status).toBe('active');
      expect(mockAdmin.getState().walletBalanceCents).toBe(16000);
    });

    it('rejects payment_intent.succeeded when paymentIntent.status is not succeeded', async () => {
      const mockAdmin = createMockAdmin();
      const eventPending = {
        id: 'evt_pi_pending',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_pending',
            status: 'processing',
            metadata: { kind: 'ad_wallet_refill', account_id: 'acc_123', refill_ad_spend_cents: '25000' },
          },
        },
      } as unknown as Stripe.Event;

      const handled = await handleAdBudgetWebhookEvent(eventPending, mockAdmin as any);
      expect(handled).toBe(false);
    });

    it('rejects invoice.paid when invoice.paid is false or status is not paid', async () => {
      const mockAdmin = createMockAdmin({
        stripeSubscriptionId: 'sub_123',
        status: 'past_due',
        provisioningStatus: 'active',
      });
      const eventUnpaidInvoice = {
        id: 'evt_inv_unpaid',
        type: 'invoice.paid',
        data: {
          object: {
            id: 'in_unpaid',
            subscription: 'sub_123',
            paid: false,
            status: 'open',
          },
        },
      } as unknown as Stripe.Event;

      const handled = await handleAdBudgetWebhookEvent(eventUnpaidInvoice, mockAdmin as any);
      expect(handled).toBe(false);
      expect(mockAdmin.getState().status).toBe('past_due');
    });
  });

  describe('2. Strict Price Tier Binding & Client Tampering Resistance', () => {
    const originalEnv = process.env.FEATURE_MANAGED_ADS_CHECKOUT_ENABLED;

    beforeEach(() => {
      process.env.FEATURE_MANAGED_ADS_CHECKOUT_ENABLED = 'true';
    });

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.FEATURE_MANAGED_ADS_CHECKOUT_ENABLED;
      } else {
        process.env.FEATURE_MANAGED_ADS_CHECKOUT_ENABLED = originalEnv;
      }
    });

    it('enforces server-owned weekly tier constants regardless of client-submitted fees', async () => {
      const { getStripeClient } = await import('@/lib/stripe');
      const stripe = getStripeClient();

      let capturedSession: any = null;
      vi.spyOn(stripe.checkout.sessions, 'create').mockImplementationOnce(async (config: any) => {
        capturedSession = config;
        return { id: 'cs_test_bundle', url: 'https://checkout.stripe.com/test' } as any;
      });

      // Attacker attempts to request $560 ad spend with only $1 fee
      await createAdBudgetCheckoutSession({
        accountId: 'acc_test_tamper',
        fundingModel: 'weekly_drip',
        bundleId: 'scale',
        weeklyAmountDollars: 561, // Tampered total
        weeklyAdSpendDollars: 560,
        weeklyFeeDollars: 1, // Tampered fee
        businessName: 'Apex Roofing',
        trade: 'Roofing',
        city: 'Austin, TX',
        returnUrl: '/dashboard/marketing/ads',
      });

      expect(capturedSession).not.toBeNull();
      // Server overrides with canonical Scale tier ($616 total = 61600 cents)
      expect(capturedSession.line_items[0].price_data.unit_amount).toBe(AD_WEEKLY_TIERS.scale.weeklyAmountCents);
      expect(capturedSession.metadata.weekly_fee_cents).toBe(String(AD_WEEKLY_TIERS.scale.weeklyFeeCents));
      expect(capturedSession.metadata.weekly_amount_cents).toBe(String(AD_WEEKLY_TIERS.scale.weeklyAmountCents));
    });

    it('rejects invalid auto-refill wallet deposit amounts not in allowed constants', async () => {
      await expect(
        createAdBudgetCheckoutSession({
          accountId: 'acc_wallet_tamper',
          fundingModel: 'auto_refill_wallet',
          depositAmountDollars: 300, // Not in [250, 500, 1000]
          businessName: 'Apex Roofing',
          trade: 'Roofing',
          city: 'Austin, TX',
          returnUrl: '/dashboard/marketing/ads',
        })
      ).rejects.toThrow(/Invalid deposit amount: \$300/);
    });

    it('rejects invalid auto-refill threshold and max spend amounts not in allowed constants', async () => {
      await expect(
        createAdBudgetCheckoutSession({
          accountId: 'acc_wallet_tamper',
          fundingModel: 'auto_refill_wallet',
          depositAmountDollars: 250,
          refillThresholdDollars: 80, // Not in [50, 75, 100, 150, 300]
          businessName: 'Apex Roofing',
          trade: 'Roofing',
          city: 'Austin, TX',
          returnUrl: '/dashboard/marketing/ads',
        })
      ).rejects.toThrow(/Invalid refill threshold: \$80/);

      await expect(
        createAdBudgetCheckoutSession({
          accountId: 'acc_wallet_tamper',
          fundingModel: 'auto_refill_wallet',
          depositAmountDollars: 250,
          refillThresholdDollars: 75,
          refillAmountDollars: 250,
          maxMonthlySpendDollars: 9999, // Not in [750, 1000, 1500, 2500, 5000]
          businessName: 'Apex Roofing',
          trade: 'Roofing',
          city: 'Austin, TX',
          returnUrl: '/dashboard/marketing/ads',
        })
      ).rejects.toThrow(/Invalid max monthly spend cap: \$9999/);
    });
  });

  describe('3. Return-URL Origin Verification (Open Redirect & SSRF Prevention)', () => {
    it('sanitizes malicious open-redirect URLs to the safe dashboard route', () => {
      expect(validateAdReturnUrl('https://evil.com/phishing')).toBe('/dashboard/marketing/ads');
      expect(validateAdReturnUrl('http://attacker.org')).toBe('/dashboard/marketing/ads');
      expect(validateAdReturnUrl('//evil.com/trick')).toBe('/dashboard/marketing/ads');
      expect(validateAdReturnUrl('/\\evil.com/trick')).toBe('/dashboard/marketing/ads');
      expect(validateAdReturnUrl('javascript:alert(1)')).toBe('/dashboard/marketing/ads');
      expect(validateAdReturnUrl('data:text/html,<script>alert(1)</script>')).toBe('/dashboard/marketing/ads');
    });

    it('preserves valid relative paths and approved hostnames', () => {
      expect(validateAdReturnUrl('/dashboard/marketing/ads')).toBe('/dashboard/marketing/ads');
      expect(validateAdReturnUrl('/dashboard/settings')).toBe('/dashboard/settings');
      expect(validateAdReturnUrl('https://app.letsgetquoted.com/dashboard/marketing/ads')).toBe('https://app.letsgetquoted.com/dashboard/marketing/ads');
      expect(validateAdReturnUrl('https://austinroofing.letsgetquoted.com/dashboard')).toBe('https://austinroofing.letsgetquoted.com/dashboard');
      expect(validateAdReturnUrl('http://localhost:3010/dashboard/marketing/ads')).toBe('http://localhost:3010/dashboard/marketing/ads');
    });

    it('honors verified contractor custom domains as allowed origins', () => {
      const customDomainOrigin = 'https://lonestarroofing.com';
      expect(validateAdReturnUrl('https://lonestarroofing.com/dashboard/marketing/ads', customDomainOrigin)).toBe(
        'https://lonestarroofing.com/dashboard/marketing/ads'
      );
    });
  });

  describe('4. Durable Event Replay Deduplication (>20 Events Safety)', () => {
    it('correctly tracks and deduplicates more than 20 sequential events without dropping history', async () => {
      let state: AdBudgetWalletState = {
        ...DEFAULT_AD_WALLET_STATE,
        status: 'active',
        walletBalanceCents: 25000,
        processedRefillPaymentIntentIds: [],
      };

      const mockAdmin: any = {
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: 'site_dedup',
                  account_id: 'acc_dedup',
                  content: { adCampaign: state },
                },
              }),
            }),
          }),
          update: (payload: any) => ({
            eq: async () => {
              state = { ...state, ...payload.content.adCampaign };
              return { error: null };
            },
          }),
        }),
      };

      // Process 30 unique refill payment intents
      for (let i = 1; i <= 30; i++) {
        const intentId = `pi_test_event_${i}`;
        const res = await atomicCreditAdWalletState(mockAdmin, {
          accountId: 'acc_dedup',
          paymentIntentId: intentId,
          creditCents: 1000, // $10 each
        });
        expect(res.success).toBe(true);
        expect(res.alreadyCredited).toBe(false);
      }

      // Balance should be initial $250 + 30 * $10 = $550 (55000 cents)
      expect(state.walletBalanceCents).toBe(55000);
      expect(state.processedRefillPaymentIntentIds?.length).toBe(30);

      // Replay the 1st event (which would have been lost in a 20-element slice)
      const replayFirst = await atomicCreditAdWalletState(mockAdmin, {
        accountId: 'acc_dedup',
        paymentIntentId: 'pi_test_event_1',
        creditCents: 1000,
      });
      expect(replayFirst.alreadyCredited).toBe(true);
      expect(replayFirst.newBalanceCents).toBe(55000); // Balance unchanged!

      // Replay the 15th and 30th event
      const replayMid = await atomicCreditAdWalletState(mockAdmin, {
        accountId: 'acc_dedup',
        paymentIntentId: 'pi_test_event_15',
        creditCents: 1000,
      });
      expect(replayMid.alreadyCredited).toBe(true);
      expect(replayMid.newBalanceCents).toBe(55000);

      const replayLast = await atomicCreditAdWalletState(mockAdmin, {
        accountId: 'acc_dedup',
        paymentIntentId: 'pi_test_event_30',
        creditCents: 1000,
      });
      expect(replayLast.alreadyCredited).toBe(true);
      expect(replayLast.newBalanceCents).toBe(55000);
    });
  });

  describe('5. Ambiguity-Safe Idempotency Key Handling on Stripe Failures', () => {
    it('preserves pendingRefillIdempotencyKey on ambiguous network errors so retries do not double charge', async () => {
      const { getStripeClient } = await import('@/lib/stripe');
      const stripe = getStripeClient();

      let state: AdBudgetWalletState = {
        ...DEFAULT_AD_WALLET_STATE,
        fundingModel: 'auto_refill_wallet',
        status: 'active',
        walletBalanceCents: 5000, // $50 (below $75 threshold)
        refillThresholdCents: 7500,
        refillAmountCents: 25000,
        maxMonthlySpendCents: 100000,
        spendThisMonthCents: 0,
        stripeCustomerId: 'cus_test_ambiguous',
      };

      const mockAdmin: any = {
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: 'site_retry',
                  account_id: 'acc_retry',
                  content: { adCampaign: state },
                },
              }),
            }),
          }),
          update: (payload: any) => ({
            eq: async () => {
              state = { ...state, ...payload.content.adCampaign };
              return { error: null };
            },
          }),
        }),
      };

      vi.spyOn(stripe.paymentMethods, 'list').mockResolvedValue({
        data: [{ id: 'pm_card_mock' }] as any,
      } as any);

      // Simulate network connection timeout on Stripe call
      vi.spyOn(stripe.paymentIntents, 'create').mockRejectedValueOnce(
        new Error('StripeConnectionError: Connection timeout reaching api.stripe.com')
      );

      const res = await executeWalletRefillCharge({
        admin: mockAdmin,
        accountId: 'acc_retry',
      });

      expect(res.success).toBe(false);
      expect(state.status).toBe('past_due');
      // Crucial: pending idempotency key must NOT be wiped!
      expect(state.pendingRefillIdempotencyKey).toBeTruthy();
      expect(state.pendingRefillAmountCents).toBe(25000);

      const savedKey = state.pendingRefillIdempotencyKey;

      // On second try, Stripe succeeds
      let capturedIdempotencyKey: string | undefined;
      vi.spyOn(stripe.paymentIntents, 'create').mockImplementationOnce(async (params: any, options: any) => {
        capturedIdempotencyKey = options?.idempotencyKey;
        return {
          id: 'pi_recovered_123',
          status: 'succeeded',
        } as any;
      });

      const retryRes = await executeWalletRefillCharge({
        admin: mockAdmin,
        accountId: 'acc_retry',
      });

      expect(retryRes.success).toBe(true);
      // Confirmed that retry used the EXACT SAME idempotency key
      expect(capturedIdempotencyKey).toBe(savedKey);
      expect(state.status).toBe('active');
      expect(state.walletBalanceCents).toBe(30000); // $50 + $250 = $300
      expect(state.pendingRefillIdempotencyKey).toBeNull(); // Cleared after success
    });

    it('clears pendingRefillIdempotencyKey on definitive card declines so new methods can be used', async () => {
      const { getStripeClient } = await import('@/lib/stripe');
      const stripe = getStripeClient();

      let state: AdBudgetWalletState = {
        ...DEFAULT_AD_WALLET_STATE,
        fundingModel: 'auto_refill_wallet',
        status: 'active',
        walletBalanceCents: 5000,
        refillThresholdCents: 7500,
        refillAmountCents: 25000,
        maxMonthlySpendCents: 100000,
        spendThisMonthCents: 0,
        stripeCustomerId: 'cus_test_declined',
      };

      const mockAdmin: any = {
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: 'site_decline',
                  account_id: 'acc_decline',
                  content: { adCampaign: state },
                },
              }),
            }),
          }),
          update: (payload: any) => ({
            eq: async () => {
              state = { ...state, ...payload.content.adCampaign };
              return { error: null };
            },
          }),
        }),
      };

      vi.spyOn(stripe.paymentMethods, 'list').mockResolvedValue({
        data: [{ id: 'pm_card_declined' }] as any,
      } as any);

      // Simulate definitive card decline error
      const declineError: any = new Error('Your card was declined.');
      declineError.type = 'card_error';
      declineError.code = 'card_declined';
      vi.spyOn(stripe.paymentIntents, 'create').mockRejectedValueOnce(declineError);

      const res = await executeWalletRefillCharge({
        admin: mockAdmin,
        accountId: 'acc_decline',
      });

      expect(res.success).toBe(false);
      expect(state.status).toBe('past_due');
      // For definitive card decline, pending key is cleared
      expect(state.pendingRefillIdempotencyKey).toBeNull();
    });
  });

  describe('6. Idempotent Pause, Resume, and Cancellation Lifecycle', () => {
    it('allows repeated calls to pause, resume, and cancel without throw or state corruption', async () => {
      let state: AdBudgetWalletState = {
        ...DEFAULT_AD_WALLET_STATE,
        status: 'active',
        googleCampaignId: 'gads_test_cycle',
        stripeSubscriptionId: 'sub_test_cycle',
        walletBalanceCents: 25000,
      };

      const mockAdmin: any = {
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: 'site_cycle',
                  account_id: 'acc_cycle',
                  content: { adCampaign: state },
                },
              }),
            }),
          }),
          update: (payload: any) => ({
            eq: async () => {
              state = { ...state, ...payload.content.adCampaign };
              return { error: null };
            },
          }),
        }),
      };

      // 1. Pause campaign
      const pause1 = await pauseAdCampaign(mockAdmin, 'acc_cycle');
      expect(pause1.success).toBe(true);
      expect(state.status).toBe('paused');

      // 2. Pause again (idempotent)
      const pause2 = await pauseAdCampaign(mockAdmin, 'acc_cycle');
      expect(pause2.success).toBe(true);
      expect(state.status).toBe('paused');

      // 3. Resume campaign
      const resume1 = await resumeAdCampaign(mockAdmin, 'acc_cycle');
      expect(resume1.success).toBe(true);
      expect(state.status).toBe('active');

      // 4. Resume again (idempotent)
      const resume2 = await resumeAdCampaign(mockAdmin, 'acc_cycle');
      expect(resume2.success).toBe(true);
      expect(state.status).toBe('active');

      // 5. Cancel campaign (immediate)
      const cancel1 = await cancelAdCampaign(mockAdmin, 'acc_cycle', true);
      expect(cancel1.success).toBe(true);
      expect(state.status).toBe('inactive');
      expect(state.stripeSubscriptionId).toBeNull();

      // 6. Cancel again (idempotent after already cancelled)
      const cancel2 = await cancelAdCampaign(mockAdmin, 'acc_cycle', true);
      expect(cancel2.success).toBe(true);
      expect(state.status).toBe('inactive');
    });
  });

  describe('7. Parallel Concurrency & Race Condition Hardening', () => {
    it('handles concurrent parallel credits safely without lost updates', async () => {
      let state: AdBudgetWalletState = {
        ...DEFAULT_AD_WALLET_STATE,
        status: 'active',
        walletBalanceCents: 10000,
        processedRefillPaymentIntentIds: [],
      };

      // Mock admin simulating Postgres atomic_ad_wallet_credit RPC with row locking
      let rpcMutex = Promise.resolve();
      const mockAdmin: any = {
        rpc: async (fnName: string, args: any) => {
          if (fnName === 'atomic_ad_wallet_credit') {
            return new Promise((resolve) => {
              rpcMutex = rpcMutex.then(async () => {
                await new Promise((r) => setTimeout(r, 2));
                const processed = state.processedRefillPaymentIntentIds || [];
                const already = processed.includes(args.p_payment_intent_id);
                const prev = state.walletBalanceCents || 0;
                const newBal = already ? prev : prev + args.p_credit_cents;
                if (!already) {
                  state = {
                    ...state,
                    status: 'active',
                    walletBalanceCents: newBal,
                    processedRefillPaymentIntentIds: [...processed, args.p_payment_intent_id],
                  };
                }
                resolve({
                  data: {
                    success: true,
                    already_credited: already,
                    previous_balance_cents: prev,
                    new_balance_cents: newBal,
                  },
                  error: null,
                });
              });
            });
          }
          return { data: null, error: { message: 'unknown RPC' } };
        },
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: 'site_parallel',
                  account_id: 'acc_parallel',
                  content: { adCampaign: state },
                },
              }),
            }),
          }),
          update: (payload: any) => ({
            eq: async () => {
              state = { ...state, ...payload.content.adCampaign };
              return { error: null };
            },
          }),
        }),
      };

      // Execute 10 distinct credits in parallel
      const creditPromises = Array.from({ length: 10 }, (_, i) =>
        atomicCreditAdWalletState(mockAdmin, {
          accountId: 'acc_parallel',
          paymentIntentId: `pi_par_${i + 1}`,
          creditCents: 5000, // $50 each
        })
      );

      const results = await Promise.all(creditPromises);
      for (const res of results) {
        expect(res.success).toBe(true);
      }

      // Verify all 10 intent IDs are recorded and balance increased by 10 * $50 = $500
      expect(state.processedRefillPaymentIntentIds?.length).toBe(10);
      expect(state.walletBalanceCents).toBe(60000); // $100 initial + $500 = $600
    });

    it('handles concurrent ad spend deductions and maintains accurate non-negative balances', async () => {
      let state: AdBudgetWalletState = {
        ...DEFAULT_AD_WALLET_STATE,
        status: 'active',
        walletBalanceCents: 50000, // $500
        dailySpendHistory: [],
        spendThisMonthCents: 0,
        totalSpendAllTimeCents: 0,
      };

      let rpcDebitMutex = Promise.resolve();
      const mockAdmin: any = {
        rpc: async (fnName: string, args: any) => {
          if (fnName === 'atomic_ad_wallet_spend') {
            return new Promise((resolve) => {
              rpcDebitMutex = rpcDebitMutex.then(async () => {
                await new Promise((r) => setTimeout(r, 2));
                const prev = state.walletBalanceCents || 0;
                const newBal = Math.max(0, prev - args.p_spend_cents);
                const newMonthSpend = (state.spendThisMonthCents || 0) + args.p_spend_cents;
                state = {
                  ...state,
                  walletBalanceCents: newBal,
                  spendThisMonthCents: newMonthSpend,
                  dailySpendHistory: [
                    {
                      date: args.p_date,
                      spendCents: args.p_spend_cents,
                      clicks: 0,
                      impressions: 0,
                      conversions: 0,
                      source: 'google_ads_api',
                      recordedAt: new Date().toISOString(),
                    },
                    ...(state.dailySpendHistory || []),
                  ],
                };
                resolve({
                  data: {
                    success: true,
                    previous_balance_cents: prev,
                    new_balance_cents: newBal,
                    delta_spend_cents: args.p_spend_cents,
                    spent_this_month_cents: newMonthSpend,
                    should_refill: false,
                  },
                  error: null,
                });
              });
            });
          }
          return { data: null, error: { message: 'unknown RPC' } };
        },
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: 'site_spend',
                  account_id: 'acc_spend',
                  content: { adCampaign: state },
                },
              }),
            }),
          }),
          update: (payload: any) => ({
            eq: async () => {
              state = { ...state, ...payload.content.adCampaign };
              return { error: null };
            },
          }),
        }),
      };

      // Record 5 distinct daily spend updates in parallel ($20, $30, $40, $50, $60 = $200 total)
      const spendPromises = [
        atomicDebitAdWalletState(mockAdmin, { accountId: 'acc_spend', spendCents: 2000, date: '2026-08-01' }),
        atomicDebitAdWalletState(mockAdmin, { accountId: 'acc_spend', spendCents: 3000, date: '2026-08-02' }),
        atomicDebitAdWalletState(mockAdmin, { accountId: 'acc_spend', spendCents: 4000, date: '2026-08-03' }),
        atomicDebitAdWalletState(mockAdmin, { accountId: 'acc_spend', spendCents: 5000, date: '2026-08-04' }),
        atomicDebitAdWalletState(mockAdmin, { accountId: 'acc_spend', spendCents: 6000, date: '2026-08-05' }),
      ];

      const results = await Promise.all(spendPromises);
      for (const res of results) {
        expect(res.success).toBe(true);
      }

      // Balance should be $500 - $200 = $300 (30000 cents)
      expect(state.walletBalanceCents).toBe(30000);
      expect(state.spendThisMonthCents).toBe(20000);
      expect(state.dailySpendHistory?.length).toBe(5);
    });
  });
});
