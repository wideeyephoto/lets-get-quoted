import { describe, it, expect } from 'vitest';
import {
  buildGoogleMapsNavUrl,
  buildAppleMapsNavUrl,
  formatBriefingStop,
  buildCrewMorningBriefingSms,
  type CrewDailyBriefing,
} from '../src/lib/crew-briefing';

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
});
