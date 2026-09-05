import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  makeUnsubscribeToken,
  parseUnsubscribeToken,
  buildUnsubscribePageUrl,
  buildUnsubscribeOneClickUrl,
  loadSuppressedEmails,
  isEmailSuppressed,
} from '@/lib/email-suppression';
import {
  sendCampaignEmail,
  sendRebookInviteEmail,
  sendReviewRequestEmail,
  renderCampaignEmailHtml,
} from '@/lib/email';
import {
  renderPlatformCampaignEmailHtml,
  resolvePlatformCampaignRecipients,
} from '@/lib/admin-platform-campaigns';
import {
  renderContractorLifecycleEmailHtml,
  CONTRACTOR_LIFECYCLE_STEPS,
  runContractorLifecycleSweep,
} from '@/lib/contractor-lifecycle-emails';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('CAN-SPAM & Email Compliance Invariants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Unsubscribe Token Cryptography & Verification', () => {
    it('generates tamper-resistant signed unsubscribe tokens', () => {
      const accountId = 'acc_12345';
      const email = 'homeowner@example.com';
      const token = makeUnsubscribeToken(accountId, email);

      expect(token).toBeTypeOf('string');
      expect(token.includes('.')).toBe(true);

      const parsed = parseUnsubscribeToken(token);
      expect(parsed).toEqual({ accountId, email });
    });

    it('rejects tampered or forged unsubscribe tokens', () => {
      const accountId = 'acc_12345';
      const email = 'homeowner@example.com';
      const token = makeUnsubscribeToken(accountId, email);

      const [payload, sig] = token.split('.');
      // Tamper with signature
      const tamperedSig = sig.slice(0, -2) + (sig.slice(-2) === 'aa' ? 'bb' : 'aa');
      expect(parseUnsubscribeToken(`${payload}.${tamperedSig}`)).toBeNull();

      // Tamper with payload
      const tamperedPayload = Buffer.from('acc_99999:attacker@example.com').toString('base64url');
      expect(parseUnsubscribeToken(`${tamperedPayload}.${sig}`)).toBeNull();

      expect(parseUnsubscribeToken('')).toBeNull();
      expect(parseUnsubscribeToken('invalid-string-no-dot')).toBeNull();
    });

    it('builds RFC 8058 one-click and human-readable unsubscribe URLs', () => {
      const accountId = 'acc_abc';
      const email = 'client@example.com';
      const pageUrl = buildUnsubscribePageUrl(accountId, email);
      const oneClickUrl = buildUnsubscribeOneClickUrl(accountId, email);

      expect(pageUrl).toContain('/unsubscribe?token=');
      expect(oneClickUrl).toContain('/api/email/unsubscribe?token=');
    });
  });

  describe('Physical Postal Address in Email Renderers', () => {
    it('renders valid physical postal address in platform campaign emails', () => {
      const html = renderPlatformCampaignEmailHtml({
        theme: 'studio',
        heading: 'Important Update',
        body: 'Hello {{first_name}}, this is a platform update.',
        subject: 'Platform Update',
      }, {
        name: 'Alex',
        businessName: 'Apex Roofing',
      });

      expect(html).toContain('Let’s Get Quoted LLC');
      expect(html).toContain('11801 Domain Blvd, 3rd Floor · Austin, TX 78758');
      expect(html).toContain('Unsubscribe from platform announcements');
    });

    it('renders valid physical postal address in contractor lifecycle emails', () => {
      const step = CONTRACTOR_LIFECYCLE_STEPS[0];
      const html = renderContractorLifecycleEmailHtml(step, {
        name: 'John',
        businessName: 'John Plumbing',
      });

      expect(html).toContain('Let’s Get Quoted LLC');
      expect(html).toContain('11801 Domain Blvd, 3rd Floor · Austin, TX 78758');
      expect(html).toContain('Unsubscribe from platform onboarding emails');
    });

    it('renders contractor mailing address in contractor campaign emails', async () => {
      const html = await renderCampaignEmailHtml({
        recipientEmail: 'homeowner@example.com',
        businessName: 'Austin Pro Electric',
        subject: 'Spring Maintenance Reminder',
        body: 'Time to check your breaker panels before summer.',
        accountId: '',
        mailingAddress: '400 Congress Ave, Suite 1200 · Austin, TX 78701',
      });

      expect(html).toContain('Austin Pro Electric');
      expect(html).toContain('400 Congress Ave, Suite 1200 · Austin, TX 78701');
      expect(html).toContain('Unsubscribe from these emails');
    });
  });

  describe('Fail-Closed Email Suppression Queries', () => {
    it('loadSuppressedEmails throws on Supabase error rather than returning empty set', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Database connection timeout' },
            }),
          }),
        }),
      } as unknown as SupabaseClient;

      await expect(loadSuppressedEmails(mockSupabase, 'acc_fail')).rejects.toThrow(
        /Failed to load email suppression list/
      );
    });

    it('isEmailSuppressed throws on Supabase error rather than allowing send', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: null,
                    error: { message: 'Permission denied on email_suppression' },
                  }),
                }),
              }),
            }),
          }),
        }),
      } as unknown as SupabaseClient;

      await expect(isEmailSuppressed(mockSupabase, 'acc_fail', 'target@example.com')).rejects.toThrow(
        /Email suppression lookup failed/
      );
    });

    it('resolvePlatformCampaignRecipients fails closed if email_suppression query errors', async () => {
      const createChain = (terminalValue: unknown) => {
        const chain: Record<string, unknown> = {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockImplementation(() => Promise.resolve(terminalValue)),
          range: vi.fn().mockImplementation(() => Promise.resolve(terminalValue)),
          then: (resolve: (val: unknown) => unknown) => Promise.resolve(terminalValue).then(resolve),
        };
        return chain;
      };

      const mockAdmin = {
        from: vi.fn((table: string) => {
          if (table === 'accounts') {
            return createChain({
              data: [{ id: 'acc_1', business_name: 'Test Business', plan: 'solo', reply_to_email: 'owner@test.com' }],
              error: null,
            });
          }
          if (table === 'sites') {
            return createChain({
              data: [{ account_id: 'acc_1', company_name: 'Test Business Site' }],
              error: null,
            });
          }
          if (table === 'account_memberships') {
            return createChain({
              data: [{ account_id: 'acc_1', user_id: 'user_1' }],
              error: null,
            });
          }
          if (table === 'users') {
            return createChain({
              data: [{ id: 'user_1', email: 'owner@test.com', raw_user_meta_data: {} }],
              error: null,
            });
          }
          if (table === 'email_suppression') {
            return createChain({
              data: null,
              error: { message: 'Network partition on replica' },
            });
          }
          return createChain({ data: [], error: null });
        }),
        rpc: vi.fn().mockResolvedValue({
          data: [{ account_id: 'acc_1', email: 'owner@test.com' }],
          error: null,
        }),
      } as unknown as SupabaseClient;

      await expect(
        resolvePlatformCampaignRecipients(mockAdmin, 'all_contractors')
      ).rejects.toThrow(/Email suppression lookup failed/);
    });

    it('runContractorLifecycleSweep fails closed if email_suppression query errors', async () => {
      process.env.RESEND_API_KEY = 're_test_dummy_key';

      const createChain = (terminalValue: unknown) => {
        const chain: Record<string, unknown> = {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockImplementation(() => Promise.resolve(terminalValue)),
          then: (resolve: (val: unknown) => unknown) => Promise.resolve(terminalValue).then(resolve),
        };
        return chain;
      };

      const mockAdmin = {
        from: vi.fn((table: string) => {
          if (table === 'accounts') {
            return createChain({
              data: [{ id: 'acc_1', business_name: 'Test Plumbing', created_at: new Date().toISOString(), reply_to_email: 'plumber@example.com' }],
              error: null,
            });
          }
          if (table === 'account_memberships') {
            return createChain({
              data: [{ account_id: 'acc_1', user_id: 'user_1' }],
              error: null,
            });
          }
          if (table === 'users') {
            return createChain({
              data: [{ id: 'user_1', email: 'plumber@example.com', raw_user_meta_data: {} }],
              error: null,
            });
          }
          if (table === 'account_events') {
            return createChain({
              data: [],
              error: null,
            });
          }
          if (table === 'jobs') {
            return createChain({
              data: [],
              error: null,
            });
          }
          if (table === 'email_suppression') {
            return createChain({
              data: null,
              error: { message: 'Suppression table lock timeout' },
            });
          }
          return createChain({ data: [], error: null });
        }),
        rpc: vi.fn().mockResolvedValue({
          data: [{ account_id: 'acc_1', email: 'plumber@example.com' }],
          error: null,
        }),
      } as unknown as SupabaseClient;

      await expect(runContractorLifecycleSweep(mockAdmin)).rejects.toThrow(
        /Email suppression lookup failed/
      );
    });
  });
});
