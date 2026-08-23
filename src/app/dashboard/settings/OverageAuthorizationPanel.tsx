'use client';

import { useState, useTransition } from 'react';

import { OVERAGE_AUTHORIZATION_TEXT } from '@/lib/billing/overage-consent';
import { setOverageAuthorizationAction } from './overage-actions';
import type { OverageAuthorizationResult } from '@/lib/billing/overage-authorization';

/**
 * The switch that decides whether a contractor can be charged past their plan.
 *
 * THE CONSENT TEXT IS ON SCREEN, not behind a link. Its SHA-256 goes into an
 * append-only evidence row every time this saves, and a digest of words nobody
 * was shown is not evidence of anything -- it is a record of a checkbox.
 *
 * The tick RESETS whenever the amount changes. Agreeing to a $50 ceiling and
 * then having the number edited underneath the agreement is the exact thing the
 * evidence row exists to prevent, and the base-plan checkout resets its own
 * affirmation on every change for the same reason.
 *
 * SWITCHING OFF NEEDS NO TICK, and no confirmation either. Consent is for
 * exposure; removing exposure is not something to make somebody agree to, and
 * a confirm step on the safe direction is how a dark pattern starts.
 *
 * Markup is deliberately the checkout's: .base-plan-checkout-consent and its
 * affirmation row are already built and already styled for exactly this job, and
 * a second set of near-identical classes would be two places to keep in step.
 */
export default function OverageAuthorizationPanel({
  enabled,
  capCents,
}: {
  enabled: boolean;
  capCents: number | null;
}) {
  const asDollars = (cents: number | null) => (cents === null ? '' : String(Math.round(cents) / 100));

  const [amount, setAmount] = useState(asDollars(capCents));
  const [accepted, setAccepted] = useState(false);
  const [state, setState] = useState<OverageAuthorizationResult | null>(null);
  const [pending, startTransition] = useTransition();

  // Defers to the server-rendered props until an action reports otherwise, so
  // the panel switches immediately rather than waiting for revalidation.
  const live = state?.ok ? { enabled: state.enabled, capCents: state.capCents } : { enabled, capCents };
  const error = state?.ok === false ? state.error : null;

  const save = (nextEnabled: boolean) => startTransition(async () => {
    const result = await setOverageAuthorizationAction(nextEnabled, nextEnabled ? amount : null);
    setState(result);
    if (result.ok) {
      setAccepted(false);
      setAmount(result.enabled ? asDollars(result.capCents) : '');
    }
  });

  const typed = Number(amount);
  const amountUsable = amount.trim() !== '' && Number.isFinite(typed) && typed > 0;

  return (
    <div className="plan-usage-overage-control">
      {live.enabled ? (
        <p className="tone-status" data-tone="info">
          {`Switched on, with a limit of $${((live.capCents ?? 0) / 100).toLocaleString('en-US')} per billing period.`}
        </p>
      ) : (
        <p className="usage-muted">
          Not switched on. When an allowance runs out, sends and drafts are refused rather
          than billed &mdash; nothing is ever charged past your plan without you turning this
          on and setting a limit.
        </p>
      )}

      <label className="plan-usage-overage-amount">
        <span>{live.enabled ? 'Change the limit' : 'Spending limit for one billing period'}</span>
        <span className="plan-usage-overage-input">
          <span aria-hidden="true">$</span>
          <input
            type="number"
            inputMode="decimal"
            min={1}
            max={10000}
            step={1}
            value={amount}
            disabled={pending}
            placeholder="50"
            onChange={(event) => {
              setAmount(event.target.value);
              // The tick was for the number that was on screen when it was made.
              setAccepted(false);
              setState(null);
            }}
          />
        </span>
      </label>

      <div className="base-plan-checkout-consent">
        <strong>Extra usage authorization</strong>
        {OVERAGE_AUTHORIZATION_TEXT.split('\n\n').map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        <label className="base-plan-checkout-affirmation">
          <input
            type="checkbox"
            name="overageAuthorizationAccepted"
            value="yes"
            checked={accepted}
            disabled={pending}
            onChange={(event) => setAccepted(event.target.checked)}
          />
          <span>
            I have read this and authorize charges past my plan, up to the limit above.
          </span>
        </label>
      </div>

      <div className="base-plan-checkout-actions">
        <button
          className="btn"
          type="button"
          disabled={pending || !accepted || !amountUsable}
          aria-busy={pending}
          onClick={() => save(true)}
        >
          {live.enabled ? 'Update limit' : 'Switch on extra usage'}
        </button>
        {live.enabled ? (
          <button
            className="btn subtle"
            type="button"
            disabled={pending}
            aria-busy={pending}
            onClick={() => save(false)}
          >
            Switch off
          </button>
        ) : null}
      </div>

      {error ? <p className="tone-status" data-tone="danger" role="alert">{error}</p> : null}
      {state?.ok && !state.changed ? (
        <p className="tone-status" data-tone="neutral" role="status">
          That was already your setting, so nothing changed.
        </p>
      ) : null}
      {state?.ok && state.changed ? (
        <p className="tone-status" data-tone="healthy" role="status">
          {state.enabled ? 'Saved. Extra usage is on.' : 'Saved. Extra usage is off.'}
        </p>
      ) : null}
    </div>
  );
}
