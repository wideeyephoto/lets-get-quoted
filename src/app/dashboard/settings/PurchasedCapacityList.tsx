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
    <div className="plan-usage-capacity-addons" style={{ marginTop: '1.5rem' }}>
      <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.75rem' }}>
        Active Add-On Subscriptions
      </h4>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {subscriptions.map((sub) => {
          const isCancelled = sub.canceledAt !== null || confirmedIds.has(sub.stripeSubscriptionId);
          const state = states[sub.stripeSubscriptionId];
          const isConfirming = cancelingId === sub.stripeSubscriptionId;
          const renewDate = formatDate(sub.currentPeriodEnd);

          return (
            <li
              key={sub.stripeSubscriptionId}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.85rem 1rem',
                background: 'var(--surface-subtle, rgba(255, 255, 255, 0.04))',
                borderRadius: '8px',
                border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                  {skuName(sub.topUpId)} &mdash; {formatUsdFromCents(sub.unitAmountCents)}/mo
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted, #888)', marginTop: '0.2rem' }}>
                  {sub.status === 'past_due' ? (
                    <span style={{ color: 'var(--color-danger, #e53935)' }}>Payment past due</span>
                  ) : isCancelled ? (
                    <span>Cancels at period end{renewDate ? ` (${renewDate})` : ''}</span>
                  ) : (
                    <span>{renewDate ? `Renews on ${renewDate}` : 'Active'}</span>
                  )}
                </div>
                {state?.ok === false ? (
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-danger, #e53935)', marginTop: '0.25rem' }}>
                    {state.error}
                  </div>
                ) : null}
              </div>

              <div>
                {!isCancelled && (
                  isConfirming ? (
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        type="button"
                        className="btn"
                        style={{ fontSize: '0.8rem', padding: '0.35rem 0.65rem' }}
                        disabled={pending}
                        onClick={() => runCancel(sub.stripeSubscriptionId)}
                      >
                        {pending ? 'Cancelling…' : 'Confirm cancel'}
                      </button>
                      <button
                        type="button"
                        className="btn subtle"
                        style={{ fontSize: '0.8rem', padding: '0.35rem 0.65rem' }}
                        disabled={pending}
                        onClick={() => setCancelingId(null)}
                      >
                        Keep
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn subtle"
                      style={{ fontSize: '0.8rem', padding: '0.35rem 0.65rem' }}
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
