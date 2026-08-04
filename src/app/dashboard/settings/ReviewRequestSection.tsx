'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { reviewRequestText } from '@/lib/review-routing';
import { setReviewFeedbackPageAction } from './actions';

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

  function toggleFeedbackPage() {
    const next = !feedback;
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
        // tells a contractor their customers are being sent somewhere they
        // aren't.
        setFeedback(!next);
        setSave('error');
      }
    });
  }

  // The link the customer actually taps, for the setting as it stands right now.
  // Switching the feedback page on or off visibly changes it, which is the whole
  // difference between the two settings said in one line instead of a paragraph.
  const shownUrl = feedback ? feedbackUrl : googleUrl ?? '[your Google review link]';

  return (
    <div className={`review-card${enabled ? '' : ' is-paused'}`}>
      <p className="review-state">
        {enabled
          ? 'Marking a job complete asks the client for a review — texted if they have a mobile on file, emailed otherwise. Once per job.'
          : 'Paused — completing a job sends nothing. You can still ask by hand from any completed job.'}
      </p>

      <div className="review-grid">
        <div className="review-settings">
          <button
            type="button"
            role="switch"
            aria-checked={feedback}
            className={`review-switch${feedback ? ' is-on' : ''}`}
            onClick={toggleFeedbackPage}
          >
            <span className="review-switch-track" aria-hidden="true">
              <span className="review-switch-knob" />
            </span>
            <span>Ask how it went first</span>
          </button>
          <p className="review-choice-note">
            {feedback
              ? 'Clients land on a short page where they rate the job, then choose to review you publicly, send you a private note, or both.'
              : 'Clients go straight to your Google review form, with no stop in between.'}
          </p>

          <p className="review-policy">
            Either way, every client is offered the public review link. Screening by rating — sending only happy
            clients to Google — is against Google&apos;s review policy and puts your Business Profile at risk, so
            letsgetquoted.com doesn&apos;t do it.
          </p>

          {/* One destination for both states: the Customer reviews card in the
              website builder, which is where googlePlaceId is actually set. */}
          <div className={`review-prereq${googleUrl ? ' is-ok' : ''}`}>
            <span aria-hidden="true">{googleUrl ? '✓' : '🔗'}</span>
            {googleUrl ? (
              <span>
                Pointing at <strong>{googleName || 'your Google Business Profile'}</strong> —{' '}
                <Link href="/dashboard/sites?open=reviews">change it in the Website builder</Link>.
              </span>
            ) : (
              <span>
                Reviews need a Google Business Profile to point to —{' '}
                <Link href="/dashboard/sites?open=reviews">connect yours in the Website builder</Link> so the ask has
                somewhere to go.
              </span>
            )}
          </div>
        </div>

        <div className="review-preview">
          <p className="eyebrow">What the client sees</p>
          <p className="review-lede">The text that goes out when you mark a job complete.</p>

          <div className="review-phone">
            <div className="review-phone-head">
              <span className="review-phone-avatar" aria-hidden="true">
                {businessName.slice(0, 2).toUpperCase()}
              </span>
              <strong>{businessName}</strong>
            </div>
            <div className="review-phone-body">
              {/* Rendered from the sender's own function, so it can't drift from
                  what gets sent. The old hand-written preview had already. */}
              <p className="review-bubble">
                {reviewRequestText({ businessName, clientName: 'Sarah', reviewUrl: shownUrl })}
              </p>
            </div>
          </div>

          <div className="review-tags">
            <span className="review-tag">Once per job</span>
            <span className="review-tag">Emailed when there&apos;s no mobile</span>
          </div>
        </div>
      </div>

      <div className="review-foot">
        <span className="review-foot-note">
          {enabled
            ? 'You can also send the ask by hand from any completed job.'
            : 'Nothing is sent automatically while this is off.'}
        </span>
        <span className={`review-save review-save-${save}`} aria-live="polite">
          {save === 'saving' ? 'Saving…' : save === 'saved' ? '✓ Saved' : save === 'error' ? 'Couldn’t save' : ''}
        </span>
      </div>
    </div>
  );
}
