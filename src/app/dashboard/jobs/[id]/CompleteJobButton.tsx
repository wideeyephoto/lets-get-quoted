'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useFormStatus } from 'react-dom';
import type { CompletionPreflightItem } from '@/lib/job-badges';
import {
  completeJobNeedsConfirm,
  completeJobReviewSentence,
  formatBookedDay,
  isEarlyCompletion,
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
  preflight = [],
  pill,
  muted = false,
}: {
  action: (formData: FormData) => Promise<void>;
  /** Everything except the pill, which this component owns. */
  warning: Omit<CompleteJobWarningInput, 'sendReview'>;
  /**
   * What is still open on the job, each with somewhere to go and fix it. The
   * same facts as `warning.blockers`, from the same function — see
   * completionPreflight.
   */
  preflight?: CompletionPreflightItem[];
  pill: ReviewPillState;
  /**
   * True until the job has actually started. This was the loudest control on
   * the page for jobs whose service date was days away — an invitation to close
   * a job early and then unpick the review text that went out with it. It stays
   * available, because small same-day jobs are real; it just stops shouting.
   */
  muted?: boolean;
}) {
  const [sendReview, setSendReview] = useState(pill.canAsk ? pill.defaultOn : false);
  const [checking, setChecking] = useState(false);
  const input: CompleteJobWarningInput = { ...warning, sendReview };
  const who = warning.clientName?.trim() || 'the customer';

  /**
   * A ref, not state. The confirm button inside the preflight is a real submit,
   * so its click and the form's submit happen in one turn — a setState here
   * would not have landed by the time onSubmit reads it, and the preflight
   * would reopen forever.
   */
  const confirmed = useRef(false);

  return (
    <form
      className={`job-done-field${muted ? ' is-muted' : ''}`}
      action={action}
      onSubmit={(event) => {
        if (confirmed.current) return;
        // Only when something is about to happen that can't be taken back.
        if (completeJobNeedsConfirm(input)) {
          event.preventDefault();
          setChecking(true);
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

      {checking ? (
        <Preflight
          who={who}
          input={input}
          items={preflight}
          pill={pill}
          sendReview={sendReview}
          onToggleReview={() => setSendReview((current) => !current)}
          onCancel={() => setChecking(false)}
          onConfirm={() => {
            confirmed.current = true;
          }}
        />
      ) : null}
    </form>
  );
}

/**
 * THE LAST SCREEN BEFORE A JOB DISAPPEARS.
 *
 * This was a window.confirm — one string, no links, and on a phone a system
 * sheet that truncates. What it had to say was "$4,200 is still unpaid, 2
 * checklist items are unticked, and Dana is about to be texted a review
 * request", which is three separate decisions with three separate fixes, and
 * the only two answers available were OK and Cancel.
 *
 * Still not a block. Every line here is something a contractor can legitimately
 * close a job over — the cheque arrives Tuesday, the two punch-list items got
 * done and nobody ticked them. See completionBlockers for why refusing would be
 * worse than the problem. What changed is that each one now has the thing that
 * fixes it beside it, and the review send — the only irreversible part — is a
 * switch on this screen rather than a sentence about a switch somewhere else.
 */
function Preflight({
  who,
  input,
  items,
  pill,
  sendReview,
  onToggleReview,
  onCancel,
  onConfirm,
}: {
  who: string;
  input: CompleteJobWarningInput;
  items: CompletionPreflightItem[];
  pill: ReviewPillState;
  sendReview: boolean;
  onToggleReview: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const early = isEarlyCompletion(input);
  const willSend = pill.canAsk && sendReview;

  return (
    <div className="job-preflight-backdrop" role="dialog" aria-modal="true" aria-labelledby="job-preflight-title">
      <div className="job-preflight">
        <div className="job-preflight-head">
          <p className="eyebrow">Before you close this out</p>
          <h2 id="job-preflight-title">Mark this job complete?</h2>
        </div>

        <p className="job-preflight-lead">
          {who} sees it close out on their job feed. You can undo it from the feed if you press it early.
        </p>

        {/* Said first, because it is the one that answers "am I on the right
            job?". The date stays on the calendar: completing does not un-book
            the work. */}
        {early && input.scheduledFor ? (
          <p className="job-preflight-flag">
            <strong>This job is booked for {formatBookedDay(input.scheduledFor)}</strong>, so you are closing it early.
            The date stays on the calendar.
          </p>
        ) : null}

        {input.quoteUnapproved ? (
          <p className="job-preflight-flag">
            <strong>This quote was never approved.</strong> Completing it also records that {who} accepted it — on their
            job feed, and on your conversion rate.
          </p>
        ) : null}

        {items.length > 0 ? (
          <div className="job-preflight-open">
            <p className="job-preflight-open-head">Still open on this job</p>
            <ul>
              {items.map((item) => (
                <li key={item.key}>
                  {/* Sentence case: these are phrased as clause fragments so
                      they can be joined into a sentence elsewhere. */}
                  <span>{item.text.charAt(0).toUpperCase()}{item.text.slice(1)}</span>
                  <a href={item.fix.href}>{item.fix.label}</a>
                </li>
              ))}
            </ul>
            <small>Completing doesn&apos;t cancel any of it — it just stops the job reminding you.</small>
          </div>
        ) : null}

        {/* The irreversible part, decided here rather than described here. */}
        <div className={`job-preflight-review${willSend ? ' is-on' : ''}`}>
          <div>
            {/* The one paragraph here whose wording is load-bearing, so it
                comes from the shared function rather than from this file —
                six states, three of which look identical and send nothing.
                It reads `input`, which carries the switch below, so it
                rewrites itself as the switch is thrown. */}
            <strong>{pill.canAsk ? completeJobReviewSentence(input) : 'No review request will be sent.'}</strong>
            <small>{pill.canAsk ? 'Completing is undoable from the feed. A review request is not.' : pill.reason}</small>
          </div>
          {pill.canAsk ? (
            <button
              type="button"
              className={`job-preflight-switch${sendReview ? ' is-on' : ''}`}
              onClick={onToggleReview}
              role="switch"
              aria-checked={sendReview}
            >
              {sendReview ? 'On' : 'Off'}
            </button>
          ) : null}
        </div>

        <div className="job-preflight-actions">
          <button type="button" className="btn ghost" onClick={onCancel}>
            Not yet
          </button>
          <button type="submit" className="btn primary" onClick={onConfirm}>
            {willSend ? 'Complete and send the review request' : 'Complete this job'}
          </button>
        </div>
      </div>
    </div>
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
