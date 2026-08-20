'use client';

import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

import {
  BILLING_PLANS,
  formatUsdFromCents,
  type BillingCycle,
} from '@/lib/billing/catalog';
import type {
  BasePlanSubscriptionCheckoutActionState,
} from '@/lib/billing/base-plan-subscription-entrypoint';
import {
  BASE_PLAN_RECURRING_CONSENT_TEXT,
  BASE_PLAN_RECURRING_CONSENT_TEXT_SHA256,
  BASE_PLAN_RECURRING_CONSENT_VERSION,
} from '@/lib/billing/subscription-consent';
import { beginBasePlanSubscriptionCheckoutAction } from './subscription-checkout-actions';

type PaidPlanCode = 'solo' | 'growth' | 'scale';

const INITIAL_STATE: BasePlanSubscriptionCheckoutActionState | null = null;
const PAID_PLANS = ['solo', 'growth', 'scale'] as const;

function SubscribeButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn primary" type="submit" disabled={pending} aria-busy={pending}>
      {pending ? 'Opening secure checkout…' : 'Continue to secure checkout'}
    </button>
  );
}

function billingPriceLabel(planCode: PaidPlanCode, interval: BillingCycle): string {
  const plan = BILLING_PLANS[planCode];
  if (interval === 'monthly') return `${formatUsdFromCents(plan.monthlyPriceCents)}/month`;
  return `${formatUsdFromCents(plan.annualPriceCents)}/year (${formatUsdFromCents(plan.annualPriceCents / 12)}/month billed annually)`;
}

function isStripeHostedCheckoutUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:'
      && parsed.origin === 'https://checkout.stripe.com'
      && !parsed.username
      && !parsed.password
      && parsed.pathname !== '/';
  } catch {
    return false;
  }
}

function newBrowserOperationId(): string | null {
  if (typeof globalThis.crypto?.randomUUID !== 'function') return null;
  return `base-plan-subscription:${globalThis.crypto.randomUUID().toLowerCase()}`;
}

export default function BasePlanSubscriptionCheckout({
  initialPlanCode = null,
  initialBillingInterval = null,
}: {
  // Where the visitor said, on /pricing, which plan they wanted. Only ever a
  // pre-selection: the controls stay live, and consent is still reset on every
  // change below, so arriving here pre-filled buys nothing on its own.
  initialPlanCode?: PaidPlanCode | null;
  initialBillingInterval?: BillingCycle | null;
} = {}) {
  const [planCode, setPlanCode] = useState<PaidPlanCode>(initialPlanCode ?? 'solo');
  const [billingInterval, setBillingInterval] = useState<BillingCycle>(initialBillingInterval ?? 'monthly');
  const [operationId, setOperationId] = useState<string | null>(null);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [clientRedirectError, setClientRedirectError] = useState(false);
  const [state, formAction] = useFormState(beginBasePlanSubscriptionCheckoutAction, INITIAL_STATE);

  // Mint after hydration so server and browser markup cannot disagree. React
  // preserves this state across Server Action rerenders, making retries of one
  // visible intent stable; a real page reload intentionally starts a new one.
  useEffect(() => {
    setOperationId(newBrowserOperationId());
  }, []);

  useEffect(() => {
    if (!state?.ok) return;
    if (!isStripeHostedCheckoutUrl(state.checkoutUrl)) {
      setClientRedirectError(true);
      return;
    }
    window.location.assign(state.checkoutUrl);
  }, [state]);

  return (
    <section className="panel workspace-section-card" id="choose-paid-plan">
      <div className="section-heading workspace-section-heading compact-heading">
        <p className="eyebrow">Ready for more</p>
        <h2>Start your first paid plan</h2>
      </div>
      <p className="workspace-details-copy plan-usage-intro">
        Choose the plan and billing schedule that fit today. The amount below comes from LGQ&apos;s
        current catalog; this form never sends an amount or Stripe Price ID from your browser.
      </p>

      <form action={formAction} className="base-plan-checkout-form">
        <input type="hidden" name="operationId" value={operationId ?? ''} />
        <input
          type="hidden"
          name="recurringConsentVersion"
          value={BASE_PLAN_RECURRING_CONSENT_VERSION}
        />
        <input
          type="hidden"
          name="recurringConsentTextSha256"
          value={BASE_PLAN_RECURRING_CONSENT_TEXT_SHA256}
        />

        <div className="form-grid base-plan-checkout-choice">
          <label className="field">
            <span>Plan</span>
            <select
              name="planCode"
              value={planCode}
              onChange={(event) => {
                setPlanCode(event.target.value as PaidPlanCode);
                setConsentAccepted(false);
              }}
            >
              {PAID_PLANS.map((id) => (
                <option key={id} value={id}>{BILLING_PLANS[id].name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Billing schedule</span>
            <select
              name="billingInterval"
              value={billingInterval}
              onChange={(event) => {
                setBillingInterval(event.target.value as BillingCycle);
                setConsentAccepted(false);
              }}
            >
              <option value="monthly">Monthly</option>
              <option value="annual">Annual</option>
            </select>
          </label>
        </div>

        <div className="base-plan-checkout-price" aria-live="polite">
          <span>{BILLING_PLANS[planCode].name}</span>
          <strong>{billingPriceLabel(planCode, billingInterval)}</strong>
          <small>{(BILLING_PLANS[planCode].platformFeeBps / 100).toFixed(2)}% LGQ platform fee</small>
        </div>

        <div className="base-plan-checkout-consent">
          <strong>Recurring billing authorization</strong>
          {BASE_PLAN_RECURRING_CONSENT_TEXT.split('\n\n').map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          <label className="base-plan-checkout-affirmation">
            <input
              type="checkbox"
              name="recurringConsentAccepted"
              value="yes"
              checked={consentAccepted}
              onChange={(event) => setConsentAccepted(event.target.checked)}
              required
            />
            <span>I have read this disclosure and authorize the recurring charges described above.</span>
          </label>
        </div>

        <div className="base-plan-checkout-actions">
          {operationId ? <SubscribeButton /> : (
            <button className="btn primary" type="button" disabled>Preparing secure checkout…</button>
          )}
          <span>Stripe securely collects your payment details. Nothing is charged on this page.</span>
        </div>

        {state && !state.ok ? (
          <p className="plan-usage-note warning" role="alert">{state.message}</p>
        ) : null}
        {state?.ok ? (
          <p className="plan-usage-note" role="status">Opening Stripe&apos;s secure checkout…</p>
        ) : null}
        {clientRedirectError ? (
          <p className="plan-usage-note warning" role="alert">
            The checkout link could not be verified in this browser. LGQ did not submit another request;
            contact support so we can reconcile the existing checkout safely.
          </p>
        ) : null}
      </form>
    </section>
  );
}
