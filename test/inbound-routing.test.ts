import { describe, it, expect } from 'vitest';
import { pickInboundAccount, type InboundRouteCandidate } from '@/lib/messages';

// Getting a customer's reply to the right contractor.
//
// Everyone sends from one shared platform number, so an inbound text carries
// the customer's number and nothing that says who it is for. The failure is not
// cosmetic: a message delivered to the wrong account is a stranger reading what
// somebody wrote about their house, and neither of them ever finds out.

function candidate(over: Partial<InboundRouteCandidate> & { accountId: string }): InboundRouteCandidate {
  return { lastMessageAt: null, consentUpdatedAt: null, ...over };
}

describe('pickInboundAccount', () => {
  it('lets the number it was sent to settle it outright', () => {
    // Not a signal to weigh — an answer. Nothing below can overrule it.
    const picked = pickInboundAccount(
      [
        candidate({ accountId: 'talking-to-them', lastMessageAt: '2026-08-04T10:00:00Z' }),
        candidate({ accountId: 'owns-the-number', consentUpdatedAt: '2020-01-01T00:00:00Z' }),
      ],
      'owns-the-number',
    );
    expect(picked).toBe('owns-the-number');
  });

  it('prefers who they were last actually talking to', () => {
    // THE BUG. sms_consent.updated_at is written by creating a job or requesting
    // a payment — not by talking to anybody. Contractor A texts a homeowner;
    // contractor B, who also knows them, creates a job for them the next day;
    // the homeowner replies to A and B receives it.
    const picked = pickInboundAccount([
      candidate({ accountId: 'A-texted-them', lastMessageAt: '2026-08-03T09:00:00Z', consentUpdatedAt: '2026-07-01T00:00:00Z' }),
      candidate({ accountId: 'B-made-a-job', consentUpdatedAt: '2026-08-04T09:00:00Z' }),
    ]);
    expect(picked).toBe('A-texted-them');
  });

  it('takes the most recent conversation when several are talking to them', () => {
    const picked = pickInboundAccount([
      candidate({ accountId: 'older', lastMessageAt: '2026-08-01T09:00:00Z' }),
      candidate({ accountId: 'newest', lastMessageAt: '2026-08-04T08:30:00Z' }),
      candidate({ accountId: 'middle', lastMessageAt: '2026-08-02T09:00:00Z' }),
    ]);
    expect(picked).toBe('newest');
  });

  it('falls back to consent only when nobody has ever messaged them', () => {
    // A first-ever inbound from a number one contractor has consent for. There
    // is no conversation to belong to, so consent is the only signal there is.
    const picked = pickInboundAccount([
      candidate({ accountId: 'old-consent', consentUpdatedAt: '2026-01-01T00:00:00Z' }),
      candidate({ accountId: 'new-consent', consentUpdatedAt: '2026-08-01T00:00:00Z' }),
    ]);
    expect(picked).toBe('new-consent');
  });

  it('never invents a recipient', () => {
    // Better no thread than somebody else's thread.
    expect(pickInboundAccount([])).toBeNull();
    expect(pickInboundAccount([candidate({ accountId: 'knows-nothing' })])).toBeNull();
    expect(pickInboundAccount([], null)).toBeNull();
  });

  it('routes on the number even when nothing else is known at all', () => {
    // The state every account is in until numbers are provisioned — and the
    // reason the To check comes first rather than last.
    expect(pickInboundAccount([], 'owns-the-number')).toBe('owns-the-number');
  });

  it('ignores an account with only a consent row once anyone is talking', () => {
    const picked = pickInboundAccount([
      candidate({ accountId: 'consent-only', consentUpdatedAt: '2026-08-04T23:59:00Z' }),
      candidate({ accountId: 'talking', lastMessageAt: '2026-07-01T09:00:00Z' }),
    ]);
    expect(picked).toBe('talking');
  });
});
