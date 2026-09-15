import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET, POST } from '@/app/api/cron/account-closure/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/account-closure-worker', () => ({
  runClosureWorkerBatch: vi.fn(),
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

describe('Account Closure Cron Route', () => {
  let createAdminClientMock: any;
  let runClosureWorkerBatchMock: any;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    vi.clearAllMocks();
    originalEnv = { ...process.env };
    process.env.CRON_SECRET = 'test_secret';

    createAdminClientMock = (await import('@/lib/auth')).createAdminClient;
    createAdminClientMock.mockReturnValue('fake_admin');

    runClosureWorkerBatchMock = (await import('@/lib/account-closure-worker')).runClosureWorkerBatch;
    runClosureWorkerBatchMock.mockResolvedValue({ processed: 2 });
  });
  
  afterEach(() => {
    process.env = originalEnv;
  });

  describe('GET', () => {
    it('fails if unauthorized', async () => {
      const req = new NextRequest('http://localhost/api/cron/account-closure');
      const res = await GET(req);
      expect(res.status).toBe(401);
    });

    it('runs cron if authorized and returns summary', async () => {
      const req = new NextRequest('http://localhost/api/cron/account-closure', {
        headers: { authorization: 'Bearer test_secret' }
      });
      const res = await GET(req);
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(createAdminClientMock).toHaveBeenCalled();
      expect(runClosureWorkerBatchMock).toHaveBeenCalledWith('fake_admin');
      expect(data.processed).toBe(2);
    });
  });

  describe('POST', () => {
    it('fails if unauthorized', async () => {
      const req = new NextRequest('http://localhost/api/cron/account-closure', { method: 'POST' });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it('runs batch if authorized', async () => {
      const req = new NextRequest('http://localhost/api/cron/account-closure', {
        method: 'POST',
        headers: { authorization: 'Bearer test_secret' }
      });
      const res = await POST(req);
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(createAdminClientMock).toHaveBeenCalled();
      expect(runClosureWorkerBatchMock).toHaveBeenCalledWith('fake_admin');
      expect(data.ok).toBe(true);
      expect(data.processed).toBe(2);
    });

    it('handles errors in POST', async () => {
      runClosureWorkerBatchMock.mockRejectedValue(new Error('Batch failed'));
      
      const req = new NextRequest('http://localhost/api/cron/account-closure', {
        method: 'POST',
        headers: { authorization: 'Bearer test_secret' }
      });
      const res = await POST(req);
      
      expect(res.status).toBe(500);
      const data = await res.json();
      
      expect(data.ok).toBe(false);
      expect(data.error).toBe('Batch failed');
    });
  });
});
