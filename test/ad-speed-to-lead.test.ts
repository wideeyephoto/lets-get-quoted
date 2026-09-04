import { describe, expect, it, vi } from 'vitest';
import {
  generateSpeedToLeadSms,
  dispatchSpeedToLeadSms,
  resolveRecipientTimeZone,
  resolveRecipientTimeZoneWithSource,
  getJurisdictionTcpaRules,
  extractUsStateCode,
  generateContractorAdLeadAlert,
  generateSpeedToLeadIdempotencyKey,
} from '@/lib/ad-speed-to-lead';

vi.mock('@/lib/sms', () => ({
  sendSpeedToLeadSms: vi.fn().mockResolvedValue('11111111-2222-4000-8000-333333333333'),
  sendContractorAdLeadSms: vi.fn().mockResolvedValue('22222222-3333-4000-8000-444444444444'),
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

  it('generates hyper-local neighborhood/halo offer copy for nearby leads', () => {
    const text = generateSpeedToLeadSms({
      businessName: 'Craftsman Painting',
      leadName: 'Emma Watson',
      projectType: 'Exterior Painting',
      haloContext: {
        isNeighborLead: true,
        streetName: 'Maplewood Drive',
        neighborhoodName: 'Sunset Hills',
        clusterOffer: '10% neighbor group discount',
      },
    });

    expect(text).toContain('Hi Emma');
    expect(text).toContain('Maplewood Drive in Sunset Hills');
    expect(text).toContain('10% neighbor group discount');
    expect(text).toContain('estimator is working nearby this week');
    expect(text).toContain('Reply STOP to opt out.');
  });

  it('extracts US 2-letter state codes from addresses and cities', () => {
    expect(extractUsStateCode('Miami, FL 33101')).toBe('FL');
    expect(extractUsStateCode('Tulsa, OK')).toBe('OK');
    expect(extractUsStateCode('Seattle, WA')).toBe('WA');
    expect(extractUsStateCode('Baltimore, MD')).toBe('MD');
    expect(extractUsStateCode('Austin, TX')).toBe('TX');
    expect(extractUsStateCode(null)).toBeNull();
  });

  it('resolves jurisdiction-specific quiet hour rules for state mini-TCPAs', () => {
    // Florida (FTSA: 8:00 PM cutoff)
    const flRule = getJurisdictionTcpaRules('Tampa, FL');
    expect(flRule.jurisdiction).toBe('state_mini_tcpa');
    expect(flRule.stateCode).toBe('FL');
    expect(flRule.quietStartHour).toBe(20); // 8:00 PM
    expect(flRule.ruleName).toContain('Florida FTSA');

    // Oklahoma (OTA: 8:00 PM cutoff)
    const okRule = getJurisdictionTcpaRules('Oklahoma City, OK');
    expect(okRule.jurisdiction).toBe('state_mini_tcpa');
    expect(okRule.stateCode).toBe('OK');
    expect(okRule.quietStartHour).toBe(20);

    // Maryland (8:00 PM cutoff)
    const mdRule = getJurisdictionTcpaRules('Annapolis, MD');
    expect(mdRule.jurisdiction).toBe('state_mini_tcpa');
    expect(mdRule.quietStartHour).toBe(20);

    // Washington (8:00 PM cutoff)
    const waRule = getJurisdictionTcpaRules('Spokane, WA');
    expect(waRule.jurisdiction).toBe('state_mini_tcpa');
    expect(waRule.quietStartHour).toBe(20);

    // Federal TCPA default (9:00 PM cutoff)
    const fedRule = getJurisdictionTcpaRules('Austin, TX');
    expect(fedRule.jurisdiction).toBe('federal_tcpa');
    expect(fedRule.quietStartHour).toBe(21); // 9:00 PM
  });

  it('resolves recipient local time zone with source attribution', () => {
    // Explicit override
    const explicit = resolveRecipientTimeZoneWithSource({
      explicitTimeZone: 'America/Denver',
      phone: '415-555-0100',
    });
    expect(explicit.timeZone).toBe('America/Denver');
    expect(explicit.source).toBe('explicit');

    // Phone NPA
    const phoneNpa = resolveRecipientTimeZoneWithSource({
      phone: '(415) 555-0199',
    });
    expect(phoneNpa.timeZone).toBe('America/Los_Angeles');
    expect(phoneNpa.source).toBe('phone_npa');

    // Location
    const loc = resolveRecipientTimeZoneWithSource({
      city: 'Chicago, IL',
    });
    expect(loc.timeZone).toBe('America/Chicago');
    expect(loc.source).toBe('location');

    // Account Fallback
    const account = resolveRecipientTimeZoneWithSource({
      accountTimeZone: 'America/Phoenix',
    });
    expect(account.timeZone).toBe('America/Phoenix');
    expect(account.source).toBe('account');

    // Default Fallback
    const def = resolveRecipientTimeZoneWithSource({});
    expect(def.timeZone).toBe('America/New_York');
    expect(def.source).toBe('default');
  });

  it('generates formatted contractor alert texts', () => {
    const sentAlert = generateContractorAdLeadAlert({
      businessName: 'Apex Roofing',
      leadName: 'John Doe',
      phone: '512-555-0199',
      projectType: 'Gutter Installation',
      city: 'Round Rock',
      speedToLeadStatus: 'sent',
    });
    expect(sentAlert).toContain('🔥 [Ad Lead] John Doe requested Gutter Installation in Round Rock');
    expect(sentAlert).toContain('Auto-SMS sent to homeowner');
    expect(sentAlert).toContain('Phone: 512-555-0199');

    const quietAlert = generateContractorAdLeadAlert({
      businessName: 'Apex Roofing',
      leadName: 'Jane Smith',
      phone: '415-555-0122',
      projectType: 'Roof Repair',
      city: 'Oakland',
      speedToLeadStatus: 'queued_quiet_hours',
      sendAtFormatted: '8:01 AM (America/Los_Angeles)',
    });
    expect(quietAlert).toContain('Auto-SMS queued for 8:01 AM (America/Los_Angeles) (quiet hours)');

    const deferredAlert = generateContractorAdLeadAlert({
      businessName: 'Apex Roofing',
      leadName: 'Bob Vance',
      phone: '214-555-0188',
      projectType: 'AC Replacement',
      city: 'Dallas',
      speedToLeadStatus: 'deferred',
    });
    expect(deferredAlert).toContain('Auto-SMS deferred (no dedicated sender)');
    expect(deferredAlert).not.toContain('Auto-SMS sent to homeowner');
  });

  it('generates time-bucketed idempotency keys for deduplication', () => {
    const key1 = generateSpeedToLeadIdempotencyKey('acc-123', '415-555-0199', 15);
    const key2 = generateSpeedToLeadIdempotencyKey('acc-123', '(415) 555-0199', 15);
    expect(key1).toBe(key2);
    expect(key1).toContain('stl:acc-123:4155550199:');
  });

  it('dispatches speed-to-lead SMS and notifies contractor with full telemetry', async () => {
    const { sendSpeedToLeadSms, sendContractorAdLeadSms } = await import('@/lib/sms');
    vi.mocked(sendSpeedToLeadSms).mockClear();
    vi.mocked(sendContractorAdLeadSms).mockClear();

    const fakeAdmin = {} as any;

    const result = await dispatchSpeedToLeadSms({
      admin: fakeAdmin,
      accountId: '10000000-0000-4000-8000-000000000001',
      recipientPhone: '+14155550199', // Pacific time zone
      businessName: 'Apex Roofing',
      leadName: 'Alex Smith',
      projectType: 'Roof Inspection',
      city: 'San Francisco, CA',
      contractorAlertPhone: '+15125550199',
    });

    expect(result.resolvedTimeZone).toBe('America/Los_Angeles');
    expect(result.message).toBeTruthy();
    expect(result.telemetry).toBeDefined();
    expect(result.telemetry.timeZoneSource).toBe('phone_npa');
    expect(result.telemetry.jurisdiction).toBe('federal_tcpa');
    expect(result.telemetry.contractorAlertStatus).toBe('sent');

    expect(sendSpeedToLeadSms).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: '10000000-0000-4000-8000-000000000001',
        phone: '+14155550199',
        businessName: 'Apex Roofing',
      })
    );

    expect(sendContractorAdLeadSms).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: '10000000-0000-4000-8000-000000000001',
        phone: '+15125550199',
      })
    );
  });

  it('rejects a quiet-hours dispatch when the delayed enqueue fails', async () => {
    const { sendSpeedToLeadSms, sendContractorAdLeadSms } = await import('@/lib/sms');
    vi.mocked(sendSpeedToLeadSms).mockRejectedValueOnce(new Error('delayed enqueue failed'));
    vi.mocked(sendContractorAdLeadSms).mockClear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T06:00:00.000Z'));

    try {
      await expect(dispatchSpeedToLeadSms({
        admin: {} as any,
        accountId: '10000000-0000-4000-8000-000000000001',
        recipientPhone: '+14155550199',
        businessName: 'Apex Roofing',
        leadName: 'Alex Smith',
        city: 'San Francisco, CA',
        contractorAlertPhone: '+15125550199',
      })).rejects.toThrow('delayed enqueue failed');

      expect(sendSpeedToLeadSms).toHaveBeenCalledWith(
        expect.objectContaining({
          availableAt: expect.any(Date),
        })
      );
      expect(sendContractorAdLeadSms).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('notifies contractor with deferred status when dedicated sender is unavailable', async () => {
    const { sendSpeedToLeadSms, sendContractorAdLeadSms } = await import('@/lib/sms');
    vi.mocked(sendSpeedToLeadSms).mockResolvedValueOnce('event-1234');
    vi.mocked(sendContractorAdLeadSms).mockClear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T20:00:00.000Z'));

    try {
      const result = await dispatchSpeedToLeadSms({
        admin: {} as any,
        accountId: '10000000-0000-4000-8000-000000000001',
        recipientPhone: '+14155550199',
        businessName: 'Apex Roofing',
        leadName: 'Alex Smith',
        city: 'San Francisco, CA',
        contractorAlertPhone: '+15125550199',
        hasDedicatedSender: false,
      });

      expect(result.sent).toBe(false);
      expect(result.telemetry.deliveryStatus).toBe('deferred');
      expect(sendContractorAdLeadSms).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('Auto-SMS deferred (no dedicated sender)'),
        }),
      );
      expect(sendContractorAdLeadSms).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.not.stringContaining('Auto-SMS sent to homeowner'),
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
