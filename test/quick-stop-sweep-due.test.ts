import { describe, it, expect } from 'vitest';
import { quickStopSweepDue, type SweepCandidate } from '../src/lib/quick-stop-sweep';

/**
 * The Quick Stops page runs the expiry sweep lazily so an owner's queue is
 * current between cron runs. It used to run on EVERY load — three SELECTs and a
 * write loop before the page read anything of its own, and its payment branch
 * emails the contractor, so an idle sweep was never free.
 *
 * This predicate decides whether the sweep would do anything, from rows the
 * page has already loaded. The dangerous direction is a FALSE NEGATIVE: say no
 * when a row was eligible and the offer quietly stops expiring on the screen
 * the owner is looking at. Every branch below is one the sweep itself acts on.
 */

const NOW = new Date('2026-08-15T18:00:00.000Z');
const past = '2026-08-15T17:00:00.000Z';
const future = '2026-08-15T19:00:00.000Z';

const row = (over: Partial<SweepCandidate>): SweepCandidate => ({ status: 'awaiting_contractor', ...over });

describe('quickStopSweepDue', () => {
  it('is false with nothing loaded', () => {
    expect(quickStopSweepDue([], NOW)).toBe(false);
  });

  describe('the payment window', () => {
    it('is due once the deadline has passed', () => {
      expect(quickStopSweepDue([row({ status: 'awaiting_customer_payment', payment_deadline_at: past })], NOW)).toBe(true);
    });
    it('is not due while the customer still has time', () => {
      expect(quickStopSweepDue([row({ status: 'awaiting_customer_payment', payment_deadline_at: future })], NOW)).toBe(false);
    });
    it('is not due when the deadline was never set', () => {
      expect(quickStopSweepDue([row({ status: 'awaiting_customer_payment', payment_deadline_at: null })], NOW)).toBe(false);
    });
  });

  describe('the contractor response window', () => {
    for (const status of ['awaiting_contractor', 'more_information_requested']) {
      it(`is due for ${status} once the deadline has passed`, () => {
        expect(quickStopSweepDue([row({ status, response_deadline_at: past })], NOW)).toBe(true);
      });
    }
    it('is not due while the contractor still has time', () => {
      expect(quickStopSweepDue([row({ status: 'awaiting_contractor', response_deadline_at: future })], NOW)).toBe(false);
    });
  });

  describe('auto-completion after the arrival window', () => {
    // The sweep gives the customer two hours after the window to report a
    // no-show before assuming the visit happened.
    const arrived = (over: Partial<SweepCandidate> = {}) =>
      row({ status: 'confirmed', arrival_date: '2026-08-15', arrival_end: '12:00', ...over });

    it('is due once the window plus the two-hour grace has elapsed', () => {
      // Window ended 12:00 local; NOW is well past 14:00 in the test's zone.
      expect(quickStopSweepDue([arrived()], new Date('2026-08-15T23:00:00.000Z'))).toBe(true);
    });

    it('is not due inside the grace period', () => {
      expect(quickStopSweepDue([arrived({ arrival_end: '23:30' })], new Date('2026-08-15T23:00:00.000Z'))).toBe(false);
    });

    it('leaves a reported no-show alone — that is for resolution, not the sweep', () => {
      expect(
        quickStopSweepDue([arrived({ no_show_reported_at: past })], new Date('2026-08-15T23:00:00.000Z')),
      ).toBe(false);
    });

    it('ignores a visit booked for a later day', () => {
      expect(
        quickStopSweepDue([arrived({ arrival_date: '2026-09-01' })], new Date('2026-08-15T23:00:00.000Z')),
      ).toBe(false);
    });
  });

  it('ignores rows in a settled state', () => {
    const settled = ['completed', 'offer_expired', 'declined', 'cancelled', 'disputed'].map((status) =>
      row({ status, payment_deadline_at: past, response_deadline_at: past }),
    );
    expect(quickStopSweepDue(settled, NOW)).toBe(false);
  });

  it('finds the one eligible row in a queue of settled ones', () => {
    const queue: SweepCandidate[] = [
      row({ status: 'completed' }),
      row({ status: 'declined' }),
      row({ status: 'awaiting_customer_payment', payment_deadline_at: past }),
      row({ status: 'completed' }),
    ];
    expect(quickStopSweepDue(queue, NOW)).toBe(true);
  });
});
