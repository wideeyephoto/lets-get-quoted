import { describe, it, expect } from 'vitest';
import {
  savingFromRemoving,
  rankDaySuggestions,
  isWorthMoving,
  dayWord,
  draftRescheduleBody,
  composeRescheduleMessage,
  rescheduleBodyProblem,
  discountProblem,
  storedWindowLabel,
  discountAmount,
  type CandidateDay
} from '@/lib/reschedule-offers';

describe('Reschedule Offers Lib', () => {
  describe('savingFromRemoving', () => {
    it('returns zero if no stop', () => {
      const res = savingFromRemoving({ stop: null, previous: { lat: 0, lng: 0 }, next: null });
      expect(res.miles).toBe(0);
      expect(res.minutes).toBe(0);
    });

    it('calculates savings correctly', () => {
      // Points in a line for easy math
      const prev = { lat: 0, lng: 0 };
      const stop = { lat: 1, lng: 0 }; // Approx 69 miles from prev
      const next = { lat: 2, lng: 0 }; // Approx 69 miles from stop, 138 from prev
      
      const res = savingFromRemoving({ previous: prev, stop, next });
      // Inbound = 69, outbound = 69. Total = 138.
      // Bridged (prev to next) = 138.
      // Saved = 0
      expect(Math.abs(res.miles)).toBeLessThan(1);
    });
  });

  describe('rankDaySuggestions', () => {
    it('returns empty if no coordinates', () => {
      const res = rankDaySuggestions({ at: null, days: [] });
      expect(res).toEqual([]);
    });

    it('filters days and ranks by distance', () => {
      const at = { lat: 0, lng: 0 };
      const days: CandidateDay[] = [
        {
          dateKey: '2023-01-01',
          anchors: [], // filtered out (no anchors)
          openWindows: [{ startMinutes: 480, endMinutes: 720 }]
        },
        {
          dateKey: '2023-01-02',
          anchors: [{ lat: 10, lng: 10 }], // filtered out (too far)
          openWindows: [{ startMinutes: 480, endMinutes: 720 }]
        },
        {
          dateKey: '2023-01-03',
          anchors: [{ lat: 0.01, lng: 0.01 }], // close enough
          openWindows: [{ startMinutes: 480, endMinutes: 720 }, { startMinutes: 600, endMinutes: 720 }] // takes largest window (240 min)
        },
        {
          dateKey: '2023-01-04',
          anchors: [{ lat: 0.005, lng: 0.005 }], // closer, should rank first
          openWindows: [{ startMinutes: 480, endMinutes: 720 }]
        }
      ];

      const res = rankDaySuggestions({ at, days });
      expect(res).toHaveLength(2);
      expect(res[0].dateKey).toBe('2023-01-04'); // closer
      expect(res[1].dateKey).toBe('2023-01-03');
      expect(res[1].window.startMinutes).toBe(480); // largest window chosen
    });
  });

  describe('isWorthMoving', () => {
    it('checks threshold', () => {
      expect(isWorthMoving({ minutes: 19 })).toBe(false);
      expect(isWorthMoving({ minutes: 20 })).toBe(true);
    });
  });

  describe('dayWord', () => {
    it('formats days appropriately', () => {
      expect(dayWord('2023-05-02', '2023-05-01')).toBe('tomorrow');
      expect(dayWord('2023-05-05', '2023-05-01')).toBe('Friday');
      expect(dayWord('2023-05-15', '2023-05-01')).toBe('Monday, May 15');
    });
  });

  describe('draftRescheduleBody', () => {
    it('formats body with all inputs', () => {
      const body = draftRescheduleBody({
        clientName: 'Alice',
        fromWord: 'tomorrow',
        toWord: 'Friday',
        windowLabel: 'Morning',
        discountPercent: 15
      });
      expect(body).toContain('Alice');
      expect(body).toContain('tomorrow');
      expect(body).toContain('Friday, Morning');
      expect(body).toContain('15%');
    });
  });

  describe('composeRescheduleMessage', () => {
    it('adds instruction and opt out', () => {
      const res = composeRescheduleMessage('My Biz', 'The body');
      expect(res).toBe('My Biz: The body Reply YES to move it or NO to keep your original time. Reply STOP to opt out.');
    });
  });

  describe('rescheduleBodyProblem', () => {
    it('validates body', () => {
      expect(rescheduleBodyProblem('   ')).toMatch(/Write what you want/);
      expect(rescheduleBodyProblem('a'.repeat(321))).toMatch(/keep it under/);
      expect(rescheduleBodyProblem('fine')).toBeNull();
    });
  });

  describe('discountProblem', () => {
    it('validates discount', () => {
      expect(discountProblem(NaN)).toMatch(/not a number/);
      expect(discountProblem(0)).toMatch(/needs a discount/);
      expect(discountProblem(50)).toMatch(/more than the 40% cap/);
      expect(discountProblem(10)).toBeNull();
    });
  });

  describe('storedWindowLabel', () => {
    it('formats window label', () => {
      expect(storedWindowLabel({ window_start: '08:00:00', window_end: '12:00:00' })).toBe('8:00 AM to 12:00 PM');
      expect(storedWindowLabel({ window_start: 'null', window_end: 'null' })).toBe('');
    });
  });

  describe('discountAmount', () => {
    it('computes amount based on percent', () => {
      expect(discountAmount(1000, 15)).toBe(150);
      expect(discountAmount(0, 10)).toBe(0);
      expect(discountAmount(500, 0)).toBe(0);
    });
  });
});
