import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_AD_WALLET_STATE,
  DEFAULT_AUTO_REFILL_CONFIG,
  createAdBudgetCheckoutSession,
  handleAdBudgetWebhookEvent,
  calculateAdBudgetBreakdown,
  checkAutoRefillTrigger,
  AD_PLATFORM_FEE_RATE,
} from '@/lib/ad-billing';

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { id: 'acc_123', stripe_customer_id: 'cus_mock_123', business_name: 'Apex Roofing' },
          }),
          maybeSingle: async () => ({
            data: { id: 'site_123', subdomain: 'apex', content: {} },
          }),
        }),
      }),
      update: () => ({
        eq: async () => ({ error: null }),
      }),
    }),
  }),
}));


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

  it('validates return URLs and rejects open redirect / phishing URLs', async () => {
    const { validateAdReturnUrl } = await import('@/lib/ad-billing-shared');

    // Rejects external untrusted URLs
    expect(validateAdReturnUrl('https://evil.com/phishing')).toBe('/dashboard/marketing/ads');
    expect(validateAdReturnUrl('http://attacker.com')).toBe('/dashboard/marketing/ads');
    expect(validateAdReturnUrl('//evil.com/login')).toBe('/dashboard/marketing/ads');
    expect(validateAdReturnUrl('javascript:alert(1)')).toBe('/dashboard/marketing/ads');

    // Accepts relative dashboard routes
    expect(validateAdReturnUrl('/dashboard/marketing/ads')).toBe('/dashboard/marketing/ads');
    expect(validateAdReturnUrl('/dashboard/settings?tab=billing')).toBe('/dashboard/settings?tab=billing');

    // Accepts official app domains
    expect(validateAdReturnUrl('https://app.letsgetquoted.com/dashboard/marketing/ads')).toBe(
      'https://app.letsgetquoted.com/dashboard/marketing/ads'
    );
    expect(validateAdReturnUrl('https://letsgetquoted.com/dashboard')).toBe('https://letsgetquoted.com/dashboard');
  });

  it('sanitizes and validates ad alert phone numbers', async () => {
    const { sanitizeAdAlertPhone } = await import('@/lib/ad-billing-shared');

    expect(sanitizeAdAlertPhone('(512) 555-0199')).toBe('5125550199');
    expect(sanitizeAdAlertPhone('+1 (512) 555-0199')).toBe('+15125550199');
    expect(sanitizeAdAlertPhone('512-555-0199')).toBe('5125550199');
    expect(sanitizeAdAlertPhone('123')).toBeNull(); // Too short
    expect(sanitizeAdAlertPhone('')).toBeNull();
    expect(sanitizeAdAlertPhone(null)).toBeNull();
    expect(sanitizeAdAlertPhone(undefined)).toBeNull();
  });

  it('fails closed and ignores checkout.session.completed when payment_status is unpaid', async () => {
    let siteUpdated = false;
    const mockAdmin: any = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: 'site_123', content: {} },
            }),
          }),
        }),
        update: () => {
          siteUpdated = true;
          return { eq: async () => ({ error: null }) };
        },
      }),
    };

    const unpaidEvent: any = {
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_unpaid_123',
          payment_status: 'unpaid',
          mode: 'payment',
          metadata: {
            kind: 'ad_budget',
            account_id: 'acc_test_123',
            funding_model: 'auto_refill_wallet',
          },
        },
      },
    };

    const handled = await handleAdBudgetWebhookEvent(unpaidEvent, mockAdmin);
    expect(handled).toBe(false);
    expect(siteUpdated).toBe(false);
  });
});

