import { describe, expect, it } from 'vitest';
import { buildReferralQueue, quickStopReferralStatus, type ReferralQueueLead } from '@/lib/referral-queue';

/**
 * The queue is the whole owner-facing feature, and it is derived — there is no
 * referrals table to be the source of truth, so these rules ARE the source of
 * truth. The two that matter are both about paying somebody twice: one person
 * who inquired twice is one debt, and the same person arriving through two
 * different friends is two.
 */

const REFERRER = 'aaaaaaaa-0000-0000-0000-000000000001';
const OTHER_REFERRER = 'aaaaaaaa-0000-0000-0000-000000000002';

let seq = 0;
function lead(over: Partial<ReferralQueueLead> = {}): ReferralQueueLead {
  seq += 1;
  return {
    id: `lead-${seq}`,
    name: 'Dana Reyes',
    phone: null,
    email: null,
    status: 'new',
    client_id: null,
    created_at: `2026-08-0${seq}T10:00:00.000Z`,
    referral_settled_at: null,
    ...over,
  };
}

const allTo = (referrer: string) => () => referrer;
const noNames = () => null;

describe('stages', () => {
  it('is waiting until the work is won', () => {
    const queue = buildReferralQueue([lead({ status: 'contacted' })], allTo(REFERRER), noNames);
    expect(queue.waiting).toHaveLength(1);
    expect(queue.owed).toHaveLength(0);
  });

  it('is owed once the lead is won', () => {
    const queue = buildReferralQueue([lead({ status: 'won' })], allTo(REFERRER), noNames);
    expect(queue.owed).toHaveLength(1);
    expect(queue.owed[0].stage).toBe('booked');
  });

  it('leaves the owed list once it is settled', () => {
    const queue = buildReferralQueue([lead({ status: 'won', referral_settled_at: '2026-08-09T00:00:00.000Z' })], allTo(REFERRER), noNames);
    expect(queue.owed).toHaveLength(0);
    expect(queue.thanked).toHaveLength(1);
    expect(queue.thanked[0].settledAt).toBe('2026-08-09T00:00:00.000Z');
  });

  it('ignores a lead nobody referred', () => {
    const queue = buildReferralQueue([lead({ status: 'won' })], () => null, noNames);
    expect(queue.owed).toHaveLength(0);
    expect(queue.waiting).toHaveLength(0);
    expect(queue.thanked).toHaveLength(0);
  });
});

describe('one person is one debt', () => {
  it('collapses two inquiries from the same client into a single row', () => {
    const rows = [
      lead({ client_id: 'client-1', status: 'new' }),
      lead({ client_id: 'client-1', status: 'won' }),
    ];
    const queue = buildReferralQueue(rows, allTo(REFERRER), noNames);
    expect(queue.owed).toHaveLength(1);
    expect(queue.waiting).toHaveLength(0);
    // Both leads travel together, so settling stamps both — the second cannot
    // reappear as a fresh debt tomorrow.
    expect(queue.owed[0].leadIds).toHaveLength(2);
  });

  it('collapses on phone when the client link has not been written yet', () => {
    const rows = [
      lead({ phone: '(555) 123-4567', status: 'new' }),
      lead({ phone: '555-123-4567', status: 'won' }),
    ];
    expect(buildReferralQueue(rows, allTo(REFERRER), noNames).owed[0].leadIds).toHaveLength(2);
  });

  it('collapses on email regardless of case and padding', () => {
    const rows = [
      lead({ email: 'Dana@Example.com', status: 'new' }),
      lead({ email: '  dana@example.com ', status: 'won' }),
    ];
    expect(buildReferralQueue(rows, allTo(REFERRER), noNames).owed[0].leadIds).toHaveLength(2);
  });

  it('never collapses two anonymous leads into one person', () => {
    const rows = [lead({ name: null, status: 'won' }), lead({ name: null, status: 'won' })];
    expect(buildReferralQueue(rows, allTo(REFERRER), noNames).owed).toHaveLength(2);
  });

  /*
   * The premise of the old first-match key — "client_id is always there,
   * because intake deduped them" — is false twice over. findOrCreateClientId
   * looks up by phone only when a phone was given and by email only when an
   * email was, with no cross-match; and createLead's client link is
   * best-effort and swallowed. Either way the group split and the owner was
   * shown the same debt twice.
   */
  it('joins leads that share ANY signal, not just the first one', () => {
    const rows = [
      lead({ client_id: 'client-1', phone: '(555) 123-4567', email: null, status: 'new' }),
      lead({ client_id: null, phone: '555-123-4567', email: null, status: 'won' }),
    ];
    const queue = buildReferralQueue(rows, allTo(REFERRER), noNames);
    expect(queue.owed).toHaveLength(1);
    expect(queue.waiting).toHaveLength(0);
    expect(queue.owed[0].leadIds).toHaveLength(2);
  });

  it('chains through a shared signal even when the ends have nothing in common', () => {
    // phone-only <- both -> email-only. The middle lead is what joins them.
    const rows = [
      lead({ client_id: null, phone: '(555) 123-4567', email: null, status: 'new' }),
      lead({ client_id: null, phone: '555-123-4567', email: 'dana@example.com', status: 'new' }),
      lead({ client_id: null, phone: null, email: 'dana@example.com', status: 'won' }),
    ];
    const queue = buildReferralQueue(rows, allTo(REFERRER), noNames);
    expect(queue.owed).toHaveLength(1);
    expect(queue.owed[0].leadIds).toHaveLength(3);
  });

  it('still keeps two genuinely unrelated people apart', () => {
    const rows = [
      lead({ client_id: 'client-1', phone: '(555) 111-1111', email: 'a@example.com', status: 'won' }),
      lead({ client_id: 'client-2', phone: '(555) 222-2222', email: 'b@example.com', status: 'won' }),
    ];
    expect(buildReferralQueue(rows, allTo(REFERRER), noNames).owed).toHaveLength(2);
  });

  it('counts one settled lead as settling the whole group', () => {
    const rows = [
      lead({ client_id: 'client-1', status: 'won', referral_settled_at: '2026-08-09T00:00:00.000Z' }),
      lead({ client_id: 'client-1', status: 'won' }),
    ];
    const queue = buildReferralQueue(rows, allTo(REFERRER), noNames);
    expect(queue.owed).toHaveLength(0);
    expect(queue.thanked).toHaveLength(1);
  });
});

describe('the same person through two different friends is two referrals', () => {
  it('does not merge across referrers', () => {
    const first = lead({ client_id: 'client-1', status: 'won' });
    const second = lead({ client_id: 'client-1', status: 'won' });
    const queue = buildReferralQueue(
      [first, second],
      (l) => (l.id === first.id ? REFERRER : OTHER_REFERRER),
      noNames,
    );
    expect(queue.owed).toHaveLength(2);
  });
});

describe('nobody refers themselves', () => {
  /*
   * Every recipient of a referral campaign is sent their own link, so the
   * cheapest way to fake a reward is to click it and book. The dedupe at intake
   * is what makes it catchable: the booking matches back to the same client row
   * the code was minted for.
   */
  it('drops a lead whose referrer is the referred client', () => {
    const queue = buildReferralQueue([lead({ client_id: REFERRER, status: 'won' })], allTo(REFERRER), noNames);
    expect(queue.owed).toHaveLength(0);
    expect(queue.waiting).toHaveLength(0);
    expect(queue.thanked).toHaveLength(0);
  });

  it('keeps a genuine referral from the same referrer alongside it', () => {
    const rows = [
      lead({ client_id: REFERRER, status: 'won' }),
      lead({ client_id: 'someone-else', status: 'won' }),
    ];
    expect(buildReferralQueue(rows, allTo(REFERRER), noNames).owed).toHaveLength(1);
  });
});

describe('dead referrals do not sit in the list forever', () => {
  it('drops one whose every inquiry was lost', () => {
    const rows = [lead({ client_id: 'client-1', status: 'lost' }), lead({ client_id: 'client-1', status: 'lost' })];
    const queue = buildReferralQueue(rows, allTo(REFERRER), noNames);
    expect(queue.waiting).toHaveLength(0);
    expect(queue.owed).toHaveLength(0);
  });

  it('keeps it when one inquiry was lost and another was won', () => {
    const rows = [lead({ client_id: 'client-1', status: 'lost' }), lead({ client_id: 'client-1', status: 'won' })];
    expect(buildReferralQueue(rows, allTo(REFERRER), noNames).owed).toHaveLength(1);
  });

  it('keeps an already-thanked one on the record even if it later went lost', () => {
    const rows = [lead({ client_id: 'client-1', status: 'lost', referral_settled_at: '2026-08-09T00:00:00.000Z' })];
    expect(buildReferralQueue(rows, allTo(REFERRER), noNames).thanked).toHaveLength(1);
  });
});

describe('Quick Stop is the other rail into the same queue', () => {
  /*
   * A referral link lands on a booking page offering two paths, and only one
   * makes a lead. A referred customer who takes the priority-visit path is
   * revenue like any other, so it belongs in the same list — but settling has
   * to stamp the right table, which is what `source` is for.
   */
  const stop = (over: Partial<ReferralQueueLead> = {}) => lead({ source: 'quick_stop', ...over });

  it('maps paid-and-onwards to won, and dead ends to lost', () => {
    for (const s of ['confirmed', 'en_route', 'arrived', 'completed']) expect(quickStopReferralStatus(s)).toBe('won');
    for (const s of ['contractor_declined', 'offer_expired', 'customer_declined', 'customer_canceled', 'contractor_canceled', 'no_show_confirmed', 'refunded'])
      expect(quickStopReferralStatus(s)).toBe('lost');
    // Still a live negotiation: nothing is owed yet, and it is not dead either.
    for (const s of ['requested', 'awaiting_contractor', 'contractor_offer_sent', 'awaiting_customer_payment', 'disputed'])
      expect(quickStopReferralStatus(s)).toBe('open');
  });

  it('owes for a Quick Stop that was paid for, and reports it under stopIds', () => {
    const queue = buildReferralQueue([stop({ client_id: 'client-1', status: 'won' })], allTo(REFERRER), noNames);
    expect(queue.owed).toHaveLength(1);
    expect(queue.owed[0].stopIds).toHaveLength(1);
    expect(queue.owed[0].leadIds).toHaveLength(0);
  });

  it('collapses a lead and a Quick Stop from the same person into ONE debt', () => {
    const rows = [
      lead({ client_id: 'client-1', status: 'new' }),
      stop({ client_id: 'client-1', status: 'won' }),
    ];
    const queue = buildReferralQueue(rows, allTo(REFERRER), noNames);
    expect(queue.owed).toHaveLength(1);
    expect(queue.waiting).toHaveLength(0);
    // Both ids travel together, so one press settles both tables — otherwise
    // the unstamped half comes back tomorrow as a fresh debt.
    expect(queue.owed[0].leadIds).toHaveLength(1);
    expect(queue.owed[0].stopIds).toHaveLength(1);
  });

  it('joins them on a shared phone when neither carries a client id yet', () => {
    const rows = [
      lead({ client_id: null, phone: '(555) 123-4567', status: 'new' }),
      stop({ client_id: null, phone: '555-123-4567', status: 'won' }),
    ];
    const queue = buildReferralQueue(rows, allTo(REFERRER), noNames);
    expect(queue.owed).toHaveLength(1);
    expect(queue.owed[0].leadIds).toHaveLength(1);
    expect(queue.owed[0].stopIds).toHaveLength(1);
  });

  it('will not credit a referrer for their own Quick Stop', () => {
    const queue = buildReferralQueue([stop({ client_id: REFERRER, status: 'won' })], allTo(REFERRER), noNames);
    expect(queue.owed).toHaveLength(0);
  });

  it('settles the whole group when either half carries the stamp', () => {
    const rows = [
      lead({ client_id: 'client-1', status: 'won' }),
      stop({ client_id: 'client-1', status: 'won', referral_settled_at: '2026-08-09T00:00:00.000Z' }),
    ];
    const queue = buildReferralQueue(rows, allTo(REFERRER), noNames);
    expect(queue.owed).toHaveLength(0);
    expect(queue.thanked).toHaveLength(1);
  });
});

describe('presentation', () => {
  it('names the referrer, and survives one whose client row is gone', () => {
    const queue = buildReferralQueue([lead({ status: 'won' })], allTo(REFERRER), (id) => (id === REFERRER ? 'Sam Okafor' : null));
    expect(queue.owed[0].referrerName).toBe('Sam Okafor');

    const orphan = buildReferralQueue([lead({ status: 'won' })], allTo(REFERRER), noNames);
    // The name is what is missing, not the obligation.
    expect(orphan.owed[0].referrerName).toBe('A past customer');
  });

  it('falls back when the referred person left no name', () => {
    const queue = buildReferralQueue([lead({ name: null, status: 'won' })], allTo(REFERRER), noNames);
    expect(queue.owed[0].referredName).toBe('Someone they sent');
  });

  it('puts the oldest debt first', () => {
    const rows = [
      lead({ client_id: 'c-new', status: 'won', created_at: '2026-08-20T00:00:00.000Z' }),
      lead({ client_id: 'c-old', status: 'won', created_at: '2026-06-01T00:00:00.000Z' }),
    ];
    const queue = buildReferralQueue(rows, allTo(REFERRER), noNames);
    expect(queue.owed.map((row) => row.introducedAt)).toEqual(['2026-06-01T00:00:00.000Z', '2026-08-20T00:00:00.000Z']);
  });

  it('dates the row from the first inquiry, not the last', () => {
    const rows = [
      lead({ client_id: 'client-1', status: 'won', created_at: '2026-07-02T00:00:00.000Z' }),
      lead({ client_id: 'client-1', status: 'new', created_at: '2026-06-01T00:00:00.000Z' }),
    ];
    expect(buildReferralQueue(rows, allTo(REFERRER), noNames).owed[0].introducedAt).toBe('2026-06-01T00:00:00.000Z');
  });
});
