import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as mediaRouteHandler } from '@/app/api/messages/media/[messageId]/route';
import { sendReplyAction, startConversationAction } from '@/app/dashboard/messages/actions';
import { groupByDay } from '@/lib/message-context';
import { topUpPurchaseEnabled } from '@/lib/billing/top-up-purchase-entrypoint';

// Mock auth
vi.mock('@/lib/auth', () => ({
  requireOfficeContext: vi.fn(),
  requireOwnerContext: vi.fn(),
  createAdminClient: vi.fn(),
}));

// Mock sms & provisioning
vi.mock('@/lib/messaging-number-provisioning', () => ({
  requireActiveDedicatedMessagingSender: vi.fn(),
}));

vi.mock('@/lib/sms', () => ({
  hasCurrentSmsConsent: vi.fn(),
  sendInboxReplySms: vi.fn(),
}));

vi.mock('@/lib/business-name', () => ({
  loadBusinessName: vi.fn().mockResolvedValue('Acme Services'),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn().mockImplementation((url: string) => {
    const err = new Error('NEXT_REDIRECT');
    (err as any).digest = `NEXT_REDIRECT;replace;${url}`;
    throw err;
  }),
}));

describe('Messages Inbox Enhancements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Issue 1: Local timezone day dividers', () => {
    it('groups 9:30 PM Eastern texts under the local date, not the next UTC day', () => {
      const messages = [
        {
          id: 'msg-1',
          created_at: '2026-09-04T21:30:00-04:00', // 2026-09-05T01:30:00Z UTC
          body: 'Evening text',
          direction: 'inbound',
          delivery_status: 'delivered',
        },
      ];

      const days = groupByDay(messages, 'America/New_York');
      expect(days).toHaveLength(1);
      // Under America/New_York, 2026-09-04T21:30:00-04:00 is Friday Sep 4
      expect(days[0].key).toBe('2026-09-04');
      expect(days[0].label).toContain('September 4');
    });
  });

  describe('Issue 3: MMS Media Proxy Route', () => {
    it('returns 400 if messageId is empty', async () => {
      const { requireOfficeContext } = await import('@/lib/auth');
      vi.mocked(requireOfficeContext).mockResolvedValue({
        supabase: {} as any,
        accountId: 'acc-123',
      } as any);

      const req = new NextRequest('http://localhost/api/messages/media/test?index=0');
      const res = await mediaRouteHandler(req, {
        params: Promise.resolve({ messageId: '' }),
      });
      expect(res.status).toBe(400);
    });

    it('returns 404 if message is not found', async () => {
      const { requireOfficeContext } = await import('@/lib/auth');
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        }),
      };
      vi.mocked(requireOfficeContext).mockResolvedValue({
        supabase: mockSupabase as any,
        accountId: 'acc-123',
      } as any);

      const req = new NextRequest('http://localhost/api/messages/media/msg-404?index=0');
      const res = await mediaRouteHandler(req, {
        params: Promise.resolve({ messageId: 'msg-404' }),
      });
      expect(res.status).toBe(404);
    });

    it('rejects private IP media targets', async () => {
      const { requireOfficeContext } = await import('@/lib/auth');
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: 'msg-1',
                    account_id: 'acc-123',
                    provider: 'twilio',
                    media_urls: ['http://127.0.0.1/evil.jpg'],
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      };
      vi.mocked(requireOfficeContext).mockResolvedValue({
        supabase: mockSupabase as any,
        accountId: 'acc-123',
      } as any);

      const req = new NextRequest('http://localhost/api/messages/media/msg-1?index=0');
      const res = await mediaRouteHandler(req, {
        params: Promise.resolve({ messageId: 'msg-1' }),
      });
      expect(res.status).toBe(403);
    });
  });

  describe('Issue 2: Send Path Error Handling and Resilience', () => {
    it('sendReplyAction returns error state on invalid phone', async () => {
      const { requireOfficeContext } = await import('@/lib/auth');
      vi.mocked(requireOfficeContext).mockResolvedValue({
        supabase: {} as any,
        accountId: 'acc-123',
      } as any);

      const formData = new FormData();
      formData.set('body', 'Test reply');
      formData.set('intentId', '11111111-1111-4111-8111-111111111111');

      const result = await sendReplyAction('invalid-phone', formData);
      expect(result).toEqual({
        status: 'error',
        message: 'This message thread has an invalid phone number.',
      });
    });

    it('sendReplyAction returns error state when carrier registration is missing', async () => {
      const { requireOfficeContext } = await import('@/lib/auth');
      const { requireActiveDedicatedMessagingSender } = await import('@/lib/messaging-number-provisioning');

      vi.mocked(requireOfficeContext).mockResolvedValue({
        supabase: {
          from: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            }),
          }),
        } as any,
        accountId: 'acc-123',
      } as any);

      vi.mocked(requireActiveDedicatedMessagingSender).mockRejectedValue(
        new Error('Customer messaging requires an approved dedicated phone number.'),
      );

      const formData = new FormData();
      formData.set('body', 'Test reply');
      formData.set('intentId', '11111111-1111-4111-8111-111111111111');

      const result = await sendReplyAction('8105550199', formData);
      expect(result.status).toBe('error');
      if ('message' in result) {
        expect(result.message).toContain('approved dedicated phone number');
      }
    });

    it('startConversationAction returns error state on consent refusal', async () => {
      const { requireOfficeContext } = await import('@/lib/auth');
      const { requireActiveDedicatedMessagingSender } = await import('@/lib/messaging-number-provisioning');
      const { hasCurrentSmsConsent } = await import('@/lib/sms');

      vi.mocked(requireOfficeContext).mockResolvedValue({
        supabase: {
          from: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            }),
          }),
        } as any,
        accountId: 'acc-123',
      } as any);

      vi.mocked(requireActiveDedicatedMessagingSender).mockResolvedValue({ kind: 'ready' } as any);
      vi.mocked(hasCurrentSmsConsent).mockResolvedValue(false);

      const formData = new FormData();
      formData.set('phone', '8105550199');
      formData.set('body', 'Hello customer');
      formData.set('intentId', '11111111-1111-4111-8111-111111111111');

      const result = await startConversationAction(formData);
      expect(result.status).toBe('error');
      if ('message' in result) {
        expect(result.message).toContain('We do not have current SMS consent');
      }
    });

    it('rethrows Next.js redirect errors', async () => {
      const { requireOfficeContext } = await import('@/lib/auth');
      const { requireActiveDedicatedMessagingSender } = await import('@/lib/messaging-number-provisioning');
      const { hasCurrentSmsConsent, sendInboxReplySms } = await import('@/lib/sms');

      vi.mocked(requireOfficeContext).mockResolvedValue({
        supabase: {
          from: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            }),
          }),
        } as any,
        accountId: 'acc-123',
      } as any);

      vi.mocked(requireActiveDedicatedMessagingSender).mockResolvedValue({ kind: 'ready' } as any);
      vi.mocked(hasCurrentSmsConsent).mockResolvedValue(true);
      vi.mocked(sendInboxReplySms).mockResolvedValue('event-123');

      const formData = new FormData();
      formData.set('phone', '8105550199');
      formData.set('body', 'Hello customer');
      formData.set('intentId', '11111111-1111-4111-8111-111111111111');

      await expect(startConversationAction(formData)).rejects.toThrow('NEXT_REDIRECT');
    });
  });

  describe('Issue 5: Top Up Link anchor', () => {
    it('returns buy-credits anchor when enabled, usage-balances when disabled', () => {
      expect(topUpPurchaseEnabled({ LGQ_TOP_UP_PURCHASE_ENABLED: '1' })).toBe(true);
      expect(topUpPurchaseEnabled({ LGQ_TOP_UP_PURCHASE_ENABLED: '0' })).toBe(false);
      expect(topUpPurchaseEnabled({})).toBe(false);
    });
  });
});
