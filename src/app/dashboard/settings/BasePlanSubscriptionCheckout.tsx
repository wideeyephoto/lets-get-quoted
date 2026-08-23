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

function SubscribeButton({ frozen }: { frozen: boolean }) {
  const { pending } = useFormStatus();
  // `frozen` covers the window this button was previously live in: after the
  // action returns a checkout URL, the browser is already navigating to Stripe,
  // and `pending` has gone back to false. A second click in that window claims a
  // second subscription intent nobody will ever pay. The top-up card next door
  // has guarded this since it was written; this one never did.
  const busy = pending || frozen;
  return (
    <button className="btn primary" type="submit" disabled={busy} aria-busy={busy}>
      {busy ? 'Opening secure checkout…' : 'Continue to secure checkout'}
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
  embedded = false,
  activeCheckoutUrl = null,
  activeCheckoutPlanName = null,
}: {
  // Where the visitor said, on /pricing, which plan they wanted. Only ever a
  // pre-selection: the controls stay live, and consent is still reset on every
  // change below, so arriving here pre-filled buys nothing on its own.
  initialPlanCode?: PaidPlanCode | null;
  initialBillingInterval?: BillingCycle | null;
  embedded?: boolean;
  activeCheckoutUrl?: string | null;
  activeCheckoutPlanName?: string | null;
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
    <div
      className={embedded ? 'plan-usage-embedded-checkout' : 'panel workspace-section-card'}
    >
      <details
        className="workspace-fold"
        id="choose-paid-plan"
        open={Boolean(initialPlanCode || initialBillingInterval || activeCheckoutUrl)}
      >
        <summary>
          <span className="section-heading workspace-section-heading compact-heading">
            <span className="eyebrow">Plans</span>
            <span className="workspace-fold-title">Review paid plans</span>
          </span>
          <em className="workspace-fold-note neutral">Optional</em>
        </summary>
        <p className="workspace-details-copy plan-usage-intro">
          Choose a plan and billing schedule, then review the exact recurring terms before checkout.
        </p>

        {activeCheckoutUrl && (!state || state.ok) ? (
          <div className="plan-usage-note info" style={{ marginBottom: '1.25rem' }}>
            <p>
              A checkout session is already open{activeCheckoutPlanName ? ` for ${activeCheckoutPlanName}` : ''}.
            </p>
            <div style={{ marginTop: '0.65rem' }}>
              <a
                href={activeCheckoutUrl}
                className="btn primary compact"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', textDecoration: 'none' }}
              >
                Resume open checkout →
              </a>
            </div>
          </div>
        ) : null}

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
          {operationId ? <SubscribeButton frozen={Boolean(state?.ok) && !clientRedirectError} /> : (
            <button className="btn primary" type="button" disabled>Preparing secure checkout…</button>
          )}
          <span>Stripe securely collects your payment details. Nothing is charged on this page.</span>
        </div>

        {state && !state.ok ? (
          <div className="plan-usage-note warning" role="alert">
            <p>{state.message}</p>
            {state.resumeCheckoutUrl ? (
              <div style={{ marginTop: '0.65rem' }}>
                <a
                  href={state.resumeCheckoutUrl}
                  className="btn primary compact"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', textDecoration: 'none' }}
                >
                  Resume open checkout →
                </a>
              </div>
            ) : null}
          </div>
        ) : null}
        {/* Not shown once the URL has failed verification. Both used to render,
            so the moment something went wrong with a subscription the screen
            said "Opening Stripe's secure checkout…" directly above "the checkout
            link could not be verified — contact support". */}
        {state?.ok && !clientRedirectError ? (
          <p className="plan-usage-note" role="status">Opening Stripe&apos;s secure checkout…</p>
        ) : null}
        {clientRedirectError ? (
          <p className="plan-usage-note warning" role="alert">
            The checkout link could not be verified in this browser. LGQ did not submit another request;
            contact support so we can reconcile the existing checkout safely.
          </p>
        ) : null}
        </form>
      </details>
    </div>
  );
}
