import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadStripePayoutsOverview } from '../src/lib/payouts-data';

// Mock dependencies
const mockRetrieve = vi.fn();
const mockPayoutsList = vi.fn();
const mockCreateLoginLink = vi.fn();
const mockAccountsRetrieve = vi.fn();
const mockCreateOnboardingLink = vi.fn();

vi.mock('../src/lib/stripe', () => ({
  getStripeClient: () => ({
    balance: { retrieve: mockRetrieve },
    payouts: { list: mockPayoutsList },
    accounts: {
      createLoginLink: mockCreateLoginLink,
      retrieve: mockAccountsRetrieve,
    },
  }),
}));

vi.mock('../src/lib/stripe-connect', () => ({
  createOnboardingLink: (...args: any[]) => mockCreateOnboardingLink(...args),
}));

const mockRequireOwnerContext = vi.fn();
vi.mock('../src/lib/auth', () => ({
  requireOwnerContext: () => mockRequireOwnerContext(),
}));

describe('Stripe Express Built-In Instant Payout Rail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Payouts Overview Data Loader', () => {
    it('accurately parses instant_available balance and flags instantPayoutEligible', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  stripe_connect_id: 'acct_123',
                  connect_onboarded: true,
                  connect_disabled_at: null,
                },
              }),
            }),
          }),
        }),
      } as any;

      mockRetrieve.mockResolvedValue({
        available: [{ amount: 500000, currency: 'usd' }], // $5,000.00
        pending: [{ amount: 150000, currency: 'usd' }],   // $1,500.00
        instant_available: [{ amount: 100000, currency: 'usd' }], // $1,000.00
      });

      mockPayoutsList.mockResolvedValue({ data: [] });

      const overview = await loadStripePayoutsOverview(mockSupabase, 'acc_test');

      expect(overview.connected).toBe(true);
      expect(overview.availableBalanceDollars).toBe(5000);
      expect(overview.pendingBalanceDollars).toBe(1500);
      expect(overview.instantAvailableDollars).toBe(1000);
      expect(overview.instantPayoutEligible).toBe(true);
    });

    it('returns zero instantAvailableDollars and false eligibility when instant_available is 0', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  stripe_connect_id: 'acct_123',
                  connect_onboarded: true,
                  connect_disabled_at: null,
                },
              }),
            }),
          }),
        }),
      } as any;

      mockRetrieve.mockResolvedValue({
        available: [{ amount: 250000, currency: 'usd' }],
        pending: [{ amount: 50000, currency: 'usd' }],
        instant_available: [{ amount: 0, currency: 'usd' }],
      });

      mockPayoutsList.mockResolvedValue({ data: [] });

      const overview = await loadStripePayoutsOverview(mockSupabase, 'acc_test');

      expect(overview.connected).toBe(true);
      expect(overview.availableBalanceDollars).toBe(2500);
      expect(overview.instantAvailableDollars).toBe(0);
      expect(overview.instantPayoutEligible).toBe(false);
    });

    it('returns default disconnected state when account has not onboarded', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  stripe_connect_id: 'acct_123',
                  connect_onboarded: false,
                  connect_disabled_at: null,
                },
              }),
            }),
          }),
        }),
      } as any;

      const overview = await loadStripePayoutsOverview(mockSupabase, 'acc_test');

      expect(overview.connected).toBe(false);
      expect(overview.instantAvailableDollars).toBe(0);
      expect(overview.instantPayoutEligible).toBe(false);
      expect(mockRetrieve).not.toHaveBeenCalled();
    });

    it('handles balance retrieval failure gracefully by preserving connection and marking available: false', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  stripe_connect_id: 'acct_123',
                  connect_onboarded: true,
                  connect_disabled_at: null,
                },
              }),
            }),
          }),
        }),
      } as any;

      mockRetrieve.mockRejectedValue(new Error('Stripe API 500 error'));
      mockPayoutsList.mockResolvedValue({ data: [] });
      mockAccountsRetrieve.mockResolvedValue({
        settings: { payouts: { schedule: { interval: 'weekly' } } },
      });

      const overview = await loadStripePayoutsOverview(mockSupabase, 'acc_test');

      expect(overview.connected).toBe(true);
      expect(overview.available).toBe(false);
      expect(overview.payoutSchedule).toBe('Weekly Automatic');
      expect(overview.availableBalanceDollars).toBe(0);
    });

    it('handles accounts.retrieve failure or unpopulated schedule interval by setting payoutSchedule to Unavailable', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  stripe_connect_id: 'acct_123',
                  connect_onboarded: true,
                  connect_disabled_at: null,
                },
              }),
            }),
          }),
        }),
      } as any;

      mockRetrieve.mockResolvedValue({
        available: [{ amount: 10000, currency: 'usd' }],
        pending: [],
        instant_available: [],
      });
      mockPayoutsList.mockResolvedValue({ data: [] });
      // Simulate Stripe accounts.retrieve rejecting (e.g. v1 on v2 account error)
      mockAccountsRetrieve.mockRejectedValue(new Error('Stripe API error on accounts.retrieve'));

      const overview = await loadStripePayoutsOverview(mockSupabase, 'acc_test');

      expect(overview.connected).toBe(true);
      expect(overview.payoutSchedule).toBe('Unavailable');
    });

    it('handles payouts.list failure gracefully by marking recentPayoutsAvailable: false without asserting zero payouts as fact', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  stripe_connect_id: 'acct_123',
                  connect_onboarded: true,
                  connect_disabled_at: null,
                },
              }),
            }),
          }),
        }),
      } as any;

      mockRetrieve.mockResolvedValue({
        available: [{ amount: 10000, currency: 'usd' }],
        pending: [],
        instant_available: [],
      });
      // Simulate payouts.list rejecting
      mockPayoutsList.mockRejectedValue(new Error('Stripe API 500 error on payouts.list'));
      mockAccountsRetrieve.mockResolvedValue({
        settings: { payouts: { schedule: { interval: 'daily' } } },
      });

      const overview = await loadStripePayoutsOverview(mockSupabase, 'acc_test');

      expect(overview.connected).toBe(true);
      expect(overview.recentPayoutsAvailable).toBe(false);
      expect(overview.recentPayouts).toEqual([]);
      expect(overview.payoutSchedule).toBe('Daily Automatic');
    });
  });

  describe('2. UI Integrity across Payouts, Settings, Modals & Revenue Screen', () => {
    it('routes contractor recipient surfaces through /api/stripe/express-dashboard with no unauthenticated links', () => {
      const expressSurfaces = [
        'src/app/dashboard/payments/PayoutsTransfersPanel.tsx',
        'src/app/dashboard/settings/PayoutAccount.tsx',
      ];

      for (const relativePath of expressSurfaces) {
        const content = readFileSync(join(process.cwd(), relativePath), 'utf8');
        expect(content).not.toContain('https://dashboard.stripe.com');
        expect(content).toContain('/api/stripe/express-dashboard');
      }
    });

    it('points MerchantOnboardingSection to https://dashboard.stripe.com for full dashboard accounts', () => {
      const content = readFileSync(
        join(process.cwd(), 'src/app/dashboard/settings/MerchantOnboardingSection.tsx'),
        'utf8'
      );
      expect(content).toContain('https://dashboard.stripe.com');
      expect(content).not.toContain('/api/stripe/express-dashboard');
    });

    it('channels dispute defense in PaymentModals and DisputesDefensePanel to LGQ Support via mailto', () => {
      const modalsContent = readFileSync(
        join(process.cwd(), 'src/app/dashboard/payments/PaymentModals.tsx'),
        'utf8'
      );
      expect(modalsContent).not.toContain('https://dashboard.stripe.com/disputes');
      expect(modalsContent).not.toContain('/api/stripe/express-dashboard');
      expect(modalsContent).toContain('mailto:support@letsgetquoted.com');
      expect(modalsContent).toContain('Email Evidence to Support ✉️');

      const panelContent = readFileSync(
        join(process.cwd(), 'src/app/dashboard/payments/DisputesDefensePanel.tsx'),
        'utf8'
      );
      expect(panelContent).not.toContain('https://dashboard.stripe.com');
      expect(panelContent).toContain('support@letsgetquoted.com');
    });

    it('enforces role gating, error alerts when disconnected, and failure banners in PayoutsTransfersPanel', () => {
      const panelCode = readFileSync(
        join(process.cwd(), 'src/app/dashboard/payments/PayoutsTransfersPanel.tsx'),
        'utf8'
      );

      // Verify fail-closed role gating
      expect(panelCode).toContain('isOwner = false');
      expect(panelCode).toContain('stripeError');
      expect(panelCode).toContain('stripe_login_failed');
      expect(panelCode).toContain('Unable to Open Stripe Express Portal');
      expect(panelCode).toContain('🔒 Workspace owner verification required');
      expect(panelCode).toContain('🔒 Owner Authorization Required');

      // Verify minimum $0.50 fee math & label
      expect(panelCode).toContain('Math.max(0.5, instantAvailable * 0.015)');
      expect(panelCode).toContain('Est. Net After Fee (1.5%, min $0.50)');

      // Verify payout failure banners and unavailable schedule handling
      expect(panelCode).toContain('Payout History Temporarily Unavailable');
      expect(panelCode).toContain('payouts.recentPayoutsAvailable');
      expect(panelCode).toContain('Schedule not reported by Stripe');
      expect(panelCode).toContain('⚡ 30-Min Transfer Available');
    });

    it('synchronizes RevenuePaymentsScreen with payout schedule, balance availability, and fail-closed owner default', () => {
      const screenCode = readFileSync(
        join(process.cwd(), 'src/app/dashboard/payments/RevenuePaymentsScreen.tsx'),
        'utf8'
      );

      // Verify no dead links
      expect(screenCode).not.toContain('https://dashboard.stripe.com');

      // Verify fail-closed default
      expect(screenCode).toContain('isOwner = false');

      // Verify dynamic schedule badge & copy
      expect(screenCode).toContain("payouts.payoutSchedule === 'Manual'");
      expect(screenCode).toContain("payouts.payoutSchedule === 'Unavailable'");
      expect(screenCode).toContain('Manual payouts enabled in Stripe');
      expect(screenCode).toContain('Payout schedule unavailable from Stripe');

      // Verify balance outage representation
      expect(screenCode).toContain("!payouts.available\n                  ? 'Syncing'");
      expect(screenCode).toContain("payouts.available ? formatUsd(payouts.availableBalanceDollars + payouts.pendingBalanceDollars) : '—'");
      expect(screenCode).toContain('Stripe balance sync temporarily delayed');
    });
  });

  describe('3. /api/stripe/express-dashboard Route Handler', () => {
    it('redirects authenticated owner to Stripe Express single-use login link with no-store headers', async () => {
      const { GET } = await import('../src/app/api/stripe/express-dashboard/route');

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  stripe_connect_id: 'acct_express_123',
                  connect_onboarded: true,
                },
              }),
            }),
          }),
        }),
      };

      mockRequireOwnerContext.mockResolvedValue({
        supabase: mockSupabase,
        accountId: 'acc_owner_1',
      });

      mockCreateLoginLink.mockResolvedValue({
        url: 'https://connect.stripe.com/express/single-use-session-token',
      });

      const req = new Request('https://app.letsgetquoted.com/api/stripe/express-dashboard');
      const res = await GET(req);

      expect(res.status).toBe(303);
      expect(res.headers.get('location')).toBe('https://connect.stripe.com/express/single-use-session-token');
      expect(res.headers.get('cache-control')).toBe('no-store, no-cache, must-revalidate');
      expect(mockCreateLoginLink).toHaveBeenCalledWith('acct_express_123');
    });

    it('re-throws NEXT_REDIRECT error when requireOwnerContext redirects non-owner', async () => {
      const { GET } = await import('../src/app/api/stripe/express-dashboard/route');

      const redirectError = new Error('NEXT_REDIRECT');
      (redirectError as any).digest = 'NEXT_REDIRECT;replace;/office-access;307';

      mockRequireOwnerContext.mockRejectedValue(redirectError);

      const req = new Request('https://app.letsgetquoted.com/api/stripe/express-dashboard');

      await expect(GET(req)).rejects.toThrow('NEXT_REDIRECT');
    });

    it('redirects to onboarding if account is not yet onboarded', async () => {
      const { GET } = await import('../src/app/api/stripe/express-dashboard/route');

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  stripe_connect_id: 'acct_express_123',
                  connect_onboarded: false,
                },
              }),
            }),
          }),
        }),
      };

      mockRequireOwnerContext.mockResolvedValue({
        supabase: mockSupabase,
        accountId: 'acc_owner_1',
      });

      mockCreateOnboardingLink.mockResolvedValue('https://connect.stripe.com/setup/s/onboarding-link');

      const req = new Request('https://app.letsgetquoted.com/api/stripe/express-dashboard');
      const res = await GET(req);

      expect(res.headers.get('location')).toBe('https://connect.stripe.com/setup/s/onboarding-link');
      expect(mockCreateLoginLink).not.toHaveBeenCalled();
    });

    it('redirects to settings if no connect account exists', async () => {
      const { GET } = await import('../src/app/api/stripe/express-dashboard/route');

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  stripe_connect_id: null,
                  connect_onboarded: false,
                },
              }),
            }),
          }),
        }),
      };

      mockRequireOwnerContext.mockResolvedValue({
        supabase: mockSupabase,
        accountId: 'acc_owner_1',
      });

      const req = new Request('https://app.letsgetquoted.com/api/stripe/express-dashboard');
      const res = await GET(req);

      expect(res.headers.get('location')).toBe('https://app.letsgetquoted.com/dashboard/settings#payments');
    });
  });
});
