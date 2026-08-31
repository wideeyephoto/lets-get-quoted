import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({
  getCurrentMembership: vi.fn(),
  loadHeldCapabilities: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock('@/lib/permit-intel', () => ({
  sendPermitMilestoneNotification: vi.fn(),
}));

import { getCurrentMembership, loadHeldCapabilities } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { sendPermitMilestoneNotification } from '@/lib/permit-intel';
import { POST } from '../src/app/api/jobs/[id]/permits/notify/route';

describe('Permit Notification API Route - POST /api/jobs/:id/permits/notify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated requests with 401', async () => {
    vi.mocked(createSupabaseServerClient).mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as any);

    const req = new Request('http://localhost/api/jobs/22222222-2222-2222-2222-222222222222/permits/notify', {
      method: 'POST',
      body: JSON.stringify({ eventType: 'submitted' }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: '22222222-2222-2222-2222-222222222222' }) });
    expect(res.status).toBe(401);
  });

  it('dispatches notification for authorized workspace owner/office', async () => {
    vi.mocked(createSupabaseServerClient).mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'usr-1' } } }) },
    } as any);

    vi.mocked(getCurrentMembership).mockResolvedValue({
      accountId: 'acc-1',
      role: 'owner',
    } as any);

    vi.mocked(loadHeldCapabilities).mockResolvedValue(new Set(['jobs.write']));

    vi.mocked(sendPermitMilestoneNotification).mockResolvedValueOnce({
      success: true,
      message: 'Homeowner notification dispatched successfully.',
      phone: '+12485550144',
      eventId: 'sms-1',
    });

    const req = new Request('http://localhost/api/jobs/22222222-2222-2222-2222-222222222222/permits/notify', {
      method: 'POST',
      body: JSON.stringify({
        eventType: 'issued',
        authorityName: 'City of Royal Oak',
        permitNumber: '2026-RO-8492',
      }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: '22222222-2222-2222-2222-222222222222' }) });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.phone).toBe('+12485550144');
    expect(sendPermitMilestoneNotification).toHaveBeenCalledWith(
      expect.anything(),
      'acc-1',
      '22222222-2222-2222-2222-222222222222',
      expect.objectContaining({ eventType: 'issued' }),
    );
  });
});
