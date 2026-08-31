import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CONTRACTOR_LIFECYCLE_STEPS,
  renderContractorLifecycleEmailHtml,
  sendContractorWelcomeEmail,
  runContractorLifecycleSweep,
} from '@/lib/contractor-lifecycle-emails';
import { PLATFORM_CAMPAIGN_TEMPLATES } from '@/lib/platform-campaign-templates';
import { renderPlatformCampaignEmailHtml } from '@/lib/admin-platform-campaigns';

describe('Contractor Lifecycle Steps & Templates Catalog', () => {
  it('contains all 10 core onboarding sequence and milestone nudge steps', () => {
    const stepIds = CONTRACTOR_LIFECYCLE_STEPS.map((s) => s.id);
    expect(stepIds).toEqual([
      'welcome_day0',
      'quote_speed_day2',
      'stripe_payout_day4',
      'crew_arrival_day7',
      'reviews_reputation_day10',
      'ai_voice_intake_day14',
      'growth_scale_day21',
      'founder_checkin_day30',
      'nudge_incomplete_stripe',
      'nudge_zero_quotes',
    ]);
  });

  it('renders valid branded email HTML for each lifecycle step with interpolated tokens', () => {
    const sampleRecipient = {
      email: 'mike@apexroofing.com',
      name: 'Mike Vance',
      businessName: 'Apex Roofing & Siding',
      accountId: 'acc-test-123',
    };

    for (const step of CONTRACTOR_LIFECYCLE_STEPS) {
      const html = renderContractorLifecycleEmailHtml(step, sampleRecipient);
      expect(html).toContain('Mike');
      expect(html).toContain(step.ctaPath);
      expect(html).toContain('Unsubscribe');
      expect(html).toContain('<!DOCTYPE html');
    }
  });

  it('contains all expanded platform campaign templates in the admin broadcast catalog', () => {
    const templateIds = PLATFORM_CAMPAIGN_TEMPLATES.map((t) => t.id);
    expect(templateIds).toContain('welcome-quickstart');
    expect(templateIds).toContain('first-quote-closing');
    expect(templateIds).toContain('stripe-deposit-setup');
    expect(templateIds).toContain('seasonal-surge');
    expect(templateIds).toContain('google-reviews-flywheel');
    expect(templateIds).toContain('ai-voice-intake');
    expect(templateIds).toContain('quick-stops-revenue');
    expect(templateIds).toContain('feature-launch');
    expect(templateIds).toContain('founder-letter');
    expect(templateIds).toContain('growth-playbook');
    expect(templateIds).toContain('upgrade-promotion');
    expect(templateIds).toContain('service-advisory');
    expect(templateIds).toContain('blank');
  });

  it('renders all admin campaign templates without errors', () => {
    const sampleRecipient = {
      email: 'dave@daveselectric.com',
      name: 'Dave Miller',
      businessName: "Dave's Electric",
      accountId: 'acc-electric-456',
    };

    for (const template of PLATFORM_CAMPAIGN_TEMPLATES) {
      const html = renderPlatformCampaignEmailHtml(template, sampleRecipient);
      expect(html).toContain('Dave');
      expect(html).toContain('Unsubscribe');
      expect(html).toContain('<!DOCTYPE html');
    }
  });
});

describe('sendContractorWelcomeEmail resiliency', () => {
  it('returns false gracefully when no mailable email is found', async () => {
    const result = await sendContractorWelcomeEmail({
      accountId: '00000000-0000-0000-0000-000000000000',
      ownerEmail: 'invalid-email',
      businessName: 'Test Biz',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('no_mailable_email');
  });
});
