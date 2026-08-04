// What a customer is offered after a job, and what they're told.
//
// letsgetquoted.com used to route 4-5★ customers to Google and send 1-3★
// customers to a private feedback form that never showed the Google link. That
// is review gating. Google's review policy prohibits discouraging negative
// reviews or selectively soliciting positive ones, and a profile caught doing it
// can lose reviews or be restricted — which lands on the CONTRACTOR, not on us,
// even though it was our product making the decision. The FTC's Consumer
// Reviews rule (effective October 2024) covers the same conduct.
//
// The fix is structural rather than a promise: `reviewRoutes` does not take a
// rating. It cannot condition what's offered on how happy someone is, because
// it can't see how happy they are. Only `reviewAcknowledgement` knows the
// rating, and all it can produce is words.

export const REVIEW_RATINGS = [1, 2, 3, 4, 5] as const;
export type ReviewRating = (typeof REVIEW_RATINGS)[number];

export function isReviewRating(value: unknown): value is ReviewRating {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5;
}

export type ReviewRoutes = {
  /** The contractor's public review destination, or null if they never set one. */
  googleUrl: string | null;
  /** Always offered. A private word with the contractor is never the only option. */
  privateFeedback: true;
};

/**
 * The routes offered to a customer. Deliberately takes no rating — see the note
 * at the top of this file. Every customer gets the same two doors in the same
 * order, and a low rating cannot close the public one.
 */
export function reviewRoutes(input: { googleUrl: string | null | undefined }): ReviewRoutes {
  const url = (input.googleUrl ?? '').trim();
  return { googleUrl: url ? url : null, privateFeedback: true };
}

/**
 * Where a review ask points, built from the Google Business Profile linked in
 * the website builder's Customer reviews card.
 *
 * A Place ID gives Google's canonical "write a review" deep link, which opens
 * the review box itself; the plain listing URL is a usable fallback that only
 * gets them to the profile. Null when nothing is linked — then the ask has
 * nowhere to land and it is suppressed rather than sent to a dead end.
 *
 * Shared by the sender and the settings preview so the link a contractor is
 * shown is the link their customer taps.
 */
export function googleReviewUrl(input: { placeId: string | null | undefined; listingUrl: string | null | undefined }): string | null {
  const placeId = (input.placeId ?? '').trim();
  if (placeId) return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;
  const listing = (input.listingUrl ?? '').trim();
  return listing || null;
}

/**
 * The text a customer is sent after a completed job.
 *
 * Lives here rather than inline in sms.ts so the settings card can render the
 * real thing. The old preview was written out by hand in the UI and had already
 * drifted — it still showed "If we earned it", wording removed from the sender
 * because it reads as a nudge that only happy customers should bother, which is
 * the selective solicitation this whole file exists to avoid.
 */
export function reviewRequestText(input: {
  businessName: string;
  clientName: string;
  /** Where the ask points: the feedback page, or Google directly. */
  reviewUrl: string;
}): string {
  const business = input.businessName.trim() || 'your contractor';
  const who = input.clientName.trim() || 'there';
  return `Let's Get Quoted: Hi ${who}, thanks for choosing ${business}! An honest review helps a small business a lot: ${input.reviewUrl}. Reply STOP to opt out.`;
}

export type ReviewAcknowledgement = { title: string; lead: string };

/**
 * The only thing a rating is allowed to change: how we answer it. Acknowledging
 * a bad experience is human; withholding the public route because of it is the
 * thing we're not doing. Every branch below leads to the same two options.
 */
export function reviewAcknowledgement(rating: number | null | undefined, businessName: string): ReviewAcknowledgement {
  const business = businessName.trim() || 'your contractor';
  if (!isReviewRating(rating)) {
    return {
      title: 'How did we do?',
      lead: `Tell ${business} how it went — publicly, privately, or both.`,
    };
  }
  if (rating >= 4) {
    return {
      title: 'Thanks — that means a lot',
      lead: `Glad it went well. You can post that publicly, send ${business} a private note, or both.`,
    };
  }
  if (rating === 3) {
    return {
      title: 'Thanks for the honest rating',
      lead: `Somewhere in the middle is useful to hear. You can post publicly, tell ${business} privately, or both.`,
    };
  }
  return {
    title: 'Sorry we missed the mark',
    lead: `That's not the job ${business} wanted to do. You can post publicly, tell them privately, or both — it's your call.`,
  };
}

// -- Owner-facing rollup ------------------------------------------------------

export type ReviewInviteRow = {
  id: string;
  job_id: string | null;
  client_name: string | null;
  rating: number | null;
  feedback: string | null;
  google_clicked_at: string | null;
  feedback_at: string | null;
  responded_at: string | null;
  /** Legacy: what the old gate decided. Read only as a fallback for old rows. */
  routed_to: 'google' | 'private' | null;
};

export type ReviewFeedbackItem = {
  id: string;
  jobId: string | null;
  clientName: string | null;
  rating: number | null;
  feedback: string;
  respondedAt: string | null;
};

export type ReviewsSummary = {
  totalInvites: number;
  /** Anyone who rated, went to Google, or wrote something. */
  responded: number;
  responseRate: number;
  avgRating: number | null;
  starCounts: Record<ReviewRating, number>;
  /** Customers who took the public route. Not the same as reviews posted — we can't see Google. */
  googleCount: number;
  privateCount: number;
  /** Both routes taken. Impossible under the old gate; the point of removing it. */
  bothCount: number;
  recentPrivate: ReviewFeedbackItem[];
};

const MAX_RECENT_PRIVATE = 25;

export function summariseReviewInvites(rows: ReviewInviteRow[]): ReviewsSummary {
  const starCounts: Record<ReviewRating, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let ratingSum = 0;
  let rated = 0;
  let responded = 0;
  let googleCount = 0;
  let privateCount = 0;
  let bothCount = 0;
  const recentPrivate: ReviewFeedbackItem[] = [];

  for (const row of rows) {
    if (isReviewRating(row.rating)) {
      starCounts[row.rating] += 1;
      ratingSum += row.rating;
      rated += 1;
    }

    // Old rows only have routed_to; new rows have real timestamps. Reading both
    // keeps pre-migration history in the totals instead of silently zeroing it.
    const wentPublic = Boolean(row.google_clicked_at) || row.routed_to === 'google';
    const wentPrivate = Boolean(row.feedback_at) || (row.routed_to === 'private' && Boolean(row.feedback));

    if (wentPublic) googleCount += 1;
    if (wentPrivate) privateCount += 1;
    if (wentPublic && wentPrivate) bothCount += 1;
    if (isReviewRating(row.rating) || wentPublic || wentPrivate) responded += 1;

    if (wentPrivate && row.feedback && recentPrivate.length < MAX_RECENT_PRIVATE) {
      recentPrivate.push({
        id: row.id,
        jobId: row.job_id,
        clientName: row.client_name,
        rating: row.rating,
        feedback: row.feedback,
        respondedAt: row.feedback_at ?? row.responded_at,
      });
    }
  }

  return {
    totalInvites: rows.length,
    responded,
    responseRate: rows.length > 0 ? responded / rows.length : 0,
    avgRating: rated > 0 ? Math.round((ratingSum / rated) * 10) / 10 : null,
    starCounts,
    googleCount,
    privateCount,
    bothCount,
    recentPrivate,
  };
}
