import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  createMessagingSetupCheckoutSession, 
  verifyMessagingSetupCheckoutSession,
  MESSAGING_SETUP_FEE_CENTS
} from '@/lib/billing/messaging-setup-checkout';
import { getStripeClient } from '@/lib/stripe';

vi.mock('@/lib/stripe', () => ({
  getStripeClient: vi.fn(),
}));

vi.mock('@/lib/app-origin', () => ({
  APP_ORIGIN: 'http://localhost:3000',
}));

describe('messaging-setup-checkout', () => {
  let mockStripe: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStripe = {
      checkout: {
        sessions: {
          create: vi.fn(),
          retrieve: vi.fn(),
        },
      },
    };
    (getStripeClient as any).mockReturnValue(mockStripe);
  });

  describe('createMessagingSetupCheckoutSession', () => {
    it('creates a checkout session with the correct fee and metadata', async () => {
      mockStripe.checkout.sessions.create.mockResolvedValue({
        id: 'cs_test_123',
        url: 'https://checkout.stripe.com/test',
      });

      const input = {
        accountId: 'acc_1',
        userId: 'usr_1',
        userEmail: 'test@example.com',
        businessName: 'Acme Corp',
        submissionKey: 'sub_key',
      };

      const result = await createMessagingSetupCheckoutSession(input);

      expect(result.sessionId).toBe('cs_test_123');
      expect(result.url).toBe('https://checkout.stripe.com/test');

      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'payment',
          customer_email: 'test@example.com',
          line_items: [
            expect.objectContaining({
              price_data: expect.objectContaining({
                unit_amount: 4999, // MUST BE EXACT CENTS
              }),
            }),
          ],
          metadata: {
            purpose: 'messaging_dedicated_number_setup',
            accountId: 'acc_1',
            userId: 'usr_1',
            businessName: 'Acme Corp',
            submissionKey: 'sub_key',
          },
          success_url: 'http://localhost:3000/dashboard/messages/dedicated-number?done=submitted&session_id={CHECKOUT_SESSION_ID}',
          cancel_url: 'http://localhost:3000/dashboard/messages/dedicated-number?error=cancelled',
        })
      );
    });
    
    it('throws error if stripe returns no url', async () => {
      mockStripe.checkout.sessions.create.mockResolvedValue({
        id: 'cs_test_123',
        url: null,
      });

      const input = {
        accountId: 'acc_1',
        userId: 'usr_1',
        userEmail: 'test@example.com',
        businessName: 'Acme Corp',
        submissionKey: 'sub_key',
      };

      await expect(createMessagingSetupCheckoutSession(input)).rejects.toThrow('Stripe failed to return a checkout URL');
    });
  });

  describe('verifyMessagingSetupCheckoutSession', () => {
    it('returns unpaid if sessionId does not start with cs_', async () => {
      const result = await verifyMessagingSetupCheckoutSession('invalid_id');
      expect(result).toEqual({ paid: false, customerEmail: null, amountPaidCents: 0 });
      expect(mockStripe.checkout.sessions.retrieve).not.toHaveBeenCalled();
    });

    it('returns unpaid if accountId does not match expectedAccountId', async () => {
      mockStripe.checkout.sessions.retrieve.mockResolvedValue({
        metadata: { accountId: 'acc_different' },
      });

      const result = await verifyMessagingSetupCheckoutSession('cs_test_123', 'acc_expected');
      expect(result).toEqual({ paid: false, customerEmail: null, amountPaidCents: 0 });
    });

    it('returns paid and details for a successfully paid session', async () => {
      mockStripe.checkout.sessions.retrieve.mockResolvedValue({
        metadata: { accountId: 'acc_expected' },
        payment_status: 'paid',
        customer_details: { email: 'paid@example.com' },
        amount_total: 4999,
      });

      const result = await verifyMessagingSetupCheckoutSession('cs_test_123', 'acc_expected');
      expect(result).toEqual({
        paid: true,
        customerEmail: 'paid@example.com',
        amountPaidCents: 4999,
      });
    });

    it('handles missing customer_details by falling back to customer_email', async () => {
      mockStripe.checkout.sessions.retrieve.mockResolvedValue({
        metadata: { accountId: 'acc_expected' },
        payment_status: 'paid',
        customer_email: 'fallback@example.com',
        amount_total: 4999,
      });

      const result = await verifyMessagingSetupCheckoutSession('cs_test_123', 'acc_expected');
      expect(result).toEqual({
        paid: true,
        customerEmail: 'fallback@example.com',
        amountPaidCents: 4999,
      });
    });

    it('catches and handles retrieve errors', async () => {
      mockStripe.checkout.sessions.retrieve.mockRejectedValue(new Error('Stripe retrieve error'));

      const result = await verifyMessagingSetupCheckoutSession('cs_test_123');
      expect(result).toEqual({ paid: false, customerEmail: null, amountPaidCents: 0 });
    });
  });
});
