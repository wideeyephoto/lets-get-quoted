import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AD_WALLET_STATE,
  createAdBudgetCheckoutSession,
  handleAdBudgetWebhookEvent,
  calculateAdBudgetBreakdown,
  AD_PLATFORM_FEE_RATE,
} from '@/lib/ad-billing';

describe('Ad Billing Module', () => {
  it('calculates 15% platform management fee breakdown correctly', () => {
    expect(AD_PLATFORM_FEE_RATE).toBe(0.15);

    const starter = calculateAdBudgetBreakdown(300);
    expect(starter.adSpendDollars).toBe(300);
    expect(starter.platformFeeDollars).toBe(45); // 15% of 300
    expect(starter.totalMonthlyDollars).toBe(345);

    const growth = calculateAdBudgetBreakdown(600);
    expect(growth.adSpendDollars).toBe(600);
    expect(growth.platformFeeDollars).toBe(90); // 15% of 600
    expect(growth.totalMonthlyDollars).toBe(690);

    const scale = calculateAdBudgetBreakdown(1200);
    expect(scale.adSpendDollars).toBe(1200);
    expect(scale.platformFeeDollars).toBe(180); // 15% of 1200
    expect(scale.totalMonthlyDollars).toBe(1380);
  });

  it('provides sensible default wallet state', () => {
    expect(DEFAULT_AD_WALLET_STATE.status).toBe('inactive');
    expect(DEFAULT_AD_WALLET_STATE.monthlyBudgetCents).toBe(60000);
    expect(DEFAULT_AD_WALLET_STATE.platformFeeCents).toBe(0);
    expect(DEFAULT_AD_WALLET_STATE.totalMonthlyCents).toBe(60000);
  });

  it('rejects monthly budgets below $100', async () => {
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
});
