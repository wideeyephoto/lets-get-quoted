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

    expect(text).toContain('Apex Roofing: Hi John, we received your Roof replacement.');
    expect(text).toContain('Our team will contact you after review.');
    expect(text).toContain('Reply STOP to opt out.');
  });

  it('includes estimate range when provided', () => {
    const text = intakeConfirmationText({
      businessName: 'Evergreen Landscaping',
      leadName: 'Sarah Connor',
      projectType: 'Patio installation',
      estimate: { min: 4500, max: 6200 },
    });

    expect(text).toContain('Evergreen Landscaping: Hi Sarah, we received your Patio installation.');
    expect(text).toContain('Preliminary range: $4,500-$6,200, subject to reviewing the work.');
    expect(text).toContain('Reply STOP to opt out.');
  });

  it('handles fallback name and project type cleanly', () => {
    const text = intakeConfirmationText({
      businessName: 'Elite Plumbing',
    });

    expect(text).toContain('Elite Plumbing: Hi there, we received your estimate request.');
    expect(text).toContain('we received your estimate request.');
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

describe('sendIntakeConfirmationSms quiet-hours and delivery behavior', () => {
  it('calculates 8:01 AM local send time and queues with availableAt during quiet hours', async () => {
    const { getTcpaCompliantSendTime } = await import('@/lib/phone-timezone');
    // 11:30 PM EDT (quiet hours: 9pm - 8am)
    const lateNightDate = new Date('2026-09-01T03:30:00Z');
    const tcpaCheck = getTcpaCompliantSendTime(lateNightDate, 'America/New_York');

    expect(tcpaCheck.isDelayed).toBe(true);
    expect(tcpaCheck.sendAt.toISOString()).toBeDefined();

    const localFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    expect(localFormatter.format(tcpaCheck.sendAt)).toBe('08:01');
  });

  it('allows immediate daytime delivery without delay during active hours', async () => {
    const { getTcpaCompliantSendTime } = await import('@/lib/phone-timezone');
    // 2:30 PM EDT (active hours)
    const daytimeDate = new Date('2026-09-01T18:30:00Z');
    const tcpaCheck = getTcpaCompliantSendTime(daytimeDate, 'America/New_York');

    expect(tcpaCheck.isDelayed).toBe(false);
    expect(tcpaCheck.sendAt.getTime()).toBe(daytimeDate.getTime());
  });
});
