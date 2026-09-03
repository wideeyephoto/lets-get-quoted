import { describe, it, expect } from 'vitest';
import {
  formatClientDashboardSmsText,
  formatPrivateSmsText,
} from '@/lib/dashboard-sms-dispatch';

describe('Dashboard SMS Dispatch Formatting', () => {
  it('formats client dashboard SMS text with compliance disclaimer and portal link', () => {
    const text = formatClientDashboardSmsText({
      businessName: 'Apex Roofing',
      clientName: 'Sarah Jenkins',
      clientDashboardUrl: 'https://letsgetquoted.com/client/jobs/tok_123',
      nextActionPrompt: 'Review Quote',
    });

    expect(text).toContain('Apex Roofing: Hi Sarah, here is your project portal and next steps (Review Quote):');
    expect(text).toContain('https://letsgetquoted.com/client/jobs/tok_123');
    expect(text).toContain('Reply STOP to opt out.');
  });

  it('formats private text with business name prefix if missing', () => {
    const text = formatPrivateSmsText({
      businessName: 'Apex Roofing',
      body: 'Can our tech come by tomorrow at 2 PM?',
    });

    expect(text).toBe('Apex Roofing: Can our tech come by tomorrow at 2 PM?');
  });

  it('avoids duplicating business name if already present in private text', () => {
    const text = formatPrivateSmsText({
      businessName: 'Apex Roofing',
      body: 'Hi, this is Dan from Apex Roofing checking in!',
    });

    expect(text).toBe('Hi, this is Dan from Apex Roofing checking in!');
  });
});
