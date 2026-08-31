import { describe, expect, it } from 'vitest';
import {
  extractAreaCode,
  getTimeZoneFromPhone,
  getTimeZoneFromLocation,
  resolveRecipientTimeZone,
  isWithinTcpaQuietHours,
  getTcpaCompliantSendTime,
  calculateNextPermissibleSendTime,
  isValidTimeZone,
} from '@/lib/phone-timezone';

describe('Phone Number & Area Code Timezone Resolution (FCC TCPA Called Party Rules)', () => {
  describe('Area code extraction', () => {
    it('extracts 3-digit area code from standard US phone numbers', () => {
      expect(extractAreaCode('(415) 555-1234')).toBe('415');
      expect(extractAreaCode('+1 (212) 555-0199')).toBe('212');
      expect(extractAreaCode('13125550100')).toBe('312');
      expect(extractAreaCode('248-555-0191')).toBe('248');
      expect(extractAreaCode('5125551234')).toBe('512');
    });

    it('returns null for invalid or unparseable phone numbers', () => {
      expect(extractAreaCode('')).toBeNull();
      expect(extractAreaCode('12345')).toBeNull();
      expect(extractAreaCode(null)).toBeNull();
    });
  });

  describe('Phone area code to IANA timezone lookup', () => {
    it('maps Eastern time area codes correctly', () => {
      expect(getTimeZoneFromPhone('212-555-0100')).toBe('America/New_York'); // NY
      expect(getTimeZoneFromPhone('(248) 555-0191')).toBe('America/New_York'); // MI
      expect(getTimeZoneFromPhone('+1 305 555 0100')).toBe('America/New_York'); // FL
      expect(getTimeZoneFromPhone('404-555-1234')).toBe('America/New_York'); // GA
      expect(getTimeZoneFromPhone('617-555-0100')).toBe('America/New_York'); // MA
    });

    it('maps Central time area codes correctly', () => {
      expect(getTimeZoneFromPhone('312-555-0100')).toBe('America/Chicago'); // IL (Chicago)
      expect(getTimeZoneFromPhone('512-555-0199')).toBe('America/Chicago'); // TX (Austin)
      expect(getTimeZoneFromPhone('(615) 555-0100')).toBe('America/Chicago'); // TN (Nashville)
      expect(getTimeZoneFromPhone('612-555-0100')).toBe('America/Chicago'); // MN (Minneapolis)
    });

    it('maps Mountain time area codes correctly', () => {
      expect(getTimeZoneFromPhone('303-555-0100')).toBe('America/Denver'); // CO (Denver)
      expect(getTimeZoneFromPhone('801-555-0100')).toBe('America/Denver'); // UT (Salt Lake City)
      expect(getTimeZoneFromPhone('406-555-0100')).toBe('America/Denver'); // MT
    });

    it('maps Arizona (no-DST) area codes correctly', () => {
      expect(getTimeZoneFromPhone('602-555-0100')).toBe('America/Phoenix'); // AZ (Phoenix)
      expect(getTimeZoneFromPhone('480-555-0100')).toBe('America/Phoenix'); // AZ (Mesa/Scottsdale)
      expect(getTimeZoneFromPhone('520-555-0100')).toBe('America/Phoenix'); // AZ (Tucson)
    });

    it('maps Pacific time area codes correctly', () => {
      expect(getTimeZoneFromPhone('415-555-0100')).toBe('America/Los_Angeles'); // CA (San Francisco)
      expect(getTimeZoneFromPhone('(213) 555-0199')).toBe('America/Los_Angeles'); // CA (Los Angeles)
      expect(getTimeZoneFromPhone('206-555-0100')).toBe('America/Los_Angeles'); // WA (Seattle)
      expect(getTimeZoneFromPhone('503-555-0100')).toBe('America/Los_Angeles'); // OR (Portland)
      expect(getTimeZoneFromPhone('702-555-0100')).toBe('America/Los_Angeles'); // NV (Las Vegas)
    });

    it('maps Alaska, Hawaii, and Territories correctly', () => {
      expect(getTimeZoneFromPhone('907-555-0100')).toBe('America/Anchorage'); // AK
      expect(getTimeZoneFromPhone('808-555-0100')).toBe('Pacific/Honolulu'); // HI
      expect(getTimeZoneFromPhone('787-555-0100')).toBe('America/Puerto_Rico'); // PR
    });

    it('maps Canadian area codes correctly', () => {
      expect(getTimeZoneFromPhone('416-555-0100')).toBe('America/Toronto'); // ON
      expect(getTimeZoneFromPhone('604-555-0100')).toBe('America/Vancouver'); // BC
      expect(getTimeZoneFromPhone('403-555-0100')).toBe('America/Edmonton'); // AB
    });
  });

  describe('Geographic location / address parsing', () => {
    it('parses timezone from city and state string', () => {
      expect(getTimeZoneFromLocation('Austin, TX')).toBe('America/Chicago');
      expect(getTimeZoneFromLocation('San Francisco, CA')).toBe('America/Los_Angeles');
      expect(getTimeZoneFromLocation('Seattle, WA 98101')).toBe('America/Los_Angeles');
      expect(getTimeZoneFromLocation('Miami, FL')).toBe('America/New_York');
      expect(getTimeZoneFromLocation('Denver, CO')).toBe('America/Denver');
      expect(getTimeZoneFromLocation('Phoenix, AZ')).toBe('America/Phoenix');
      expect(getTimeZoneFromLocation('Honolulu, HI')).toBe('Pacific/Honolulu');
    });

    it('parses timezone from full state names', () => {
      expect(getTimeZoneFromLocation('Los Angeles California')).toBe('America/Los_Angeles');
      expect(getTimeZoneFromLocation('Dallas Texas')).toBe('America/Chicago');
    });
  });

  describe('Hierarchical recipient timezone resolution', () => {
    it('prefers explicit recipient timezone if provided and valid', () => {
      const tz = resolveRecipientTimeZone({
        explicitTimeZone: 'America/Los_Angeles',
        phone: '212-555-0100', // Eastern phone
        accountTimeZone: 'America/Chicago',
      });
      expect(tz).toBe('America/Los_Angeles');
    });

    it('resolves timezone from recipient phone area code when explicit timezone is absent', () => {
      const tz = resolveRecipientTimeZone({
        phone: '415-555-0100', // Pacific phone
        accountTimeZone: 'America/New_York', // Eastern contractor
      });
      expect(tz).toBe('America/Los_Angeles');
    });

    it('resolves timezone from address when phone is non-US or indeterminate', () => {
      const tz = resolveRecipientTimeZone({
        phone: '12345',
        address: '100 Main St, Dallas, TX 75201',
        accountTimeZone: 'America/New_York',
      });
      expect(tz).toBe('America/Chicago');
    });

    it('falls back to account operating timezone when recipient location is unavailable', () => {
      const tz = resolveRecipientTimeZone({
        phone: '',
        accountTimeZone: 'America/Denver',
      });
      expect(tz).toBe('America/Denver');
    });

    it('defaults to America/New_York only when no location info is available', () => {
      const tz = resolveRecipientTimeZone({});
      expect(tz).toBe('America/New_York');
    });
  });

  describe('FCC TCPA Quiet Hours Evaluation (Called Party Local Time)', () => {
    it('accurately evaluates daytime vs quiet hours in target timezone', () => {
      // 2:00 PM (14:00) UTC is daytime in UTC
      const dayUtc = new Date('2026-08-31T14:00:00Z');
      expect(isWithinTcpaQuietHours(dayUtc, 'UTC')).toBe(false);

      // 11:30 PM (23:30) UTC is quiet hours in UTC (>= 21:00)
      const nightUtc = new Date('2026-08-31T23:30:00Z');
      expect(isWithinTcpaQuietHours(nightUtc, 'UTC')).toBe(true);

      // 7:45 AM UTC is quiet hours in UTC (< 8:00)
      const morningUtc = new Date('2026-08-31T07:45:00Z');
      expect(isWithinTcpaQuietHours(morningUtc, 'UTC')).toBe(true);
    });

    it('evaluates based on the CALLED PARTY local time across different time zones', () => {
      // 12:30 UTC:
      // In New York (EDT, UTC-4): 8:30 AM -> Daytime (allowed)
      // In Los Angeles (PDT, UTC-7): 5:30 AM -> Quiet Hours (prohibited)
      const morningLead = new Date('2026-08-31T12:30:00Z');

      const easternLeadQuiet = isWithinTcpaQuietHours(morningLead, 'America/New_York');
      const pacificLeadQuiet = isWithinTcpaQuietHours(morningLead, 'America/Los_Angeles');

      expect(easternLeadQuiet).toBe(false); // 8:30 AM EDT is permissible
      expect(pacificLeadQuiet).toBe(true);  // 5:30 AM PDT is prohibited under FCC TCPA

      // 01:30 UTC:
      // In New York (EDT, UTC-4): 9:30 PM (21:30) -> Quiet Hours (prohibited)
      // In Los Angeles (PDT, UTC-7): 6:30 PM (18:30) -> Daytime (allowed)
      const eveningLead = new Date('2026-08-31T01:30:00Z');

      const easternEveningQuiet = isWithinTcpaQuietHours(eveningLead, 'America/New_York');
      const pacificEveningQuiet = isWithinTcpaQuietHours(eveningLead, 'America/Los_Angeles');

      expect(easternEveningQuiet).toBe(true);  // 9:30 PM EDT is prohibited under FCC TCPA
      expect(pacificEveningQuiet).toBe(false); // 6:30 PM PDT is permissible
    });

    it('calculates exact 8:01 AM recipient-local send time for overnight leads', () => {
      // Overnight Pacific lead at 11:30 PM PDT (06:30 UTC next day)
      const overnightPdt = new Date('2026-08-31T06:30:00Z');
      const result = getTcpaCompliantSendTime(overnightPdt, 'America/Los_Angeles');

      expect(result.isDelayed).toBe(true);
      expect(result.timeZone).toBe('America/Los_Angeles');
      expect(result.reason).toContain('8:01 AM recipient-local delivery');
      expect(result.reason).toContain('America/Los_Angeles');

      // Verify that sendAt formatted in America/Los_Angeles is exactly 8:01:00 AM
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Los_Angeles',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      expect(formatter.format(result.sendAt)).toBe('08:01');
    });
  });
});
