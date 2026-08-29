import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { playQuickStopAlertChime } from '@/app/dashboard/quick-stops/QuickStopRequestCard';
import { buildQuickStopPitch } from '@/lib/quick-stop-pitch';

describe('Quick Stops Dashboard Enhancements', () => {
  it('exports playQuickStopAlertChime helper function safely', () => {
    expect(typeof playQuickStopAlertChime).toBe('function');
    // Calling in node environment without window/audio should not throw
    expect(() => playQuickStopAlertChime()).not.toThrow();
  });

  it('generates consistent pitch copy for the candidate announcement preview', () => {
    const pitch = buildQuickStopPitch({
      businessName: 'Apex Plumbing',
      bookingUrl: 'https://apex.letsgetquoted.com/book/apex',
      minFeeCents: 12500,
      daysAhead: 1,
    });

    expect(pitch.body).toContain('Apex Plumbing');
    expect(pitch.subject).toMatch(/fixed today or tomorrow\?/);
    expect(pitch.body).toContain('$125');
    expect(pitch.sms).toContain('https://apex.letsgetquoted.com/book/apex');
    expect(pitch.sms.length).toBeLessThanOrEqual(160);
  });

  it('QuickStopRequestCard source includes real-time polling, navigation, and activity log', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/dashboard/quick-stops/QuickStopRequestCard.tsx'), 'utf8');

    // Real-time polling
    expect(src).toContain("request.status !== 'awaiting_customer_payment'");
    expect(src).toContain('visibilitychange');

    // Maps navigation links
    expect(src).toContain('google.com/maps/dir');
    expect(src).toContain('maps.apple.com/?daddr');

    // Touchpoint / activity log
    expect(src).toContain('auditTimeline');
    expect(src).toContain('Activity &amp; Communication Log');

    // Route-gap recommendations
    expect(src).toContain('route?.recommendedStart');
    expect(src).toContain('slotted after');
  });

  it('QuickStopCandidates source includes pitch preview and settings adjustment tip', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/dashboard/quick-stops/QuickStopCandidates.tsx'), 'utf8');

    expect(src).toContain('Preview Customer Pitch');
    expect(src).toContain('SMS Announcement Template');
    expect(src).toContain('Email Announcement Template');
    expect(src).toContain('Work longer than');
    expect(src).toContain('tab=settings#quick-stop-setup');
  });
});
