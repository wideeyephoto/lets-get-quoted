import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '@/app/api/cron/voice-receipt-recovery/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/voice/receipt-recovery', () => ({
  runVoiceReceiptRecovery: vi.fn(),
}));

vi.mock('@/lib/voice/operational-health', () => ({
  recordVoiceOperationalHealth: vi.fn(),
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

describe('Voice Receipt Recovery Cron Route', () => {
  let runVoiceReceiptRecoveryMock: any;
  let recordVoiceOperationalHealthMock: any;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    vi.clearAllMocks();
    originalEnv = { ...process.env };
    process.env.CRON_SECRET = 'test_secret';

    runVoiceReceiptRecoveryMock = (await import('@/lib/voice/receipt-recovery')).runVoiceReceiptRecovery;
    runVoiceReceiptRecoveryMock.mockResolvedValue({ recovered: 3, failed: 1 });

    recordVoiceOperationalHealthMock = (await import('@/lib/voice/operational-health')).recordVoiceOperationalHealth;
    recordVoiceOperationalHealthMock.mockResolvedValue({ recorded: true, failed: 2 });
  });
  
  afterEach(() => {
    process.env = originalEnv;
  });

  it('fails if unauthorized', async () => {
    const req = new NextRequest('http://localhost/api/cron/voice-receipt-recovery');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('runs cron if authorized and returns summary', async () => {
    const req = new NextRequest('http://localhost/api/cron/voice-receipt-recovery', {
      headers: { authorization: 'Bearer test_secret' }
    });
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    const data = await res.json();
    
    expect(runVoiceReceiptRecoveryMock).toHaveBeenCalled();
    expect(recordVoiceOperationalHealthMock).toHaveBeenCalled();
    
    expect(data.recovered).toBe(3);
    expect(data.health.recorded).toBe(true);
    expect(data.failed).toBe(3); // 1 + 2
  });
});
