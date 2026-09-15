import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '@/app/api/health/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/apm-telemetry', () => ({
  recordRequestMetric: vi.fn(),
  getApmSummary: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(),
  clientIpFrom: vi.fn(),
}));

describe('Health API Route', () => {
  let createAdminClientMock: any;
  let recordRequestMetricMock: any;
  let getApmSummaryMock: any;
  let checkRateLimitMock: any;
  let clientIpFromMock: any;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['performance', 'Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(new Date('2026-09-12T12:00:00.000Z'));
    originalEnv = { ...process.env };
    
    // Default mock setup
    createAdminClientMock = (await import('@/lib/auth')).createAdminClient;
    createAdminClientMock.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ error: null })
        })
      })
    });

    recordRequestMetricMock = (await import('@/lib/apm-telemetry')).recordRequestMetric;
    getApmSummaryMock = (await import('@/lib/apm-telemetry')).getApmSummary;
    getApmSummaryMock.mockReturnValue({
      latencyPercentiles: { p95Ms: 42 },
      errorRatePct: 0.1,
    });

    checkRateLimitMock = (await import('@/lib/rate-limit')).checkRateLimit;
    checkRateLimitMock.mockResolvedValue(true);

    clientIpFromMock = (await import('@/lib/rate-limit')).clientIpFrom;
    clientIpFromMock.mockReturnValue('1.2.3.4');
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = originalEnv;
  });

  const createRequest = (authHeader?: string, cronSecret?: string) => {
    const headers = new Headers();
    if (authHeader) headers.set('authorization', authHeader);
    if (cronSecret) headers.set('x-cron-secret', cronSecret);
    return new NextRequest('http://localhost/api/health', { headers });
  };

  it('returns operational status for authenticated diagnostic caller', async () => {
    process.env.CRON_SECRET = 'secret123';
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.TWILIO_ACCOUNT_SID = 'AC123';
    process.env.TWILIO_AUTH_TOKEN = 'token123';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost';

    const req = createRequest('Bearer secret123');
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    expect(res.headers.get('x-lgq-uptime-status')).toBe('operational');
    expect(res.headers.get('x-lgq-apm-p95')).toBe('42ms');
    
    const data = await res.json();
    expect(data.status).toBe('operational');
    expect(data.timestamp).toBe('2026-09-12T12:00:00.000Z');
    expect(data.apm.p95Ms).toBe(42);
    expect(data.apm.errorRatePct).toBe(0.1);
    
    expect(data.services).toEqual([
      expect.objectContaining({ id: 'quoting-engine', status: 'operational' }),
      expect.objectContaining({ id: 'sms-gateway', status: 'operational', detail: 'SignalWire / 10DLC Carrier Network operational' }),
      expect.objectContaining({ id: 'stripe-payments', status: 'operational', detail: 'Stripe Connect API V2 operational' }),
      expect.objectContaining({ id: 'contractor-cdn', status: 'operational', detail: 'Global Anycast Edge Network operational' }),
    ]);

    expect(checkRateLimitMock).not.toHaveBeenCalled();
    expect(recordRequestMetricMock).toHaveBeenCalledWith(expect.objectContaining({
      path: '/api/health',
      statusCode: 200,
    }));
  });

  it('masks details for unauthenticated callers', async () => {
    process.env.CRON_SECRET = 'secret123';
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.TWILIO_ACCOUNT_SID = 'AC123';
    process.env.TWILIO_AUTH_TOKEN = 'token123';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost';

    const req = createRequest(); // Unauthenticated
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    expect(res.headers.has('x-lgq-apm-p95')).toBe(false);
    
    const data = await res.json();
    expect(data.apm.p95Ms).toBeUndefined();
    expect(data.apm.errorRatePct).toBeUndefined();
    
    expect(data.services[1].detail).toBe('Operational'); // SMS gateway
    
    expect(checkRateLimitMock).toHaveBeenCalledWith(expect.any(Object), 'health:ip:1.2.3.4', 120, 60);
  });

  it('returns 429 if unauthenticated and rate limited', async () => {
    checkRateLimitMock.mockResolvedValue(false);
    const req = createRequest();
    const res = await GET(req);
    
    expect(res.status).toBe(429);
  });

  it('returns degraded if DB is slow', async () => {
    process.env.CRON_SECRET = 'secret123';
    
    // Mock DB probe to be slow
    createAdminClientMock.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => new Promise((resolve) => {
            // Wait 1600ms (more than 1500 limit)
            setTimeout(() => resolve({ error: null }), 1600);
            vi.advanceTimersByTime(1600); // Advance timers to trigger it
          }))
        })
      })
    });

    const req = createRequest('Bearer secret123');
    const res = await GET(req);
    
    expect(res.status).toBe(200); // Still 200 for degraded
    expect(res.headers.get('x-lgq-uptime-status')).toBe('degraded');
    
    const data = await res.json();
    expect(data.status).toBe('degraded');
    expect(data.services[0].status).toBe('degraded');
    expect(data.services[0].detail).toContain('High database latency');
  });

  it('returns outage if DB query fails', async () => {
    process.env.CRON_SECRET = 'secret123';
    
    createAdminClientMock.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ error: { message: 'DB down' } })
        })
      })
    });

    const req = createRequest('Bearer secret123');
    const res = await GET(req);
    
    expect(res.status).toBe(503);
    expect(res.headers.get('x-lgq-uptime-status')).toBe('outage');
    
    const data = await res.json();
    expect(data.status).toBe('outage');
    expect(data.services[0].status).toBe('outage');
  });

  it('reports missing configs as degraded', async () => {
    process.env.CRON_SECRET = 'secret123';
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.SIGNALWIRE_PROJECT_ID;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_ROOT_DOMAIN;

    const req = createRequest('Bearer secret123');
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('degraded');
    
    expect(data.services[1].status).toBe('degraded'); // sms
    expect(data.services[2].status).toBe('degraded'); // stripe
    expect(data.services[3].status).toBe('degraded'); // cdn
  });
});
