import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import { getReviewsSummary } from '@/lib/reviews';
import AutomationLink from '@/components/automation-link';

function formatDate(value: string | null): string {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function stars(rating: number | null): string {
  if (!rating) return '';
  return '★★★★★'.slice(0, rating) + '☆☆☆☆☆'.slice(0, 5 - rating);
}

export default async function ReviewsPage() {
  const { supabase, accountId } = await requireOwnerContext();
  const summary = await getReviewsSummary(supabase, accountId);
  const { data: reviewAcct } = await supabase.from('accounts').select('auto_review_request').eq('id', accountId).maybeSingle();
  const reviewsOn = Boolean(reviewAcct?.auto_review_request);

  const maxStar = Math.max(1, ...([5, 4, 3, 2, 1] as const).map((n) => summary.starCounts[n]));
  const pct = (n: number) => `${Math.round((n / (summary.totalInvites || 1)) * 100)}%`;

  return (
    <main className="wide-shell workspace-shell">
      <section className="workspace-hero panel">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Reviews</p>
          <h1 className="workspace-title">Reputation &amp; feedback</h1>
          <p className="workspace-lead">
            Every gated review ask in one place — the happy customers you sent to Google, and the private feedback
            that came back to you instead of a public 1-star.
          </p>
          <div style={{ marginTop: '0.75rem' }}>
            <AutomationLink id="reviews" label="Auto review requests" on={reviewsOn} />
          </div>
        </div>
      </section>

      {summary.totalInvites === 0 ? (
        <section className="panel workspace-section-card">
          <p className="empty-state">
            No gated review asks yet. With review-gating on, every review request routes through a &ldquo;how&apos;d we
            do?&rdquo; page and the results show up here.
          </p>
        </section>
      ) : (
        <>
          <div className="workspace-metric-grid">
            <article className="workspace-metric-card accent">
              <span className="workspace-metric-label">Average rating</span>
              <strong className="workspace-metric-value">{summary.avgRating !== null ? summary.avgRating.toFixed(1) : '—'}</strong>
              <p className="workspace-metric-note">{summary.avgRating !== null ? stars(Math.round(summary.avgRating)) : 'No ratings yet'} · {summary.responded} rated</p>
            </article>
            <article className="workspace-metric-card">
              <span className="workspace-metric-label">Sent to Google</span>
              <strong className="workspace-metric-value">{summary.googleCount}</strong>
              <p className="workspace-metric-note">Happy customers routed to a public review.</p>
            </article>
            <article className="workspace-metric-card">
              <span className="workspace-metric-label">Private feedback</span>
              <strong className="workspace-metric-value">{summary.privateCount}</strong>
              <p className="workspace-metric-note">Kept off Google so you can make it right.</p>
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
              <p className="eyebrow">Private feedback{summary.privateCount > 0 ? ` · ${summary.privateCount}` : ''}</p>
            </div>
            {summary.recentPrivate.length === 0 ? (
              <p className="empty-state">No private feedback yet — that&apos;s a good thing. Anything 3★ or under lands here instead of Google.</p>
            ) : (
              <div className="review-feedback-list">
                {summary.recentPrivate.map((item) => (
                  <div key={item.id} className="review-feedback-card">
                    <div className="review-feedback-top">
                      <span className="review-feedback-stars">{stars(item.rating)}</span>
                      <span className="review-feedback-meta">
                        {item.clientName || 'A client'} · {formatDate(item.respondedAt)}
                        {item.jobId ? <> · <Link href={`/dashboard/jobs/${item.jobId}`}>Open job →</Link></> : null}
                      </span>
                    </div>
                    <p className="review-feedback-body">{item.feedback}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
