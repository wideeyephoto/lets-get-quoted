import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '@/app/api/cron/ad-wallet-refill/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/ad-billing', () => ({
  processAllWalletAutoRefills: vi.fn(),
}));

vi.mock('@/lib/ad-billing-shared', () => ({
  isManagedAdsCheckoutAllowed: vi.fn(),
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

describe('Ad Wallet Refill Cron Route', () => {
  let createAdminClientMock: any;
  let processAllWalletAutoRefillsMock: any;
  let isManagedAdsCheckoutAllowedMock: any;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    vi.clearAllMocks();
    originalEnv = { ...process.env };
    process.env.CRON_SECRET = 'test_secret';

    createAdminClientMock = (await import('@/lib/auth')).createAdminClient;
    createAdminClientMock.mockReturnValue('fake_admin');

    processAllWalletAutoRefillsMock = (await import('@/lib/ad-billing')).processAllWalletAutoRefills;
    processAllWalletAutoRefillsMock.mockResolvedValue({
      processed: 5,
      refilled: 3,
      pausedByKillSwitch: false,
    });

    isManagedAdsCheckoutAllowedMock = (await import('@/lib/ad-billing-shared')).isManagedAdsCheckoutAllowed;
    isManagedAdsCheckoutAllowedMock.mockReturnValue(true);
  });
  
  afterEach(() => {
    process.env = originalEnv;
  });

  it('fails if unauthorized', async () => {
    const req = new NextRequest('http://localhost/api/cron/ad-wallet-refill');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('skips processing if checkout is not allowed', async () => {
    isManagedAdsCheckoutAllowedMock.mockReturnValue(false);
    
    const req = new NextRequest('http://localhost/api/cron/ad-wallet-refill', {
      headers: { authorization: 'Bearer test_secret' }
    });
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    const data = await res.json();
    
    expect(processAllWalletAutoRefillsMock).not.toHaveBeenCalled();
    expect(data.processed).toBe(0);
    expect(data.refilled).toBe(0);
    expect(data.pausedByKillSwitch).toBe(true);
    expect(data.summary).toContain('Auto-refills paused');
  });

  it('runs cron if authorized and allowed', async () => {
    const req = new NextRequest('http://localhost/api/cron/ad-wallet-refill', {
      headers: { authorization: 'Bearer test_secret' }
    });
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    const data = await res.json();
    
    expect(createAdminClientMock).toHaveBeenCalled();
    expect(processAllWalletAutoRefillsMock).toHaveBeenCalledWith('fake_admin');
    
    expect(data.processed).toBe(5);
    expect(data.refilled).toBe(3);
    expect(data.pausedByKillSwitch).toBe(false);
    expect(data.summary).toBe('Processed 5 wallet accounts, refilled 3.');
  });
});
