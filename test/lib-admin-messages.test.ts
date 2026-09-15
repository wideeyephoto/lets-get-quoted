import { describe, it, expect, vi, beforeEach } from 'vitest';
import { messageFailed, listAccountMessages, messageKindLabel } from '@/lib/admin-messages';

describe('Admin Messages Lib', () => {
  let adminMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    adminMock = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
    };
  });

  describe('messageFailed', () => {
    it('handles email', () => {
      expect(messageFailed({ channel: 'email', status: 'bounced' } as any)).toBe(true);
      expect(messageFailed({ channel: 'email', status: 'delivered' } as any)).toBe(false);
    });

    it('handles sms', () => {
      expect(messageFailed({ channel: 'sms', status: 'failed' } as any)).toBe(true);
      expect(messageFailed({ channel: 'sms', status: 'delivered' } as any)).toBe(false);
    });
  });

  describe('listAccountMessages', () => {
    it('handles errors', async () => {
      adminMock.limit.mockResolvedValue({ data: null, error: new Error('fail') });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const res = await listAccountMessages(adminMock, 'acct_1');
      expect(res).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledTimes(2);
      consoleSpy.mockRestore();
    });

    it('merges and sorts messages', async () => {
      let callCount = 0;
      adminMock.limit.mockImplementation(() => {
        callCount++;
        if (callCount === 1) { // email
          return Promise.resolve({
            data: [{ id: '1', kind: 'invoice', recipient: 'a@a.com', status: 'delivered', error_reason: null, occurred_at: '2023-01-02' }]
          });
        }
        if (callCount === 2) { // sms
          return Promise.resolve({
            data: [{ id: '2', event_type: 'payment_requested', phone_number: '123', status: 'failed', error_reason: 'bad', body: 'hi', created_at: '2023-01-01', sent_at: '2023-01-03' }]
          });
        }
      });

      const res = await listAccountMessages(adminMock, 'acct_1');
      expect(res.length).toBe(2);
      expect(res[0].id).toBe('sms:2');
      expect(res[0].occurredAt).toBe('2023-01-03');
      expect(res[1].id).toBe('email:1');
    });
  });

  describe('messageKindLabel', () => {
    it('returns known label', () => {
      expect(messageKindLabel('invoice')).toBe('Invoice');
    });

    it('formats unknown label', () => {
      expect(messageKindLabel('some_random_event')).toBe('some random event');
    });
  });
});
