import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '@/app/api/cron/storage-usage-sweep/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/billing/billing-worker-cron', () => ({
  workspaceStorageUsageSweepWorkerEnabled: vi.fn(),
  runWorkspaceStorageUsageSweepCron: vi.fn(),
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

describe('Storage Usage Sweep Cron Route', () => {
  let workspaceStorageUsageSweepWorkerEnabledMock: any;
  let runWorkspaceStorageUsageSweepCronMock: any;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    vi.clearAllMocks();
    originalEnv = { ...process.env };
    process.env.CRON_SECRET = 'test_secret';

    workspaceStorageUsageSweepWorkerEnabledMock = (await import('@/lib/billing/billing-worker-cron')).workspaceStorageUsageSweepWorkerEnabled;
    workspaceStorageUsageSweepWorkerEnabledMock.mockReturnValue(true);

    runWorkspaceStorageUsageSweepCronMock = (await import('@/lib/billing/billing-worker-cron')).runWorkspaceStorageUsageSweepCron;
    runWorkspaceStorageUsageSweepCronMock.mockResolvedValue({ swept: 12 });
  });
  
  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns 404 if worker is disabled', async () => {
    workspaceStorageUsageSweepWorkerEnabledMock.mockReturnValue(false);
    
    const req = new NextRequest('http://localhost/api/cron/storage-usage-sweep');
    const res = await GET(req);
    
    expect(res.status).toBe(404);
  });

  it('fails if unauthorized and worker is enabled', async () => {
    const req = new NextRequest('http://localhost/api/cron/storage-usage-sweep');
    const res = await GET(req);
    
    expect(res.status).toBe(401);
  });

  it('runs cron if authorized and worker is enabled', async () => {
    const req = new NextRequest('http://localhost/api/cron/storage-usage-sweep', {
      headers: { authorization: 'Bearer test_secret' }
    });
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    const data = await res.json();
    
    expect(runWorkspaceStorageUsageSweepCronMock).toHaveBeenCalled();
    expect(data.swept).toBe(12);
  });
});
