'use client';

import { useState, useTransition } from 'react';

import { cancelBasePlanSubscriptionAction, type CancelSubscriptionActionState } from './subscription-cancellation-actions';

/**
 * The cancel affordance the Terms, the checkout consent box, the homepage and
 * the FAQ have all been promising while it did not exist.
 *
 * Two steps, because this is the one control on the page that ends a paid
 * relationship and a stray click should not. It is not a destructive-sounding
 * confirm dialog either: cancelling is a thing a customer is entitled to do, and
 * making it feel dangerous is a dark pattern.
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
  const [pending, startTransition] = useTransition();

  const endsOn = (value: string | null): string | null => {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
      ? null
      : parsed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  const scheduled = alreadyScheduled || (state?.ok === true);
  const endDate = endsOn(state?.ok === true ? state.currentPeriodEnd : currentPeriodEnd);

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
          Changed your mind? Contact support and we can put it back before it ends.
        </p>
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
        the period ends, and its platform fee rate goes back to 1.25%.
      </p>

      {state?.ok === false ? <p className="form-error" role="alert">{state.error}</p> : null}

      {confirming ? (
        <div className="button-row">
          <button
            className="btn"
            type="button"
            disabled={pending}
            aria-busy={pending}
            onClick={() => startTransition(async () => setState(await cancelBasePlanSubscriptionAction()))}
          >
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
