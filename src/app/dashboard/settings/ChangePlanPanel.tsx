'use client';

import { useState, useTransition } from 'react';

import { BILLING_PLANS, type BillingCycle, type BillingPlanId } from '@/lib/billing/catalog';

import {
  cancelScheduledPlanChangeAction,
  changeBasePlanAction,
  type PlanChangeActionState,
} from './plan-change-actions';

/**
 * Moving between paid plans, which the product had no surface for at all.
 *
 * The checkout form is gated on `planCode === 'flex'`, so it renders only for a
 * workspace that has never subscribed. A paying customer could not change tier
 * or billing cycle by any self-serve route, and both seat top-ups are withheld
 * -- so outgrowing a plan meant emailing us.
 *
 * The two outcomes are deliberately labelled differently, because they are
 * different promises. An upgrade on the same billing cycle charges the
 * difference now and takes effect immediately. Everything else -- any downgrade,
 * and any change of billing cycle -- takes effect at renewal, which is what
 * stops an annual subscriber leaving the term they paid for by switching to
 * monthly. Saying "changes now" for one of those would be a lie the customer
 * would discover on their next invoice.
 */

type PlanOption = Readonly<{
  planCode: BillingPlanId;
  billingInterval: 'none' | BillingCycle;
  label: string;
  effect: 'immediate' | 'at_renewal';
  priceLabel: string;
}>;

export default function ChangePlanPanel({
  currentPlanCode,
  currentBillingInterval,
  currentPeriodEnd,
  pendingPlanCode,
  pendingEffectiveAt,
  options,
}: {
  currentPlanCode: BillingPlanId;
  currentBillingInterval: 'none' | BillingCycle;
  currentPeriodEnd: string | null;
  pendingPlanCode: string | null;
  pendingEffectiveAt: string | null;
  options: readonly PlanOption[];
}) {
  const [state, setState] = useState<PlanChangeActionState>(null);
  const [confirming, setConfirming] = useState<PlanOption | null>(null);
  const [pending, startTransition] = useTransition();

  const asDate = (value: string | null): string | null => {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
      ? null
      : parsed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  // The cycle belongs in the label, not just the plan: "Growth" and "Growth,
  // annual" are different prices and different rules about when a change lands,
  // and somebody choosing between the options below needs to know which they are on.
  const currentName = currentBillingInterval === 'none'
    ? BILLING_PLANS[currentPlanCode].name
    : `${BILLING_PLANS[currentPlanCode].name}, ${currentBillingInterval}`;
  const renewsOn = asDate(currentPeriodEnd);
  const scheduledFor = asDate(pendingEffectiveAt);
  const error = state?.ok === false ? state.error : null;

  const run = (option: PlanOption) => startTransition(async () => {
    const result = await changeBasePlanAction(option.planCode, option.billingInterval);
    setState(result);
    if (result?.ok) setConfirming(null);
  });

  const clear = () => startTransition(async () => setState(await cancelScheduledPlanChangeAction()));

  if (pendingPlanCode) {
    const pendingName = BILLING_PLANS[pendingPlanCode as BillingPlanId]?.name ?? pendingPlanCode;
    return (
      <section className="panel workspace-section-card" id="change-plan">
        <div className="section-heading workspace-section-heading compact-heading">
          <h3>Plan change scheduled</h3>
        </div>
        <p>
          {scheduledFor
            ? `You stay on ${currentName} until ${scheduledFor}, then move to ${pendingName}. Nothing changes before then.`
            : `You stay on ${currentName} until your renewal, then move to ${pendingName}.`}
        </p>
        <p className="muted-note">
          Changed your mind? Cancelling this keeps you on {currentName} and nothing is charged differently.
        </p>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="btn subtle" type="button" disabled={pending} aria-busy={pending} onClick={clear}>
          {pending ? 'Cancelling…' : `Stay on ${currentName}`}
        </button>
      </section>
    );
  }

  return (
    <section className="panel workspace-section-card" id="change-plan">
      <div className="section-heading workspace-section-heading compact-heading">
        <h3>Change your plan</h3>
      </div>
      <p>
        {renewsOn
          ? `You are on ${currentName}, renewing ${renewsOn}.`
          : `You are on ${currentName}.`}
      </p>

      {error ? <p className="form-error" role="alert">{error}</p> : null}

      <ul className="plan-change-options">
        {options.map((option) => {
          const isConfirming = confirming?.planCode === option.planCode
            && confirming?.billingInterval === option.billingInterval;
          return (
            <li key={`${option.planCode}_${option.billingInterval}`}>
              <div>
                <strong>{option.label}</strong>
                <span className="muted-note"> {option.priceLabel}</span>
                <p className="muted-note">
                  {option.effect === 'immediate'
                    ? 'Takes effect now. You are charged the difference for the rest of this period.'
                    : renewsOn
                      ? `Takes effect ${renewsOn}, at your renewal. Nothing is charged today.`
                      : 'Takes effect at your renewal. Nothing is charged today.'}
                </p>
              </div>
              {isConfirming ? (
                <div className="button-row">
                  <button
                    className="btn"
                    type="button"
                    disabled={pending}
                    aria-busy={pending}
                    onClick={() => run(option)}
                  >
                    {pending
                      ? 'Working…'
                      : option.effect === 'immediate' ? `Upgrade and pay now` : `Schedule for renewal`}
                  </button>
                  <button className="btn subtle" type="button" disabled={pending} onClick={() => setConfirming(null)}>
                    Not now
                  </button>
                </div>
              ) : (
                <button className="btn subtle" type="button" onClick={() => setConfirming(option)}>
                  {option.effect === 'immediate' ? 'Upgrade' : 'Switch at renewal'}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
