import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AD_WALLET_STATE,
  DEFAULT_AUTO_REFILL_CONFIG,
  createAdBudgetCheckoutSession,
  handleAdBudgetWebhookEvent,
  calculateAdBudgetBreakdown,
  checkAutoRefillTrigger,
  AD_PLATFORM_FEE_RATE,
} from '@/lib/ad-billing';

describe('Ad Billing Module', () => {
  it('calculates 10% platform management fee breakdown correctly', () => {
    expect(AD_PLATFORM_FEE_RATE).toBe(0.10);

    const starter = calculateAdBudgetBreakdown(300);
    expect(starter.adSpendDollars).toBe(300);
    expect(starter.platformFeeDollars).toBe(30); // 10% of 300
    expect(starter.totalMonthlyDollars).toBe(330);

    const growth = calculateAdBudgetBreakdown(600);
    expect(growth.adSpendDollars).toBe(600);
    expect(growth.platformFeeDollars).toBe(60); // 10% of 600
    expect(growth.totalMonthlyDollars).toBe(660);

    const scale = calculateAdBudgetBreakdown(1200);
    expect(scale.adSpendDollars).toBe(1200);
    expect(scale.platformFeeDollars).toBe(120); // 10% of 1200
    expect(scale.totalMonthlyDollars).toBe(1320);
  });

  it('provides sensible default wallet state', () => {
    expect(DEFAULT_AD_WALLET_STATE.status).toBe('inactive');
    expect(DEFAULT_AD_WALLET_STATE.monthlyBudgetCents).toBe(60000);
    expect(DEFAULT_AD_WALLET_STATE.platformFeeCents).toBe(0);
    expect(DEFAULT_AD_WALLET_STATE.totalMonthlyCents).toBe(60000);
  });

  it('rejects monthly budgets below $100 or above $50,000', async () => {
    await expect(
      createAdBudgetCheckoutSession({
        accountId: 'acc_123',
        monthlyBudgetDollars: 50,
        businessName: 'Apex Roofing',
        trade: 'Roofing',
        city: 'Austin, TX',
        returnUrl: '/dashboard/marketing/ads',
      })
    ).rejects.toThrow('Minimum monthly ad budget is $100.');

    await expect(
      createAdBudgetCheckoutSession({
        accountId: 'acc_123',
        monthlyBudgetDollars: 60000,
        businessName: 'Apex Roofing',
        trade: 'Roofing',
        city: 'Austin, TX',
        returnUrl: '/dashboard/marketing/ads',
      })
    ).rejects.toThrow('Maximum monthly ad budget is $50,000.');
  });

  it('rejects weekly budgets below $50 or above $15,000', async () => {
    await expect(
      createAdBudgetCheckoutSession({
        accountId: 'acc_123',
        weeklyAmountDollars: 25,
        businessName: 'Apex Roofing',
        trade: 'Roofing',
        city: 'Austin, TX',
        returnUrl: '/dashboard/marketing/ads',
      })
    ).rejects.toThrow('Minimum weekly ad budget is $50.');

    await expect(
      createAdBudgetCheckoutSession({
        accountId: 'acc_123',
        weeklyAmountDollars: 20000,
        businessName: 'Apex Roofing',
        trade: 'Roofing',
        city: 'Austin, TX',
        returnUrl: '/dashboard/marketing/ads',
      })
    ).rejects.toThrow('Maximum weekly ad budget is $15,000.');
  });

  it('refuses to create checkout session in production when Google Ads is unconfigured', async () => {
    const originalVercelEnv = process.env.VERCEL_ENV;
    process.env.VERCEL_ENV = 'production';
    try {
      await expect(
        createAdBudgetCheckoutSession({
          accountId: 'acc_123',
          weeklyAmountDollars: 330,
          businessName: 'Apex Roofing',
          trade: 'Roofing',
          city: 'Austin, TX',
          returnUrl: '/dashboard/marketing/ads',
        })
      ).rejects.toThrow('Google Ads automated provisioning is currently undergoing configuration in this environment.');
    } finally {
      process.env.VERCEL_ENV = originalVercelEnv;
    }
  });

  it('ignores unrelated Stripe webhook events', async () => {
    const fakeEvent: any = {
      type: 'charge.succeeded',
      data: { object: {} },
    };
    const handled = await handleAdBudgetWebhookEvent(fakeEvent);
    expect(handled).toBe(false);
  });

  it('ignores checkout sessions not marked as kind=ad_budget', async () => {
    const fakeEvent: any = {
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: { kind: 'standard_invoice' },
        },
      },
    };
    const handled = await handleAdBudgetWebhookEvent(fakeEvent);
    expect(handled).toBe(false);
  });

  it('correctly evaluates auto-refill triggers with low balance and monthly spend caps', () => {
    const config = {
      depositAmountDollars: 250,
      refillThresholdDollars: 75,
      refillAmountDollars: 250,
      maxMonthlySpendDollars: 1000,
    };

    // 1. Balance above threshold -> no refill
    const aboveThreshold = checkAutoRefillTrigger({
      currentBalanceDollars: 120,
      spentThisMonthDollars: 250,
      config,
    });
    expect(aboveThreshold.shouldRefill).toBe(false);
    expect(aboveThreshold.refillAmountDollars).toBe(0);

    // 2. Balance at or below threshold ($75) and within monthly cap -> triggers $250 refill
    const belowThreshold = checkAutoRefillTrigger({
      currentBalanceDollars: 45,
      spentThisMonthDollars: 250,
      config,
    });
    expect(belowThreshold.shouldRefill).toBe(true);
    expect(belowThreshold.refillAmountDollars).toBe(250);

    // 3. Balance below threshold but monthly spend reached $1,000 -> hard stop (no refill)
    const atMonthlyCap = checkAutoRefillTrigger({
      currentBalanceDollars: 30,
      spentThisMonthDollars: 1000,
      config,
    });
    expect(atMonthlyCap.shouldRefill).toBe(false);
    expect(atMonthlyCap.refillAmountDollars).toBe(0);
    expect(atMonthlyCap.reason).toContain('Max monthly spend cap');

    // 4. Balance below threshold with partial remaining monthly allowance ($150 left) -> capped refill ($150)
    const partialAllowance = checkAutoRefillTrigger({
      currentBalanceDollars: 50,
      spentThisMonthDollars: 850,
      config,
    });
    expect(partialAllowance.shouldRefill).toBe(true);
    expect(partialAllowance.refillAmountDollars).toBe(150);
  });
});
