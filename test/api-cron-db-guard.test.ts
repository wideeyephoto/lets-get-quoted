import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '@/app/api/cron/db-guard/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/ai-operator/db-guard', () => ({
  runDatabasePoolGuard: vi.fn(),
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

describe('DB Guard Cron Route', () => {
  let createAdminClientMock: any;
  let runDatabasePoolGuardMock: any;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    vi.clearAllMocks();
    originalEnv = { ...process.env };
    process.env.CRON_SECRET = 'test_secret';

    createAdminClientMock = (await import('@/lib/auth')).createAdminClient;
    createAdminClientMock.mockReturnValue('fake_admin');

    runDatabasePoolGuardMock = (await import('@/lib/ai-operator/db-guard')).runDatabasePoolGuard;
    runDatabasePoolGuardMock.mockResolvedValue({
      longRunningQueriesCount: 2,
      canceledQueriesCount: 1,
      status: 'healthy',
      errors: []
    });
  });
  
  afterEach(() => {
    process.env = originalEnv;
  });

  it('fails if unauthorized', async () => {
    const req = new NextRequest('http://localhost/api/cron/db-guard');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('runs cron if authorized and returns summary', async () => {
    const req = new NextRequest('http://localhost/api/cron/db-guard', {
      headers: { authorization: 'Bearer test_secret' }
    });
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    const data = await res.json();
    
    expect(createAdminClientMock).toHaveBeenCalled();
    expect(runDatabasePoolGuardMock).toHaveBeenCalledWith('fake_admin');
    
    expect(data.ok).toBe(true);
    expect(data.longRunningQueries).toBe(2);
    expect(data.canceledQueries).toBe(1);
    expect(data.status).toBe('healthy');
    expect(data.errors).toBe(0);
    expect(data.errorSamples).toEqual([]);
  });

  it('returns false ok when there are errors', async () => {
    runDatabasePoolGuardMock.mockResolvedValue({
      longRunningQueriesCount: 0,
      canceledQueriesCount: 0,
      status: 'degraded',
      errors: [new Error('Failed sweep 1'), new Error('Failed sweep 2')]
    });

    const req = new NextRequest('http://localhost/api/cron/db-guard', {
      headers: { authorization: 'Bearer test_secret' }
    });
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    const data = await res.json();
    
    expect(data.ok).toBe(false);
    expect(data.errors).toBe(2);
    expect(data.errorSamples).toHaveLength(2);
  });
});
