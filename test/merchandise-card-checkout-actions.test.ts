import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createCardQuoteAction,
  saveCardProofAction,
  createCardCheckoutSessionAction,
} from '@/app/dashboard/merchandise/actions';
import type { ShippingAddress } from '@/lib/merchandise/types';
import type { CardQuoteRecord } from '@/lib/merchandise/card-operations';
import { calculateCardQuoteCents } from '@/lib/merchandise/card-operations';

// Mock dependencies
const mockRevalidatePath = vi.fn();
vi.mock('next/cache', () => ({
  revalidatePath: (...args: any[]) => mockRevalidatePath(...args),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue({
    get: (key: string) => (key === 'origin' ? 'https://letsgetquoted.com' : 'localhost:3010'),
  }),
}));

let mockInsertedOrder: any = null;
let mockInsertedQuote: any = null;
let mockInsertedProof: any = null;
let mockInsertedOp: any = null;
let mockExistingOp: any = null;

const mockAdmin = {
  from: vi.fn((table: string) => {
    if (table === 'merchandise_order_quotes') {
      return {
        insert: vi.fn().mockImplementation((payload: any) => {
          mockInsertedQuote = payload;
          return {
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: payload, error: null }),
            }),
            error: null,
          };
        }),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockImplementation(async () => ({
          data: mockInsertedQuote,
          error: null,
        })),
      };
    }

    if (table === 'merchandise_card_proofs') {
      return {
        insert: vi.fn().mockImplementation((payload: any) => {
          mockInsertedProof = payload;
          return { error: null };
        }),
      };
    }

    if (table === 'merchandise_checkout_operations') {
      return {
        insert: vi.fn().mockImplementation((payload: any) => {
          mockInsertedOp = payload;
          return { error: null };
        }),
        update: vi.fn().mockImplementation((payload: any) => ({
          eq: vi.fn().mockResolvedValue({ error: null }),
        })),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockImplementation(async () => ({
          data: mockExistingOp,
          error: null,
        })),
      };
    }

    if (table === 'merchandise_orders') {
      return {
        insert: vi.fn().mockImplementation((payload: any) => {
          mockInsertedOrder = {
            id: 'ord_mock_test_123',
            order_number: payload.order_number,
            account_id: payload.account_id,
            total_amount: payload.total_amount,
            status: payload.status,
          };
          return {
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: mockInsertedOrder, error: null }),
            }),
          };
        }),
        update: vi.fn().mockImplementation((payload: any) => ({
          eq: vi.fn().mockResolvedValue({ error: null }),
        })),
      };
    }

    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
  }),
};

vi.mock('@/lib/auth', () => ({
  requireOfficeContext: vi.fn().mockResolvedValue({ accountId: 'acc_merch_office_123' }),
  createAdminClient: vi.fn(() => mockAdmin),
}));

let mockStripeSessionsCreate = vi.fn().mockResolvedValue({
  id: 'cs_test_session_bc_123',
  url: 'https://checkout.stripe.com/pay/cs_test_session_bc_123',
});

vi.mock('@/lib/stripe', () => ({
  getStripeClient: vi.fn(() => ({
    checkout: {
      sessions: {
        create: (...args: any[]) => mockStripeSessionsCreate(...args),
      },
    },
  })),
  toCents: (amt: number) => Math.round(amt * 100),
}));

describe('Batch E: Server Quoting & Stripe Checkout Actions', () => {
  const validAddress: ShippingAddress = {
    fullName: 'Alice Contractor',
    companyName: 'Apex Pro Roofing',
    streetAddress: '100 Construction Way',
    city: 'Boulder',
    state: 'CO',
    postalCode: '80301',
    country: 'US',
    phone: '(303) 555-0144',
    email: 'alice@apexproroofing.com',
  };

  beforeEach(() => {
    mockInsertedOrder = null;
    mockInsertedQuote = null;
    mockInsertedProof = null;
    mockInsertedOp = null;
    mockExistingOp = null;
    mockStripeSessionsCreate.mockClear();
  });

  describe('createCardQuoteAction', () => {
    it('generates and persists an authoritative quote in integer cents', async () => {
      const res = await createCardQuoteAction({
        cardCount: 100,
        shippingAddress: validAddress,
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;

      expect(res.quote?.subtotalCents).toBe(3500); // $35.00
      expect(res.quote?.shippingCostCents).toBe(1200); // $12.00
      expect(res.quote?.totalCents).toBe(4700); // $47.00
      expect(mockInsertedQuote).toBeDefined();
      expect(mockInsertedQuote.subtotal_cents).toBe(3500);
    });

    it('rejects invalid shipping address fields', async () => {
      const invalidAddr: ShippingAddress = {
        ...validAddress,
        postalCode: 'invalid_zip',
      };

      const res = await createCardQuoteAction({
        cardCount: 100,
        shippingAddress: invalidAddr,
      });

      expect(res.ok).toBe(false);
      expect(res.error).toContain('valid 5-digit US ZIP code');
    });
  });

  describe('saveCardProofAction', () => {
    it('persists proof and returns deterministic approval hash', async () => {
      const res = await saveCardProofAction({
        frontSvg: '<svg>front</svg>',
        backSvg: '<svg>back</svg>',
        designRevision: 1,
      });

      expect(res.ok).toBe(true);
      expect(res.proofId).toBeDefined();
      expect(res.approvalHash).toHaveLength(64);
      expect(mockInsertedProof).toBeDefined();
      expect(mockInsertedProof.is_approved).toBe(true);
    });

    it('rejects missing artwork SVGs', async () => {
      const res = await saveCardProofAction({
        frontSvg: '',
        backSvg: '<svg>back</svg>',
      });

      expect(res.ok).toBe(false);
      expect(res.error).toContain('Both front and back artwork files are required');
    });
  });

  describe('createCardCheckoutSessionAction', () => {
    it('creates Stripe checkout session with line items, metadata, and idempotent operation key', async () => {
      const quoteRes = calculateCardQuoteCents({
        accountId: 'acc_merch_office_123',
        cardCount: 100,
        shippingAddress: validAddress,
      });
      if (!quoteRes.ok) throw new Error('Quote calc failed');

      const res = await createCardCheckoutSessionAction({
        quote: quoteRes.quote,
        proofId: 'proof_mock_123',
        approvalHash: 'hash_mock_123',
        shippingAddress: validAddress,
      });

      expect(res.ok).toBe(true);
      expect(res.checkoutUrl).toContain('cs_test_session_bc_123');
      expect(res.orderNumber).toContain('LGQ-MRCH');

      // Verify Stripe session was called with correct line items
      expect(mockStripeSessionsCreate).toHaveBeenCalledTimes(1);
      const stripeArgs = mockStripeSessionsCreate.mock.calls[0][0];

      expect(stripeArgs.customer_email).toBe('alice@apexproroofing.com');
      expect(stripeArgs.line_items).toHaveLength(2);
      expect(stripeArgs.line_items[0].price_data.unit_amount).toBe(3500); // $35.00
      expect(stripeArgs.line_items[1].price_data.unit_amount).toBe(1200); // $12.00
      expect(stripeArgs.metadata.operation_key).toBe(res.operationKey);
    });

    it('rejects checkout when shipping address changes after quote', async () => {
      const quoteRes = calculateCardQuoteCents({
        accountId: 'acc_merch_office_123',
        cardCount: 100,
        shippingAddress: validAddress,
      });
      if (!quoteRes.ok) throw new Error('Quote calc failed');

      const tamperedAddress: ShippingAddress = {
        ...validAddress,
        city: 'Denver', // Modified destination
      };

      const res = await createCardCheckoutSessionAction({
        quote: quoteRes.quote,
        proofId: 'proof_mock_123',
        approvalHash: 'hash_mock_123',
        shippingAddress: tamperedAddress,
      });

      expect(res.ok).toBe(false);
      expect(res.error).toContain('Shipping address changed after quote generation');
    });

    it('reuses existing pending Stripe session for idempotent duplicate click', async () => {
      mockExistingOp = {
        id: 'op_existing_123',
        status: 'pending',
        stripe_session_id: 'cs_existing_reused_session',
      };

      const quoteRes = calculateCardQuoteCents({
        accountId: 'acc_merch_office_123',
        cardCount: 100,
        shippingAddress: validAddress,
      });
      if (!quoteRes.ok) throw new Error('Quote calc failed');

      const res = await createCardCheckoutSessionAction({
        quote: quoteRes.quote,
        proofId: 'proof_mock_123',
        approvalHash: 'hash_mock_123',
        shippingAddress: validAddress,
      });

      expect(res.ok).toBe(true);
      expect(res.checkoutUrl).toBe('https://checkout.stripe.com/pay/cs_existing_reused_session');
      expect(mockStripeSessionsCreate).not.toHaveBeenCalled(); // Re-used existing!
    });
  });
});
