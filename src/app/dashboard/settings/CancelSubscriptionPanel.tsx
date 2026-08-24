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
      <section className="panel workspace-section-card plan-cancel-panel" id="cancel-plan">
        <div className="workspace-section-headrow">
          <div className="section-heading workspace-section-heading compact-heading">
            <p className="eyebrow">Subscription status</p>
            <div className="plan-cancel-title-row">
              <div className="plan-cancel-header-icon-wrap amber" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <h3>Cancellation scheduled</h3>
            </div>
          </div>
        </div>

        <div className="plan-cancel-status-banner">
          <p className="plan-cancel-status-main">
            {endDate
              ? `Your ${planName} plan stays open until ${endDate} and will not renew. Nothing more is charged.`
              : `Your ${planName} plan will not renew, and nothing more is charged.`}
          </p>
          <p className="plan-cancel-status-sub">
            Changed your mind? You can restore it yourself any time before it ends — the plan carries on as if you had
            never cancelled, at the same price, and you are not charged anything extra for the gap.
          </p>
        </div>

        {error ? <p className="form-error" role="alert">{error}</p> : null}

        <button className="btn primary plan-cancel-restore-btn" type="button" disabled={pending} aria-busy={pending} onClick={runResume}>
          {pending ? 'Restoring…' : `Keep ${planName} after all`}
        </button>
      </section>
    );
  }

  return (
    <section className="panel workspace-section-card plan-cancel-panel" id="cancel-plan">
      <div className="workspace-section-headrow">
        <div className="section-heading workspace-section-heading compact-heading">
          <p className="eyebrow">Manage subscription</p>
          <div className="plan-cancel-title-row">
            <div className="plan-cancel-header-icon-wrap" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
                <line x1="12" y1="2" x2="12" y2="12" />
              </svg>
            </div>
            <h3>Cancel your plan</h3>
          </div>
        </div>
      </div>

      <div className="plan-cancel-info-box">
        <p className="plan-cancel-info-lead">
          {endDate
            ? `Cancelling keeps ${planName} open until ${endDate}, the end of the period you have already paid for. It will not renew after that.`
            : `Cancelling keeps ${planName} open until the end of the period you have already paid for. It will not renew after that.`}
        </p>
        <p className="plan-cancel-info-details">
          Your jobs, invoices and customers stay exactly where they are. The workspace moves to the free Flex plan when
          the period ends, and its platform fee rate goes back to 1.25%. You can undo this any time before it takes
          effect.
        </p>
      </div>

      {error ? <p className="form-error" role="alert">{error}</p> : null}

      {confirming ? (
        <div className="plan-cancel-confirm-drawer">
          <p className="plan-cancel-confirm-prompt">
            Are you sure you want to schedule cancellation for {planName}?
          </p>
          <div className="button-row plan-cancel-button-row">
            <button className="btn subtle plan-cancel-confirm-action" type="button" disabled={pending} aria-busy={pending} onClick={runCancel}>
              {pending ? 'Cancelling…' : `Yes, cancel ${planName}`}
            </button>
            <button className="btn primary plan-cancel-keep-action" type="button" disabled={pending} onClick={() => setConfirming(false)}>
              Keep my plan
            </button>
          </div>
        </div>
      ) : (
        <button className="btn subtle plan-cancel-init-btn" type="button" onClick={() => setConfirming(true)}>
          Cancel plan
        </button>
      )}
    </section>
  );
}
