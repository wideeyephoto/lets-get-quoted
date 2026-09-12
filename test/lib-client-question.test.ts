import { describe, it, expect, vi, beforeEach } from 'vitest';
import { askQuoteQuestion } from '@/lib/client-question';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/change-order-client', () => ({
  resolveJobAccess: vi.fn(),
}));

vi.mock('@/lib/job-feed', () => ({
  createJobFeedEvent: vi.fn(),
}));

vi.mock('@/lib/email', () => ({
  getAccountOwnerEmail: vi.fn().mockResolvedValue('owner@test.com'),
  sendContractorAlertEmail: vi.fn(),
}));

vi.mock('@/lib/business-name', () => ({
  loadBusinessName: vi.fn().mockResolvedValue('Test Biz'),
}));

vi.mock('@/lib/sms', () => ({
  sendOwnerPortalMessageAlertSms: vi.fn(),
}));

describe('Client Question Lib', () => {
  let adminMock: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    adminMock = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockReturnThis(),
    };

    const createAdminClientMock = (await import('@/lib/auth')).createAdminClient;
    (createAdminClientMock as any).mockReturnValue(adminMock);
  });

  describe('askQuoteQuestion', () => {
    it('returns error if question empty', async () => {
      const res = await askQuoteQuestion('token', '   ');
      expect(res).toEqual({ ok: false, message: 'Type your question first.' });
    });

    it('returns error if invalid token', async () => {
      const resolveMock = (await import('@/lib/change-order-client')).resolveJobAccess;
      (resolveMock as any).mockResolvedValue(null);
      const res = await askQuoteQuestion('token', 'Hi');
      expect(res).toEqual({ ok: false, message: 'This link is no longer valid. Ask your contractor to resend it.' });
    });

    it('creates job feed event and sends notifications', async () => {
      const resolveMock = (await import('@/lib/change-order-client')).resolveJobAccess;
      (resolveMock as any).mockResolvedValue({ accountId: '1', jobId: '2' });

      let callCount = 0;
      adminMock.maybeSingle.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve({ data: { ref: '123', client_name: 'John' } }); // job
        if (callCount === 2) return Promise.resolve({ data: { business_name: 'Biz', alert_phone: '1234567890' } }); // account
      });

      const res = await askQuoteQuestion('token', 'What is this charge?');
      expect(res).toEqual({ ok: true });

      const createEventMock = (await import('@/lib/job-feed')).createJobFeedEvent;
      expect(createEventMock).toHaveBeenCalled();
      
      const sendEmailMock = (await import('@/lib/email')).sendContractorAlertEmail;
      expect(sendEmailMock).toHaveBeenCalled();

      const sendSmsMock = (await import('@/lib/sms')).sendOwnerPortalMessageAlertSms;
      expect(sendSmsMock).toHaveBeenCalled();
    });

    it('handles email and sms failures gracefully', async () => {
      const resolveMock = (await import('@/lib/change-order-client')).resolveJobAccess;
      (resolveMock as any).mockResolvedValue({ accountId: '1', jobId: '2' });

      adminMock.maybeSingle.mockResolvedValue({ data: { alert_phone: '1234567890' } });

      const sendEmailMock = (await import('@/lib/email')).sendContractorAlertEmail;
      (sendEmailMock as any).mockRejectedValue(new Error('email fail'));

      const sendSmsMock = (await import('@/lib/sms')).sendOwnerPortalMessageAlertSms;
      (sendSmsMock as any).mockRejectedValue(new Error('sms fail'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const res = await askQuoteQuestion('token', 'Test');
      expect(res).toEqual({ ok: true });
      expect(consoleSpy).toHaveBeenCalledTimes(2);

      consoleSpy.mockRestore();
    });
  });
});
