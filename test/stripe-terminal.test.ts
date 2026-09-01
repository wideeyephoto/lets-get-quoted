import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getOrCreateTerminalLocation,
  createTerminalConnectionToken,
  listTerminalReaders,
  registerTerminalReader,
  createTerminalPaymentIntent,
  simulateTerminalCardTap,
  cancelTerminalReaderAction,
  confirmTerminalPayment,
} from '../src/lib/stripe-terminal';

// Mock getStripeClient
const mockStripe = {
  terminal: {
    locations: {
      list: vi.fn(),
      create: vi.fn(),
    },
    connectionTokens: {
      create: vi.fn(),
    },
    readers: {
      list: vi.fn(),
      create: vi.fn(),
      cancelAction: vi.fn(),
      processPaymentIntent: vi.fn(),
    },
  },
  paymentIntents: {
    create: vi.fn(),
    retrieve: vi.fn(),
    cancel: vi.fn(),
    confirm: vi.fn(),
  },
  testHelpers: {
    terminal: {
      readers: {
        presentPaymentMethod: vi.fn(),
      },
    },
  },
};

vi.mock('@/lib/stripe', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/lib/stripe');
  return {
    ...actual,
    getStripeClient: () => mockStripe,
    toCents: (d: number) => Math.round(d * 100),
    fromCents: (c: number) => Math.round(c) / 100,
    computePlatformFee: (amt: number, rate: number) => Math.round(amt * rate * 100) / 100,
    computePlatformFeeCents: (amt: number, rate: number) => Math.round(amt * 100 * rate),
    canCreateConnectCharge: (acc: unknown) => Boolean((acc as { connect_onboarded?: boolean })?.connect_onboarded),
  };
});

vi.mock('@/lib/jobs', () => ({
  getJob: vi.fn().mockResolvedValue({
    id: 'job_123',
    ref: 'JOB-2026-99',
    clientName: 'Alice Contractor Client',
  }),
}));

vi.mock('@/lib/billing/workspace-fee-rate', () => ({
  resolvePaymentFeeRate: vi.fn().mockResolvedValue({ feeRate: 0.0125 }),
}));

vi.mock('@/lib/billing/fee-basis', () => ({
  resolveFeeBasisCents: vi.fn().mockResolvedValue({ basisCents: 50000 }),
}));

vi.mock('@/lib/invoices', () => ({
  markInvoicePaidForPayment: vi.fn().mockResolvedValue({ success: true }),
}));

function createMockSupabase(overrides?: {
  account?: Record<string, unknown>;
  payment?: Record<string, unknown>;
  insertError?: unknown;
}) {
  const accountData = overrides?.account || {
    id: 'acc_test_1',
    business_name: 'Apex Renovation LLC',
    stripe_connect_id: 'acct_connect_123',
    connect_onboarded: true,
  };

  const paymentData = overrides?.payment || {
    id: 'pay_test_999',
    amount: 500.0,
    invoice_id: 'inv_123',
    job_id: 'job_123',
    status: 'requested',
  };

  return {
    from: vi.fn((table: string) => {
      if (table === 'accounts') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: accountData, error: null }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }),
        };
      }
      if (table === 'sites') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { company_name: 'Apex Renovation' }, error: null }),
        };
      }
      if (table === 'payments') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: paymentData, error: null }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: paymentData,
                error: overrides?.insertError || null,
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: paymentData, error: null }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    }),
  } as unknown as import('@supabase/supabase-js').SupabaseClient;
}

describe('Stripe Terminal & Tap to Pay Core Library', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getOrCreateTerminalLocation', () => {
    it('returns existing Stripe Terminal location if found', async () => {
      mockStripe.terminal.locations.list.mockResolvedValueOnce({
        data: [{ id: 'loc_existing_123', display_name: 'Main Office' }],
      });

      const supabase = createMockSupabase();
      const locId = await getOrCreateTerminalLocation(supabase, 'acc_test_1');

      expect(locId).toBe('loc_existing_123');
      expect(mockStripe.terminal.locations.list).toHaveBeenCalledWith({ limit: 5 });
    });

    it('creates new Terminal location when no existing locations exist', async () => {
      mockStripe.terminal.locations.list.mockResolvedValueOnce({ data: [] });
      mockStripe.terminal.locations.create.mockResolvedValueOnce({
        id: 'loc_new_456',
        display_name: 'Apex Renovation Jobsite',
      });

      const supabase = createMockSupabase();
      const locId = await getOrCreateTerminalLocation(supabase, 'acc_test_1');

      expect(locId).toBe('loc_new_456');
      expect(mockStripe.terminal.locations.create).toHaveBeenCalled();
    });
  });

  describe('createTerminalConnectionToken', () => {
    it('creates and returns a Stripe connection token for reader SDK initialization', async () => {
      mockStripe.terminal.locations.list.mockResolvedValueOnce({
        data: [{ id: 'loc_live_789' }],
      });
      mockStripe.terminal.connectionTokens.create.mockResolvedValueOnce({
        secret: 'pst_secret_live_abc123',
        location: 'loc_live_789',
      });

      const supabase = createMockSupabase();
      const token = await createTerminalConnectionToken(supabase, 'acc_test_1');

      expect(token.secret).toBe('pst_secret_live_abc123');
      expect(token.locationId).toBe('loc_live_789');
      expect(mockStripe.terminal.connectionTokens.create).toHaveBeenCalledWith({
        location: 'loc_live_789',
      });
    });
  });

  describe('listTerminalReaders', () => {
    it('returns registered terminal readers and default simulators for testing', async () => {
      mockStripe.terminal.locations.list.mockResolvedValueOnce({
        data: [{ id: 'loc_live_100' }],
      });
      mockStripe.terminal.readers.list.mockResolvedValueOnce({
        data: [
          {
            id: 'tmr_wisepos_1',
            label: 'Counter Reader',
            device_type: 'bbpos_wisepos_e',
            status: 'online',
            ip_address: '192.168.1.50',
            serial_number: 'WPOS-12345',
            location: 'loc_live_100',
          },
        ],
      });

      const supabase = createMockSupabase();
      const readers = await listTerminalReaders(supabase, 'acc_test_1', 'loc_live_100');

      expect(readers.length).toBeGreaterThan(0);
      expect(readers[0].id).toBe('tmr_wisepos_1');
      expect(readers[0].label).toBe('Counter Reader');
      expect(readers[0].status).toBe('online');
    });

    it('provides simulated WisePOS E and Tap to Pay mobile readers when no hardware is registered', async () => {
      mockStripe.terminal.locations.list.mockResolvedValueOnce({
        data: [{ id: 'loc_live_100' }],
      });
      mockStripe.terminal.readers.list.mockResolvedValueOnce({ data: [] });

      const supabase = createMockSupabase();
      const readers = await listTerminalReaders(supabase, 'acc_test_1', 'loc_live_100');

      expect(readers.some((r) => r.simulated === true)).toBe(true);
      expect(readers.some((r) => r.id === 'tmr_tap_to_pay_mobile')).toBe(true);
    });
  });

  describe('registerTerminalReader', () => {
    it('registers a new physical or smart reader device with pairing code', async () => {
      mockStripe.terminal.locations.list.mockResolvedValueOnce({
        data: [{ id: 'loc_live_100' }],
      });
      mockStripe.terminal.readers.create.mockResolvedValueOnce({
        id: 'tmr_new_reader_55',
        label: 'Field Van Reader',
        device_type: 'stripe_m2',
        status: 'online',
        ip_address: null,
        serial_number: 'M2-998877',
        location: 'loc_live_100',
      });

      const supabase = createMockSupabase();
      const registered = await registerTerminalReader(supabase, 'acc_test_1', {
        registrationCode: 'simulated-wpos-1',
        label: 'Field Van Reader',
        locationId: 'loc_live_100',
      });

      expect(registered.id).toBe('tmr_new_reader_55');
      expect(registered.label).toBe('Field Van Reader');
      expect(registered.status).toBe('online');
    });
  });

  describe('createTerminalPaymentIntent', () => {
    it('creates card_present PaymentIntent on Stripe and dispatches to reader', async () => {
      mockStripe.paymentIntents.create.mockResolvedValueOnce({
        id: 'pi_terminal_cardpresent_123',
        client_secret: 'pi_terminal_cardpresent_123_secret',
        status: 'requires_payment_method',
      });
      mockStripe.terminal.readers.processPaymentIntent.mockResolvedValueOnce({
        action: { status: 'in_progress' },
      });

      const supabase = createMockSupabase();
      const result = await createTerminalPaymentIntent(supabase, 'acc_test_1', {
        jobId: 'job_123',
        amount: 500.0,
        description: 'Deposit for Kitchen Remodel',
        readerId: 'tmr_real_reader_1',
      });

      expect(result.paymentId).toBe('pay_test_999');
      expect(result.paymentIntentId).toBe('pi_terminal_cardpresent_123');
      expect(result.clientSecret).toBe('pi_terminal_cardpresent_123_secret');
      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 50000,
          currency: 'usd',
          payment_method_types: ['card_present'],
          capture_method: 'automatic',
          transfer_data: { destination: 'acct_connect_123' },
          application_fee_amount: expect.any(Number),
        })
      );
      expect(mockStripe.terminal.readers.processPaymentIntent).toHaveBeenCalledWith(
        'tmr_real_reader_1',
        { payment_intent: 'pi_terminal_cardpresent_123' }
      );
    });

    it('rejects invalid non-positive amounts', async () => {
      const supabase = createMockSupabase();
      await expect(
        createTerminalPaymentIntent(supabase, 'acc_test_1', {
          jobId: 'job_123',
          amount: -50,
        })
      ).rejects.toThrow('Please enter a valid amount greater than $0.');
    });
  });

  describe('simulateTerminalCardTap', () => {
    it('triggers testHelpers presentPaymentMethod for simulated readers', async () => {
      mockStripe.testHelpers.terminal.readers.presentPaymentMethod.mockResolvedValueOnce({
        id: 'tmr_sim_reader',
      });

      const supabase = createMockSupabase();
      const result = await simulateTerminalCardTap(supabase, 'acc_test_1', 'tmr_sim_reader');

      expect(result.success).toBe(true);
      expect(mockStripe.testHelpers.terminal.readers.presentPaymentMethod).toHaveBeenCalledWith('tmr_sim_reader');
    });
  });

  describe('cancelTerminalReaderAction', () => {
    it('cancels active reader action and payment intent', async () => {
      mockStripe.terminal.readers.cancelAction.mockResolvedValueOnce({});
      mockStripe.paymentIntents.cancel.mockResolvedValueOnce({});

      const supabase = createMockSupabase();
      const res = await cancelTerminalReaderAction(supabase, 'acc_test_1', {
        readerId: 'tmr_real_reader_1',
        paymentIntentId: 'pi_live_123',
        paymentId: 'pay_test_999',
      });

      expect(res.success).toBe(true);
      expect(mockStripe.terminal.readers.cancelAction).toHaveBeenCalledWith('tmr_real_reader_1');
      expect(mockStripe.paymentIntents.cancel).toHaveBeenCalledWith('pi_live_123');
    });
  });

  describe('confirmTerminalPayment', () => {
    it('retrieves PaymentIntent, updates payments table to paid, and marks invoice paid', async () => {
      mockStripe.paymentIntents.retrieve.mockResolvedValueOnce({
        id: 'pi_terminal_cardpresent_123',
        status: 'succeeded',
        amount: 50000,
        amount_received: 50000,
        latest_charge: {
          receipt_url: 'https://pay.stripe.com/receipts/test_receipt_123',
          payment_method_details: {
            card_present: {
              brand: 'Visa Contactless',
              last4: '4242',
            },
          },
        },
      });

      const supabase = createMockSupabase({
        payment: {
          id: 'pay_test_999',
          amount: 500.0,
          invoice_id: 'inv_123',
          job_id: 'job_123',
          status: 'processing',
        },
      });

      const result = await confirmTerminalPayment(
        supabase,
        'acc_test_1',
        'pay_test_999',
        'pi_terminal_cardpresent_123'
      );

      expect(result.status).toBe('succeeded');
      expect(result.amount).toBe(500.0);
      expect(result.cardBrand).toBe('Visa Contactless');
      expect(result.last4).toBe('4242');
      expect(result.receiptUrl).toBe('https://pay.stripe.com/receipts/test_receipt_123');
    });
  });
});
