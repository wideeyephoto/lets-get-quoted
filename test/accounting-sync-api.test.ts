import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getCurrentMembership: vi.fn(),
  loadHeldCapabilities: vi.fn(),
}));

vi.mock('@/lib/jobs', () => ({
  getJob: vi.fn(),
}));

import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getCurrentMembership, loadHeldCapabilities } from '@/lib/auth';
import { getJob } from '@/lib/jobs';
import { POST } from '../src/app/api/accounting/sync/route';

describe('Accounting Sync API Route - POST /api/accounting/sync', () => {
  const mockAccountId = '22222222-2222-4222-a222-222222222222';
  const mockUserId = '33333333-3333-4333-a333-333333333333';
  const mockJobId = '11111111-1111-4111-a111-111111111111';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('syncs job revenue and permit fee expenses into financial ledger', async () => {
    vi.mocked(createSupabaseServerClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: mockUserId } } }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: [
            {
              authority_name: 'City of Royal Oak',
              permit_number: 'ROOF-2026-99',
              total_fee: 145,
            },
          ],
        }),
      }),
    } as any);

    vi.mocked(getCurrentMembership).mockResolvedValue({
      accountId: mockAccountId,
      role: 'owner',
    } as any);

    vi.mocked(loadHeldCapabilities).mockResolvedValue(new Set(['jobs.read']));

    vi.mocked(getJob).mockResolvedValue({
      id: mockJobId,
      account_id: mockAccountId,
      ref: 'JOB-9941',
      client_name: 'David Miller',
      client_email: 'david@example.com',
      address: '211 S Williams St, Royal Oak, MI',
      quoted_amount: 12500,
      status: 'in_progress',
    } as any);

    const req = new Request('http://localhost/api/accounting/sync', {
      method: 'POST',
      body: JSON.stringify({
        jobId: mockJobId,
        platform: 'quickbooks_online',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.ledger).toBeDefined();
    expect(json.ledger.revenue.quotedTotal).toBe(12500);
    expect(json.ledger.expenses.permitFeesTotal).toBe(145);
    expect(json.ledger.profitability.grossProfit).toBe(12500 - 145);
  });
});
