import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/lib/jobs', () => ({
  getJob: vi.fn(),
}));

vi.mock('../src/lib/sms-delivery', () => ({
  enqueueSmsDelivery: vi.fn().mockResolvedValue({
    eventId: 'sms-evt-1',
    state: 'queued',
    created: true,
  }),
}));

import { getJob } from '../src/lib/jobs';
import { enqueueSmsDelivery } from '../src/lib/sms-delivery';
import {
  formatPermitMilestoneMessage,
  sendPermitMilestoneNotification,
} from '../src/lib/permit-intel/permit-notifications';

describe('Permit Milestone Notifications Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('formatPermitMilestoneMessage', () => {
    it('formats submitted message correctly', () => {
      const msg = formatPermitMilestoneMessage({
        eventType: 'submitted',
        clientName: 'Jane Smith',
        businessName: 'Apex Roofing',
        authorityName: 'City of Royal Oak',
      });
      expect(msg).toContain('Hi Jane, Apex Roofing has submitted the municipal permit application');
      expect(msg).toContain('City of Royal Oak');
    });

    it('formats issued message with permit number', () => {
      const msg = formatPermitMilestoneMessage({
        eventType: 'issued',
        clientName: 'Bob Builder',
        businessName: 'Apex Roofing',
        authorityName: 'City of Royal Oak',
        permitNumber: '2026-RO-9988',
      });
      expect(msg).toContain('Great news Bob!');
      expect(msg).toContain('permit #2026-RO-9988');
    });

    it('formats inspection passed message', () => {
      const msg = formatPermitMilestoneMessage({
        eventType: 'inspection_passed',
        clientName: 'Alice Johnson',
        businessName: 'Apex Roofing',
        authorityName: 'Detroit BSEED',
        inspectionType: 'Final Building',
      });
      expect(msg).toContain('officially passed the Detroit BSEED Final Building inspection! ✅');
    });
  });

  describe('sendPermitMilestoneNotification', () => {
    const mockInsert = vi.fn().mockResolvedValue({ data: null, error: null });
    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'job_feed') {
          return { insert: mockInsert };
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { business_name: 'Apex Roofing', company_name: 'Apex Roofing' },
                error: null,
              }),
            }),
          }),
        };
      }),
    } as any;

    it('enqueues SMS and records feed event when client phone is present', async () => {
      vi.mocked(getJob).mockResolvedValueOnce({
        id: 'job-1',
        account_id: 'acc-1',
        client_name: 'Jane Smith',
        client_phone: '(248) 555-0144',
        address: '211 S Williams St, Royal Oak, MI',
      } as any);

      const result = await sendPermitMilestoneNotification(
        mockSupabase,
        'acc-1',
        'job-1',
        {
          eventType: 'issued',
          authorityName: 'City of Royal Oak',
          permitNumber: '2026-RO-9988',
        },
      );

      expect(result.success).toBe(true);
      expect(result.phone).toBe('+12485550144');
      expect(result.eventId).toBe('sms-evt-1');

      expect(enqueueSmsDelivery).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 'acc-1',
          phoneNumber: '+12485550144',
          billingCategory: 'customer_message',
          context: 'customer',
        }),
      );

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          account_id: 'acc-1',
          job_id: 'job-1',
          kind: 'permit_notification_sent',
        }),
      );
    });

    it('gracefully skips SMS and logs internal feed notice when phone is missing', async () => {
      vi.mocked(getJob).mockResolvedValueOnce({
        id: 'job-1',
        account_id: 'acc-1',
        client_name: 'Jane Smith',
        client_phone: null,
        address: '211 S Williams St, Royal Oak, MI',
      } as any);

      const result = await sendPermitMilestoneNotification(
        mockSupabase,
        'acc-1',
        'job-1',
        {
          eventType: 'submitted',
          authorityName: 'City of Royal Oak',
        },
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('missing_phone');
      expect(enqueueSmsDelivery).not.toHaveBeenCalled();
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'permit_notification_skipped',
        }),
      );
    });
  });
});
