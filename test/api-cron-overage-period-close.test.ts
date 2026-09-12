import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '@/app/api/cron/overage-period-close/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/billing/overage-settlement-worker', () => ({
  overagePeriodCloseWorkerEnabled: vi.fn(),
  runOveragePeriodCloseBatch: vi.fn(),
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

describe('Overage Period Close Cron Route', () => {
  let overagePeriodCloseWorkerEnabledMock: any;
  let runOveragePeriodCloseBatchMock: any;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    vi.clearAllMocks();
    originalEnv = { ...process.env };
    process.env.CRON_SECRET = 'test_secret';

    overagePeriodCloseWorkerEnabledMock = (await import('@/lib/billing/overage-settlement-worker')).overagePeriodCloseWorkerEnabled;
    overagePeriodCloseWorkerEnabledMock.mockReturnValue(true);

    runOveragePeriodCloseBatchMock = (await import('@/lib/billing/overage-settlement-worker')).runOveragePeriodCloseBatch;
    runOveragePeriodCloseBatchMock.mockResolvedValue({ closed: 3 });
  });
  
  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns 404 if worker is disabled', async () => {
    overagePeriodCloseWorkerEnabledMock.mockReturnValue(false);
    
    const req = new NextRequest('http://localhost/api/cron/overage-period-close');
    const res = await GET(req);
    
    expect(res.status).toBe(404);
  });

  it('fails if unauthorized and worker is enabled', async () => {
    const req = new NextRequest('http://localhost/api/cron/overage-period-close');
    const res = await GET(req);
    
    expect(res.status).toBe(401);
  });

  it('runs cron if authorized and worker is enabled', async () => {
    const req = new NextRequest('http://localhost/api/cron/overage-period-close', {
      headers: { authorization: 'Bearer test_secret' }
    });
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    const data = await res.json();
    
    expect(runOveragePeriodCloseBatchMock).toHaveBeenCalled();
    expect(data.closed).toBe(3);
  });
});
