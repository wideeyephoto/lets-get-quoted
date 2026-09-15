import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '@/app/api/cron/ad-spend-sync/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/ad-billing', () => ({
  processAllAdSpendSync: vi.fn(),
  processUpcomingPaymentSmsAlerts: vi.fn(),
}));

vi.mock('@/lib/google-ads-conversion-outbox', () => ({
  retryPendingOfflineConversions: vi.fn(),
}));

vi.mock('@/lib/meta-capi-outbox', () => ({
  retryPendingMetaCapiConversions: vi.fn(),
}));

vi.mock('@/lib/cron-runs', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    cronRoute: (job: string, run: () => Promise<unknown>) => {
      return async function GET(request: Request) {
        const secret = process.env.CRON_SECRET;
        const auth = request.headers.get('authorization');
        if (!secret || auth !== `Bearer ${secret}`) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
        }
        const summary = await run();
        return new Response(JSON.stringify(summary), { status: 200 });
      };
    }
  };
});

describe('Ad Spend Sync Cron Route', () => {
  let createAdminClientMock: any;
  let processAllAdSpendSyncMock: any;
  let processUpcomingPaymentSmsAlertsMock: any;
  let retryPendingOfflineConversionsMock: any;
  let retryPendingMetaCapiConversionsMock: any;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    vi.clearAllMocks();
    originalEnv = { ...process.env };
    process.env.CRON_SECRET = 'test_secret';

    createAdminClientMock = (await import('@/lib/auth')).createAdminClient;
    createAdminClientMock.mockReturnValue('fake_admin');

    processAllAdSpendSyncMock = (await import('@/lib/ad-billing')).processAllAdSpendSync;
    processAllAdSpendSyncMock.mockResolvedValue({
      processed: 5,
      succeeded: 4,
      failed: 1,
      failures: [{ error: 'test error' }],
      totalSpendSyncedCents: 15000,
    });

    processUpcomingPaymentSmsAlertsMock = (await import('@/lib/ad-billing')).processUpcomingPaymentSmsAlerts;
    processUpcomingPaymentSmsAlertsMock.mockResolvedValue({ alertsSent: 2 });

    retryPendingOfflineConversionsMock = (await import('@/lib/google-ads-conversion-outbox')).retryPendingOfflineConversions;
    retryPendingOfflineConversionsMock.mockResolvedValue({ processed: 3, succeeded: 3 });

    retryPendingMetaCapiConversionsMock = (await import('@/lib/meta-capi-outbox')).retryPendingMetaCapiConversions;
    retryPendingMetaCapiConversionsMock.mockResolvedValue({ processed: 1, succeeded: 0 });
  });
  
  afterEach(() => {
    process.env = originalEnv;
  });

  it('fails if unauthorized', async () => {
    const req = new NextRequest('http://localhost/api/cron/ad-spend-sync');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('runs cron if authorized and returns summary', async () => {
    const req = new NextRequest('http://localhost/api/cron/ad-spend-sync', {
      headers: { authorization: 'Bearer test_secret' }
    });
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    const data = await res.json();
    
    expect(createAdminClientMock).toHaveBeenCalled();
    expect(processAllAdSpendSyncMock).toHaveBeenCalledWith('fake_admin');
    expect(processUpcomingPaymentSmsAlertsMock).toHaveBeenCalledWith('fake_admin');
    expect(retryPendingOfflineConversionsMock).toHaveBeenCalledWith('fake_admin');
    expect(retryPendingMetaCapiConversionsMock).toHaveBeenCalledWith('fake_admin');
    
    expect(data.processed).toBe(5);
    expect(data.failed).toBe(1);
    expect(data.totalSpendSyncedDollars).toBe('150.00');
    expect(data.upcomingPaymentAlertsSent).toBe(2);
    expect(data.offlineConversionsRetried).toBe(3);
    expect(data.metaConversionsSucceeded).toBe(0);
  });
});
