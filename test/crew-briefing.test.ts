import { describe, it, expect } from 'vitest';
import {
  buildGoogleMapsNavUrl,
  buildAppleMapsNavUrl,
  formatBriefingStop,
  buildCrewMorningBriefingSms,
  buildCrewDailyRunSheetText,
  type CrewDailyBriefing,
} from '@/lib/crew-briefing';

describe('Crew Morning Dispatch Briefing', () => {
  const sampleStops = [
    {
      jobRef: 'J-101',
      clientName: 'Alice Johnson',
      address: '1418 S Main St, Royal Oak, MI 48067',
      phone: '248-555-0199',
      scheduledTime: '8:00 AM',
      scope: 'Replace 40gal water heater',
      lat: 42.4895,
      lng: -83.1446,
    },
    {
      jobRef: 'J-102',
      clientName: 'Bob Williams',
      address: '3200 Crooks Rd, Troy, MI 48084',
      scheduledTime: '1:00 PM',
      scope: 'Sump pump backup installation',
    },
  ];

  it('builds valid Google Maps navigation URLs from address or lat/lng', () => {
    const latLngUrl = buildGoogleMapsNavUrl('Anywhere', 42.4895, -83.1446);
    expect(latLngUrl).toContain('destination=42.4895,-83.1446');

    const addressUrl = buildGoogleMapsNavUrl('1418 S Main St, Royal Oak, MI');
    expect(addressUrl).toContain('destination=1418%20S%20Main%20St');
  });

  it('builds valid Apple Maps navigation URLs', () => {
    const appleUrl = buildAppleMapsNavUrl('1418 S Main St, Royal Oak, MI', 42.4895, -83.1446);
    expect(appleUrl).toContain('maps.apple.com');
    expect(appleUrl).toContain('daddr=42.4895,-83.1446');
  });

  it('formats individual stops concisely', () => {
    const formatted = formatBriefingStop(sampleStops[0], 0);
    expect(formatted).toContain('1) [J-101] Alice (8:00 AM)');
    expect(formatted).toContain('1418 S Main St');
    expect(formatted).toContain('https://www.google.com/maps/dir/');
  });

  it('generates full morning briefing SMS for crew members', () => {
    const briefing: CrewDailyBriefing = {
      crewName: 'Dave Miller',
      businessName: 'Apex Plumbing',
      date: 'Monday, Aug 25',
      stops: sampleStops,
      portalUrl: 'https://apex.com/field',
    };

    const sms = buildCrewMorningBriefingSms(briefing);
    expect(sms).toContain('Good morning Dave!');
    expect(sms).toContain('Monday, Aug 25');
    expect(sms).toContain('Apex Plumbing (2 stops)');
    expect(sms).toContain('[J-101]');
    expect(sms).toContain('[J-102]');
    expect(sms).toContain('Open Field App: https://apex.com/field');
    expect(sms).toContain('Reply STOP to opt out.');
  });

  it('handles zero stops gracefully on off-days', () => {
    const emptyBriefing: CrewDailyBriefing = {
      crewName: 'Dave Miller',
      businessName: 'Apex Plumbing',
      date: 'Sunday, Aug 24',
      stops: [],
    };

    const sms = buildCrewMorningBriefingSms(emptyBriefing);
    expect(sms).toContain('no scheduled stops');
    expect(sms).toContain('Enjoy your day!');
  });

  it('includes custom notes/instructions in morning SMS when provided', () => {
    const briefingWithNote: CrewDailyBriefing = {
      crewName: 'Dave Miller',
      businessName: 'Apex Plumbing',
      date: 'Monday, Aug 25',
      stops: sampleStops,
      customNote: 'Gate code is #8821. Rain expected at 2 PM, please finish roof first.',
    };

    const sms = buildCrewMorningBriefingSms(briefingWithNote);
    expect(sms).toContain('📌 Note: Gate code is #8821.');
    expect(sms).toContain('[J-101]');
  });

  it('generates rich multi-line run-sheet text for clipboard and printing', () => {
    const briefing: CrewDailyBriefing = {
      crewName: 'Dave Miller',
      businessName: 'Apex Plumbing',
      date: 'Monday, Aug 25',
      stops: sampleStops,
      portalUrl: 'https://apex.com/field',
      customNote: 'Bring the 32ft extension ladder.',
    };

    const runSheet = buildCrewDailyRunSheetText(briefing);
    expect(runSheet).toContain('DAILY DISPATCH RUN-SHEET: Monday, Aug 25');
    expect(runSheet).toContain('Assigned: Dave Miller (Apex Plumbing)');
    expect(runSheet).toContain('📌 DAILY NOTES:');
    expect(runSheet).toContain('Bring the 32ft extension ladder.');
    expect(runSheet).toContain('Stop #1 [J-101]');
    expect(runSheet).toContain('⏰ Scheduled: 8:00 AM');
    expect(runSheet).toContain('👤 Client: Alice Johnson');
    expect(runSheet).toContain('📞 Phone: 248-555-0199');
    expect(runSheet).toContain('📍 Address: 1418 S Main St, Royal Oak, MI 48067');
    expect(runSheet).toContain('📝 Scope: Replace 40gal water heater');
    expect(runSheet).toContain('Stop #2 [J-102]');
    expect(runSheet).toContain('🔗 Crew Field Portal: https://apex.com/field');
  });
});
