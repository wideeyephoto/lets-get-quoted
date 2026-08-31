import { describe, expect, it, vi } from 'vitest';
import {
  generateSpeedToLeadSms,
  dispatchSpeedToLeadSms,
  resolveRecipientTimeZone,
} from '@/lib/ad-speed-to-lead';

vi.mock('@/lib/sms', () => ({
  sendSpeedToLeadSms: vi.fn().mockResolvedValue('11111111-2222-4000-8000-333333333333'),
}));


describe('AI Speed-to-Lead SMS Engine', () => {
  it('generates a warm, natural SMS response for standard ad leads', () => {
    const text = generateSpeedToLeadSms({
      businessName: 'Apex Roofing',
      leadName: 'Sarah Jenkins',
      projectType: 'Roof Replacement',
      city: 'Austin, TX',
      urgency: 'standard',
    });

    expect(text).toContain('Hi Sarah');
    expect(text).toContain('Apex Roofing');
    expect(text).toContain('Roof Replacement in Austin');
    expect(text).toContain('tomorrow morning or afternoon');
    expect(text).toContain('Reply STOP to opt out.');
  });

  it('generates high-urgency dispatch SMS for emergency leads', () => {
    const text = generateSpeedToLeadSms({
      businessName: 'Evergreen Plumbing',
      leadName: 'David Miller',
      projectType: 'Burst Pipe Leak',
      city: 'Dallas, TX',
      urgency: 'emergency',
    });

    expect(text).toContain('Hi David');
    expect(text).toContain('urgent request for Burst Pipe Leak in Dallas');
    expect(text).toContain('dispatch team is on standby');
    expect(text).toContain('Reply STOP to opt out.');
  });

  it('resolves recipient local time zone from phone area code and location', () => {
    // California phone (415)
    expect(
      resolveRecipientTimeZone({
        phone: '(415) 555-0199',
        accountTimeZone: 'America/New_York',
      })
    ).toBe('America/Los_Angeles');

    // Texas phone (512)
    expect(
      resolveRecipientTimeZone({
        phone: '512-555-0100',
        accountTimeZone: 'America/New_York',
      })
    ).toBe('America/Chicago');

    // Location string (Austin, TX)
    expect(
      resolveRecipientTimeZone({
        city: 'Austin, TX',
        accountTimeZone: 'America/New_York',
      })
    ).toBe('America/Chicago');
  });

  it('evaluates quiet hours against called party local time during speed-to-lead dispatch', async () => {
    const fakeAdmin = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    } as any;

    const result = await dispatchSpeedToLeadSms({
      admin: fakeAdmin,
      accountId: '10000000-0000-4000-8000-000000000001',
      recipientPhone: '+14155550199', // Pacific time zone
      businessName: 'Apex Roofing',
      leadName: 'Alex Smith',
      projectType: 'Roof Inspection',
      city: 'San Francisco, CA',
      accountTimeZone: 'America/New_York', // Contractor in Eastern Time
    });

    expect(result.resolvedTimeZone).toBe('America/Los_Angeles');
    expect(result.message).toBeTruthy();
  });
});

