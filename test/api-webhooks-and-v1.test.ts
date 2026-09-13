import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  checkRateLimitStrict: vi.fn(),
  clientIpFrom: vi.fn(),
  verifyApiToken: vi.fn(),
  createLead: vi.fn(),
  getLead: vi.fn(),
  handleStripeBillingWebhook: vi.fn(),
  handleStripeConnectedPaymentWebhook: vi.fn(),
  handleStripeTopUpWebhook: vi.fn(),
  validateWebhookUrl: vi.fn(),
  generateWebhookSecret: vi.fn(),
  encryptWebhookSecret: vi.fn(),
  smsInboundHandler: vi.fn(),
  smsVoiceHandler: vi.fn(),
  smsStatusHandler: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimitStrict: mocks.checkRateLimitStrict,
  clientIpFrom: () => '127.0.0.1',
}));

vi.mock('@/lib/public-api/api-credentials', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/public-api/api-credentials')>();
  return {
    ...actual,
    verifyApiToken: mocks.verifyApiToken,
  };
});

vi.mock('@/lib/leads', () => ({
  createLead: mocks.createLead,
  getLead: mocks.getLead,
  getLeadTriage: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/billing/stripe-billing-webhook', () => ({
  handleStripeBillingWebhook: mocks.handleStripeBillingWebhook,
}));

vi.mock('@/lib/billing/stripe-connected-payment-webhook', () => ({
  handleStripeConnectedPaymentWebhook: mocks.handleStripeConnectedPaymentWebhook,
}));

vi.mock('@/lib/billing/stripe-top-up-webhook', () => ({
  handleStripeTopUpWebhook: mocks.handleStripeTopUpWebhook,
}));

vi.mock('@/lib/public-api/ssrf-guard', () => ({
  validateWebhookUrl: mocks.validateWebhookUrl,
}));

vi.mock('@/lib/public-api/webhook-vault-crypto', () => ({
  generateWebhookSecret: mocks.generateWebhookSecret,
  encryptWebhookSecret: mocks.encryptWebhookSecret,
}));

vi.mock('@/app/api/sms/inbound/route', () => ({
  POST: mocks.smsInboundHandler,
}));

vi.mock('@/app/api/sms/voice/route', () => ({
  POST: mocks.smsVoiceHandler,
}));

vi.mock('@/app/api/sms/status/route', () => ({
  POST: mocks.smsStatusHandler,
}));

import { GET as getLeadsRoute, POST as postLeadsRoute } from '@/app/api/v1/leads/route';
import { GET as getLeadByIdRoute, PATCH as patchLeadByIdRoute } from '@/app/api/v1/leads/[id]/route';
import {
  GET as getWebhookSubsRoute,
  POST as postWebhookSubsRoute,
} from '@/app/api/v1/webhook-subscriptions/route';
import {
  GET as getWebhookSubByIdRoute,
  DELETE as deleteWebhookSubByIdRoute,
} from '@/app/api/v1/webhook-subscriptions/[id]/route';
import { GET as getDeliveriesRoute } from '@/app/api/v1/webhook-subscriptions/[id]/deliveries/route';
import { POST as retryDeliveryRoute } from '@/app/api/v1/webhook-deliveries/[id]/retry/route';

import { POST as stripeBillingRoute } from '@/app/api/stripe/billing/webhook/route';
import { POST as stripeConnectedRoute } from '@/app/api/stripe/connected-payments/webhook/route';
import { POST as stripeTopUpsRoute } from '@/app/api/stripe/top-ups/webhook/route';

import { POST as twilioInboundRoute } from '@/app/api/twilio/inbound/route';
import { POST as twilioVoiceRoute } from '@/app/api/twilio/voice/route';
import { POST as twilioStatusRoute } from '@/app/api/twilio/status/route';

describe('Public API v1 and Webhooks', () => {
  let fakeAdmin: any;
  let customFromHandler: ((table: string) => any) | null = null;

  const validTokenContext = {
    credentialId: 'cred-123',
    accountId: 'acc-456',
    name: 'Production Key',
    tokenPrefix: 'lgq_live_abc',
    scopes: new Set(['leads.read', 'leads.write', 'webhooks.manage']),
    expiresAt: null,
    createdBy: 'user-789',
  };

  const createDefaultBuilder = () => {
    const builder: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      insert: vi.fn().mockImplementation(() => {
        const p: any = Promise.resolve({ data: null, error: null });
        p.select = vi.fn().mockReturnThis();
        p.single = vi.fn().mockResolvedValue({ data: null, error: null });
        return p;
      }),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: (resolve: any) => Promise.resolve({ data: null, error: null }).then(resolve),
    };
    return builder;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    customFromHandler = null;

    fakeAdmin = {
      from: vi.fn((table: string) => {
        if (table === 'api_request_audit') {
          return {
            insert: vi.fn().mockReturnValue(Promise.resolve({ data: null, error: null })),
          };
        }
        if (table === 'api_idempotency_records') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            insert: vi.fn().mockReturnValue(Promise.resolve({ data: null, error: null })),
          };
        }
        if (customFromHandler) {
          const res = customFromHandler(table);
          if (res) return res;
        }
        return createDefaultBuilder();
      }),
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    };

    mocks.createAdminClient.mockReturnValue(fakeAdmin);
    mocks.checkRateLimitStrict.mockResolvedValue(true);
    mocks.verifyApiToken.mockResolvedValue(validTokenContext);
    mocks.validateWebhookUrl.mockResolvedValue({ safe: true });
    mocks.generateWebhookSecret.mockReturnValue('whsec_secret_123');
    mocks.encryptWebhookSecret.mockReturnValue({
      secretEncrypted: 'enc_123',
      secretIv: 'iv_123',
      secretTag: 'tag_123',
    });
  });

  describe('Authentication & Scopes on v1 Routes', () => {
    it('rejects requests without Authorization header with 401', async () => {
      const req = new NextRequest('http://localhost:3010/api/v1/leads');
      const res = await getLeadsRoute(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error.code).toBe('invalid_api_key');
    });

    it('rejects invalid tokens with 401', async () => {
      mocks.verifyApiToken.mockResolvedValue(null);
      const req = new NextRequest('http://localhost:3010/api/v1/leads', {
        headers: { authorization: 'Bearer invalid-token' },
      });
      const res = await getLeadsRoute(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error.code).toBe('invalid_api_key');
    });

    it('rejects tokens lacking required scope with 403', async () => {
      mocks.verifyApiToken.mockResolvedValue({
        ...validTokenContext,
        scopes: new Set(['webhooks.manage']), // missing leads.read
      });
      const req = new NextRequest('http://localhost:3010/api/v1/leads', {
        headers: { authorization: 'Bearer lgq_live_abc' },
      });
      const res = await getLeadsRoute(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error.code).toBe('insufficient_scope');
    });
  });

  describe('GET /api/v1/leads', () => {
    it('returns paginated leads matching query params', async () => {
      const mockLeads = [
        {
          id: 'lead-1',
          account_id: 'acc-456',
          status: 'new',
          customer_name: 'Jane Doe',
          email: 'jane@example.com',
          phone: '5125550100',
          source: 'website',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      customFromHandler = () => {
        const b: any = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          then: (resolve: any) => Promise.resolve({ data: mockLeads, error: null }).then(resolve),
        };
        return b;
      };

      const req = new NextRequest('http://localhost:3010/api/v1/leads?status=new&limit=10', {
        headers: { authorization: 'Bearer lgq_live_abc' },
      });

      const res = await getLeadsRoute(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data).toHaveLength(1);
      expect(data.data[0].id).toBe('lead-1');
      expect(data.data[0].status).toBe('new');
    });
  });

  describe('POST /api/v1/leads', () => {
    it('returns 400 when body is invalid JSON', async () => {
      const req = new NextRequest('http://localhost:3010/api/v1/leads', {
        method: 'POST',
        headers: { authorization: 'Bearer lgq_live_abc', 'content-type': 'application/json' },
        body: 'invalid-json',
      });
      const res = await postLeadsRoute(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe('invalid_request');
    });

    it('creates lead and returns 201', async () => {
      const created = {
        id: 'lead-new-1',
        account_id: 'acc-456',
        customer_name: 'John Smith',
        email: 'john@example.com',
        phone: '5125550199',
        status: 'new',
        source: 'api',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mocks.createLead.mockResolvedValue(created);

      const req = new NextRequest('http://localhost:3010/api/v1/leads', {
        method: 'POST',
        headers: {
          authorization: 'Bearer lgq_live_abc',
          'content-type': 'application/json',
          'idempotency-key': 'idem-key-1',
        },
        body: JSON.stringify({
          name: 'John Smith',
          email: 'john@example.com',
          phone: '5125550199',
          project_type: 'Plumbing',
          description: 'Need leaky faucet fixed',
        }),
      });

      const res = await postLeadsRoute(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.id).toBe('lead-new-1');
      expect(mocks.createLead).toHaveBeenCalled();
    });
  });

  describe('GET & PATCH /api/v1/leads/[id]', () => {
    it('returns 404 when lead is missing', async () => {
      mocks.getLead.mockResolvedValue(null);
      const req = new NextRequest('http://localhost:3010/api/v1/leads/lead-999', {
        headers: { authorization: 'Bearer lgq_live_abc' },
      });
      const res = await getLeadByIdRoute(req, { params: Promise.resolve({ id: 'lead-999' }) });
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error.code).toBe('not_found');
    });

    it('returns lead when found', async () => {
      mocks.getLead.mockResolvedValue({
        id: 'lead-123',
        account_id: 'acc-456',
        name: 'Alice Cooper',
        email: 'alice@example.com',
        phone: '5125550155',
        status: 'contacted',
        source: 'website',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      const req = new NextRequest('http://localhost:3010/api/v1/leads/lead-123', {
        headers: { authorization: 'Bearer lgq_live_abc' },
      });
      const res = await getLeadByIdRoute(req, { params: Promise.resolve({ id: 'lead-123' }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id).toBe('lead-123');
      expect(data.customer.name).toBe('Alice Cooper');
    });

    it('patches lead successfully', async () => {
      const existing = {
        id: 'lead-123',
        account_id: 'acc-456',
        customer_name: 'Alice Cooper',
        email: 'alice@example.com',
        phone: '5125550155',
        status: 'contacted',
        source: 'website',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mocks.getLead.mockResolvedValue(existing);

      customFromHandler = (table: string) => {
        if (table === 'leads') {
          return {
            update: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { ...existing, status: 'quoted' },
              error: null,
            }),
          };
        }
        return null;
      };

      const req = new NextRequest('http://localhost:3010/api/v1/leads/lead-123', {
        method: 'PATCH',
        headers: {
          authorization: 'Bearer lgq_live_abc',
          'content-type': 'application/json',
          'idempotency-key': 'idem-patch-1',
        },
        body: JSON.stringify({ status: 'quoted' }),
      });

      const res = await patchLeadByIdRoute(req, { params: Promise.resolve({ id: 'lead-123' }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe('quoted');
    });
  });

  describe('Webhook Subscriptions Management', () => {
    it('lists webhook subscriptions for workspace', async () => {
      customFromHandler = (table: string) => {
        if (table === 'webhook_subscriptions') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'sub-1',
                  target_url: 'https://example.com/webhook',
                  event_types: ['lead.created'],
                  secret_preview: 'whsec_***123',
                  status: 'active',
                  disabled_reason: null,
                  consecutive_failures: 0,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                },
              ],
              error: null,
            }),
          };
        }
        return null;
      };

      const req = new NextRequest('http://localhost:3010/api/v1/webhook-subscriptions', {
        headers: { authorization: 'Bearer lgq_live_abc' },
      });

      const res = await getWebhookSubsRoute(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data).toHaveLength(1);
      expect(data.data[0].id).toBe('sub-1');
    });

    it('creates a new webhook subscription with generated secret', async () => {
      customFromHandler = (table: string) => {
        if (table === 'webhook_subscriptions') {
          return {
            insert: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'sub-new',
                target_url: 'https://example.com/webhook',
                event_types: ['lead.created'],
                secret_preview: 'whsec_***123',
                status: 'active',
                disabled_reason: null,
                consecutive_failures: 0,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
              error: null,
            }),
          };
        }
        return null;
      };

      const req = new NextRequest('http://localhost:3010/api/v1/webhook-subscriptions', {
        method: 'POST',
        headers: {
          authorization: 'Bearer lgq_live_abc',
          'content-type': 'application/json',
          'idempotency-key': 'idem-sub-1',
        },
        body: JSON.stringify({
          target_url: 'https://example.com/webhook',
          event_types: ['lead.created'],
        }),
      });

      const res = await postWebhookSubsRoute(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.id).toBe('sub-new');
      expect(data.secret).toBe('whsec_secret_123');
    });

    it('retrieves and deletes webhook subscription by ID', async () => {
      customFromHandler = (table: string) => {
        if (table === 'webhook_subscriptions') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            delete: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: 'sub-1',
                target_url: 'https://example.com/webhook',
                event_types: ['lead.created'],
                secret_preview: 'whsec_***123',
                status: 'active',
                disabled_reason: null,
                consecutive_failures: 0,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
              error: null,
            }),
          };
        }
        return null;
      };

      const reqGet = new NextRequest('http://localhost:3010/api/v1/webhook-subscriptions/sub-1', {
        headers: { authorization: 'Bearer lgq_live_abc' },
      });
      const resGet = await getWebhookSubByIdRoute(reqGet, { params: Promise.resolve({ id: 'sub-1' }) });
      expect(resGet.status).toBe(200);

      const reqDel = new NextRequest('http://localhost:3010/api/v1/webhook-subscriptions/sub-1', {
        method: 'DELETE',
        headers: { authorization: 'Bearer lgq_live_abc' },
      });
      const resDel = await deleteWebhookSubByIdRoute(reqDel, { params: Promise.resolve({ id: 'sub-1' }) });
      expect(resDel.status).toBe(204);
    });

    it('lists deliveries and retries a failed delivery', async () => {
      customFromHandler = (table: string) => {
        if (table === 'webhook_deliveries') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'del-1',
                  event_id: 'ev-1',
                  status: 'failed',
                  attempt_count: 3,
                  max_attempts: 5,
                  next_attempt_at: null,
                  delivered_at: null,
                  last_error: 'Connection refused',
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                },
              ],
              error: null,
            }),
          };
        }
        return null;
      };

      const reqDeliveries = new NextRequest('http://localhost:3010/api/v1/webhook-subscriptions/sub-1/deliveries', {
        headers: { authorization: 'Bearer lgq_live_abc' },
      });
      const resDeliveries = await getDeliveriesRoute(reqDeliveries, { params: Promise.resolve({ id: 'sub-1' }) });
      expect(resDeliveries.status).toBe(200);
      const dataDeliveries = await resDeliveries.json();
      expect(dataDeliveries.data).toHaveLength(1);
      expect(dataDeliveries.data[0].id).toBe('del-1');

      // Retry delivery
      fakeAdmin.rpc.mockResolvedValue({ data: true, error: null });
      const reqRetry = new NextRequest('http://localhost:3010/api/v1/webhook-deliveries/del-1/retry', {
        method: 'POST',
        headers: { authorization: 'Bearer lgq_live_abc' },
      });
      const resRetry = await retryDeliveryRoute(reqRetry, { params: Promise.resolve({ id: 'del-1' }) });
      expect(resRetry.status).toBe(200);
      const dataRetry = await resRetry.json();
      expect(dataRetry.success).toBe(true);
      expect(dataRetry.status).toBe('pending');
    });
  });

  describe('Stripe Webhook Handlers', () => {
    it('delegates billing webhook to handleStripeBillingWebhook', async () => {
      mocks.handleStripeBillingWebhook.mockResolvedValue(NextResponse.json({ received: true }, { status: 200 }));
      const req = new Request('http://localhost:3010/api/stripe/billing/webhook', {
        method: 'POST',
        body: JSON.stringify({ type: 'invoice.paid' }),
      });
      const res = await stripeBillingRoute(req);
      expect(res.status).toBe(200);
      expect(mocks.handleStripeBillingWebhook).toHaveBeenCalledWith(req);
    });

    it('delegates connected payments webhook to handleStripeConnectedPaymentWebhook', async () => {
      mocks.handleStripeConnectedPaymentWebhook.mockResolvedValue(NextResponse.json({ received: true }, { status: 200 }));
      const req = new Request('http://localhost:3010/api/stripe/connected-payments/webhook', {
        method: 'POST',
        body: JSON.stringify({ type: 'payment_intent.succeeded' }),
      });
      const res = await stripeConnectedRoute(req);
      expect(res.status).toBe(200);
      expect(mocks.handleStripeConnectedPaymentWebhook).toHaveBeenCalledWith(req);
    });

    it('delegates top-ups webhook to handleStripeTopUpWebhook', async () => {
      mocks.handleStripeTopUpWebhook.mockResolvedValue(NextResponse.json({ received: true }, { status: 200 }));
      const req = new Request('http://localhost:3010/api/stripe/top-ups/webhook', {
        method: 'POST',
        body: JSON.stringify({ type: 'topup.successful' }),
      });
      const res = await stripeTopUpsRoute(req);
      expect(res.status).toBe(200);
      expect(mocks.handleStripeTopUpWebhook).toHaveBeenCalledWith(req);
    });
  });

  describe('Twilio Alias Routes', () => {
    it('routes twilio/inbound to sms/inbound handler', async () => {
      mocks.smsInboundHandler.mockResolvedValue(new Response('<Response></Response>', { status: 200 }));
      const req = new Request('http://localhost:3010/api/twilio/inbound', { method: 'POST' });
      const res = await twilioInboundRoute(req);
      expect(res.status).toBe(200);
      expect(mocks.smsInboundHandler).toHaveBeenCalledWith(req);
    });

    it('routes twilio/voice to sms/voice handler', async () => {
      mocks.smsVoiceHandler.mockResolvedValue(new Response('<Response><Say>Hello</Say></Response>', { status: 200 }));
      const req = new Request('http://localhost:3010/api/twilio/voice', { method: 'POST' });
      const res = await twilioVoiceRoute(req);
      expect(res.status).toBe(200);
      expect(mocks.smsVoiceHandler).toHaveBeenCalledWith(req);
    });

    it('routes twilio/status to sms/status handler', async () => {
      mocks.smsStatusHandler.mockResolvedValue(new Response('OK', { status: 200 }));
      const req = new Request('http://localhost:3010/api/twilio/status', { method: 'POST' });
      const res = await twilioStatusRoute(req);
      expect(res.status).toBe(200);
      expect(mocks.smsStatusHandler).toHaveBeenCalledWith(req);
    });
  });
});
