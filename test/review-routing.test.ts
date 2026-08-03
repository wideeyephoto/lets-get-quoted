import { describe, it, expect } from 'vitest';
import {
  reviewRoutes,
  reviewAcknowledgement,
  summariseReviewInvites,
  isReviewRating,
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
