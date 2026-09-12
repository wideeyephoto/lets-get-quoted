import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET, POST } from '@/app/api/cron/purge-expired/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/purge-worker', () => ({
  runPurgeWorker: vi.fn(),
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

describe('Purge Expired Cron Route', () => {
  let runPurgeWorkerMock: any;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    vi.clearAllMocks();
    originalEnv = { ...process.env };
    process.env.CRON_SECRET = 'test_secret';

    runPurgeWorkerMock = (await import('@/lib/purge-worker')).runPurgeWorker;
    runPurgeWorkerMock.mockResolvedValue({ purged: 10 });
  });
  
  afterEach(() => {
    process.env = originalEnv;
  });

  describe('GET', () => {
    it('fails if unauthorized', async () => {
      const req = new NextRequest('http://localhost/api/cron/purge-expired');
      const res = await GET(req);
      expect(res.status).toBe(401);
    });

    it('runs cron if authorized', async () => {
      const req = new NextRequest('http://localhost/api/cron/purge-expired', {
        headers: { authorization: 'Bearer test_secret' }
      });
      const res = await GET(req);
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(runPurgeWorkerMock).toHaveBeenCalled();
      expect(data.purged).toBe(10);
    });
  });

  describe('POST', () => {
    it('fails if unauthorized', async () => {
      const req = new NextRequest('http://localhost/api/cron/purge-expired', { method: 'POST' });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it('runs worker if authorized', async () => {
      const req = new NextRequest('http://localhost/api/cron/purge-expired', {
        method: 'POST',
        headers: { authorization: 'Bearer test_secret' }
      });
      const res = await POST(req);
      
      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(runPurgeWorkerMock).toHaveBeenCalled();
      expect(data.ok).toBe(true);
      expect(data.purged).toBe(10);
    });

    it('handles worker errors gracefully', async () => {
      runPurgeWorkerMock.mockRejectedValue(new Error('Purge failed'));
      
      const req = new NextRequest('http://localhost/api/cron/purge-expired', {
        method: 'POST',
        headers: { authorization: 'Bearer test_secret' }
      });
      const res = await POST(req);
      
      expect(res.status).toBe(500);
      const data = await res.json();
      
      expect(data.ok).toBe(false);
      expect(data.error).toBe('Purge failed');
    });
  });
});
