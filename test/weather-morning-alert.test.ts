import { describe, it, expect } from 'vitest';
import {
  isMorningWeatherAlertWindow,
  buildMorningWeatherAlertText,
  runWeatherMorningAlerts,
} from '@/lib/weather-morning-alert';
import { sendWeatherMorningAlertSms } from '@/lib/sms';
import { SMS_CATALOGUE, CATALOGUE_SENDERS } from '@/lib/sms-catalogue';

describe('6:45 AM Morning Weather Alert', () => {
  describe('isMorningWeatherAlertWindow', () => {
    it('matches the 6:45 AM - 7:14 AM morning dispatch window', () => {
      expect(isMorningWeatherAlertWindow('06:45')).toBe(true);
      expect(isMorningWeatherAlertWindow('06:50')).toBe(true);
      expect(isMorningWeatherAlertWindow('07:00')).toBe(true);
      expect(isMorningWeatherAlertWindow('07:14')).toBe(true);
    });

    it('rejects times outside the morning dispatch window', () => {
      expect(isMorningWeatherAlertWindow('06:00')).toBe(false);
      expect(isMorningWeatherAlertWindow('06:44')).toBe(false);
      expect(isMorningWeatherAlertWindow('07:15')).toBe(false);
      expect(isMorningWeatherAlertWindow('08:00')).toBe(false);
      expect(isMorningWeatherAlertWindow('18:00')).toBe(false);
    });
  });

  describe('buildMorningWeatherAlertText', () => {
    it('formats single job morning alert text cleanly', () => {
      const text = buildMorningWeatherAlertText({
        businessName: 'Summit Roofing',
        jobCount: 1,
        clientNames: ['Sarah Connor'],
        reasons: ['80% chance of rain', '1.1in precipitation'],
        scheduleUrl: 'https://app.letsgetquoted.com/dashboard/schedule?weather=check',
      });

      expect(text).toContain('⛈️ Morning Weather Alert (6:45 AM)');
      expect(text).toContain('1 scheduled job');
      expect(text).toContain('Summit Roofing: Sarah Connor');
      expect(text).toContain('80% chance of rain');
      expect(text).toContain('before crews roll');
      expect(text).toContain('https://app.letsgetquoted.com/dashboard/schedule?weather=check');
    });

    it('formats multiple jobs with pluralization and capping', () => {
      const text = buildMorningWeatherAlertText({
        businessName: 'Evergreen Lawn',
        jobCount: 4,
        clientNames: ['Alice', 'Bob', 'Charlie', 'Diana'],
        reasons: ['High wind gusts 45mph'],
        scheduleUrl: 'https://app.letsgetquoted.com/dashboard/schedule?weather=check',
      });

      expect(text).toContain('4 scheduled jobs');
      expect(text).toContain('Alice, Bob, Charlie +1 more');
      expect(text).toContain('High wind gusts 45mph');
    });
  });

  describe('SMS Catalogue and Sender Registration', () => {
    it('registers sendWeatherMorningAlertSms in CATALOGUE_SENDERS', () => {
      expect(CATALOGUE_SENDERS).toContain('sendWeatherMorningAlertSms');
    });

    it('has a verified entry in SMS_CATALOGUE under owner audience', () => {
      const entry = SMS_CATALOGUE.find((e) => e.id === 'weather-morning-alert');
      expect(entry).toBeDefined();
      expect(entry?.audience).toBe('owner');
      expect(entry?.title).toContain('6:45 AM');
      expect(entry?.body).toContain('Morning Weather Alert (6:45 AM)');
    });
  });
});
