import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '@/app/api/cron/addon-refunds/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/billing/addon-refund-worker', () => ({
  runAddonRefundBatch: vi.fn(),
}));

vi.mock('@/lib/billing/addon-refunds', () => ({
  ADDON_REFUND_FLAG: 'FEATURE_ADDON_REFUND',
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

describe('Addon Refunds Cron Route', () => {
  let runAddonRefundBatchMock: any;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    vi.clearAllMocks();
    originalEnv = { ...process.env };
    process.env.CRON_SECRET = 'test_secret';
    process.env.FEATURE_ADDON_REFUND = '1';

    runAddonRefundBatchMock = (await import('@/lib/billing/addon-refund-worker')).runAddonRefundBatch;
    runAddonRefundBatchMock.mockResolvedValue({ refunded: 5 });
  });
  
  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns 404 if flag is disabled', async () => {
    process.env.FEATURE_ADDON_REFUND = '0';
    
    const req = new NextRequest('http://localhost/api/cron/addon-refunds');
    const res = await GET(req);
    
    expect(res.status).toBe(404);
  });

  it('fails if unauthorized and flag is enabled', async () => {
    const req = new NextRequest('http://localhost/api/cron/addon-refunds');
    const res = await GET(req);
    
    expect(res.status).toBe(401);
  });

  it('runs cron if authorized and flag is enabled', async () => {
    const req = new NextRequest('http://localhost/api/cron/addon-refunds', {
      headers: { authorization: 'Bearer test_secret' }
    });
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    const data = await res.json();
    
    expect(runAddonRefundBatchMock).toHaveBeenCalled();
    expect(data.refunded).toBe(5);
  });
});
