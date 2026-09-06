import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  enqueueMetaCapiConversion,
  processMetaCapiConversionItem,
  triggerWonLeadMetaCapiConversion,
  retryPendingMetaCapiConversions,
} from '@/lib/meta-capi-outbox';
import { uploadMetaCapiEvents } from '@/lib/ad-closed-loop-sync';

describe('Meta CAPI Transport (uploadMetaCapiEvents)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    delete process.env.VERCEL_ENV;
    (process.env as Record<string, string | undefined>).NODE_ENV = 'test';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns simulated status in non-production environments when keys are missing', async () => {
    delete process.env.META_ACCESS_TOKEN;
    delete process.env.META_PIXEL_ID;

    const res = await uploadMetaCapiEvents({
      events: [
        {
          event_name: 'Purchase',
          event_time: 1725540000,
          event_id: 'purchase_123',
          action_source: 'website',
          user_data: { em: ['mock_hash'] },
          custom_data: { value: 1200, currency: 'USD', order_id: '123' },
        },
      ],
    });

    expect(res.success).toBe(true);
    expect(res.status).toBe('simulated');
    expect(res.eventsReceived).toBe(1);
    expect(res.fbtraceId).toBeTruthy();
  });

  it('fails closed in production environment when pixel or token is missing', async () => {
    process.env.VERCEL_ENV = 'production';
    delete process.env.META_ACCESS_TOKEN;
    delete process.env.META_PIXEL_ID;

    const res = await uploadMetaCapiEvents({
      events: [
        {
          event_name: 'Purchase',
          event_time: 1725540000,
          event_id: 'purchase_123',
          action_source: 'website',
          user_data: { em: ['mock_hash'] },
          custom_data: { value: 1200, currency: 'USD', order_id: '123' },
        },
      ],
    });

    expect(res.success).toBe(false);
    expect(res.status).toBe('unconfigured');
  });

  it('successfully uploads events when configured and returns fbtrace_id', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(
        JSON.stringify({
          events_received: 1,
          fbtrace_id: 'fb_trace_abc123',
        }),
        { status: 200 }
      );
    });

    const res = await uploadMetaCapiEvents({
      events: [
        {
          event_name: 'Purchase',
          event_time: 1725540000,
          event_id: 'purchase_123',
          action_source: 'website',
          user_data: { em: ['mock_hash'] },
          custom_data: { value: 1200, currency: 'USD', order_id: '123' },
        },
      ],
      pixelId: '1234567890',
      accessToken: 'EAAB_token',
    });

    expect(res.success).toBe(true);
    expect(res.status).toBe('uploaded');
    expect(res.eventsReceived).toBe(1);
    expect(res.fbtraceId).toBe('fb_trace_abc123');
  });
});

describe('Meta CAPI Durable Outbox & Database Lifecycle', () => {
  it('skips leads with neither fbclid nor customer contact data', async () => {
    const mockAdmin: any = {
      from: vi.fn(),
    };

    const lead: any = {
      id: 'lead_no_match',
      account_id: 'acc_1',
      triage: {},
    };

    const res = await triggerWonLeadMetaCapiConversion(mockAdmin, 'acc_1', lead, 800);
    expect(res.triggered).toBe(false);
    expect(res.status).toBe('skipped');
    expect(mockAdmin.from).not.toHaveBeenCalled();
  });

  it('skips leads that have already been uploaded (idempotency guard)', async () => {
    const mockAdmin: any = {
      from: vi.fn(),
    };

    const lead: any = {
      id: 'lead_already_uploaded',
      account_id: 'acc_1',
      email: 'client@example.com',
      triage: {
        metaOfflineConversion: {
          status: 'uploaded',
          uploadedAt: '2026-09-01T12:00:00Z',
        },
      },
    };

    const res = await triggerWonLeadMetaCapiConversion(mockAdmin, 'acc_1', lead, 1200);
    expect(res.triggered).toBe(false);
    expect(res.status).toBe('uploaded');
    expect(mockAdmin.from).not.toHaveBeenCalled();
  });

  it('persists pending status and then uploaded status upon successful dispatch', async () => {
    let persistedTriage: any = null;

    const mockAdmin: any = {
      from: (table: string) => ({
        update: (payload: any) => {
          persistedTriage = payload.triage;
          return {
            eq: async () => ({ error: null }),
          };
        },
      }),
    };

    const lead: any = {
      id: 'lead_fb_won',
      account_id: 'acc_1',
      email: 'homeowner@gmail.com',
      phone: '5865551234',
      service: 'Roofing',
      triage: {
        attribution: {
          fbclid: 'fb_click_test_123',
        },
      },
    };

    const res = await triggerWonLeadMetaCapiConversion(mockAdmin, 'acc_1', lead, 5500);
    expect(res.triggered).toBe(true);
    expect(res.status).toBe('uploaded');
    expect(persistedTriage).toBeTruthy();
    expect(persistedTriage.metaOfflineConversion.status).toBe('uploaded');
    expect(persistedTriage.metaOfflineConversion.fbclid).toBe('fb_click_test_123');
  });

  it('retries pending offline conversions across leads via cron worker', async () => {
    const mockLeads: any[] = [
      {
        id: 'lead_retry_1',
        account_id: 'acc_1',
        email: 'retry1@example.com',
        triage: {
          metaOfflineConversion: {
            status: 'pending',
            attempts: 1,
          },
        },
      },
      {
        id: 'lead_retry_2',
        account_id: 'acc_1',
        email: 'retry2@example.com',
        triage: {
          metaOfflineConversion: {
            status: 'pending',
            attempts: 1,
          },
        },
      },
    ];

    const mockAdmin: any = {
      from: (table: string) => ({
        select: () => ({
          eq: (field1: string, val1: string) => ({
            eq: (field2: string, val2: string) => ({
              limit: async () => ({ data: mockLeads, error: null }),
            }),
          }),
        }),
        update: () => ({
          eq: async () => ({ error: null }),
        }),
      }),
    };

    const summary = await retryPendingMetaCapiConversions(mockAdmin, 10);
    expect(summary.processed).toBe(2);
    expect(summary.succeeded).toBe(2);
    expect(summary.failed).toBe(0);
  });
});
