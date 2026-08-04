import { describe, it, expect } from 'vitest';
import {
  reviewRoutes,
  reviewAcknowledgement,
  summariseReviewInvites,
  isReviewRating,
  googleReviewUrl,
  reviewRequestText,
  REVIEW_RATINGS,
  type ReviewInviteRow,
} from '@/lib/review-routing';

const GOOGLE = 'https://g.page/r/example/review';

function row(overrides: Partial<ReviewInviteRow> = {}): ReviewInviteRow {
  return {
    id: 'r1',
    job_id: null,
    client_name: null,
    rating: null,
    feedback: null,
    google_clicked_at: null,
    feedback_at: null,
    responded_at: null,
    routed_to: null,
    ...overrides,
  };
}

describe('reviewRoutes — the anti-gating guard', () => {
  it('offers exactly the same routes no matter how the job went', () => {
    // reviewRoutes takes no rating, so it cannot branch on one. This test is the
    // written-down version of that: if someone ever threads a rating through and
    // closes the public door on a bad one, it fails here.
    const seen = [null, ...REVIEW_RATINGS].map(() => reviewRoutes({ googleUrl: GOOGLE }));
    for (const routes of seen) {
      expect(routes).toEqual({ googleUrl: GOOGLE, privateFeedback: true });
    }
  });

  it('always offers the private route, even with no public destination configured', () => {
    expect(reviewRoutes({ googleUrl: null })).toEqual({ googleUrl: null, privateFeedback: true });
    expect(reviewRoutes({ googleUrl: '   ' })).toEqual({ googleUrl: null, privateFeedback: true });
    expect(reviewRoutes({ googleUrl: undefined })).toEqual({ googleUrl: null, privateFeedback: true });
  });

  it('trims a stored URL rather than emitting a broken link', () => {
    expect(reviewRoutes({ googleUrl: `  ${GOOGLE} ` }).googleUrl).toBe(GOOGLE);
  });
});

describe('reviewAcknowledgement — the only thing a rating may change', () => {
  it('answers every rating, and the unrated first view', () => {
    for (const rating of [null, ...REVIEW_RATINGS]) {
      const ack = reviewAcknowledgement(rating, 'BrokePipes');
      expect(ack.title.length).toBeGreaterThan(0);
      expect(ack.lead.length).toBeGreaterThan(0);
    }
  });

  it('acknowledges a bad experience without withdrawing the public option', () => {
    const low = reviewAcknowledgement(1, 'BrokePipes');
    expect(low.title).toMatch(/missed the mark/i);
    // The lead must still name posting publicly as an option.
    expect(low.lead).toMatch(/publicly/i);
  });

  it('falls back to a neutral name when the business has none', () => {
    expect(reviewAcknowledgement(5, '   ').lead).toContain('your contractor');
  });

  it('treats junk ratings as unrated rather than throwing', () => {
    expect(reviewAcknowledgement(0, 'X').title).toBe('How did we do?');
    expect(reviewAcknowledgement(9, 'X').title).toBe('How did we do?');
    expect(reviewAcknowledgement(4.5, 'X').title).toBe('How did we do?');
    expect(isReviewRating(3)).toBe(true);
    expect(isReviewRating('3')).toBe(false);
  });
});

describe('summariseReviewInvites', () => {
  it('returns an honest empty summary with no invites', () => {
    const s = summariseReviewInvites([]);
    expect(s.totalInvites).toBe(0);
    expect(s.responseRate).toBe(0);
    expect(s.avgRating).toBeNull();
    expect(s.recentPrivate).toEqual([]);
  });

  it('averages only the rows that carry a rating', () => {
    const s = summariseReviewInvites([
      row({ id: 'a', rating: 5 }),
      row({ id: 'b', rating: 3 }),
      row({ id: 'c' }), // asked, never answered
    ]);
    expect(s.avgRating).toBe(4);
    expect(s.starCounts[5]).toBe(1);
    expect(s.starCounts[3]).toBe(1);
    expect(s.responded).toBe(2);
    expect(s.totalInvites).toBe(3);
  });

  it('counts a customer who did both — impossible under the old gate', () => {
    const s = summariseReviewInvites([
      row({ id: 'a', rating: 2, feedback: 'Left a mess', feedback_at: '2026-08-03T10:00:00Z', google_clicked_at: '2026-08-03T10:05:00Z' }),
    ]);
    expect(s.googleCount).toBe(1);
    expect(s.privateCount).toBe(1);
    expect(s.bothCount).toBe(1);
    expect(s.responded).toBe(1);
  });

  it('still counts pre-migration rows that only have routed_to', () => {
    const s = summariseReviewInvites([
      row({ id: 'a', rating: 5, routed_to: 'google', responded_at: '2026-07-01T00:00:00Z' }),
      row({ id: 'b', rating: 2, routed_to: 'private', feedback: 'Late twice', responded_at: '2026-07-02T00:00:00Z' }),
    ]);
    expect(s.googleCount).toBe(1);
    expect(s.privateCount).toBe(1);
    expect(s.bothCount).toBe(0);
    expect(s.responded).toBe(2);
    expect(s.recentPrivate).toHaveLength(1);
    expect(s.recentPrivate[0].respondedAt).toBe('2026-07-02T00:00:00Z');
  });

  it('does not count a legacy private row that never carried feedback', () => {
    // The old flow stamped routed_to='private' on the rating and left the row
    // open until the note arrived. Those are unanswered, not private feedback.
    const s = summariseReviewInvites([row({ id: 'a', rating: 2, routed_to: 'private', feedback: null })]);
    expect(s.privateCount).toBe(0);
    expect(s.recentPrivate).toEqual([]);
    expect(s.responded).toBe(1); // they did rate
  });

  it('counts a public click from someone who never rated', () => {
    const s = summariseReviewInvites([row({ id: 'a', google_clicked_at: '2026-08-03T10:00:00Z' })]);
    expect(s.responded).toBe(1);
    expect(s.responseRate).toBe(1);
    expect(s.avgRating).toBeNull();
  });

  it('caps the private feedback list without distorting the count', () => {
    const rows = Array.from({ length: 40 }, (_, i) =>
      row({ id: `r${i}`, rating: 2, feedback: `note ${i}`, feedback_at: '2026-08-03T10:00:00Z' }),
    );
    const s = summariseReviewInvites(rows);
    expect(s.privateCount).toBe(40);
    expect(s.recentPrivate).toHaveLength(25);
  });
});

describe('googleReviewUrl — where the ask points', () => {
  it('prefers the Place ID, which opens the review box itself', () => {
    expect(googleReviewUrl({ placeId: 'ChIJabc123', listingUrl: 'https://maps.google.com/?cid=9' }))
      .toBe('https://search.google.com/local/writereview?placeid=ChIJabc123');
  });

  it('falls back to the plain listing when there is no Place ID', () => {
    expect(googleReviewUrl({ placeId: '', listingUrl: 'https://maps.google.com/?cid=9' }))
      .toBe('https://maps.google.com/?cid=9');
  });

  it('is null when nothing is linked, so the ask is suppressed rather than sent nowhere', () => {
    expect(googleReviewUrl({ placeId: '', listingUrl: '' })).toBeNull();
    expect(googleReviewUrl({ placeId: null, listingUrl: undefined })).toBeNull();
    expect(googleReviewUrl({ placeId: '   ', listingUrl: '  ' })).toBeNull();
  });

  it('escapes a Place ID rather than pasting it into the query string', () => {
    expect(googleReviewUrl({ placeId: 'a b&c', listingUrl: null }))
      .toBe('https://search.google.com/local/writereview?placeid=a%20b%26c');
  });
});

describe('reviewRequestText — the message the settings card shows', () => {
  const text = reviewRequestText({ businessName: 'BrokePipes', clientName: 'Sarah', reviewUrl: 'https://x.test/r' });

  it('carries the opt-out, because it is part of what the customer reads', () => {
    expect(text).toContain('Reply STOP to opt out.');
  });

  it('asks everyone the same way', () => {
    // "If we earned it" was removed from the sender for reading as a nudge that
    // only happy customers should bother — the polite form of the selective
    // solicitation this whole module exists to prevent. The preview renders
    // this function, so it can't quietly reintroduce the old wording.
    expect(text).not.toMatch(/if we earned it/i);
    expect(text).toContain('An honest review helps a small business a lot');
  });

  it('puts the link the customer taps in the body', () => {
    expect(text).toContain('https://x.test/r');
    expect(reviewRequestText({ businessName: 'B', clientName: 'S', reviewUrl: '[your Google review link]' }))
      .toContain('[your Google review link]');
  });

  it('never addresses somebody as an empty string', () => {
    const blank = reviewRequestText({ businessName: '  ', clientName: '  ', reviewUrl: 'https://x.test/r' });
    expect(blank).toContain('Hi there,');
    expect(blank).toContain('thanks for choosing your contractor!');
  });
});
