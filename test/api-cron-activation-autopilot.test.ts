import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '@/app/api/cron/activation-autopilot/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/ai-operator/activation-nudge', () => ({
  runActivationAutopilotSweep: vi.fn(),
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

describe('Activation Autopilot Cron Route', () => {
  let createAdminClientMock: any;
  let runActivationAutopilotSweepMock: any;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    vi.clearAllMocks();
    originalEnv = { ...process.env };
    process.env.CRON_SECRET = 'test_secret';

    createAdminClientMock = (await import('@/lib/auth')).createAdminClient;
    createAdminClientMock.mockReturnValue('fake_admin');

    runActivationAutopilotSweepMock = (await import('@/lib/ai-operator/activation-nudge')).runActivationAutopilotSweep;
    runActivationAutopilotSweepMock.mockResolvedValue({
      accountsScanned: 5,
      welcomeNudgesSent: 1,
      stripeRemindersSent: 2,
      phoneSetupNudgesSent: 0,
      skippedQuietHours: 1,
      errors: []
    });
  });
  
  afterEach(() => {
    process.env = originalEnv;
  });

  it('fails if unauthorized', async () => {
    const req = new NextRequest('http://localhost/api/cron/activation-autopilot');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('runs cron if authorized and returns summary', async () => {
    const req = new NextRequest('http://localhost/api/cron/activation-autopilot', {
      headers: { authorization: 'Bearer test_secret' }
    });
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    const data = await res.json();
    
    expect(createAdminClientMock).toHaveBeenCalled();
    expect(runActivationAutopilotSweepMock).toHaveBeenCalledWith('fake_admin');
    
    expect(data.ok).toBe(true);
    expect(data.scanned).toBe(5);
    expect(data.welcomeNudges).toBe(1);
    expect(data.stripeReminders).toBe(2);
    expect(data.phoneSetupNudges).toBe(0);
    expect(data.skippedQuietHours).toBe(1);
    expect(data.errors).toBe(0);
    expect(data.errorSamples).toEqual([]);
  });

  it('returns false ok when there are errors', async () => {
    runActivationAutopilotSweepMock.mockResolvedValue({
      accountsScanned: 1,
      welcomeNudgesSent: 0,
      stripeRemindersSent: 0,
      phoneSetupNudgesSent: 0,
      skippedQuietHours: 0,
      errors: [new Error('Failed sweep 1'), new Error('Failed sweep 2')]
    });

    const req = new NextRequest('http://localhost/api/cron/activation-autopilot', {
      headers: { authorization: 'Bearer test_secret' }
    });
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    const data = await res.json();
    
    expect(data.ok).toBe(false);
    expect(data.errors).toBe(2);
    expect(data.errorSamples).toHaveLength(2); // Since Error objects don't serialize easily to JSON in tests, we just check length
  });
});
