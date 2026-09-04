import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { MERCHANDISE_PRODUCTS, ALL_MERCHANDISE_PRODUCTS, getProductById } from '@/lib/merchandise/catalog';
import {
  calculateMerchandisePricing,
  resolveServerItemPricing,
  calculateSalesTax,
  getSalesTaxRate,
} from '@/lib/merchandise/pricing';
import { createPrintfulOrder } from '@/lib/merchandise/printful-client';
import { generateOrderNumber, saveMerchandiseOrder } from '@/lib/merchandise/orders';
import { handleMerchandiseWebhookEvent } from '@/lib/merchandise/stripe-webhook';
import type { MerchandiseOrderItem, ShippingAddress } from '@/lib/merchandise/types';

// Mock dependencies for Server Actions & Webhooks
const mockRevalidatePath = vi.fn();
vi.mock('next/cache', () => ({
  revalidatePath: (...args: any[]) => mockRevalidatePath(...args),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue({
    get: (key: string) => (key === 'origin' ? 'https://letsgetquoted.com' : null),
  }),
}));

let mockCreatedOrderData: any = null;
let mockFoundOrderData: any = null;
const mockDbUpdates: any[] = [];
const mockLedgerInserts: any[] = [];

const mockAdmin = {
  from: vi.fn((table: string) => {
    if (table === 'merchandise_orders') {
      return {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockImplementation((payload: any) => ({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockImplementation(async () => {
              mockCreatedOrderData = {
                id: 'ord_mock_123',
                account_id: payload.account_id,
                order_number: payload.order_number,
                status: payload.status,
                items: payload.items,
                subtotal: payload.subtotal,
                shipping_cost: payload.shipping_cost,
                tax_amount: payload.tax_amount,
                total_amount: payload.total_amount,
                shipping_address: payload.shipping_address,
                stripe_session_id: payload.stripe_session_id,
                stripe_payment_intent_id: payload.stripe_payment_intent_id,
                printful_order_id: payload.printful_order_id,
                tracking_number: payload.tracking_number,
                tracking_carrier: payload.tracking_carrier,
                estimated_delivery_date: payload.estimated_delivery_date,
                proof_approved_at: payload.proof_approved_at,
                proof_snapshot_url: payload.proof_snapshot_url,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              };
              return { data: mockCreatedOrderData, error: null };
            }),
          }),
        })),
        update: vi.fn().mockImplementation((updates: any) => ({
          eq: vi.fn().mockImplementation((col: string, val: any) => {
            mockDbUpdates.push({ table, updates, col, val });
            return {
              eq: vi.fn().mockResolvedValue({ error: null }),
              then: (fn: any) => fn({ error: null }),
            };
          }),
        })),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockImplementation(async () => ({
          data: mockFoundOrderData,
          error: null,
        })),
      };
    }
    if (table === 'merchandise_revenue_ledger') {
      return {
        insert: vi.fn().mockImplementation(async (payload: any) => {
          mockLedgerInserts.push(payload);
          return { error: null };
        }),
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
  requireOfficeContext: vi.fn().mockResolvedValue({ accountId: 'acc_merch_test_123' }),
  createAdminClient: vi.fn(() => mockAdmin),
}));

let mockStripeSessionsCreate = vi.fn().mockResolvedValue({
  id: 'cs_test_mock_123',
  url: 'https://checkout.stripe.com/pay/cs_test_mock_123',
});

let mockStripeClient: any = {
  checkout: {
    sessions: {
      create: (...args: any[]) => mockStripeSessionsCreate(...args),
    },
  },
};

vi.mock('@/lib/stripe', () => ({
  getStripeClient: vi.fn(() => mockStripeClient),
  toCents: (amt: number) => Math.round(amt * 100),
}));

describe('Merchandise Studio & Instant Purchasing Engine', () => {
  beforeEach(() => {
    mockCreatedOrderData = null;
    mockFoundOrderData = null;
    mockDbUpdates.length = 0;
    mockLedgerInserts.length = 0;
    mockStripeSessionsCreate.mockClear();
  });

  describe('Product Catalog Integrity', () => {
    it('focuses active storefront on business cards and notepads, preserving extended catalog', () => {
      const activeProductIds = MERCHANDISE_PRODUCTS.map((p) => p.id);
      expect(activeProductIds).toEqual(['biz_cards', 'notepads']);

      const allProductIds = ALL_MERCHANDISE_PRODUCTS.map((p) => p.id);
      expect(allProductIds).toContain('biz_cards');
      expect(allProductIds).toContain('polos');
      expect(allProductIds).toContain('t_shirts');
      expect(allProductIds).toContain('hats');
      expect(allProductIds).toContain('notepads');
      expect(allProductIds).toContain('pens');
      expect(allProductIds).toContain('phone_cases');
      expect(allProductIds).toContain('yard_signs');
      expect(allProductIds).toContain('tumblers');
      expect(allProductIds).toContain('decals');
    });

    it('defines rich volume pricing tiers and specs for each item', () => {
      for (const prod of MERCHANDISE_PRODUCTS) {
        expect(prod.pricingTiers.length).toBeGreaterThanOrEqual(3);
        expect(prod.availableColors.length).toBeGreaterThanOrEqual(2);
        expect(prod.specs.dimensions).toBeDefined();
        expect(prod.specs.material).toBeDefined();
        expect(prod.specs.finish).toBeDefined();
      }
    });

    it('correctly looks up product by ID, defaulting to active storefront only', () => {
      const bizCards = getProductById('biz_cards');
      expect(bizCards).toBeDefined();
      expect(bizCards?.name).toContain('Velvet');

      // By default, retired/inactive apparel is rejected from storefront lookup
      expect(getProductById('hats')).toBeUndefined();
      expect(getProductById('polos')).toBeUndefined();

      // Can be queried with allowInactive = true for historical orders or admin tooling
      const hat = getProductById('hats', true);
      expect(hat).toBeDefined();
      expect(hat?.name).toContain('Richardson 112');
      expect(hat?.decorationMethod).toBe('leather_patch');
    });

    it('resolves official Printful high-resolution studio photos for apparel and hats', async () => {
      const { getProductStudioPhoto } = await import('@/lib/merchandise/mockup-assets');

      // T-Shirts: black front & back
      const tShirtBlack = getProductStudioPhoto('t_shirts', 'black', 'front');
      expect(tShirtBlack.photoUrl).toContain('files.cdn.printful.com/products/71');
      expect(tShirtBlack.hasBackPhoto).toBe(true);

      const tShirtBack = getProductStudioPhoto('t_shirts', 'black', 'back');
      expect(tShirtBack.photoUrl).toContain('files.cdn.printful.com');

      // Polos: black front
      const poloBlack = getProductStudioPhoto('polos', 'onyx_black', 'front');
      expect(poloBlack.photoUrl).toContain('files.cdn.printful.com/products/670');

      // Richardson 112: heather black front
      const hatPhoto = getProductStudioPhoto('hats', 'heather_black', 'front');
      expect(hatPhoto.photoUrl).toContain('files.cdn.printful.com/products/422');
    });
  });

  describe('Server Pricing Engine & Money Path Protection', () => {
    it('enforces a $5.00 minimum platform fee floor on small orders', () => {
      const result = calculateMerchandisePricing({
        wholesaleUnitCost: 20.0,
        quantity: 1,
        isEmbroidery: false,
      });

      expect(result.platformCutAmount).toBe(5.0);
      expect(result.platformCutAmount).toBeGreaterThanOrEqual(5.0);
    });

    it('takes a full 10% on large fleet orders where 10% exceeds $5.00', () => {
      const result = calculateMerchandisePricing({
        wholesaleUnitCost: 25.0,
        quantity: 24,
        isEmbroidery: true,
      });

      const expectedTenPercent = Math.round(result.retailSubtotal * 0.1 * 100) / 100;
      expect(result.platformCutAmount).toBe(expectedTenPercent);
      expect(result.platformCutAmount).toBeGreaterThan(50.0);
    });

    it('waives embroidery digitizing fee on orders of 6 or more units', () => {
      const sixPolos = calculateMerchandisePricing({
        wholesaleUnitCost: 18.0,
        quantity: 6,
        isEmbroidery: true,
      });

      expect(sixPolos.isFreeDigitizing).toBe(true);
      expect(sixPolos.digitizingFee).toBe(0);

      const twoPolos = calculateMerchandisePricing({
        wholesaleUnitCost: 18.0,
        quantity: 2,
        isEmbroidery: true,
      });

      expect(twoPolos.isFreeDigitizing).toBe(false);
      expect(twoPolos.digitizingFee).toBe(6.5);
    });

    it('provides free standard shipping on orders over $150', () => {
      const largeOrder = calculateMerchandisePricing({
        wholesaleUnitCost: 20.0,
        quantity: 12,
        shippingMethod: 'standard',
      });

      expect(largeOrder.retailSubtotal).toBeGreaterThan(150);
      expect(largeOrder.shippingCost).toBe(0);
    });

    it('authoritatively calculates pricing from catalog tiers, immune to client price tampering', () => {
      const bizCards = getProductById('biz_cards')!;
      // 500 business cards tier
      const tier500 = resolveServerItemPricing(bizCards, 500);
      expect(tier500.unitPrice).toBe(0.17);
      expect(tier500.totalPrice).toBe(85.0);
      expect(tier500.wholesaleUnitPrice).toBe(0.19);
      expect(tier500.wholesaleTotal).toBe(95.0);

      // 1000 business cards tier
      const tier1000 = resolveServerItemPricing(bizCards, 1000);
      expect(tier1000.unitPrice).toBe(0.12);
      expect(tier1000.totalPrice).toBe(120.0);
      expect(tier1000.wholesaleUnitPrice).toBe(0.19);
      expect(tier1000.wholesaleTotal).toBe(190.0);
    });
  });

  describe('Destination-Based Sales Tax', () => {
    it('exempts NOMAD states from sales tax (0%)', () => {
      const nomadStates = ['OR', 'MT', 'NH', 'DE', 'AK'];
      for (const state of nomadStates) {
        expect(getSalesTaxRate(state)).toBe(0);
        expect(calculateSalesTax(250.0, state)).toBe(0);
      }
    });

    it('accurately applies state rates for taxable destinations', () => {
      expect(getSalesTaxRate('CA')).toBe(0.0725);
      expect(calculateSalesTax(100.0, 'CA')).toBe(7.25);

      expect(getSalesTaxRate('NY')).toBe(0.08);
      expect(calculateSalesTax(100.0, 'NY')).toBe(8.0);

      expect(getSalesTaxRate('TX')).toBe(0.0625);
      expect(calculateSalesTax(200.0, 'TX')).toBe(12.5);

      expect(getSalesTaxRate('FL')).toBe(0.06);
      expect(calculateSalesTax(100.0, 'FL')).toBe(6.0);
    });

    it('normalizes whitespace and case in state codes', () => {
      expect(getSalesTaxRate('  ca  ')).toBe(0.0725);
      expect(getSalesTaxRate('Or')).toBe(0);
      expect(calculateSalesTax(100.0, '  co  ')).toBe(2.9);
    });

    it('falls back to 6.5% standard rate for unknown states or blank input', () => {
      expect(getSalesTaxRate('ZZ')).toBe(0.065);
      expect(getSalesTaxRate('')).toBe(0.065);
    });
  });

  describe('Order Persistence & Collision Resistance', () => {
    it('generates unique order numbers across high-volume iterations', () => {
      const count = 1000;
      const generated = new Set<string>();
      for (let i = 0; i < count; i++) {
        const orderNum = generateOrderNumber();
        expect(orderNum).toMatch(/^LGQ-MRCH-\d{4}-[A-Z0-9]+-[A-Z0-9]{6}$/);
        generated.add(orderNum);
      }
      expect(generated.size).toBe(count);
    });

    it('initializes orders with pending_payment and no fabricated tracking numbers', async () => {
      const mockInsert = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockImplementation(async () => ({
            data: {
              id: 'ord_test_123',
              order_number: 'LGQ-MRCH-2026-TEST-123456',
              status: 'pending_payment',
              items: [],
              subtotal: 85.0,
              shipping_cost: 12.0,
              tax_amount: 0.0,
              total_amount: 97.0,
              shipping_address: {},
              stripe_session_id: 'cs_test_abc123',
              stripe_payment_intent_id: null,
              printful_order_id: null,
              tracking_number: null,
              tracking_carrier: null,
              estimated_delivery_date: null,
              proof_approved_at: null,
              proof_snapshot_url: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            error: null,
          })),
        }),
      });

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          insert: mockInsert,
        }),
      } as any;

      const order = await saveMerchandiseOrder(mockSupabase, 'acc_test_1', {
        items: [],
        subtotal: 85.0,
        shippingCost: 12.0,
        taxAmount: 0.0,
        totalAmount: 97.0,
        shippingAddress: {
          fullName: 'Test User',
          streetAddress: '123 Main St',
          city: 'Portland',
          state: 'OR',
          postalCode: '97201',
          country: 'US',
          phone: '555-5555',
          email: 'test@example.com',
        },
        stripeSessionId: 'cs_test_abc123',
      });

      expect(order.status).toBe('pending_payment');
      expect(order.trackingNumber).toBeNull();
      expect(order.trackingCarrier).toBeNull();
      expect(order.estimatedDeliveryDate).toBeNull();
      expect(mockInsert).toHaveBeenCalledTimes(1);
      const payload = mockInsert.mock.calls[0][0];
      expect(payload.status).toBe('pending_payment');
      expect(payload.tracking_number).toBeNull();
      expect(payload.tracking_carrier).toBeNull();
    });
  });

  describe('Server Checkout Action & Security', () => {
    it('rejects order when digital proof is not approved', async () => {
      const { createMerchandiseCheckoutAction } = await import('@/app/dashboard/merchandise/actions');

      const res = await createMerchandiseCheckoutAction({
        items: [
          {
            productId: 'biz_cards',
            productName: '16pt Velvet Business Cards',
            quantity: 500,
            unitPrice: 0.17,
            totalPrice: 85.0,
            colorName: 'Matte Charcoal Onyx',
            colorHex: '#18181b',
            customizationDetails: {
              businessName: 'Bob Smith',
              decorationMethod: 'offset_cmyk',
              placement: 'Standard front & back',
            },
          },
        ],
        shippingAddress: {
          fullName: 'Bob Smith',
          streetAddress: '100 Main St',
          city: 'Denver',
          state: 'CO',
          postalCode: '80202',
          country: 'US',
          phone: '303-555-0100',
          email: 'bob@example.com',
        },
        shippingMethod: 'standard',
        proofApproved: false, // NOT approved
      });

      expect(res.ok).toBe(false);
      expect(res.error).toContain('digital proof approval');
    });

    it('rejects order when attempting to checkout inactive product', async () => {
      const { createMerchandiseCheckoutAction } = await import('@/app/dashboard/merchandise/actions');

      const res = await createMerchandiseCheckoutAction({
        items: [
          {
            productId: 'polos', // Inactive product
            productName: 'Polo Shirt',
            quantity: 12,
            unitPrice: 26.5,
            totalPrice: 318.0,
            colorName: 'Deep Royal Navy',
            colorHex: '#1e3a8a',
            customizationDetails: {
              businessName: 'Bob Smith',
              decorationMethod: 'embroidery',
              placement: 'Left chest',
            },
          },
        ],
        shippingAddress: {
          fullName: 'Bob Smith',
          streetAddress: '100 Main St',
          city: 'Denver',
          state: 'CO',
          postalCode: '80202',
          country: 'US',
          phone: '303-555-0100',
          email: 'bob@example.com',
        },
        shippingMethod: 'standard',
        proofApproved: true,
      });

      expect(res.ok).toBe(false);
      expect(res.error).toContain('no longer available in the active storefront');
    });

    it('overrides client-side price tampering with authoritative server pricing', async () => {
      const { createMerchandiseCheckoutAction } = await import('@/app/dashboard/merchandise/actions');

      // Attacker tries to submit a $0.01 total price for 500 business cards ($85 value)
      const res = await createMerchandiseCheckoutAction({
        items: [
          {
            productId: 'biz_cards',
            productName: '16pt Velvet Business Cards',
            quantity: 500,
            unitPrice: 0.00002,
            totalPrice: 0.01, // TAMPERED PRICE
            colorName: 'Matte Charcoal Onyx',
            colorHex: '#18181b',
            customizationDetails: {
              businessName: 'Bob Smith',
              decorationMethod: 'offset_cmyk',
              placement: 'Standard front & back',
            },
          },
        ],
        shippingAddress: {
          fullName: 'Bob Smith',
          streetAddress: '100 Main St',
          city: 'Portland',
          state: 'OR', // 0% tax
          postalCode: '97201',
          country: 'US',
          phone: '503-555-0100',
          email: 'bob@example.com',
        },
        shippingMethod: 'standard',
        proofApproved: true,
      });

      expect(res.ok).toBe(true);
      expect(res.checkoutUrl).toBe('https://checkout.stripe.com/pay/cs_test_mock_123');

      // Verify Stripe line items charge the authoritative $85.00 (8500 cents), not $0.01
      const lastCall = mockStripeSessionsCreate.mock.calls[0][0];
      expect(lastCall).toBeDefined();
      const merchandiseLineItem = lastCall.line_items[0];
      expect(merchandiseLineItem.price_data.unit_amount).toBe(8500); // $85.00
      expect(merchandiseLineItem.quantity).toBe(1);

      // Verify shipping line item is $12.00
      const shippingLineItem = lastCall.line_items[1];
      expect(shippingLineItem.price_data.unit_amount).toBe(1200); // $12.00
    });

    it('fails safely when Stripe fails, without creating an unpaid fulfillment order', async () => {
      const { createMerchandiseCheckoutAction } = await import('@/app/dashboard/merchandise/actions');

      const savedClient = mockStripeClient;
      mockStripeClient = null; // Simulate Stripe unavailable

      try {
        const res = await createMerchandiseCheckoutAction({
          items: [
            {
              productId: 'biz_cards',
              productName: '16pt Velvet Business Cards',
              quantity: 500,
              unitPrice: 0.17,
              totalPrice: 85.0,
              colorName: 'Matte Charcoal Onyx',
              colorHex: '#18181b',
              customizationDetails: {
                businessName: 'Bob Smith',
                decorationMethod: 'offset_cmyk',
                placement: 'Standard front & back',
              },
            },
          ],
          shippingAddress: {
            fullName: 'Bob Smith',
            streetAddress: '100 Main St',
            city: 'Portland',
            state: 'OR',
            postalCode: '97201',
            country: 'US',
            phone: '503-555-0100',
            email: 'bob@example.com',
          },
          shippingMethod: 'standard',
          proofApproved: true,
        });

        expect(res.ok).toBe(false);
        expect(res.error).toContain('Stripe is not configured');
        expect(res.order).toBeUndefined(); // Zero unpaid fulfillment
      } finally {
        mockStripeClient = savedClient;
      }
    });
  });

  describe('Stripe Webhook Payment Settlement & Fulfillment', () => {
    it('processes checkout.session.completed, dispatches Printful, and logs revenue ledger', async () => {
      const mockOrder = {
        id: 'ord_webhook_123',
        order_number: 'LGQ-MRCH-2026-TEST-999999',
        account_id: 'acc_test_1',
        status: 'pending_payment',
        subtotal: 85.0,
        shipping_cost: 12.0,
        tax_amount: 0.0,
        total_amount: 97.0,
        items: [
          {
            productId: 'biz_cards',
            productName: '16pt Velvet Heavyweight Business Cards',
            color: { id: 'classic_black', name: 'Classic Black', hex: '#1e293b' },
            quantity: 500,
            unitPrice: 0.17,
            totalPrice: 85.0,
            options: { finish: 'Soft-Touch Matte Velvet' },
          },
        ],
        shipping_address: {
          fullName: 'John Contractor',
          streetAddress: '100 Industrial Pkwy',
          city: 'Portland',
          state: 'OR',
          postalCode: '97201',
          country: 'US',
          phone: '503-555-0100',
          email: 'john@example.com',
        },
        stripe_session_id: 'cs_test_paid_123',
      };

      const updateMock = vi.fn().mockResolvedValue({ error: null });
      const ledgerInsertMock = vi.fn().mockResolvedValue({ error: null });

      const mockAdminClient = {
        from: vi.fn((table: string) => {
          if (table === 'merchandise_orders') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: mockOrder, error: null }),
                }),
              }),
              update: vi.fn().mockReturnValue({
                eq: updateMock,
              }),
            };
          }
          if (table === 'merchandise_revenue_ledger') {
            return {
              insert: ledgerInsertMock,
            };
          }
          return {};
        }),
      } as any;

      const stripeEvent = {
        id: 'evt_test_paid',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_paid_123',
            payment_status: 'paid',
            payment_intent: 'pi_test_123',
            metadata: {
              merchandise_order: 'true',
              account_id: 'acc_test_1',
              order_id: 'ord_webhook_123',
              order_number: 'LGQ-MRCH-2026-TEST-999999',
              platform_cut: '8.50',
              wholesale_cost: '35.00',
            },
          },
        },
      } as any;

      const handled = await handleMerchandiseWebhookEvent(stripeEvent, mockAdminClient);
      expect(handled).toBe(true);
      expect(updateMock).toHaveBeenCalled();
      expect(ledgerInsertMock).toHaveBeenCalledTimes(1);

      const ledgerCall = ledgerInsertMock.mock.calls[0][0];
      expect(ledgerCall.account_id).toBe('acc_test_1');
      expect(ledgerCall.order_id).toBe('ord_webhook_123');
      expect(ledgerCall.order_number).toBe('LGQ-MRCH-2026-TEST-999999');
      expect(ledgerCall.gross_retail_amount).toBe(85.0);
      expect(ledgerCall.platform_cut_amount).toBe(8.5);
    });

    it('enforces idempotency on duplicate Stripe events without duplicate dispatch', async () => {
      const mockPaidOrder = {
        id: 'ord_123',
        status: 'in_production', // Already processed
      };

      const mockAdminClient = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: mockPaidOrder, error: null }),
            }),
          }),
          update: vi.fn(),
        })),
      } as any;

      const stripeEvent = {
        id: 'evt_test_dup',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_123',
            payment_status: 'paid',
            metadata: { merchandise_order: 'true', order_id: 'ord_123' },
          },
        },
      } as any;

      const handled = await handleMerchandiseWebhookEvent(stripeEvent, mockAdminClient);
      expect(handled).toBe(true);
      expect(mockAdminClient.from).toHaveBeenCalledTimes(1); // Only checked status, did not update or dispatch
    });

    it('cancels pending order on checkout.session.expired', async () => {
      const updateMock = vi.fn().mockResolvedValue({ error: null });
      const mockAdminClient = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'ord_expired_1', status: 'pending_payment' },
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: updateMock,
          }),
        })),
      } as any;

      const stripeEvent = {
        id: 'evt_test_exp',
        type: 'checkout.session.expired',
        data: {
          object: {
            id: 'cs_test_expired',
            metadata: { merchandise_order: 'true', order_id: 'ord_expired_1' },
          },
        },
      } as any;

      const handled = await handleMerchandiseWebhookEvent(stripeEvent, mockAdminClient);
      expect(handled).toBe(true);
      expect(updateMock).toHaveBeenCalled();
    });

    it('ignores non-merchandise Stripe checkout sessions', async () => {
      const stripeEvent = {
        id: 'evt_other',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_other',
            metadata: { plan_id: 'pro_monthly' }, // Not a merchandise order
          },
        },
      } as any;

      const handled = await handleMerchandiseWebhookEvent(stripeEvent, {} as any);
      expect(handled).toBe(false);
    });
  });

  describe('Printful Webhook Authentication & Security', () => {
    it('rejects unauthenticated requests with 401 when webhook secret is configured', async () => {
      const { POST } = await import('@/app/api/webhooks/printful/route');
      const originalSecret = process.env.PRINTFUL_WEBHOOK_SECRET;
      process.env.PRINTFUL_WEBHOOK_SECRET = 'pf_secret_test_key';

      try {
        const req = new Request('http://localhost:3000/api/webhooks/printful', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'package_shipped', data: {} }),
        });

        const res = await POST(req);
        expect(res.status).toBe(401);
        const json = await res.json();
        expect(json.error).toBe('Unauthorized');
      } finally {
        process.env.PRINTFUL_WEBHOOK_SECRET = originalSecret;
      }
    });

    it('rejects requests with mismatched HMAC signature with 401', async () => {
      const { POST } = await import('@/app/api/webhooks/printful/route');
      const originalSecret = process.env.PRINTFUL_WEBHOOK_SECRET;
      process.env.PRINTFUL_WEBHOOK_SECRET = 'pf_secret_test_key';

      try {
        const req = new Request('http://localhost:3000/api/webhooks/printful', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-printful-signature': '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          },
          body: JSON.stringify({ type: 'package_shipped', data: {} }),
        });

        const res = await POST(req);
        expect(res.status).toBe(401);
      } finally {
        process.env.PRINTFUL_WEBHOOK_SECRET = originalSecret;
      }
    });

    it('accepts valid HMAC-SHA256 signature in X-Printful-Signature header', async () => {
      const { POST } = await import('@/app/api/webhooks/printful/route');
      const originalSecret = process.env.PRINTFUL_WEBHOOK_SECRET;
      const testSecret = 'pf_secret_test_key';
      process.env.PRINTFUL_WEBHOOK_SECRET = testSecret;

      try {
        const payload = JSON.stringify({
          type: 'package_shipped',
          data: {
            order: { external_id: 'LGQ-MRCH-2026-9999' },
            shipment: {
              tracking_number: '1Z9999999999999999',
              carrier: 'UPS Ground Commercial',
              estimated_delivery_date: '2026-09-10',
            },
          },
        });

        const hmac = createHmac('sha256', testSecret);
        hmac.update(payload, 'utf8');
        const signature = hmac.digest('hex');

        const req = new Request('http://localhost:3000/api/webhooks/printful', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-printful-signature': signature,
          },
          body: payload,
        });

        const res = await POST(req);
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.ok).toBe(true);
      } finally {
        process.env.PRINTFUL_WEBHOOK_SECRET = originalSecret;
      }
    });

    it('accepts valid secret key in X-PF-Webhook-Key header', async () => {
      const { POST } = await import('@/app/api/webhooks/printful/route');
      const originalSecret = process.env.PRINTFUL_WEBHOOK_SECRET;
      const testSecret = 'pf_secret_test_key_direct';
      process.env.PRINTFUL_WEBHOOK_SECRET = testSecret;

      try {
        const payload = JSON.stringify({
          type: 'package_shipped',
          data: {
            order: { external_id: 'LGQ-MRCH-2026-8888' },
            shipment: {
              tracking_number: '9400111899223190000000',
              carrier: 'USPS Priority Mail',
            },
          },
        });

        const req = new Request('http://localhost:3000/api/webhooks/printful', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-pf-webhook-key': testSecret,
          },
          body: payload,
        });

        const res = await POST(req);
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.ok).toBe(true);
      } finally {
        process.env.PRINTFUL_WEBHOOK_SECRET = originalSecret;
      }
    });
  });

  describe('Printful Automated Fulfillment Dispatch', () => {
    it('builds a valid simulated order payload when running in test environment', async () => {
      const mockItem: MerchandiseOrderItem = {
        productId: 'polos',
        productName: 'Pro Moisture-Wicking Embroidered Work Polo',
        quantity: 12,
        unitPrice: 26.5,
        totalPrice: 318.0,
        colorName: 'Deep Royal Navy',
        colorHex: '#1e3a8a',
        customizationDetails: {
          businessName: 'Apex Plumbing Experts',
          phone: '(303) 555-0199',
          website: 'www.apexplumb.com',
          license: 'LIC #94820',
          logoUrl: 'https://storage.googleapis.com/test-bucket/apex-logo.png',
          decorationMethod: 'embroidery',
          placement: 'Left Chest High-Density Embroidery',
          sizeBreakdown: { M: 4, L: 4, XL: 4 },
        },
      };

      const mockAddress: ShippingAddress = {
        fullName: 'Mike Harrison',
        companyName: 'Apex Plumbing',
        streetAddress: '4200 Commercial Way',
        city: 'Denver',
        state: 'CO',
        postalCode: '80205',
        country: 'US',
        phone: '(303) 555-0199',
        email: 'mike@apexplumb.com',
      };

      const res = await createPrintfulOrder({
        orderNumber: 'LGQ-MRCH-2026-9999',
        items: [mockItem],
        shippingAddress: mockAddress,
        retailTotal: 318.0,
        companyName: 'Apex Plumbing Experts',
      });

      expect(res.ok).toBe(true);
      expect(res.trackingNumber).toBeDefined();
      expect(res.trackingNumber).toContain('1Z999');
      expect(res.carrier).toBe('UPS Ground Commercial');
      expect(res.status).toBe('in_production');
    });
  });

  describe('HTML5 Canvas Real-Item Casting Engine', () => {
    it('verifies all photographic blanks have valid URLs for canvas projection', async () => {
      const { PRINTFUL_STUDIO_PHOTOS } = await import('@/lib/merchandise/mockup-assets');

      expect(Object.keys(PRINTFUL_STUDIO_PHOTOS)).toContain('t_shirts');
      expect(Object.keys(PRINTFUL_STUDIO_PHOTOS)).toContain('polos');
      expect(Object.keys(PRINTFUL_STUDIO_PHOTOS)).toContain('hats');
      expect(Object.keys(PRINTFUL_STUDIO_PHOTOS)).toContain('tumblers');
      expect(Object.keys(PRINTFUL_STUDIO_PHOTOS)).toContain('phone_cases');

      for (const [category, colors] of Object.entries(PRINTFUL_STUDIO_PHOTOS)) {
        for (const [colorKey, photoDef] of Object.entries(colors)) {
          expect(photoDef.front).toMatch(/^https:\/\/files\.cdn\.printful\.com/);
        }
      }
    });

    it('rejects forbidden hosts in proxy-image validation to prevent SSRF', async () => {
      const { GET } = await import('@/app/api/merchandise/proxy-image/route');
      const { NextRequest } = await import('next/server');

      // Test missing URL
      const reqMissing = new NextRequest('http://localhost:3012/api/merchandise/proxy-image');
      const resMissing = await GET(reqMissing);
      expect(resMissing.status).toBe(400);

      // Test malicious internal IP host
      const reqEvil = new NextRequest(
        'http://localhost:3012/api/merchandise/proxy-image?url=http://127.0.0.1:8080/secret'
      );
      const resEvil = await GET(reqEvil);
      expect(resEvil.status).toBe(403);

      // Test unwhitelisted public host
      const reqUnknown = new NextRequest(
        'http://localhost:3012/api/merchandise/proxy-image?url=https://evil-site.com/exploit.jpg'
      );
      const resUnknown = await GET(reqUnknown);
      expect(resUnknown.status).toBe(403);
    });
  });
});
