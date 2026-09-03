'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { reviewRequestText } from '@/lib/review-routing';
import { setReviewFeedbackPageAction } from './actions';
import MailIcon from '@/components/MailIcon';

/**
 * Review requests, from the contractor's side.
 *
 * The on/off switch is the one in the card's own header, so it isn't repeated
 * here. It used to be — a checkbox reading "Ask for a review automatically when
 * I mark a job complete" sat inside this card writing the same column as the
 * switch above it. Two controls for one boolean means one of them is always
 * about to be wrong, and this pair was worse than most: the checkbox rendered
 * from a stale value, so turning the switch off and then pressing Save turned it
 * back on.
 *
 * What's left is the one real choice (where the ask points) and the message
 * itself, shown rather than hidden behind a Preview toggle — the words that go
 * out under a contractor's name are the main thing on this card, not a detail.
 */

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

type Props = {
  /** The card's master switch — auto_review_request. */
  enabled: boolean;
  businessName: string;
  feedbackPage: boolean;
  /** Where the ask lands with the feedback page off. Null when no Google profile is linked. */
  googleUrl: string | null;
  /** The linked profile's name, for saying which one it is. */
  googleName: string;
  /** Where the ask lands with the feedback page on. */
  feedbackUrl: string;
};

export default function ReviewRequestSection({
  enabled,
  businessName,
  feedbackPage,
  googleUrl,
  googleName,
  feedbackUrl,
}: Props) {
  const [feedback, setFeedback] = useState(feedbackPage);
  const [save, setSave] = useState<SaveState>('idle');
  const [, startSaving] = useTransition();
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current); }, []);
  // The server wins once a revalidation lands.
  useEffect(() => { setFeedback(feedbackPage); }, [feedbackPage]);

  function handleSelectFeedbackMode(next: boolean) {
    if (next === feedback && save !== 'error') return;
    setFeedback(next);
    setSave('saving');
    startSaving(async () => {
      try {
        await setReviewFeedbackPageAction(next);
        setSave('saved');
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSave('idle'), 2400);
      } catch {
        // Put it back. A switch left showing the new state after a failed save
        // tells a contractor their customers are being sent somewhere they aren't.
        setFeedback(!next);
        setSave('error');
      }
    });
  }

  // The link the customer actually taps, for the setting as it stands right now.
  const shownUrl = feedback ? feedbackUrl : googleUrl ?? '[your Google review link]';

  return (
    <div className={`review-card${enabled ? '' : ' is-paused'}`}>
      <div className={`review-state-banner ${enabled ? 'is-active' : 'is-paused'}`}>
        <span className="review-state-indicator" aria-hidden="true">
          {enabled ? '⚡' : '⏸️'}
        </span>
        <div className="review-state-text">
          <strong className="review-state-heading">{enabled ? 'Auto-Ask Active' : 'Automation Paused'}</strong>
          <span className="review-state-desc">
            {enabled
              ? 'Marking a job complete sends an automatic review request (SMS to mobile, email fallback). Sent once per job.'
              : 'Paused — completing a job will not send automatic review asks. You can still send manual requests from any job.'}
          </span>
        </div>
      </div>

      <div className="review-grid">
        <div className="review-settings">
          <div className="review-section-header">
            <h4 className="review-section-title">Review Destination Mode</h4>
            <span className={`review-save review-save-${save}`} aria-live="polite">
              {save === 'saving' ? 'Saving…' : save === 'saved' ? '✓ Saved' : save === 'error' ? 'Couldn’t save' : ''}
            </span>
          </div>

          <div className="review-mode-options" role="radiogroup" aria-label="Review Destination Mode">
            <button
              type="button"
              role="radio"
              aria-checked={feedback}
              className={`review-mode-card ${feedback ? 'is-selected' : ''}`}
              onClick={() => handleSelectFeedbackMode(true)}
            >
              <div className="review-mode-card-header">
                <span className="review-mode-radio" aria-hidden="true">
                  <span className="review-mode-radio-dot" />
                </span>
                <span className="review-mode-label">2-Step Feedback Page</span>
                <span className="review-badge-recommended">Recommended</span>
              </div>
              <p className="review-mode-desc">
                Clients rate the job first. Happy clients are guided to leave a Google review; private feedback is saved for your team.
              </p>
            </button>

            <button
              type="button"
              role="radio"
              aria-checked={!feedback}
              className={`review-mode-card ${!feedback ? 'is-selected' : ''}`}
              onClick={() => handleSelectFeedbackMode(false)}
            >
              <div className="review-mode-card-header">
                <span className="review-mode-radio" aria-hidden="true">
                  <span className="review-mode-radio-dot" />
                </span>
                <span className="review-mode-label">Direct to Google Review</span>
                <span className="review-badge-direct">Direct Link</span>
              </div>
              <p className="review-mode-desc">
                Clients go straight into your official Google review submission form without an intermediate step.
              </p>
            </button>
          </div>

          <div className="review-policy-box">
            <span className="review-policy-icon" aria-hidden="true">🛡️</span>
            <div>
              <strong className="review-policy-heading">Google Policy Compliant</strong>
              <p className="review-policy-copy">
                Every client is offered the public Google review link. We never gate or screen reviews by rating, protecting your Google Business Profile from penalties.
              </p>
            </div>
          </div>

          <div className={`review-prereq ${googleUrl ? 'is-ok' : 'is-warning'}`}>
            <span className="review-prereq-icon" aria-hidden="true">{googleUrl ? '✓' : '🔗'}</span>
            <div className="review-prereq-content">
              {googleUrl ? (
                <>
                  <span className="review-prereq-title">Google Profile Linked</span>
                  <span className="review-prereq-desc">
                    Pointing at <strong>{googleName || 'your Google Business Profile'}</strong> —{' '}
                    <Link href="/dashboard/sites?open=reviews" className="review-link">
                      Change in Website Builder →
                    </Link>
                  </span>
                </>
              ) : (
                <>
                  <span className="review-prereq-title">Google Profile Required</span>
                  <span className="review-prereq-desc">
                    Connect your Google Business Profile so reviews have a verified destination.{' '}
                    <Link href="/dashboard/sites?open=reviews" className="review-link">
                      Connect Profile in Website Builder →
                    </Link>
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="review-preview">
          <div className="review-preview-header">
            <span className="eyebrow">Interactive Live Preview</span>
            <span className="review-preview-pill">SMS Simulation</span>
          </div>
          <p className="review-lede">Real-time preview of the automated text sent upon job completion.</p>

          <div className="review-phone">
            <div className="review-phone-status-bar" aria-hidden="true">
              <span>9:41</span>
              <span className="review-phone-notch" />
              <span>5G 100%</span>
            </div>

            <div className="review-phone-head">
              <span className="review-phone-avatar" aria-hidden="true">
                {businessName ? businessName.slice(0, 2).toUpperCase() : 'LG'}
              </span>
              <div className="review-phone-meta">
                <strong>{businessName || 'Your Business'}</strong>
                <span className="review-phone-verified">✓ Verified Business</span>
              </div>
            </div>

            <div className="review-phone-body">
              <div className="review-phone-timestamp">Today • 2:15 PM</div>
              <p className="review-bubble">
                {reviewRequestText({ businessName: businessName || 'Your Business', clientName: 'Sarah', reviewUrl: shownUrl })}
              </p>
              <div className="review-bubble-status">Delivered</div>
            </div>
          </div>

          <div className="review-tags" aria-label="Automation delivery details">
            <span className="review-tag">⚡ Once per completed job</span>
            <span className="review-tag">📱 SMS to client mobile</span>
            <span className="review-tag" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}><MailIcon /> Email fallback</span>
          </div>
        </div>
      </div>

      <div className="review-foot">
        <span className="review-foot-note">
          {enabled
            ? 'Automatic asks run on job completion. You can also send manual requests from any job record.'
            : 'Nothing is sent automatically while paused. You can still send manual requests from completed jobs.'}
        </span>
        <span className={`review-save review-save-${save}`} aria-live="polite">
          {save === 'saving' ? 'Saving…' : save === 'saved' ? '✓ Saved' : save === 'error' ? 'Couldn’t save' : ''}
        </span>
      </div>
    </div>
  );
}
