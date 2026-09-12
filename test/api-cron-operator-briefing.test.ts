import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '@/app/api/cron/operator-briefing/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/ai-operator/engine', () => ({
  runAutonomousOperatorCycle: vi.fn(),
}));

vi.mock('@/lib/ai-operator/audit', () => ({
  flushOperatorWrites: vi.fn(),
}));

vi.mock('@/lib/ai-operator/digest', () => ({
  dispatchExecutiveBriefingDigest: vi.fn(),
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

describe('Operator Briefing Cron Route', () => {
  let createAdminClientMock: any;
  let runAutonomousOperatorCycleMock: any;
  let flushOperatorWritesMock: any;
  let dispatchExecutiveBriefingDigestMock: any;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    vi.clearAllMocks();
    originalEnv = { ...process.env };
    process.env.CRON_SECRET = 'test_secret';

    createAdminClientMock = (await import('@/lib/auth')).createAdminClient;
    createAdminClientMock.mockReturnValue('fake_admin');

    runAutonomousOperatorCycleMock = (await import('@/lib/ai-operator/engine')).runAutonomousOperatorCycle;
    runAutonomousOperatorCycleMock.mockResolvedValue({
      cycleId: 'cycle_1',
      timestamp: '2023-01-01T00:00:00Z',
      briefing: {
        revenue: { mrrEstimated: 1000 },
        contractors: { totalActive: 5 }
      },
      auditActionsLogged: 2,
      safeActionsExecuted: 2,
      onboardingNudgeCandidates: 1
    });

    flushOperatorWritesMock = (await import('@/lib/ai-operator/audit')).flushOperatorWrites;
    flushOperatorWritesMock.mockResolvedValue();

    dispatchExecutiveBriefingDigestMock = (await import('@/lib/ai-operator/digest')).dispatchExecutiveBriefingDigest;
    dispatchExecutiveBriefingDigestMock.mockResolvedValue({
      success: true,
      deliveredVia: 'email'
    });
  });
  
  afterEach(() => {
    process.env = originalEnv;
  });

  it('fails if unauthorized', async () => {
    const req = new NextRequest('http://localhost/api/cron/operator-briefing');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('runs cron if authorized and returns summary', async () => {
    const req = new NextRequest('http://localhost/api/cron/operator-briefing', {
      headers: { authorization: 'Bearer test_secret' }
    });
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    const data = await res.json();
    
    expect(createAdminClientMock).toHaveBeenCalled();
    expect(runAutonomousOperatorCycleMock).toHaveBeenCalledWith('fake_admin', { adminUserId: 'cron-operator-7am' });
    expect(dispatchExecutiveBriefingDigestMock).toHaveBeenCalledWith({
      revenue: { mrrEstimated: 1000 },
      contractors: { totalActive: 5 }
    });
    expect(flushOperatorWritesMock).toHaveBeenCalled();
    
    expect(data.cycleId).toBe('cycle_1');
    expect(data.timestamp).toBe('2023-01-01T00:00:00Z');
    expect(data.mrrEstimated).toBe(1000);
    expect(data.totalContractors).toBe(5);
    expect(data.auditActionsLogged).toBe(2);
    expect(data.safeActionsExecuted).toBe(2);
    expect(data.onboardingNudgeCandidates).toBe(1);
    expect(data.digestDelivered).toBe(true);
    expect(data.deliveredVia).toBe('email');
  });
});
