import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { MANUAL_ARTICLES } from '@/lib/help/user-manual';
import { resolveTabForHash } from '@/lib/nav-helpers';

describe('Deep-link and Navigation Integrity Audit', () => {
  it('ensures next.config.mjs does not block the new job request form', () => {
    const nextConfig = readFileSync('next.config.mjs', 'utf8');
    expect(nextConfig).not.toContain("source: '/dashboard/crew/requests/new'");
    expect(nextConfig).toContain("source: '/dashboard/campaigns'");
    expect(nextConfig).toContain("destination: '/dashboard/marketing/campaigns'");
  });

  it('ensures user manual routes contain no stale paths', () => {
    const stalePatterns = [
      '/dashboard/quotes',
      '/dashboard/invoices',
      '/dashboard/timecards',
      '/dashboard/price-book',
      '/dashboard/reports/cash-flow',
      '/dashboard/intake',
      '/dashboard/campaigns',
      'settings#alerts',
      'settings#crew',
      'settings#stripe',
      'automations#rebooking',
      'sites#blog',
      'sites#booking',
      'sites#quick-stops',
      'settings#developer-api',
    ];

    for (const article of MANUAL_ARTICLES) {
      for (const route of article.routes) {
        for (const pattern of stalePatterns) {
          expect(
            route.href,
            `Article "${article.slug}" has stale route "${route.href}" matching "${pattern}"`
          ).not.toBe(pattern);
        }
      }
    }
  });

  it('ensures opportunity loader deep-links "Respond to lead" directly to the lead ID', () => {
    const code = readFileSync('src/lib/dashboard/opportunity-loader.ts', 'utf8');
    expect(code).toContain('actionHref: `${basePath}/leads/${lead.id}`');
  });

  it('ensures voice controls link to crew tab instead of obsolete settings team', () => {
    const code = readFileSync('src/app/dashboard/voice-calls/VoiceControlsSection.tsx', 'utf8');
    expect(code).toContain('href="/dashboard/crew?tab=people"');
    expect(code).not.toContain('href="/dashboard/settings#team"');
  });

  it('ensures marketing overview links directly to #marketing-address', () => {
    const code = readFileSync('src/lib/marketing-overview.ts', 'utf8');
    expect(code).toContain("href: '/dashboard/settings#marketing-address'");
  });

  it('ensures MarketingCalendar links to #marketing-address', () => {
    const code = readFileSync('src/app/dashboard/marketing/MarketingCalendar.tsx', 'utf8');
    expect(code).toContain('href="/dashboard/settings#marketing-address"');
  });

  it('ensures Job detail invoice section links to #payouts', () => {
    const code = readFileSync('src/app/dashboard/jobs/[id]/page.tsx', 'utf8');
    expect(code).toContain('href="/dashboard/settings#payouts"');
  });

  it('ensures automations page always renders #ai-receptionist card anchor', () => {
    const code = readFileSync('src/app/dashboard/automations/page.tsx', 'utf8');
    expect(code).toContain('id="ai-receptionist"');
    // Fallback card is present when aiVoice is falsy
    expect(code).toContain('View Voice Controls →');
  });

  it('resolves legacy and deep-link anchors to the appropriate settings tab', () => {
    const mockTabs = [
      { id: 'plan', label: 'Plan & usage', anchors: ['plan-at-a-glance', 'office-team'], content: null },
      { id: 'account', label: 'Login & security', anchors: ['appearance', 'support', 'danger-zone', 'account'], content: null },
      { id: 'payments', label: 'Payments', anchors: ['payouts', 'stripe', 'payments'], content: null },
      { id: 'business', label: 'Business', anchors: ['business-basics', 'import', 'data-import', 'export', 'integrations', 'marketing-address', 'alerts'], content: null },
      { id: 'developers', label: 'Developers & APIs', anchors: ['api-tokens', 'webhooks', 'developer-api', 'developers'], content: null },
    ];

    expect(resolveTabForHash(mockTabs, 'payouts')).toBe('payments');
    expect(resolveTabForHash(mockTabs, 'stripe')).toBe('payments');
    expect(resolveTabForHash(mockTabs, 'marketing-address')).toBe('business');
    expect(resolveTabForHash(mockTabs, 'data-import')).toBe('business');
    expect(resolveTabForHash(mockTabs, 'integrations')).toBe('business');
    expect(resolveTabForHash(mockTabs, 'alerts')).toBe('business');
    expect(resolveTabForHash(mockTabs, 'developer-api')).toBe('developers');
    expect(resolveTabForHash(mockTabs, 'danger-zone')).toBe('account');
  });
});
