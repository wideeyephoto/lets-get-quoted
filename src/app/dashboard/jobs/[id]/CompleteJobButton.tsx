'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useFormStatus } from 'react-dom';
import {
  completeJobConfirmMessage,
  completeJobNeedsConfirm,
  type CompleteJobWarningInput,
  type ReviewPillState,
} from '@/lib/job-detail-labels';

/**
 * The end of the job, and whether the customer gets asked for a review.
 *
 * One control, two decisions. Completing used to always fire the account's
 * automatic review ask, so the only way to close a job without texting somebody
 * was to go to Settings, turn the automation off, come back, complete, and turn
 * it on again. The pill makes it one tap on the button you were already
 * pressing.
 *
 * The pill is a SIBLING of the submit button, not a child of it. A button
 * inside a button is invalid HTML and the browser does its own thing with the
 * click; the wrapper is what carries the pill shape and the glow, so the two
 * still read as one object.
 */
export default function CompleteJobButton({
  action,
  warning,
  pill,
}: {
  action: (formData: FormData) => Promise<void>;
  /** Everything except the pill, which this component owns. */
  warning: Omit<CompleteJobWarningInput, 'sendReview'>;
  pill: ReviewPillState;
}) {
  const [sendReview, setSendReview] = useState(pill.canAsk ? pill.defaultOn : false);
  const input: CompleteJobWarningInput = { ...warning, sendReview };

  return (
    <form
      className="job-done-field"
      action={action}
      onSubmit={(event) => {
        // Only when something is about to happen that can't be taken back.
        if (completeJobNeedsConfirm(input) && !window.confirm(completeJobConfirmMessage(input))) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="sendReview" value={sendReview ? 'on' : 'off'} />

      <div className={`job-done-shell${sendReview ? ' review-on' : ''}`}>
        <CompleteSubmit />

        {/* type="button" is load-bearing: inside a form, a bare <button> submits,
            so without it flipping the toggle would complete the job. */}
        <button
          type="button"
          className={`job-done-pill${sendReview ? ' is-on' : ''}`}
          onClick={() => setSendReview((current) => !current)}
          disabled={!pill.canAsk}
          role="switch"
          aria-checked={sendReview}
          aria-label="Send a review request when this job is completed"
        >
          {/* Both labels occupy the same grid cell, so the pill is always as
              wide as the longer one. "ON" and "OFF" are different widths, and
              swapping the text resized the pill — which resized the whole
              button under the cursor mid-click. A min-width in em would be a
              guess that breaks at another font size; this is exact. */}
          <span className="job-done-pill-label">
            <span className="job-done-pill-sizer" aria-hidden="true">Review OFF</span>
            <span>Review {sendReview ? 'ON' : 'OFF'}</span>
          </span>
          <span className="job-done-pill-track" aria-hidden="true">
            <span className="job-done-pill-knob" />
          </span>
        </button>
      </div>

      <p className={`job-done-hint${sendReview ? ' is-on' : ''}`}>
        {hint(pill, sendReview)}
        {/* Only the missing-link state carries a fix, because it is the only one
            of the three the owner can do anything about from here. */}
        {!pill.canAsk && pill.fix ? (
          <>
            {' '}
            <Link className="job-done-hint-fix" href={pill.fix.href}>{pill.fix.label}</Link>
          </>
        ) : null}
      </p>
    </form>
  );
}

/**
 * The line under the button. Says what pressing it will do, in the three states
 * that are genuinely different: it will send, it won't, and it can't.
 */
function hint(pill: ReviewPillState, sendReview: boolean): string {
  if (!pill.canAsk) return pill.reason;
  if (!sendReview) return 'No review request will be sent.';
  return `Sends a review request by ${pill.channel}. Tap the pill to switch it off before completing ⤴`;
}

/**
 * Its own component so useFormStatus reads THIS form's pending state — the hook
 * only reports a submission from inside the form it is rendered in.
 */
function CompleteSubmit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="job-done-submit" disabled={pending} aria-busy={pending}>
      {pending ? 'Wrapping up…' : 'Mark Job Completed'}
    </button>
  );
}
