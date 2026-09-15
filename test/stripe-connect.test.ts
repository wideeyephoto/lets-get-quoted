import { describe, it, expect, vi, beforeEach } from 'vitest';
import Stripe from 'stripe';
import {
  createOrGetRecipientAccount,
  createOnboardingLink,
  getRecipientTransferStatus,
  refreshAccountOnboardingStatus
} from '@/lib/stripe-connect';
import { getStripeClient } from '@/lib/stripe';

vi.mock('@/lib/stripe', () => ({
  getStripeClient: vi.fn(),
}));

describe('stripe-connect', () => {
  let mockSupabase: any;
  let mockStripe: any;
  let mockSelect: any;
  let mockEq: any;
  let mockSingle: any;
  let mockUpdate: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    mockEq = vi.fn(() => ({ single: mockSingle }));
    mockSelect = vi.fn(() => ({ eq: mockEq }));

    mockUpdate = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }));

    mockSupabase = {
      from: vi.fn((table) => {
        if (table === 'accounts') {
          return { select: mockSelect, update: mockUpdate };
        }
        return {};
      }),
    };

    mockStripe = {
      v2: {
        core: {
          accounts: {
            retrieve: vi.fn(),
            create: vi.fn(),
          },
          accountLinks: {
            create: vi.fn(),
          },
        },
      },
    };
    (getStripeClient as any).mockReturnValue(mockStripe);
  });

  describe('createOrGetRecipientAccount', () => {
    it('throws error if db select fails', async () => {
      mockSingle.mockResolvedValue({ data: null, error: new Error('DB Error') });

      await expect(
        createOrGetRecipientAccount(mockSupabase, 'acc_1', 'Business', 'test@test.com')
      ).rejects.toThrow('DB Error');
    });

    it('returns existing connect id if retrieve succeeds', async () => {
      mockSingle.mockResolvedValue({ data: { stripe_connect_id: 'acct_existing' }, error: null });
      mockStripe.v2.core.accounts.retrieve.mockResolvedValue({ id: 'acct_existing' });

      const result = await createOrGetRecipientAccount(mockSupabase, 'acc_1', 'Business', 'test@test.com');
      
      expect(result).toBe('acct_existing');
      expect(mockStripe.v2.core.accounts.retrieve).toHaveBeenCalledWith('acct_existing');
      expect(mockStripe.v2.core.accounts.create).not.toHaveBeenCalled();
    });

    it('creates new account if existing connect id throws permission/invalid error', async () => {
      mockSingle.mockResolvedValue({ data: { stripe_connect_id: 'acct_stale' }, error: null });
      
      const error = new Stripe.errors.StripePermissionError({
        message: 'Permission denied',
        type: 'invalid_request_error'
      });
      mockStripe.v2.core.accounts.retrieve.mockRejectedValue(error);
      mockStripe.v2.core.accounts.create.mockResolvedValue({ id: 'acct_new' });

      const result = await createOrGetRecipientAccount(mockSupabase, 'acc_1', 'Business', 'test@test.com');
      
      expect(result).toBe('acct_new');
      expect(mockStripe.v2.core.accounts.create).toHaveBeenCalledWith(
        expect.objectContaining({ display_name: 'Business', contact_email: 'test@test.com' })
      );
      expect(mockUpdate).toHaveBeenCalledWith({ stripe_connect_id: 'acct_new', connect_onboarded: false });
    });

    it('throws non-permission errors on retrieve', async () => {
      mockSingle.mockResolvedValue({ data: { stripe_connect_id: 'acct_existing' }, error: null });
      const unknownError = new Error('Random API failure');
      mockStripe.v2.core.accounts.retrieve.mockRejectedValue(unknownError);

      await expect(
        createOrGetRecipientAccount(mockSupabase, 'acc_1', 'Business', 'test@test.com')
      ).rejects.toThrow('Random API failure');
    });

    it('creates account when none exists and updates db', async () => {
      mockSingle.mockResolvedValue({ data: { stripe_connect_id: null }, error: null });
      mockStripe.v2.core.accounts.create.mockResolvedValue({ id: 'acct_new' });

      const result = await createOrGetRecipientAccount(mockSupabase, 'acc_1', 'Business', null);
      
      expect(result).toBe('acct_new');
      expect(mockStripe.v2.core.accounts.create).toHaveBeenCalledWith(
        expect.objectContaining({ display_name: 'Business', contact_email: undefined })
      );
      expect(mockUpdate).toHaveBeenCalledWith({ stripe_connect_id: 'acct_new', connect_onboarded: false });
    });

    it('throws if db update fails', async () => {
      mockSingle.mockResolvedValue({ data: { stripe_connect_id: null }, error: null });
      mockStripe.v2.core.accounts.create.mockResolvedValue({ id: 'acct_new' });
      
      mockUpdate.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: new Error('Update failed') }) });

      await expect(
        createOrGetRecipientAccount(mockSupabase, 'acc_1', 'Business', null)
      ).rejects.toThrow('Update failed');
    });
  });

  describe('createOnboardingLink', () => {
    it('returns link url', async () => {
      mockStripe.v2.core.accountLinks.create.mockResolvedValue({ url: 'https://stripe.com/onboard' });

      const result = await createOnboardingLink('acct_1', 'http://ret', 'http://ref');
      
      expect(result).toBe('https://stripe.com/onboard');
      expect(mockStripe.v2.core.accountLinks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          account: 'acct_1',
          use_case: {
            type: 'account_onboarding',
            account_onboarding: {
              configurations: ['recipient'],
              return_url: 'http://ret',
              refresh_url: 'http://ref',
            }
          }
        })
      );
    });
  });

  describe('getRecipientTransferStatus', () => {
    it('returns status if present', async () => {
      mockStripe.v2.core.accounts.retrieve.mockResolvedValue({
        configuration: {
          recipient: {
            capabilities: {
              stripe_balance: {
                stripe_transfers: { status: 'active' }
              }
            }
          }
        }
      });

      const result = await getRecipientTransferStatus('acct_1');
      expect(result).toBe('active');
    });

    it('returns null if deeply nested property is missing', async () => {
      mockStripe.v2.core.accounts.retrieve.mockResolvedValue({
        configuration: { recipient: {} }
      });

      const result = await getRecipientTransferStatus('acct_1');
      expect(result).toBeNull();
    });
  });

  describe('refreshAccountOnboardingStatus', () => {
    it('updates connect_onboarded to true when status is active', async () => {
      mockStripe.v2.core.accounts.retrieve.mockResolvedValue({
        configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { status: 'active' } } } } }
      });

      const result = await refreshAccountOnboardingStatus(mockSupabase, 'acc_1', 'acct_stripe');
      
      expect(result).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith({ connect_onboarded: true });
    });

    it('updates connect_onboarded to false when status is pending', async () => {
      mockStripe.v2.core.accounts.retrieve.mockResolvedValue({
        configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { status: 'pending' } } } } }
      });

      const result = await refreshAccountOnboardingStatus(mockSupabase, 'acc_1', 'acct_stripe');
      
      expect(result).toBe(false);
      expect(mockUpdate).toHaveBeenCalledWith({ connect_onboarded: false });
    });

    it('throws if update fails', async () => {
      mockStripe.v2.core.accounts.retrieve.mockResolvedValue({
        configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { status: 'active' } } } } }
      });
      mockUpdate.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: new Error('Refresh update error') }) });

      await expect(
        refreshAccountOnboardingStatus(mockSupabase, 'acc_1', 'acct_stripe')
      ).rejects.toThrow('Refresh update error');
    });
  });
});
