'use client';

import { useState, useTransition } from 'react';
import { formatUsdFromCents, TOP_UPS, type TopUpId } from '@/lib/billing/catalog';
import type { ActivePurchasedCapacitySubscription } from '@/lib/billing/purchased-seats';
import {
  cancelPurchasedCapacitySubscriptionAction,
  type CancelSubscriptionActionState,
} from './subscription-cancellation-actions';

function formatDate(value: string | null): string {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? ''
    : parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function skuName(topUpId: string): string {
  if (topUpId in TOP_UPS) {
    return TOP_UPS[topUpId as TopUpId].label;
  }
  return topUpId === 'crew_user' ? 'Extra Crew Seat' : topUpId;
}

export default function PurchasedCapacityList({
  subscriptions,
}: {
  subscriptions: ActivePurchasedCapacitySubscription[];
}) {
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set());
  const [states, setStates] = useState<Record<string, CancelSubscriptionActionState>>({});
  const [pending, startTransition] = useTransition();

  if (!subscriptions || subscriptions.length === 0) {
    return null;
  }

  const runCancel = (stripeSubscriptionId: string) => {
    startTransition(async () => {
      const result = await cancelPurchasedCapacitySubscriptionAction(stripeSubscriptionId);
      setStates((prev) => ({ ...prev, [stripeSubscriptionId]: result }));
      setCancelingId(null);
      if (result?.ok) {
        setConfirmedIds((prev) => new Set([...prev, stripeSubscriptionId]));
      }
    });
  };

  return (
    <div className="plan-usage-capacity-addons">
      <div className="plan-addon-heading-row">
        <svg className="plan-usage-resource-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
        <h4 className="plan-addon-heading">Active Add-On Subscriptions</h4>
      </div>
      <ul className="plan-addon-subscription-list">
        {subscriptions.map((sub) => {
          const isCancelled = sub.canceledAt !== null || confirmedIds.has(sub.stripeSubscriptionId);
          const state = states[sub.stripeSubscriptionId];
          const isConfirming = cancelingId === sub.stripeSubscriptionId;
          const renewDate = formatDate(sub.currentPeriodEnd);

          return (
            <li
              key={sub.stripeSubscriptionId}
              className={`plan-addon-subscription-card ${isCancelled ? 'is-canceling' : ''}`}
            >
              <div className="plan-addon-subscription-info">
                <div className="plan-addon-subscription-title">
                  {skuName(sub.topUpId)} &mdash; {formatUsdFromCents(sub.unitAmountCents)}/mo
                </div>
                <div className="plan-addon-subscription-meta">
                  {sub.status === 'past_due' ? (
                    <span className="plan-addon-status-pill past-due">● Payment past due</span>
                  ) : isCancelled ? (
                    <span className="plan-addon-status-pill canceling">● Cancels at period end{renewDate ? ` (${renewDate})` : ''}</span>
                  ) : (
                    <span className="plan-addon-status-pill active">● {renewDate ? `Renews on ${renewDate}` : 'Active'}</span>
                  )}
                </div>
                {state?.ok === false ? (
                  <div className="plan-addon-error">
                    {state.error}
                  </div>
                ) : null}
              </div>

              <div className="plan-addon-subscription-actions">
                {!isCancelled && (
                  isConfirming ? (
                    <div className="plan-addon-button-row">
                      <button
                        type="button"
                        className="btn subtle plan-addon-confirm-btn"
                        disabled={pending}
                        onClick={() => runCancel(sub.stripeSubscriptionId)}
                      >
                        {pending ? 'Cancelling…' : 'Confirm cancel'}
                      </button>
                      <button
                        type="button"
                        className="btn plan-addon-keep-btn"
                        disabled={pending}
                        onClick={() => setCancelingId(null)}
                      >
                        Keep
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn subtle plan-addon-cancel-btn"
                      onClick={() => setCancelingId(sub.stripeSubscriptionId)}
                    >
                      Cancel renewal
                    </button>
                  )
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
