import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '@/app/api/cron/arrival-confirm/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/arrival-sweep', () => ({
  runMorningConfirmationSweep: vi.fn(),
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

describe('Arrival Confirm Cron Route', () => {
  let runMorningConfirmationSweepMock: any;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    vi.clearAllMocks();
    originalEnv = { ...process.env };
    process.env.CRON_SECRET = 'test_secret';

    runMorningConfirmationSweepMock = (await import('@/lib/arrival-sweep')).runMorningConfirmationSweep;
    runMorningConfirmationSweepMock.mockResolvedValue({ confirmed: 8 });
  });
  
  afterEach(() => {
    process.env = originalEnv;
  });

  it('fails if unauthorized', async () => {
    const req = new NextRequest('http://localhost/api/cron/arrival-confirm');
    const res = await GET(req);
    
    expect(res.status).toBe(401);
  });

  it('runs cron if authorized and returns summary', async () => {
    const req = new NextRequest('http://localhost/api/cron/arrival-confirm', {
      headers: { authorization: 'Bearer test_secret' }
    });
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    const data = await res.json();
    
    expect(runMorningConfirmationSweepMock).toHaveBeenCalled();
    expect(data.confirmed).toBe(8);
  });
});
