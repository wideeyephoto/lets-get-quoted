import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadStripePayoutsOverview } from '../src/lib/payouts-data';

// Mock dependencies
const mockRetrieve = vi.fn();
const mockPayoutsList = vi.fn();
const mockCreateLoginLink = vi.fn();
const mockCreateOnboardingLink = vi.fn();

vi.mock('../src/lib/stripe', () => ({
  getStripeClient: () => ({
    balance: { retrieve: mockRetrieve },
    payouts: { list: mockPayoutsList },
    accounts: { createLoginLink: mockCreateLoginLink },
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
  });

  describe('2. PayoutsTransfersPanel UI Integrity', () => {
    it('has zero dead links to https://dashboard.stripe.com and routes through /api/stripe/express-dashboard', () => {
      const panelCode = readFileSync(
        join(process.cwd(), 'src/app/dashboard/payments/PayoutsTransfersPanel.tsx'),
        'utf8'
      );

      // Verify no unauthenticated dashboard.stripe.com links remain
      expect(panelCode).not.toContain('https://dashboard.stripe.com');

      // Verify all 3 action destinations point to /api/stripe/express-dashboard
      const expressLinks = panelCode.match(/href="\/api\/stripe\/express-dashboard"/g);
      expect(expressLinks).not.toBeNull();
      expect(expressLinks?.length).toBe(3);

      // Verify instant payout calculations reference instantAvailableDollars
      expect(panelCode).toContain('payouts.instantAvailableDollars');
      expect(panelCode).toContain('Instant Transfer Available');
      expect(panelCode).toContain('rel="noopener noreferrer"');
    });
  });

  describe('3. /api/stripe/express-dashboard Route Handler', () => {
    it('redirects authenticated owner to Stripe Express single-use login link', async () => {
      const { GET } = await import('../src/app/api/stripe/express-dashboard/route');

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
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
      expect(mockCreateLoginLink).toHaveBeenCalledWith('acct_express_123');
    });

    it('redirects to onboarding if account is not yet onboarded', async () => {
      const { GET } = await import('../src/app/api/stripe/express-dashboard/route');

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
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
              single: vi.fn().mockResolvedValue({
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
