'use client';

import { useState, useTransition } from 'react';
import { submitJobFeedbackAction } from './actions';

type ClientReviewCardProps = {
  token: string;
  businessName: string;
  googleUrl: string | null;
  isComplete: boolean;
};

export default function ClientReviewCard({
  token,
  businessName,
  googleUrl,
  isComplete,
}: ClientReviewCardProps) {
  const [rating, setRating] = useState<number | null>(null);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!isComplete) return null;

  const currentHover = hoverRating || rating || 0;

  return (
    <section className="panel workspace-section-card client-review-card" id="review">
      <div className="section-heading workspace-section-heading compact-heading">
        <p className="eyebrow">Your feedback</p>
        <h2>How was your experience with {businessName}?</h2>
      </div>

      <p className="workspace-card-copy">
        Your feedback helps us continuously improve our service and helps your neighbors make informed decisions.
      </p>

      {/* 5-Star Rating Selector */}
      <div
        className="review-stars-wrapper"
        style={{ margin: '1rem 0', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
        onMouseLeave={() => setHoverRating(0)}
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            className={`star-btn${star <= currentHover ? ' is-active' : ''}`}
            onClick={() => {
              setRating(star);
              setShowFeedbackForm(true);
            }}
            onMouseEnter={() => setHoverRating(star)}
            onFocus={() => setHoverRating(star)}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.75rem',
              cursor: 'pointer',
              color: star <= currentHover ? '#f59e0b' : 'var(--border, #d1d5db)',
              padding: '0 0.15rem',
              transition: 'color 0.15s ease, transform 0.15s ease',
            }}
            aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
          >
            ★
          </button>
        ))}
        {rating ? (
          <span style={{ fontSize: '0.9rem', color: 'var(--muted, #666)', marginLeft: '0.5rem' }}>
            {rating} of 5 stars
          </span>
        ) : null}
      </div>

      {done ? (
        <div className="client-warranty-done" style={{ marginTop: '0.75rem' }}>
          <p>Thank you! Your feedback has been received by {businessName}.</p>
          {googleUrl ? (
            <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
              If you’d also like to share your review publicly, you can{' '}
              <a href={googleUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline', fontWeight: 600 }}>
                leave a Google review
              </a>
              .
            </p>
          ) : null}
        </div>
      ) : (
        <div className="review-action-doors" style={{ marginTop: '1rem' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
            {googleUrl ? (
              <a
                href={googleUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
              >
                ⭐ Write a Google Review
              </a>
            ) : null}

            <button
              type="button"
              className="btn secondary"
              onClick={() => setShowFeedbackForm(!showFeedbackForm)}
            >
              {showFeedbackForm ? 'Close direct note' : 'Send private note to owner'}
            </button>
          </div>

          {showFeedbackForm ? (
            <form
              className="client-warranty-form"
              action={(formData) => {
                setError(null);
                startTransition(async () => {
                  if (rating) formData.set('rating', String(rating));
                  const result = await submitJobFeedbackAction(token, formData);
                  if (result.ok) {
                    setDone(true);
                    setShowFeedbackForm(false);
                  } else {
                    setError(result.message ?? 'Could not send feedback. Please try again.');
                  }
                });
              }}
            >
              <label htmlFor="feedback-text">
                Private note for {businessName} (never published publicly)
              </label>
              <textarea
                id="feedback-text"
                name="feedback"
                rows={3}
                required
                maxLength={2000}
                placeholder="What went well, or what could we do better next time?"
              />
              <div className="client-warranty-actions">
                <button type="submit" className="btn primary" disabled={pending}>
                  {pending ? 'Sending…' : 'Send private feedback'}
                </button>
                <button type="button" className="btn ghost" onClick={() => setShowFeedbackForm(false)} disabled={pending}>
                  Cancel
                </button>
              </div>
            </form>
          ) : null}
        </div>
      )}

      {error ? <p className="client-warranty-error">{error}</p> : null}
    </section>
  );
}
