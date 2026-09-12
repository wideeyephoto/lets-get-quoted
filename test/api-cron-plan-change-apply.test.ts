import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '@/app/api/cron/plan-change-apply/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/billing/plan-change-worker', () => ({
  applyDuePlanChanges: vi.fn(),
  PLAN_CHANGE_APPLY_BATCH_SIZE: 50,
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

describe('Plan Change Apply Cron Route', () => {
  let createAdminClientMock: any;
  let applyDuePlanChangesMock: any;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    vi.clearAllMocks();
    originalEnv = { ...process.env };
    process.env.CRON_SECRET = 'test_secret';

    createAdminClientMock = (await import('@/lib/auth')).createAdminClient;
    createAdminClientMock.mockReturnValue('fake_admin');

    applyDuePlanChangesMock = (await import('@/lib/billing/plan-change-worker')).applyDuePlanChanges;
    applyDuePlanChangesMock.mockResolvedValue({ applied: 5 });
  });
  
  afterEach(() => {
    process.env = originalEnv;
  });

  it('fails if unauthorized', async () => {
    const req = new NextRequest('http://localhost/api/cron/plan-change-apply');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('runs cron if authorized and returns summary', async () => {
    const req = new NextRequest('http://localhost/api/cron/plan-change-apply', {
      headers: { authorization: 'Bearer test_secret' }
    });
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    const data = await res.json();
    
    expect(createAdminClientMock).toHaveBeenCalled();
    expect(applyDuePlanChangesMock).toHaveBeenCalledWith({
      admin: 'fake_admin',
      limit: 50
    });
    
    expect(data.applied).toBe(5);
  });
});
