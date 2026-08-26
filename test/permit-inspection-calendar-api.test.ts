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

vi.mock('@/lib/sms-delivery', () => ({
  enqueueSmsDelivery: vi.fn().mockResolvedValue({
    success: true,
    message: 'SMS queued successfully',
  }),
}));

import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getCurrentMembership, loadHeldCapabilities } from '@/lib/auth';
import { getJob } from '@/lib/jobs';
import { GET as calendarGet } from '../src/app/api/permits/inspections/calendar.ics/route';
import { POST as remindPost } from '../src/app/api/permits/inspections/[id]/remind/route';

describe('Permit Inspection Calendar & Reminder API Routes', () => {
  const mockAccountId = '22222222-2222-4222-a222-222222222222';
  const mockUserId = '33333333-3333-4333-a333-333333333333';
  const mockPermitId = '44444444-4444-4444-a444-444444444444';
  const mockJobId = '55555555-5555-5555-a555-555555555555';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/permits/inspections/calendar.ics', () => {
    it('returns an RFC 5545 iCalendar feed with 200 and text/calendar header', async () => {
      vi.mocked(createSupabaseServerClient).mockReturnValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: mockUserId } } }),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          not: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'case-1',
                permit_number: 'BLD-9912',
                authority_name: 'City of Royal Oak',
                scheduled_inspection_date: '2026-08-27',
                inspection_type: 'Rough Electrical',
                inspection_status: 'scheduled',
                notes: 'Gate code #1234',
              },
            ],
          }),
        }),
      } as any);

      vi.mocked(getCurrentMembership).mockResolvedValue({
        accountId: mockAccountId,
        role: 'owner',
      } as any);

      const req = new Request('http://localhost/api/permits/inspections/calendar.ics');
      const res = await calendarGet(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/calendar');
      const text = await res.text();
      expect(text).toContain('BEGIN:VCALENDAR');
      expect(text).toContain('BLD-9912');
    });
  });

  describe('POST /api/permits/inspections/:id/remind', () => {
    it('dispatches a 24-hour homeowner preparation SMS for an active permit inspection', async () => {
      vi.mocked(createSupabaseServerClient).mockReturnValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: mockUserId } } }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'permit_cases') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: mockPermitId,
                  account_id: mockAccountId,
                  job_id: mockJobId,
                  permit_number: 'ROOF-2026-114',
                  authority_name: 'City of Royal Oak',
                  inspection_type: 'Mid-Roof / Ice Barrier',
                  scheduled_inspection_date: '2026-08-27',
                },
              }),
            };
          }
          if (table === 'accounts' || table === 'sites') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { business_name: 'Apex Roofing & Solar LLC' },
              }),
            };
          }
          return {
            select: vi.fn().mockReturnThis(),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }),
      } as any);

      vi.mocked(getCurrentMembership).mockResolvedValue({
        accountId: mockAccountId,
        role: 'owner',
      } as any);

      vi.mocked(loadHeldCapabilities).mockResolvedValue(new Set(['jobs.write']));

      vi.mocked(getJob).mockResolvedValue({
        id: mockJobId,
        account_id: mockAccountId,
        client_name: 'David K.',
        client_phone: '(248) 555-7799',
        address: '1500 N Main St, Royal Oak, MI',
      } as any);

      const req = new Request(`http://localhost/api/permits/inspections/${mockPermitId}/remind`, {
        method: 'POST',
        body: JSON.stringify({
          timeWindow: '9:00 AM - 1:00 PM',
        }),
      });

      const res = await remindPost(req, { params: { id: mockPermitId } });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.message).toContain('Homeowner inspection prep reminder sent');
      expect(json.phone).toBe('+12485557799');
    });
  });
});
