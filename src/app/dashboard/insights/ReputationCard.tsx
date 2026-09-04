import Link from 'next/link';
import type { ReputationMetrics } from '@/lib/insights-metrics';

/**
 * Reputation and Review Velocity: measures the word-of-mouth and Google review pipeline
 * that directly impacts quote conversion and SEO.
 */
export default function ReputationCard({
  reputation,
  basePath = '/dashboard',
}: {
  reputation: ReputationMetrics;
  basePath?: string;
}) {
  const { totalInvites, respondedCount, responseRate, averageRating, googleReviewsCount, googleConversionRate, ratingCounts, hasData } = reputation;

  return (
    <section className="panel ins-card ins-reputation-card">
      <p className="ins-card-head">
        <span className="ins-chip is-source" aria-hidden="true">★</span> Reputation &amp; reviews
      </p>

      {!hasData ? (
        <p className="ins-empty-note">
          Once review invites are sent to clients after job completion, response rates, ratings, and Google review conversions appear here.
        </p>
      ) : (
        <>
          <div className="ins-figures" style={{ marginBottom: '0.75rem' }}>
            <div className="ins-figure">
              <span className="ins-figure-label">Average rating</span>
              <strong className="ins-figure-value" style={{ color: '#d97706' }}>
                {averageRating !== null ? `${averageRating.toFixed(1)} ★` : '—'}
              </strong>
              <span className="ins-sub">{respondedCount} review{respondedCount === 1 ? '' : 's'} received</span>
            </div>
            <div className="ins-figure">
              <span className="ins-figure-label">Response rate</span>
              <strong className="ins-figure-value">{responseRate}%</strong>
              <span className="ins-sub">{respondedCount} of {totalInvites} invites</span>
            </div>
            <div className="ins-figure">
              <span className="ins-figure-label">Google reviews</span>
              <strong className="ins-figure-value" style={{ color: '#2563eb' }}>{googleReviewsCount}</strong>
              <span className="ins-sub">{googleConversionRate}% converted to Google</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.8rem', color: '#666', marginTop: '0.5rem' }}>
            <span>Ratings:</span>
            {[5, 4, 3, 2, 1].map((star) => (
              <span key={star} style={{ background: 'rgba(0,0,0,0.04)', padding: '2px 6px', borderRadius: '4px' }}>
                {star}★: <strong>{ratingCounts[star as keyof typeof ratingCounts]}</strong>
              </span>
            ))}
          </div>

          <div className="ins-card-foot" style={{ marginTop: '1rem' }}>
            <span>Monitored from automated review requests sent upon job completion.</span>
            <Link className="ins-inline-link" href={`${basePath}/reviews`}>View reviews →</Link>
          </div>
        </>
      )}
    </section>
  );
}
