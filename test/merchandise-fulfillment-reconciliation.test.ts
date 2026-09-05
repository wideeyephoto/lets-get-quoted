import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { handleMerchandiseWebhookEvent } from '@/lib/merchandise/stripe-webhook';

// Mock dependencies
let mockOrderUpdatePayloads: any[] = [];
let mockOpUpdatePayloads: any[] = [];
let mockFulfillmentAttempts: any[] = [];
let mockLedgerEntries: any[] = [];

let mockOrderRecord: any = null;
let mockPrintfulRes = {
  ok: true,
  provider: 'printful',
  printfulOrderId: 98765432,
  trackingNumber: '1Z9999999999999999',
  carrier: 'UPS Ground',
  estimatedDelivery: '2026-09-12',
  isSimulated: true,
  error: null as string | null,
};

vi.mock('@/lib/merchandise/printful-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/merchandise/printful-client')>();
  return {
    ...actual,
    createPrintfulOrder: vi.fn().mockImplementation(async () => mockPrintfulRes),
  };
});

vi.mock('@/lib/merchandise/merchandise-emails', () => ({
  sendCustomerMerchandiseReceipt: vi.fn().mockResolvedValue({ ok: true }),
  sendStaffMerchandiseAlert: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue(true),
  clientIpFrom: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('@/lib/stripe', () => ({
  getStripeClient: vi.fn(() => ({
    paymentIntents: {
      retrieve: vi.fn().mockResolvedValue({
        latest_charge: {
          balance_transaction: { fee: 166 },
        },
      }),
    },
  })),
}));

const mockAdmin: any = {
  from: vi.fn((table: string) => {
    if (table === 'merchandise_orders') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockImplementation(async () => ({
          data: mockOrderRecord,
          error: null,
        })),
        update: vi.fn().mockImplementation((payload: any) => {
          mockOrderUpdatePayloads.push(payload);
          return {
            eq: vi.fn().mockResolvedValue({ error: null }),
          };
        }),
      };
    }

    if (table === 'merchandise_checkout_operations') {
      return {
        update: vi.fn().mockImplementation((payload: any) => {
          mockOpUpdatePayloads.push(payload);
          return {
            eq: vi.fn().mockResolvedValue({ error: null }),
          };
        }),
      };
    }

    if (table === 'merchandise_fulfillment_attempts') {
      return {
        insert: vi.fn().mockImplementation((payload: any) => {
          mockFulfillmentAttempts.push(payload);
          return { error: null };
        }),
      };
    }

    if (table === 'merchandise_revenue_ledger') {
      return {
        insert: vi.fn().mockImplementation((payload: any) => {
          mockLedgerEntries.push(payload);
          return { error: null };
        }),
      };
    }

    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    };
  }),
};

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(() => mockAdmin),
}));

describe('Batch F: Fulfillment Worker & Webhook Reconciliation', () => {
  beforeEach(() => {
    mockOrderUpdatePayloads = [];
    mockOpUpdatePayloads = [];
    mockFulfillmentAttempts = [];
    mockLedgerEntries = [];
    mockPrintfulRes = {
      ok: true,
      provider: 'printful',
      printfulOrderId: 98765432,
      trackingNumber: '1Z9999999999999999',
      carrier: 'UPS Ground',
      estimatedDelivery: '2026-09-12',
      isSimulated: true,
      error: null,
    };
    mockOrderRecord = {
      id: 'ord_test_rec_123',
      account_id: 'acc_test_rec_123',
      order_number: 'LGQ-MRCH-2026-REC1',
      status: 'pending_payment',
      payment_status: 'pending',
      fulfillment_status: 'not_submitted',
      subtotal: 35.0,
      shipping_cost: 12.0,
      tax_amount: 0.0,
      total_amount: 47.0,
      items: [
        {
          productId: 'biz_cards',
          quantity: 100,
          unitPrice: 0.35,
          totalPrice: 35.0,
          customizationDetails: { businessName: 'Apex Contracting' },
        },
      ],
      shipping_address: {
        fullName: 'John Builder',
        streetAddress: '100 Construction Way',
        city: 'Denver',
        state: 'CO',
        postalCode: '80202',
        country: 'US',
        phone: '(303) 555-0100',
        email: 'john@apexcontracting.com',
      },
    };
  });

  describe('Printful Webhook Authentication & Deduplication', () => {
    it('rejects unauthorized requests with 401 when secret is set', async () => {
      const { POST } = await import('@/app/api/webhooks/printful/route');
      const originalSecret = process.env.PRINTFUL_WEBHOOK_SECRET;
      process.env.PRINTFUL_WEBHOOK_SECRET = 'pf_sec_recon_key';

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

    it('accepts v2 signature header X-PF-Webhook-Signature', async () => {
      const { POST } = await import('@/app/api/webhooks/printful/route');
      const originalSecret = process.env.PRINTFUL_WEBHOOK_SECRET;
      const testSecret = 'pf_sec_recon_key_v2';
      process.env.PRINTFUL_WEBHOOK_SECRET = testSecret;

      try {
        const payload = JSON.stringify({
          event_id: 'evt_unique_101',
          type: 'package_shipped',
          data: {
            order: { external_id: 'LGQ-MRCH-2026-REC1' },
            shipment: {
              tracking_number: '1Z8888888888888888',
              carrier: 'UPS Ground Commercial',
              estimated_delivery_date: '2026-09-15',
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
            'x-pf-webhook-signature': signature,
          },
          body: payload,
        });

        const res = await POST(req);
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.ok).toBe(true);

        // Verify update was called with decoupled status
        const update = mockOrderUpdatePayloads.find((u) => u.tracking_number === '1Z8888888888888888');
        expect(update).toBeDefined();
        expect(update.status).toBe('shipped');
        expect(update.fulfillment_status).toBe('shipped');
      } finally {
        process.env.PRINTFUL_WEBHOOK_SECRET = originalSecret;
      }
    });

    it('accepts 64-character hex-encoded Printful secret with v2 signature', async () => {
      const { POST } = await import('@/app/api/webhooks/printful/route');
      const originalSecret = process.env.PRINTFUL_WEBHOOK_SECRET;
      // 32-byte (64 hex characters) secret
      const hexSecret = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      process.env.PRINTFUL_WEBHOOK_SECRET = hexSecret;

      try {
        const payload = JSON.stringify({
          event_id: 'evt_unique_hex_102',
          type: 'package_shipped',
          data: {
            order: { external_id: 'LGQ-MRCH-2026-REC1' },
            shipment: {
              tracking_number: '1ZHEX123456789',
              carrier: 'UPS Ground',
            },
          },
        });

        const hmac = createHmac('sha256', Buffer.from(hexSecret, 'hex'));
        hmac.update(payload, 'utf8');
        const signature = hmac.digest('hex');

        const req = new Request('http://localhost:3000/api/webhooks/printful', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-pf-webhook-signature': signature,
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

    it('deduplicates replayed event IDs', async () => {
      const { POST } = await import('@/app/api/webhooks/printful/route');
      const originalSecret = process.env.PRINTFUL_WEBHOOK_SECRET;
      const testSecret = 'pf_sec_dedup_test';
      process.env.PRINTFUL_WEBHOOK_SECRET = testSecret;

      try {
        const payload = JSON.stringify({
          event_id: 'evt_replay_dedup_1001',
          type: 'order_updated',
          data: {
            order: { external_id: 'LGQ-MRCH-2026-REC1', status: 'inprocess' },
          },
        });

        const hmac = createHmac('sha256', testSecret);
        hmac.update(payload, 'utf8');
        const signature = hmac.digest('hex');

        const sendReq = () =>
          new Request('http://localhost:3000/api/webhooks/printful', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-pf-webhook-signature': signature,
            },
            body: payload,
          });

        const res1 = await POST(sendReq());
        expect(res1.status).toBe(200);

        // Replay same event ID
        const res2 = await POST(sendReq());
        expect(res2.status).toBe(200);
        const json2 = await res2.json();
        expect(json2.message).toBe('Event already processed');
      } finally {
        process.env.PRINTFUL_WEBHOOK_SECRET = originalSecret;
      }
    });

    it('maps Printful status updates to decoupled fulfillment_status', async () => {
      const { POST } = await import('@/app/api/webhooks/printful/route');
      const originalSecret = process.env.PRINTFUL_WEBHOOK_SECRET;
      const testSecret = 'pf_sec_status_map';
      process.env.PRINTFUL_WEBHOOK_SECRET = testSecret;

      try {
        const statusesToTest = [
          { pfStatus: 'inprocess', expectedStatus: 'in_production', expectedFulfillment: 'in_production' },
          { pfStatus: 'fulfilled', expectedStatus: 'shipped', expectedFulfillment: 'shipped' },
          { pfStatus: 'canceled', expectedStatus: 'cancelled', expectedFulfillment: 'cancelled' },
          { pfStatus: 'failed', expectedStatus: 'failed', expectedFulfillment: 'failed' },
          { pfStatus: 'onhold', expectedStatus: 'on_hold', expectedFulfillment: 'on_hold' },
        ];

        for (let i = 0; i < statusesToTest.length; i++) {
          const { pfStatus, expectedStatus, expectedFulfillment } = statusesToTest[i];
          const payload = JSON.stringify({
            event_id: `evt_status_map_${i}_${Date.now()}`,
            type: 'order_updated',
            data: {
              order: { external_id: 'LGQ-MRCH-2026-REC1', status: pfStatus },
            },
          });

          const hmac = createHmac('sha256', testSecret);
          hmac.update(payload, 'utf8');
          const signature = hmac.digest('hex');

          const req = new Request('http://localhost:3000/api/webhooks/printful', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-pf-webhook-signature': signature,
            },
            body: payload,
          });

          const res = await POST(req);
          expect(res.status).toBe(200);

          const lastUpdate = mockOrderUpdatePayloads[mockOrderUpdatePayloads.length - 1];
          expect(lastUpdate.status).toBe(expectedStatus);
          expect(lastUpdate.fulfillment_status).toBe(expectedFulfillment);
        }
      } finally {
        process.env.PRINTFUL_WEBHOOK_SECRET = originalSecret;
      }
    });
  });

  describe('Stripe Webhook Decoupled Payment & Fulfillment Lifecycle', () => {
    it('sets payment_status=paid, fulfillment_status=in_production, and completes operation on paid session', async () => {
      const mockEvent: any = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_complete_123',
            payment_status: 'paid',
            payment_intent: 'pi_test_complete_123',
            amount_total: 4700,
            metadata: {
              merchandise_order: 'true',
              order_id: 'ord_test_rec_123',
              order_number: 'LGQ-MRCH-2026-REC1',
              operation_key: 'op_test_key_123',
            },
            total_details: {
              amount_tax: 0,
              amount_shipping: 1200,
            },
          },
        },
      };

      const handled = await handleMerchandiseWebhookEvent(mockEvent, mockAdmin);
      expect(handled).toBe(true);

      // Verify order update had decoupled statuses
      const orderUpdate = mockOrderUpdatePayloads.find((p) => p.payment_status === 'paid');
      expect(orderUpdate).toBeDefined();
      expect(orderUpdate.status).toBe('in_production');
      expect(orderUpdate.fulfillment_status).toBe('in_production');
      expect(orderUpdate.printful_external_id).toBe('LGQ-MRCH-2026-REC1');
      expect(orderUpdate.confirmed_at).toBeDefined();

      // Verify checkout operation completed
      const opUpdate = mockOpUpdatePayloads.find((p) => p.status === 'completed');
      expect(opUpdate).toBeDefined();
    });

    it('sets payment_status=paid but fulfillment_status=failed without resetting to proof_approved if Printful fails', async () => {
      mockPrintfulRes = {
        ok: false,
        provider: 'printful',
        printfulOrderId: 0,
        trackingNumber: null as any,
        carrier: null as any,
        estimatedDelivery: null as any,
        isSimulated: false,
        error: 'Printful API error: stock unavailable for Mohawk cards',
      };

      const mockEvent: any = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_failed_pf_123',
            payment_status: 'paid',
            payment_intent: 'pi_test_failed_pf_123',
            amount_total: 4700,
            metadata: {
              merchandise_order: 'true',
              order_id: 'ord_test_rec_123',
              order_number: 'LGQ-MRCH-2026-REC1',
              operation_key: 'op_failed_pf_123',
            },
          },
        },
      };

      const handled = await handleMerchandiseWebhookEvent(mockEvent, mockAdmin);
      expect(handled).toBe(true);

      const orderUpdate = mockOrderUpdatePayloads.find((p) => p.payment_status === 'paid');
      expect(orderUpdate).toBeDefined();
      // CRITICAL: Payment remains paid, but fulfillment failed. Does NOT revert to proof_approved!
      expect(orderUpdate.payment_status).toBe('paid');
      expect(orderUpdate.status).toBe('failed');
      expect(orderUpdate.fulfillment_status).toBe('failed');

      // Operation record is marked failed with error message
      const opUpdate = mockOpUpdatePayloads.find((p) => p.status === 'failed');
      expect(opUpdate).toBeDefined();
      expect(opUpdate.last_error).toContain('stock unavailable');

      // Fulfillment attempt is logged
      const attempt = mockFulfillmentAttempts.find((a) => a.status === 'failed');
      expect(attempt).toBeDefined();
      expect(attempt.error_message).toContain('stock unavailable');
    });

    it('marks order and operation as cancelled/expired on checkout.session.expired', async () => {
      const mockEvent: any = {
        type: 'checkout.session.expired',
        data: {
          object: {
            id: 'cs_test_expired_123',
            metadata: {
              merchandise_order: 'true',
              operation_key: 'op_expired_key_123',
            },
          },
        },
      };

      const handled = await handleMerchandiseWebhookEvent(mockEvent, mockAdmin);
      expect(handled).toBe(true);

      const orderUpdate = mockOrderUpdatePayloads.find((p) => p.status === 'cancelled');
      expect(orderUpdate).toBeDefined();
      expect(orderUpdate.payment_status).toBe('cancelled');
      expect(orderUpdate.fulfillment_status).toBe('cancelled');

      const opUpdate = mockOpUpdatePayloads.find((p) => p.status === 'expired');
      expect(opUpdate).toBeDefined();
    });

    it('marks order payment_status=refunded on charge.refunded and creates reversal ledger entry', async () => {
      const mockEvent: any = {
        type: 'charge.refunded',
        data: {
          object: {
            payment_intent: 'pi_test_refund_123',
            amount_refunded: 4700,
          },
        },
      };

      const handled = await handleMerchandiseWebhookEvent(mockEvent, mockAdmin);
      expect(handled).toBe(true);

      const orderUpdate = mockOrderUpdatePayloads.find((p) => p.status === 'refunded');
      expect(orderUpdate).toBeDefined();
      expect(orderUpdate.payment_status).toBe('refunded');

      const ledger = mockLedgerEntries.find((l) => l.gross_retail_amount < 0);
      expect(ledger).toBeDefined();
      expect(ledger.order_number).toContain('-REFUND');
    });

    it('marks order payment_status=disputed on charge.dispute.created', async () => {
      const mockEvent: any = {
        type: 'charge.dispute.created',
        data: {
          object: {
            charge: 'ch_test_dispute_123',
            payment_intent: 'pi_test_dispute_123',
          },
        },
      };

      const handled = await handleMerchandiseWebhookEvent(mockEvent, mockAdmin);
      expect(handled).toBe(true);

      const orderUpdate = mockOrderUpdatePayloads.find((p) => p.status === 'disputed');
      expect(orderUpdate).toBeDefined();
      expect(orderUpdate.payment_status).toBe('disputed');
    });
  });
});
