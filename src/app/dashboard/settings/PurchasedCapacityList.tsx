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
    <div className="plan-usage-capacity-addons" style={{ marginTop: '1.75rem' }}>
      <h4 style={{ fontSize: '0.98rem', fontWeight: 800, marginBottom: '0.85rem', color: 'var(--text)', letterSpacing: '-0.01em' }}>
        Active Add-On Subscriptions
      </h4>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
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
                gap: '1rem',
                flexWrap: 'wrap',
                padding: '1rem 1.25rem',
                background: 'linear-gradient(180deg, rgba(var(--tint), 0.04) 0%, rgba(var(--tint), 0.015) 100%)',
                backdropFilter: 'blur(12px)',
                borderRadius: '1rem',
                border: '1px solid var(--rule-t12)',
                boxShadow: '0 4px 16px -2px rgba(0, 0, 0, 0.15)',
              }}
            >
              <div>
                <div style={{ fontWeight: 800, fontSize: '0.96rem', color: 'var(--text)' }}>
                  {skuName(sub.topUpId)} &mdash; {formatUsdFromCents(sub.unitAmountCents)}/mo
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--mute-t50)', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  {sub.status === 'past_due' ? (
                    <span style={{ color: 'var(--danger)', fontWeight: 700 }}>● Payment past due</span>
                  ) : isCancelled ? (
                    <span style={{ color: 'var(--warn)', fontWeight: 700 }}>● Cancels at period end{renewDate ? ` (${renewDate})` : ''}</span>
                  ) : (
                    <span style={{ color: 'var(--ink-green-13)', fontWeight: 700 }}>● {renewDate ? `Renews on ${renewDate}` : 'Active'}</span>
                  )}
                </div>
                {state?.ok === false ? (
                  <div style={{ fontSize: '0.82rem', color: 'var(--danger)', marginTop: '0.35rem', fontWeight: 600 }}>
                    {state.error}
                  </div>
                ) : null}
              </div>

              <div>
                {!isCancelled && (
                  isConfirming ? (
                    <div style={{ display: 'flex', gap: '0.6rem' }}>
                      <button
                        type="button"
                        className="btn"
                        style={{ fontSize: '0.82rem', padding: '0.45rem 0.85rem' }}
                        disabled={pending}
                        onClick={() => runCancel(sub.stripeSubscriptionId)}
                      >
                        {pending ? 'Cancelling…' : 'Confirm cancel'}
                      </button>
                      <button
                        type="button"
                        className="btn subtle"
                        style={{ fontSize: '0.82rem', padding: '0.45rem 0.85rem' }}
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
                      style={{ fontSize: '0.82rem', padding: '0.45rem 0.85rem' }}
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
