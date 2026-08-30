import { describe, it, expect } from 'vitest';
import { intakeConfirmationText } from '@/lib/sms-templates';
import { getSiteContent } from '@/lib/site-content';

describe('intake confirmation SMS template', () => {
  it('generates friendly confirmation with opt-out suffix', () => {
    const text = intakeConfirmationText({
      businessName: 'Apex Roofing',
      leadName: 'John Smith',
      projectType: 'Roof replacement',
    });

    expect(text).toContain('Hi John, thanks for reaching out to Apex Roofing!');
    expect(text).toContain('We received your Roof replacement.');
    expect(text).toContain('Reply STOP to opt out.');
  });

  it('includes estimate range when provided', () => {
    const text = intakeConfirmationText({
      businessName: 'Evergreen Landscaping',
      leadName: 'Sarah Connor',
      projectType: 'Patio installation',
      estimate: { min: 4500, max: 6200 },
    });

    expect(text).toContain('Hi Sarah, thanks for reaching out to Evergreen Landscaping!');
    expect(text).toContain('Your estimated range: $4,500-$6,200.');
    expect(text).toContain('Reply STOP to opt out.');
  });

  it('handles fallback name and project type cleanly', () => {
    const text = intakeConfirmationText({
      businessName: 'Elite Plumbing',
    });

    expect(text).toContain('Hi there, thanks for reaching out to Elite Plumbing!');
    expect(text).toContain('We received your estimate request.');
    expect(text).toContain('Reply STOP to opt out.');
  });
});

describe('site content normalization for instantConfirmationSms', () => {
  it('defaults instantConfirmationSms to false for unconfigured sites', () => {
    const content = getSiteContent({});
    expect(content.leadFilters.instantConfirmationSms).toBe(false);
  });

  it('preserves instantConfirmationSms when enabled', () => {
    const content = getSiteContent({
      leadFilters: {
        instantConfirmationSms: true,
      },
    });
    expect(content.leadFilters.instantConfirmationSms).toBe(true);
  });
});
