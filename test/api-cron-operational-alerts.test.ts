import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '@/app/api/cron/operational-alerts/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/operational-monitor.mjs', () => ({
  runOperationalMonitor: vi.fn(),
  sendMonitorFailure: vi.fn(),
}));

vi.mock('../../../../../vercel.json', () => ({
  default: {
    crons: [{ path: '/api/cron/test', schedule: '0 0 * * *' }]
  }
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
        try {
          const summary = await run();
          return new Response(JSON.stringify(summary), { status: 200 });
        } catch (error: any) {
          return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }
      };
    }
  };
});

describe('Operational Alerts Cron Route', () => {
  let createAdminClientMock: any;
  let runOperationalMonitorMock: any;
  let sendMonitorFailureMock: any;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    vi.clearAllMocks();
    originalEnv = { ...process.env };
    process.env.CRON_SECRET = 'test_secret';

    createAdminClientMock = (await import('@/lib/supabase-admin')).createAdminClient;
    createAdminClientMock.mockReturnValue('fake_admin');

    runOperationalMonitorMock = (await import('@/lib/operational-monitor.mjs')).runOperationalMonitor;
    runOperationalMonitorMock.mockResolvedValue({ failed: false, checks: 5 });

    sendMonitorFailureMock = (await import('@/lib/operational-monitor.mjs')).sendMonitorFailure;
    sendMonitorFailureMock.mockResolvedValue();
  });
  
  afterEach(() => {
    process.env = originalEnv;
  });

  it('fails if unauthorized', async () => {
    const req = new NextRequest('http://localhost/api/cron/operational-alerts');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('runs monitor successfully', async () => {
    const req = new NextRequest('http://localhost/api/cron/operational-alerts', {
      headers: { authorization: 'Bearer test_secret' }
    });
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    const data = await res.json();
    
    expect(createAdminClientMock).toHaveBeenCalled();
    expect(runOperationalMonitorMock).toHaveBeenCalledWith({
      admin: 'fake_admin',
      crons: expect.any(Array)
    });
    expect(sendMonitorFailureMock).not.toHaveBeenCalled();
    expect(data.failed).toBe(false);
  });

  it('sends monitor failure if monitor results in failure', async () => {
    runOperationalMonitorMock.mockResolvedValue({ failed: true, checks: 5 });
    
    const req = new NextRequest('http://localhost/api/cron/operational-alerts', {
      headers: { authorization: 'Bearer test_secret' }
    });
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    expect(sendMonitorFailureMock).toHaveBeenCalled();
  });

  it('handles thrown errors and sends failure', async () => {
    runOperationalMonitorMock.mockRejectedValue(new Error('Total failure'));
    
    const req = new NextRequest('http://localhost/api/cron/operational-alerts', {
      headers: { authorization: 'Bearer test_secret' }
    });
    const res = await GET(req);
    
    expect(res.status).toBe(500);
    expect(sendMonitorFailureMock).toHaveBeenCalled();
  });

  it('swallows sendMonitorFailure errors in catch block', async () => {
    runOperationalMonitorMock.mockRejectedValue(new Error('Total failure'));
    sendMonitorFailureMock.mockRejectedValue(new Error('Slack down'));
    
    const req = new NextRequest('http://localhost/api/cron/operational-alerts', {
      headers: { authorization: 'Bearer test_secret' }
    });
    const res = await GET(req);
    
    expect(res.status).toBe(500);
  });
});
