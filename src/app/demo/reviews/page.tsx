import Link from 'next/link';
import type { ReviewFeedbackItem, ReviewsSummary } from '@/lib/reviews';

export const dynamic = 'force-dynamic';

function formatDate(value: string | null): string {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function stars(rating: number | null): string {
  if (!rating) return '';
  return '★★★★★'.slice(0, rating) + '☆☆☆☆☆'.slice(0, 5 - rating);
}

// Days-ago → ISO date, so the demo reads as "recent" whenever it's viewed.
function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

// Happy customers routed out to a public Google review.
const DEMO_PUBLIC_REVIEWS: ReviewFeedbackItem[] = [
  {
    id: 'rev-1',
    jobId: 'job-1',
    clientName: 'Karen Whitfield',
    rating: 5,
    feedback:
      'Our new paver patio looks incredible — the fire pit and seat wall are exactly what we pictured. The crew was tidy, on time, and left the yard spotless. Already getting compliments from the neighbors.',
    respondedAt: daysAgo(3),
  },
  {
    id: 'rev-2',
    jobId: 'job-2',
    clientName: 'Marcus Delgado',
    rating: 5,
    feedback:
      'Evergreen redesigned our whole front yard — new beds, plantings, mulch and clean edging. Total transformation. They keep our lawn perfect every week and it has never looked greener.',
    respondedAt: daysAgo(6),
  },
  {
    id: 'rev-3',
    jobId: 'job-3',
    clientName: 'Isabel Reyes',
    rating: 5,
    feedback:
      'They built a 60-foot retaining wall on a tricky slope and handled the drainage perfectly. Rock solid work and honest pricing. No more washout after heavy rain.',
    respondedAt: daysAgo(9),
  },
  {
    id: 'rev-4',
    jobId: 'job-7',
    clientName: 'Grace Foster',
    rating: 5,
    feedback:
      'Our backyard used to flood every storm. The French drain and regrade completely fixed it — bone dry now. Professional from the quote all the way through cleanup.',
    respondedAt: daysAgo(12),
  },
  {
    id: 'rev-5',
    jobId: 'job-8',
    clientName: 'Paul Grant',
    rating: 5,
    feedback:
      'The low-voltage lighting they installed makes the whole yard glow at night — path lights, uplights on the trees, and the patio. Beautiful job and it was done in a single day.',
    respondedAt: daysAgo(15),
  },
  {
    id: 'rev-6',
    jobId: 'job-6',
    clientName: "Brian O'Malley",
    rating: 4,
    feedback:
      'Nice tree and shrub planting package and the mulched beds look great. Took a day longer than we expected because of the weather, but the finished result was well worth it.',
    respondedAt: daysAgo(19),
  },
  {
    id: 'rev-7',
    jobId: 'job-2',
    clientName: 'Marcus Delgado',
    rating: 5,
    feedback:
      'Second season with Evergreen on our weekly maintenance and I would not go anywhere else. Reliable, friendly, and the lawn is the best on the block.',
    respondedAt: daysAgo(24),
  },
];

// Customers who chose to say it to the owner rather than in public. They were
// offered the Google link too — a private note is an extra channel, not a
// diversion away from one.
const DEMO_PRIVATE_FEEDBACK: ReviewFeedbackItem[] = [
  {
    id: 'fb-1',
    jobId: 'job-8',
    clientName: 'Paul Grant',
    rating: 3,
    feedback:
      'Love the finished lighting, but we had to call twice to get the final invoice and a crew member missed the first appointment window. The work itself was great once it got going.',
    respondedAt: daysAgo(21),
  },
  {
    id: 'fb-2',
    jobId: 'job-6',
    clientName: "Brian O'Malley",
    rating: 3,
    feedback:
      'A couple of the new shrubs came in smaller than the ones in the plan. The team offered to swap them next visit — just wanted to flag it before the review.',
    respondedAt: daysAgo(31),
  },
];

// A believable spread rather than a suspiciously perfect one. The old numbers
// here — 35 five-stars, zero ones and twos, a 4.9 average — were what a GATED
// profile looks like, and showing that as the goal was advertising the thing we
// just removed. A real contractor with 40 asks has a couple of bad days in there.
const DEMO_SUMMARY: ReviewsSummary = {
  totalInvites: 40,
  responded: 34,
  responseRate: 34 / 40,
  avgRating: 4.5,
  starCounts: { 1: 1, 2: 1, 3: 2, 4: 6, 5: 24 },
  googleCount: 31,
  privateCount: 2,
  bothCount: 1,
  recentPrivate: DEMO_PRIVATE_FEEDBACK,
};

export default function DemoReviewsPage() {
  const summary = DEMO_SUMMARY;

  const maxStar = Math.max(1, ...([5, 4, 3, 2, 1] as const).map((n) => summary.starCounts[n]));
  const pct = (n: number) => `${Math.round((n / (summary.totalInvites || 1)) * 100)}%`;

  return (
    <main className="wide-shell workspace-shell">
      <section className="workspace-hero panel">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Reviews</p>
          <h1 className="workspace-title">Reputation &amp; feedback</h1>
          <p className="workspace-lead">
            Every review ask in one place — how customers rated Evergreen Lawn &amp; Landscape, who went on to review
            them publicly, and what came back privately.
          </p>
          <p className="review-policy-note">
            Every customer is offered both routes: a public review and a private word with the owner. No screening by
            rating — Google prohibits sending only happy customers to a review page, and it&apos;s the contractor&apos;s
            Business Profile that gets restricted for it.
          </p>
        </div>
      </section>

      <div className="workspace-metric-grid">
        <article className="workspace-metric-card accent">
          <span className="workspace-metric-label">Average rating</span>
          <strong className="workspace-metric-value">{summary.avgRating !== null ? summary.avgRating.toFixed(1) : '—'}</strong>
          <p className="workspace-metric-note">{summary.avgRating !== null ? stars(Math.round(summary.avgRating)) : 'No ratings yet'} · {summary.responded} rated</p>
        </article>
        <article className="workspace-metric-card">
          <span className="workspace-metric-label">Went to Google</span>
          <strong className="workspace-metric-value">{summary.googleCount}</strong>
          <p className="workspace-metric-note">Took the public route. Whether they posted is between them and Google.</p>
        </article>
        <article className="workspace-metric-card">
          <span className="workspace-metric-label">Private feedback</span>
          <strong className="workspace-metric-value">{summary.privateCount}</strong>
          <p className="workspace-metric-note">
            Straight to the owner, not published.
            {summary.bothCount > 0 ? ` ${summary.bothCount} of them also went public.` : ''}
          </p>
        </article>
        <article className="workspace-metric-card">
          <span className="workspace-metric-label">Response rate</span>
          <strong className="workspace-metric-value">{Math.round(summary.responseRate * 100)}%</strong>
          <p className="workspace-metric-note">{summary.responded} of {summary.totalInvites} asked responded.</p>
        </article>
      </div>

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading compact-heading">
          <p className="eyebrow">Rating breakdown</p>
        </div>
        <div className="review-bars">
          {([5, 4, 3, 2, 1] as const).map((n) => (
            <div key={n} className="review-bar-row">
              <span className="review-bar-label">{n}★</span>
              <div className="review-bar-track">
                <div className={`review-bar-fill${n >= 4 ? ' is-good' : ' is-low'}`} style={{ width: `${Math.round((summary.starCounts[n] / maxStar) * 100)}%` }} />
              </div>
              <span className="review-bar-count">{summary.starCounts[n]} · {pct(summary.starCounts[n])}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading compact-heading">
          <p className="eyebrow">Sent to Google · {summary.googleCount}</p>
        </div>
        <div className="review-feedback-list">
          {DEMO_PUBLIC_REVIEWS.map((item) => (
            <div key={item.id} className="review-feedback-card">
              <div className="review-feedback-top">
                <span className="review-feedback-stars">{stars(item.rating)}</span>
                <span className="review-feedback-meta">
                  {item.clientName || 'A client'} · {formatDate(item.respondedAt)}
                </span>
              </div>
              <p className="review-feedback-body">{item.feedback}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading compact-heading">
          <p className="eyebrow">Private feedback{summary.privateCount > 0 ? ` · ${summary.privateCount}` : ''}</p>
        </div>
        <div className="review-feedback-list">
          {summary.recentPrivate.map((item) => (
            <div key={item.id} className="review-feedback-card">
              <div className="review-feedback-top">
                <span className="review-feedback-stars">{stars(item.rating)}</span>
                <span className="review-feedback-meta">
                  {item.clientName || 'A client'} · {formatDate(item.respondedAt)}
                </span>
              </div>
              <p className="review-feedback-body">{item.feedback}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="panel workspace-section-card demo-locked-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Try it yourself</p>
          <h2>Ask for a review</h2>
        </div>
        <p className="workspace-card-copy">
          Send a review link after every job. Customers rate the work, then choose to post publicly, tell you
          privately, or both — so problems reach you fast without your Google profile looking screened. This demo
          account is read-only.
        </p>
        <Link href="/login" className="btn primary">
          Create free account
        </Link>
      </section>
    </main>
  );
}
