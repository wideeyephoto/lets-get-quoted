import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({
  getCurrentMembership: vi.fn(),
  loadHeldCapabilities: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock('@/lib/jobs', () => ({
  getJob: vi.fn().mockResolvedValue({ id: '11111111-1111-1111-1111-111111111111', ref: 'JOB-101' }),
}));

vi.mock('@/lib/permit-intel', () => ({
  updatePermitCase: vi.fn(),
  syncPermitTasksToChecklist: vi.fn(),
  recordPermitFeeExpense: vi.fn(),
}));

import { getCurrentMembership, loadHeldCapabilities } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { recordPermitFeeExpense } from '@/lib/permit-intel';
import { POST } from '../src/app/api/jobs/[id]/permits/workflow/route';

describe('Permit Workflow API - Fee Markup Action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes markupAmount and addToInvoice flag to recordPermitFeeExpense', async () => {
    vi.mocked(createSupabaseServerClient).mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'usr-1', email: 'contractor@example.com' } } }) },
    } as any);

    vi.mocked(getCurrentMembership).mockResolvedValue({
      accountId: 'acc-1',
      role: 'owner',
    } as any);

    vi.mocked(loadHeldCapabilities).mockResolvedValue(new Set(['jobs.write']));

    vi.mocked(recordPermitFeeExpense).mockResolvedValueOnce({
      cost: { id: 'cost-1', amount: 150 } as any,
      invoiceItem: { id: 'inv-item-1', amount: 200 } as any,
      totalBilled: 200,
      markupAmount: 50,
    } as any);

    const req = new Request('http://localhost/api/jobs/11111111-1111-1111-1111-111111111111/permits/workflow', {
      method: 'POST',
      body: JSON.stringify({
        action: 'record_fee',
        feeAmount: 150,
        markupAmount: 50,
        addToInvoice: true,
        authorityName: 'City of Royal Oak',
      }),
    });

    const res = await POST(req, { params: { id: '11111111-1111-1111-1111-111111111111' } });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.totalBilled).toBe(200);

    expect(recordPermitFeeExpense).toHaveBeenCalledWith(
      expect.anything(),
      'acc-1',
      '11111111-1111-1111-1111-111111111111',
      expect.objectContaining({
        feeAmount: 150,
        markupAmount: 50,
        addToInvoice: true,
        authorityName: 'City of Royal Oak',
      }),
    );
  });
});
