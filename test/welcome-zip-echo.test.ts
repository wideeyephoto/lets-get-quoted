import { describe, it, expect } from 'vitest';
import {
  formatZipEcho,
  mapGeocodeToEcho,
  placeHintFor,
  isFiveDigitZip,
  ZipEchoSequenceGuard,
  type GeocodeOutcome,
} from '@/lib/welcome-zip-echo';

describe('Welcome ZIP Place Echo', () => {
  describe('isFiveDigitZip', () => {
    it('accepts standard 5-digit US postal codes', () => {
      expect(isFiveDigitZip('48226')).toBe(true);
      expect(isFiveDigitZip('90210')).toBe(true);
      expect(isFiveDigitZip(' 02138 ')).toBe(true);
    });

    it('rejects incomplete, extended, or non-numeric ZIP codes', () => {
      expect(isFiveDigitZip('')).toBe(false);
      expect(isFiveDigitZip('4822')).toBe(false);
      expect(isFiveDigitZip('482261')).toBe(false);
      expect(isFiveDigitZip('48226-1234')).toBe(false);
      expect(isFiveDigitZip('M5V2T6')).toBe(false);
      expect(isFiveDigitZip('abcde')).toBe(false);
    });
  });

  describe('formatZipEcho', () => {
    it('formats Detroit, MI into verified city echo sentence', () => {
      const echo = formatZipEcho('Detroit, MI');
      expect(echo).toEqual({
        place: 'Detroit, MI',
        cityName: 'Detroit',
        headline: 'Detroit, MI.',
        lead: "We'll write your site about Detroit and the towns around it.",
      });
    });

    it('formats Royal Oak, MI into verified city echo sentence', () => {
      const echo = formatZipEcho('Royal Oak, MI');
      expect(echo).toEqual({
        place: 'Royal Oak, MI',
        cityName: 'Royal Oak',
        headline: 'Royal Oak, MI.',
        lead: "We'll write your site about Royal Oak and the towns around it.",
      });
    });

    it('returns null for empty or invalid place inputs', () => {
      expect(formatZipEcho('')).toBeNull();
      expect(formatZipEcho('   ')).toBeNull();
      expect(formatZipEcho(null)).toBeNull();
      expect(formatZipEcho(undefined)).toBeNull();
    });
  });

  describe('mapGeocodeToEcho handling outcomes', () => {
    it('returns formatted echo sentence on successful geocode (ok: true)', () => {
      const outcome: GeocodeOutcome = { ok: true, place: 'Austin, TX' };
      const echo = mapGeocodeToEcho(outcome);
      expect(echo).not.toBeNull();
      expect(echo?.headline).toBe('Austin, TX.');
      expect(echo?.lead).toBe("We'll write your site about Austin and the towns around it.");
      expect(echo?.cityName).toBe('Austin');
    });

    it('returns null on unconfigured (e.g. missing Maps key)', () => {
      const outcome: GeocodeOutcome = { ok: false, reason: 'unconfigured' };
      expect(mapGeocodeToEcho(outcome)).toBeNull();
    });

    it('returns null on not-found', () => {
      const outcome: GeocodeOutcome = { ok: false, reason: 'not-found' };
      expect(mapGeocodeToEcho(outcome)).toBeNull();
    });

    it('returns null on too-large bounding box', () => {
      const outcome: GeocodeOutcome = { ok: false, reason: 'too-large' };
      expect(mapGeocodeToEcho(outcome)).toBeNull();
    });

    it('returns null on rate-limited or transient errors', () => {
      const outcome: GeocodeOutcome = { ok: false, reason: 'rate-limited' };
      expect(mapGeocodeToEcho(outcome)).toBeNull();
    });
  });

  describe('placeHintFor pure helper and conflict rule', () => {
    it('handles resolved outcome and overrides conflicting marketing city (ZIP wins)', () => {
      // Conflict case: /welcome?city=Austin,%20TX plus a Detroit ZIP shows Detroit only, with no mention of Austin
      const hint = placeHintFor({ ok: true, place: 'Detroit, MI' }, 'Austin, TX');
      expect(hint.outcome).toBe('resolved');
      expect(hint.isResolved).toBe(true);
      expect(hint.headline).toBe('Detroit, MI.');
      expect(hint.lead).toBe("We'll write your site about Detroit and the towns around it.");
      expect(hint.lead).not.toContain('Austin');
      expect(hint.place).toBe('Detroit, MI');
      expect(hint.cityName).toBe('Detroit');
    });

    it('handles resolved outcome with matching or empty city', () => {
      const hint = placeHintFor({ ok: true, place: 'Royal Oak, MI' }, null);
      expect(hint.outcome).toBe('resolved');
      expect(hint.isResolved).toBe(true);
      expect(hint.headline).toBe('Royal Oak, MI.');
      expect(hint.lead).toBe("We'll write your site about Royal Oak and the towns around it.");
    });

    it('handles unconfigured outcome with marketing city', () => {
      const hint = placeHintFor({ ok: false, reason: 'unconfigured' }, 'Austin, TX');
      expect(hint.outcome).toBe('unconfigured');
      expect(hint.isResolved).toBe(false);
      expect(hint.headline).toBeNull();
      expect(hint.lead).toContain('Austin, TX');
      expect(hint.lead).toContain('5-digit ZIP for accurate permit requirements');
    });

    it('handles unconfigured outcome without marketing city', () => {
      const hint = placeHintFor({ ok: false, reason: 'unconfigured' }, null);
      expect(hint.outcome).toBe('unconfigured');
      expect(hint.isResolved).toBe(false);
      expect(hint.headline).toBeNull();
      expect(hint.lead).toBe('This is what lets us write your whole site about the actual towns you serve, not "your local area".');
    });

    it('handles not-found outcome', () => {
      const hint = placeHintFor({ ok: false, reason: 'not-found' }, null);
      expect(hint.outcome).toBe('not-found');
      expect(hint.isResolved).toBe(false);
      expect(hint.headline).toBeNull();
      expect(hint.lead).toBe('This is what lets us write your whole site about the actual towns you serve, not "your local area".');
    });

    it('handles too-large outcome', () => {
      const hint = placeHintFor({ ok: false, reason: 'too-large' }, 'Austin, TX');
      expect(hint.outcome).toBe('too-large');
      expect(hint.isResolved).toBe(false);
      expect(hint.headline).toBeNull();
      expect(hint.lead).toContain('Austin, TX');
    });
  });

  describe('ZipEchoSequenceGuard race condition prevention', () => {
    it('accepts only the latest request sequence and discards stale out-of-order responses', () => {
      const guard = new ZipEchoSequenceGuard();
      const firstReq = guard.next();
      const secondReq = guard.next();

      expect(firstReq).toBe(1);
      expect(secondReq).toBe(2);

      // Suppose firstReq resolves after secondReq
      expect(guard.isLatest(firstReq)).toBe(false);
      // secondReq is the newest request
      expect(guard.isLatest(secondReq)).toBe(true);
    });
  });
});
