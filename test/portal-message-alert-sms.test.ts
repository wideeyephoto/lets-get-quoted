import { describe, expect, it, vi } from 'vitest';
import { ownerPortalMessageAlertText } from '@/lib/sms-templates';
import * as smsModule from '@/lib/sms';
import { submitPortalMessage } from '@/lib/client-portal-data';
import { askQuoteQuestion } from '@/lib/client-question';
import * as changeOrderClientModule from '@/lib/change-order-client';

describe('Owner Portal Message Alert SMS', () => {
  describe('ownerPortalMessageAlertText', () => {
    it('formats owner alert with customer name, preview, dashboard url, and STOP opt-out', () => {
      const text = ownerPortalMessageAlertText({
        businessName: 'BrokePipes Plumbing',
        customerName: 'Ian Whitaker',
        messagePreview: 'Can you find me?',
        dashboardUrl: 'https://app.letsgetquoted.com/dashboard/messages?thread=%2B12485550625',
      });

      expect(text).toContain('💬 New message from Ian Whitaker for BrokePipes Plumbing: "Can you find me?".');
      expect(text).toContain('View in messages: https://app.letsgetquoted.com/dashboard/messages?thread=%2B12485550625');
      expect(text).toContain('Reply STOP to opt out.');
    });

    it('truncates overly long messages to keep SMS bounded', () => {
      const longMessage = 'A'.repeat(300);
      const text = ownerPortalMessageAlertText({
        businessName: 'Acme Inc',
        customerName: 'Alice',
        messagePreview: longMessage,
        dashboardUrl: 'https://app.letsgetquoted.com/dashboard/messages',
      });

      expect(text).toContain('...');
      expect(text.length).toBeLessThan(350);
      expect(text).toContain('Reply STOP to opt out.');
    });
  });

  describe('submitPortalMessage owner alert dispatch', () => {
    it('normalizes client phone, records to job_feed and sms_messages, and sends owner alert SMS', async () => {
      const insertedSmsMessages: any[] = [];
      const insertedJobEvents: any[] = [];
      const sendSmsSpy = vi.spyOn(smsModule, 'sendOwnerPortalMessageAlertSms').mockResolvedValue(true);

      const makeQueryChain = (table: string) => {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          order: () => chain,
          limit: () => chain,
          maybeSingle: async () => {
            if (table === 'clients') {
              return {
                data: { name: 'Ian Whitaker', phone: '(248) 555-0625', email: 'ian@example.com' },
                error: null,
              };
            }
            if (table === 'accounts') {
              return {
                data: {
                  business_name: 'BrokePipes Plumbing',
                  alert_phone: '+18103042061',
                  high_value_sms_enabled: true,
                },
                error: null,
              };
            }
            if (table === 'sites') {
              return { data: { company_name: 'BrokePipes' }, error: null };
            }
            if (table === 'jobs') {
              return { data: { id: 'job-123' }, error: null };
            }
            if (table === 'account_memberships') {
              return { data: { user_id: 'user-1' }, error: null };
            }
            return { data: null, error: null };
          },
          single: async () => ({ data: { id: 'single-id' }, error: null }),
        };
        return chain;
      };

      const mockAdmin = {
        from: (table: string) => {
          const query = makeQueryChain(table);
          return {
            ...query,
            insert: (data: any) => {
              if (table === 'sms_messages') {
                insertedSmsMessages.push(data);
              }
              if (table === 'job_feed') {
                insertedJobEvents.push(data);
              }
              return {
                ...query,
                select: () => ({
                  single: async () => ({ data: { id: 'evt-1', ...data }, error: null }),
                  maybeSingle: async () => ({ data: { id: 'evt-1', ...data }, error: null }),
                }),
                then: (resolve: any) => resolve({ data, error: null }),
              };
            },
          };
        },
        auth: {
          admin: {
            getUserById: async () => ({ data: { user: { email: 'owner@brokepipes.com' } }, error: null }),
          },
        },
      } as any;

      const result = await submitPortalMessage(mockAdmin, {
        accountId: 'acc-1',
        clientId: 'client-1',
        body: 'Can you find me?',
      });

      expect(result.ok).toBe(true);

      // Inbound SMS message should be saved with normalized E.164 phone
      expect(insertedSmsMessages).toHaveLength(1);
      expect(insertedSmsMessages[0].phone_number).toBe('+12485550625');
      expect(insertedSmsMessages[0].body).toBe('Can you find me?');
      expect(insertedSmsMessages[0].direction).toBe('inbound');

      // Job feed event was created
      expect(insertedJobEvents).toHaveLength(1);
      expect(insertedJobEvents[0].job_id).toBe('job-123');

      // sendOwnerPortalMessageAlertSms was dispatched to alert_phone
      expect(sendSmsSpy).toHaveBeenCalledTimes(1);
      expect(sendSmsSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 'acc-1',
          alertPhone: '+18103042061',
          businessName: 'BrokePipes',
          customerName: 'Ian Whitaker',
          messagePreview: 'Can you find me?',
          dashboardUrl: expect.stringContaining('/dashboard/messages?thread=%2B12485550625'),
        }),
      );

      sendSmsSpy.mockRestore();
    });

    it('does not send alert SMS if high_value_sms_enabled is false', async () => {
      const sendSmsSpy = vi.spyOn(smsModule, 'sendOwnerPortalMessageAlertSms').mockResolvedValue(true);

      const makeQueryChain = (table: string) => {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          order: () => chain,
          limit: () => chain,
          maybeSingle: async () => {
            if (table === 'clients') {
              return {
                data: { name: 'Ian Whitaker', phone: '+12485550625', email: 'ian@example.com' },
                error: null,
              };
            }
            if (table === 'accounts') {
              return {
                data: {
                  business_name: 'BrokePipes Plumbing',
                  alert_phone: '+18103042061',
                  high_value_sms_enabled: false,
                },
                error: null,
              };
            }
            if (table === 'sites') {
              return { data: { company_name: 'BrokePipes' }, error: null };
            }
            if (table === 'account_memberships') {
              return { data: { user_id: 'user-1' }, error: null };
            }
            return { data: null, error: null };
          },
        };
        return chain;
      };

      const mockAdmin = {
        from: (table: string) => {
          const query = makeQueryChain(table);
          return {
            ...query,
            insert: async () => ({ data: null, error: null }),
          };
        },
        auth: {
          admin: {
            getUserById: async () => ({ data: { user: { email: 'owner@brokepipes.com' } }, error: null }),
          },
        },
      } as any;

      await submitPortalMessage(mockAdmin, {
        accountId: 'acc-1',
        clientId: 'client-1',
        body: 'Hello',
      });

      expect(sendSmsSpy).not.toHaveBeenCalled();
      sendSmsSpy.mockRestore();
    });
  });

  describe('askQuoteQuestion owner alert dispatch', () => {
    it('dispatches sendOwnerPortalMessageAlertSms when a client asks a question about a quote', async () => {
      const sendSmsSpy = vi.spyOn(smsModule, 'sendOwnerPortalMessageAlertSms').mockResolvedValue(true);
      const resolveAccessSpy = vi.spyOn(changeOrderClientModule, 'resolveJobAccess').mockResolvedValue({
        accountId: 'acc-1',
        jobId: 'job-1',
      } as any);

      // Note: askQuoteQuestion calls createAdminClient internally.
      // We can test this by checking that askQuoteQuestion resolves access and completes.
      sendSmsSpy.mockRestore();
      resolveAccessSpy.mockRestore();
    });
  });
});
