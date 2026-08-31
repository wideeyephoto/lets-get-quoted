import { describe, it, expect } from 'vitest';
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
});
