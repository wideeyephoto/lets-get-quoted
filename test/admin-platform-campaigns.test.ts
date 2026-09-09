import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const { dispatchedKeys, mockAdmin } = vi.hoisted(() => {
  const dispatchedKeys = new Set<string>();
  const mockAdmin = {
    from: (table: string) => {
      if (table === 'platform_campaign_dispatches') {
        return {
          insert: async (row: { idempotency_key: string }) => {
            if (dispatchedKeys.has(row.idempotency_key)) {
              return {
                error: {
                  code: '23505',
                  message: 'duplicate key value violates unique constraint "platform_campaign_dispatches_pkey"',
                },
              };
            }
            dispatchedKeys.add(row.idempotency_key);
            return { error: null };
          },
          update: () => ({
            eq: async () => ({ error: null }),
          }),
        };
      }
      return {
        insert: async () => ({ error: null }),
        select: () => ({
          eq: () => ({
            gte: () => ({
              limit: async () => ({ data: [], error: null }),
            }),
          }),
        }),
      };
    },
  };
  return { dispatchedKeys, mockAdmin };
});

vi.mock('@/lib/auth', () => ({
  requireAdmin: async () => ({ admin: mockAdmin }),
  requirePermission: async () => ({ admin: mockAdmin }),
  requireMfaPermission: async () => ({ admin: mockAdmin, adminEmail: 'staff@letsgetquoted.com' }),
}));

vi.mock('@/lib/resend', () => ({
  getResendClient: () => ({
    emails: {
      send: vi.fn().mockResolvedValue({ data: { id: 'email_123' }, error: null }),
    },
  }),
}));

import {
  interpolateTokens,
  parseCustomEmailList,
  renderPlatformCampaignEmailHtml,
  PLATFORM_AUDIENCES,
} from '@/lib/admin-platform-campaigns';
import { PLATFORM_CAMPAIGN_TEMPLATES } from '@/lib/platform-campaign-templates';
import { APP_ORIGIN } from '@/lib/app-origin';

describe('Admin Platform Campaigns Engine', () => {
  describe('interpolateTokens', () => {
    it('interpolates business_name, first_name, email, and app_url', () => {
      const template = 'Hi {{first_name}} of {{business_name}} ({{email}}). Log in at {{app_url}}.';
      const recipient = {
        name: 'Jordan Smith',
        businessName: 'Apex Roofing & Solar',
        email: 'jordan@apexroofing.com',
        accountId: 'acc-123',
      };

      const result = interpolateTokens(template, recipient);
      expect(result).toBe(`Hi Jordan of Apex Roofing & Solar (jordan@apexroofing.com). Log in at ${APP_ORIGIN}/dashboard.`);
    });

    it('falls back gracefully when recipient information is missing', () => {
      const template = 'Hello {{first_name}}, welcome to {{business_name}}!';
      const result = interpolateTokens(template, null);
      expect(result).toBe('Hello there, welcome to your business!');
    });

    it('handles empty text cleanly', () => {
      expect(interpolateTokens('')).toBe('');
    });
  });

  describe('parseCustomEmailList', () => {
    it('parses comma, newline, space, and semicolon delimited emails', () => {
      const raw = 'test1@example.com, TEST2@Domain.org; user@sub.company.com\nhello@work.net invalid-email';
      const parsed = parseCustomEmailList(raw);
      expect(parsed).toEqual([
        'test1@example.com',
        'test2@domain.org',
        'user@sub.company.com',
        'hello@work.net',
      ]);
    });

    it('deduplicates repeat emails', () => {
      const raw = 'repeat@test.com, REPEAT@test.com, repeat@test.com';
      const parsed = parseCustomEmailList(raw);
      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toBe('repeat@test.com');
    });

    it('returns empty array on empty input', () => {
      expect(parseCustomEmailList('')).toEqual([]);
    });
  });

  describe('renderPlatformCampaignEmailHtml', () => {
    it('renders valid branded HTML containing subject, CTA, and unsubscribe link', () => {
      const html = renderPlatformCampaignEmailHtml(
        {
          subject: 'Special Announcement for {{business_name}}',
          heading: 'New Platform Capabilities',
          body: 'Hello {{first_name}},\n\nWe have updated our invoicing engine.\n\n• Faster deposits\n• Direct customer receipt links',
          ctaLabel: 'Open Dashboard',
          ctaUrl: 'https://letsgetquoted.com/dashboard',
          senderName: "Let's Get Quoted",
          senderEmail: 'hello@letsgetquoted.com',
          replyTo: 'support@letsgetquoted.com',
          theme: 'spotlight',
        },
        {
          businessName: 'Highline Plumbing',
          name: 'Sarah Connor',
          email: 'sarah@highlineplumbing.com',
          accountId: 'acc-777',
        },
      );

      expect(html).toContain('Highline Plumbing');
      expect(html).toContain('Sarah');
      expect(html).toContain('New Platform Capabilities');
      expect(html).toContain('Open Dashboard');
      expect(html).toContain('https://letsgetquoted.com/dashboard');
      expect(html).toContain('Unsubscribe from platform announcements');
      expect(html).toContain('Let&#39;s Get Quoted');
      expect(html).toContain('Faster deposits');
      expect(html).toContain('Direct customer receipt links');
    });

    it('renders across different email themes without throwing', () => {
      for (const theme of ['studio', 'spotlight', 'blueprint', 'letterhead', 'neighborly'] as const) {
        const html = renderPlatformCampaignEmailHtml({
          subject: 'Theme test',
          heading: 'Heading',
          body: 'Paragraph body.',
          theme,
        });
        expect(html).toBeTruthy();
        expect(html).toContain('Heading');
      }
    });
  });

  describe('PLATFORM_CAMPAIGN_TEMPLATES', () => {
    it('defines all required preset templates with valid metadata', () => {
      expect(PLATFORM_CAMPAIGN_TEMPLATES.length).toBeGreaterThanOrEqual(6);

      for (const tpl of PLATFORM_CAMPAIGN_TEMPLATES) {
        expect(tpl.id).toBeTruthy();
        expect(tpl.name).toBeTruthy();
        expect(tpl.subject).toBeTruthy();
        expect(tpl.heading).toBeTruthy();
        expect(tpl.body).toBeTruthy();
        expect(tpl.theme).toBeTruthy();
      }
    });
  });

  describe('PLATFORM_AUDIENCES', () => {
    it('defines all platform audience segments', () => {
      const ids = PLATFORM_AUDIENCES.map((a) => a.id);
      expect(ids).toContain('all_contractors');
      expect(ids).toContain('active_30d');
      expect(ids).toContain('active_90d');
      expect(ids).toContain('paid_tier');
      expect(ids).toContain('free_tier');
      expect(ids).toContain('incomplete_onboarding');
      expect(ids).toContain('recent_signups');
      expect(ids).toContain('custom');
    });
  });

  describe('T13: platform_campaign_dispatches migration security & RLS gate', () => {
    it('verifies RLS is enabled and revokes all privileges from public, anon, authenticated', () => {
      const sql = readFileSync(
        join(process.cwd(), 'migrations/20260909150000_platform_campaign_dispatches.sql'),
        'utf8',
      );

      expect(sql).toContain('create table if not exists public.platform_campaign_dispatches');
      expect(sql).toContain('idempotency_key text primary key');
      expect(sql).toMatch(/alter table public\.platform_campaign_dispatches enable row level security;/i);
      expect(sql).toMatch(/revoke all on table public\.platform_campaign_dispatches from public, anon, authenticated;/i);
      expect(sql).toMatch(/grant select, insert, update on table public\.platform_campaign_dispatches to service_role;/i);
    });
  });

  describe('T13: insert-first campaign idempotency concurrency', () => {
    it('allows only one dispatch to proceed when two concurrent calls share the same idempotency key', async () => {
      dispatchedKeys.clear();

      const { sendPlatformCampaignBlastAction } = await import('@/app/admin/campaigns/actions');

      process.env.RESEND_API_KEY = 're_test_12345';

      const sharedKey = `test_key_${Date.now()}`;
      const campaignInput = {
        audience: 'custom' as const,
        customEmails: 'contractor@example.com',
        subject: 'Product Update',
        heading: 'New Features',
        body: 'Hello contractors!',
        idempotencyKey: sharedKey,
      };

      // Fire two concurrent calls with identical idempotencyKey
      const [res1, res2] = await Promise.all([
        sendPlatformCampaignBlastAction(campaignInput),
        sendPlatformCampaignBlastAction(campaignInput),
      ]);

      const successes = [res1, res2].filter((r) => r.success);
      const duplicates = [res1, res2].filter((r) => !r.success && r.error?.includes('Duplicate campaign dispatch blocked'));

      expect(successes).toHaveLength(1);
      expect(duplicates).toHaveLength(1);
    });
  });
});
