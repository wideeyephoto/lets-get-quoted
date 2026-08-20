'use client';

import { useState, useTransition } from 'react';

import {
  cancelBasePlanSubscriptionAction,
  resumeBasePlanSubscriptionAction,
  type CancelSubscriptionActionState,
  type ResumeSubscriptionActionState,
} from './subscription-cancellation-actions';

/**
 * The cancel affordance the Terms, the checkout consent box, the homepage and
 * the FAQ have all been promising while it did not exist.
 *
 * Two steps, because this is the one control on the page that ends a paid
 * relationship and a stray click should not. It is not a destructive-sounding
 * confirm dialog either: cancelling is a thing a customer is entitled to do, and
 * making it feel dangerous is a dark pattern.
 *
 * Restoring is ONE step, deliberately. The asymmetry is the point: the click
 * that costs someone their plan deserves a confirmation, and the click that
 * gives it back does not. This panel used to tell them to "contact support" --
 * a promise with no mechanism behind it, which is the same defect the cancel
 * button itself was built to retire.
 */
export default function CancelSubscriptionPanel({
  planName,
  currentPeriodEnd,
  alreadyScheduled,
}: {
  planName: string;
  currentPeriodEnd: string | null;
  alreadyScheduled: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [state, setState] = useState<CancelSubscriptionActionState>(null);
  const [resumeState, setResumeState] = useState<ResumeSubscriptionActionState>(null);
  const [pending, startTransition] = useTransition();

  // null defers to the server-rendered prop. revalidatePath will bring that prop
  // into line on the next render, but the override makes the switch immediate
  // rather than leaving the old panel on screen until the page catches up.
  const [scheduledOverride, setScheduledOverride] = useState<boolean | null>(null);
  const scheduled = scheduledOverride ?? alreadyScheduled;

  const endsOn = (value: string | null): string | null => {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
      ? null
      : parsed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  const endDate = endsOn(state?.ok === true ? state.currentPeriodEnd : currentPeriodEnd);
  const error = state?.ok === false ? state.error : resumeState?.ok === false ? resumeState.error : null;

  const runCancel = () => startTransition(async () => {
    const result = await cancelBasePlanSubscriptionAction();
    setState(result);
    setResumeState(null);
    if (result?.ok) setScheduledOverride(true);
  });

  const runResume = () => startTransition(async () => {
    const result = await resumeBasePlanSubscriptionAction();
    setResumeState(result);
    setState(null);
    if (result?.ok) {
      setScheduledOverride(false);
      setConfirming(false);
    }
  });

  if (scheduled) {
    return (
      <section className="panel workspace-section-card" id="cancel-plan">
        <div className="section-heading workspace-section-heading compact-heading">
          <h3>Cancellation scheduled</h3>
        </div>
        <p>
          {endDate
            ? `Your ${planName} plan stays open until ${endDate} and will not renew. Nothing more is charged.`
            : `Your ${planName} plan will not renew, and nothing more is charged.`}
        </p>
        <p className="muted-note">
          Changed your mind? You can restore it yourself any time before it ends — the plan carries on as if you had
          never cancelled, at the same price, and you are not charged anything extra for the gap.
        </p>

        {error ? <p className="form-error" role="alert">{error}</p> : null}

        <button className="btn" type="button" disabled={pending} aria-busy={pending} onClick={runResume}>
          {pending ? 'Restoring…' : `Keep ${planName} after all`}
        </button>
      </section>
    );
  }

  return (
    <section className="panel workspace-section-card" id="cancel-plan">
      <div className="section-heading workspace-section-heading compact-heading">
        <h3>Cancel your plan</h3>
      </div>
      <p>
        {endDate
          ? `Cancelling keeps ${planName} open until ${endDate}, the end of the period you have already paid for. It will not renew after that.`
          : `Cancelling keeps ${planName} open until the end of the period you have already paid for. It will not renew after that.`}
      </p>
      <p className="muted-note">
        Your jobs, invoices and customers stay exactly where they are. The workspace moves to the free Flex plan when
        the period ends, and its platform fee rate goes back to 1.25%. You can undo this any time before it takes
        effect.
      </p>

      {error ? <p className="form-error" role="alert">{error}</p> : null}

      {confirming ? (
        <div className="button-row">
          <button className="btn" type="button" disabled={pending} aria-busy={pending} onClick={runCancel}>
            {pending ? 'Cancelling…' : `Yes, cancel ${planName}`}
          </button>
          <button className="btn subtle" type="button" disabled={pending} onClick={() => setConfirming(false)}>
            Keep my plan
          </button>
        </div>
      ) : (
        <button className="btn subtle" type="button" onClick={() => setConfirming(true)}>
          Cancel plan
        </button>
      )}
    </section>
  );
}
