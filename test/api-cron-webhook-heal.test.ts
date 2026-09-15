import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '@/app/api/cron/webhook-heal/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/ai-operator/webhook-healer', () => ({
  runWebhookAutoHealer: vi.fn(),
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

describe('Webhook Heal Cron Route', () => {
  let createAdminClientMock: any;
  let runWebhookAutoHealerMock: any;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    vi.clearAllMocks();
    originalEnv = { ...process.env };
    process.env.CRON_SECRET = 'test_secret';

    createAdminClientMock = (await import('@/lib/auth')).createAdminClient;
    createAdminClientMock.mockReturnValue('fake_admin');

    runWebhookAutoHealerMock = (await import('@/lib/ai-operator/webhook-healer')).runWebhookAutoHealer;
    runWebhookAutoHealerMock.mockResolvedValue({
      totalUnresolved: 6,
      replayedCount: 2,
      autoResolvedCount: 3,
      escalatedToHitlCount: 1,
      errors: []
    });
  });
  
  afterEach(() => {
    process.env = originalEnv;
  });

  it('fails if unauthorized', async () => {
    const req = new NextRequest('http://localhost/api/cron/webhook-heal');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('runs cron if authorized and returns summary', async () => {
    const req = new NextRequest('http://localhost/api/cron/webhook-heal', {
      headers: { authorization: 'Bearer test_secret' }
    });
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    const data = await res.json();
    
    expect(createAdminClientMock).toHaveBeenCalled();
    expect(runWebhookAutoHealerMock).toHaveBeenCalledWith('fake_admin');
    
    expect(data.ok).toBe(true);
    expect(data.totalUnresolved).toBe(6);
    expect(data.replayed).toBe(2);
    expect(data.autoResolved).toBe(3);
    expect(data.escalatedToHitl).toBe(1);
    expect(data.errors).toBe(0);
    expect(data.errorSamples).toEqual([]);
  });

  it('returns false ok when there are errors', async () => {
    runWebhookAutoHealerMock.mockResolvedValue({
      totalUnresolved: 2,
      replayedCount: 0,
      autoResolvedCount: 0,
      escalatedToHitlCount: 0,
      errors: [new Error('Heal failed')]
    });

    const req = new NextRequest('http://localhost/api/cron/webhook-heal', {
      headers: { authorization: 'Bearer test_secret' }
    });
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    const data = await res.json();
    
    expect(data.ok).toBe(false);
    expect(data.errors).toBe(1);
    expect(data.errorSamples).toHaveLength(1);
  });
});
