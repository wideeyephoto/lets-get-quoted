import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '@/app/api/cron/smart-dunning/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/ai-operator/smart-dunning', () => ({
  runSmartDunningSweep: vi.fn(),
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

describe('Smart Dunning Cron Route', () => {
  let createAdminClientMock: any;
  let runSmartDunningSweepMock: any;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    vi.clearAllMocks();
    originalEnv = { ...process.env };
    process.env.CRON_SECRET = 'test_secret';

    createAdminClientMock = (await import('@/lib/auth')).createAdminClient;
    createAdminClientMock.mockReturnValue('fake_admin');

    runSmartDunningSweepMock = (await import('@/lib/ai-operator/smart-dunning')).runSmartDunningSweep;
    runSmartDunningSweepMock.mockResolvedValue({
      totalDunningAccounts: 5,
      retriesOptimized: 2,
      gracePeriodsApplied: 1,
      cardUpdateLinksDispatched: 2,
      errors: []
    });
  });
  
  afterEach(() => {
    process.env = originalEnv;
  });

  it('fails if unauthorized', async () => {
    const req = new NextRequest('http://localhost/api/cron/smart-dunning');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('runs cron if authorized and returns summary', async () => {
    const req = new NextRequest('http://localhost/api/cron/smart-dunning', {
      headers: { authorization: 'Bearer test_secret' }
    });
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    const data = await res.json();
    
    expect(createAdminClientMock).toHaveBeenCalled();
    expect(runSmartDunningSweepMock).toHaveBeenCalledWith('fake_admin');
    
    expect(data.ok).toBe(true);
    expect(data.totalDunning).toBe(5);
    expect(data.retriesOptimized).toBe(2);
    expect(data.gracePeriodsApplied).toBe(1);
    expect(data.cardUpdateLinksDispatched).toBe(2);
    expect(data.errors).toBe(0);
    expect(data.errorSamples).toEqual([]);
  });

  it('returns false ok when there are errors', async () => {
    runSmartDunningSweepMock.mockResolvedValue({
      totalDunningAccounts: 1,
      retriesOptimized: 0,
      gracePeriodsApplied: 0,
      cardUpdateLinksDispatched: 0,
      errors: [new Error('Failed sweep 1'), new Error('Failed sweep 2')]
    });

    const req = new NextRequest('http://localhost/api/cron/smart-dunning', {
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
