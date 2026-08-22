'use client';

import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

import {
  SELLABLE_TOP_UP_IDS,
  TOP_UPS,
  describeTopUpCadence,
  describeTopUpUnits,
  formatUsdFromCents,
  type BillingPlanId,
  type TopUpDefinition,
} from '@/lib/billing/catalog';
import type {
  TopUpPurchaseCheckoutActionState,
} from '@/lib/billing/top-up-purchase-entrypoint';
import { beginTopUpPurchaseCheckoutAction } from './top-up-checkout-actions';

/**
 * Buy one add-on. Dark behind LGQ_TOP_UP_PURCHASE_ENABLED, like everything else
 * on this path.
 *
 * WITHHELD SKUS ARE NOT RENDERED AT ALL -- not even as "coming soon". Three of
 * the eight are withheld because nothing fulfils them yet (see TOP_UPS_WITHHELD
 * for the reason on each), and advertising a price for something that would
 * grant nothing invites a support conversation LGQ cannot finish. The published
 * appendix is where the settled price book lives; this card is a place to spend
 * money, so it lists only what can actually be bought.
 *
 * The list is derived the same way the tests derive it -- SELLABLE_TOP_UP_IDS,
 * then the SKU's own eligiblePlans -- so a stale UI cannot offer something
 * requireSellableTopUp would refuse. It is still only a hint: the server
 * boundary decides.
 */

type PlanCode = BillingPlanId | 'enterprise';

const INITIAL_STATE: TopUpPurchaseCheckoutActionState | null = null;

function BuyButton({ label, frozen }: { label: string; frozen: boolean }) {
  const { pending } = useFormStatus();
  // `frozen` is the whole card, not this form: once one SKU has produced a
  // checkout URL the browser is already navigating to Stripe, and a second
  // click would claim a second intent nobody will ever pay.
  const busy = pending || frozen;
  return (
    <button className="btn primary" type="submit" disabled={busy} aria-busy={busy}>
      {busy ? 'Opening secure checkout…' : label}
    </button>
  );
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
  return `top-up-purchase:${globalThis.crypto.randomUUID().toLowerCase()}`;
}

function offeredTopUps(planCode: PlanCode): TopUpDefinition[] {
  return SELLABLE_TOP_UP_IDS
    .map((id) => TOP_UPS[id])
    .filter((sku) => (sku.eligiblePlans as readonly string[]).includes(planCode));
}

// unitsLabel used to live here and derived its noun from the resource code,
// which produced "1 crew users". Both halves of the line now come from the
// catalog, which is the only thing that knows whether a SKU recurs.

export default function TopUpPurchaseCheckout({
  planCode,
  returnStatus = null,
}: {
  planCode: PlanCode;
  returnStatus?: 'success' | 'canceled' | null;
}) {
  const offered = offeredTopUps(planCode);
  const [operationIds, setOperationIds] = useState<Readonly<Record<string, string>>>({});
  const [clientRedirectError, setClientRedirectError] = useState(false);
  const [state, formAction] = useFormState(beginTopUpPurchaseCheckoutAction, INITIAL_STATE);

  // Mint after hydration so server and browser markup cannot disagree. React
  // preserves this state across Server Action rerenders, so a retry of one
  // visible intent replays the same operation; a real page reload starts new
  // ones, which is what a spent intent needs.
  useEffect(() => {
    const minted: Record<string, string> = {};
    for (const sku of offered) {
      const id = newBrowserOperationId();
      if (id) minted[sku.id] = id;
    }
    setOperationIds(minted);
    // The offered list is derived from a prop that does not change while this
    // card is mounted, so one mint per mount is the whole lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planCode]);

  useEffect(() => {
    if (!state?.ok) return;
    if (!isStripeHostedCheckoutUrl(state.checkoutUrl)) {
      setClientRedirectError(true);
      return;
    }
    window.location.assign(state.checkoutUrl);
  }, [state]);

  if (offered.length === 0) return null;

  // The card used to offer five one-time credit packs and said so throughout --
  // "credits", "never expire", "added to the balances above". A recurring seat
  // is none of those things, so the copy follows what is actually on offer
  // rather than what was on offer the day it was written.
  const hasRecurring = offered.some((sku) => sku.recurring);
  const hasCredits = offered.some((sku) => !sku.recurring);

  return (
    <section className="panel workspace-section-card" id="buy-credits">
      <details className="workspace-fold" open={returnStatus !== null}>
        <summary>
          <span className="section-heading workspace-section-heading compact-heading">
            <span className="eyebrow">Add-ons</span>
            <span className="workspace-fold-title">{hasRecurring ? 'Add credits or capacity' : 'Add credits'}</span>
          </span>
          <em className="workspace-fold-note neutral">View options</em>
        </summary>
        <p className="workspace-details-copy plan-usage-intro">
          {hasCredits ? 'Purchased credits never expire. ' : ''}
          {hasRecurring ? 'Monthly add-ons renew until canceled. ' : ''}
          Prices and eligibility are verified again at secure checkout.
        </p>

      {returnStatus === 'success' ? (
        <p className="plan-usage-note" role="status">
          Thanks — your payment was received. What you bought is applied once Stripe confirms the
          charge; refresh this page to see it. Nothing is lost if that takes a while.
        </p>
      ) : null}
      {returnStatus === 'canceled' ? (
        <p className="plan-usage-note" role="status">
          Checkout was canceled and nothing was charged.
        </p>
      ) : null}

      <div className="plan-usage-balance-grid">
        {offered.map((sku) => (
          <article className="plan-usage-balance" key={sku.id}>
            <span>{sku.label}</span>
            <strong>{formatUsdFromCents(sku.priceCents)}</strong>
            <small>{describeTopUpUnits(sku)} · {describeTopUpCadence(sku)}</small>
            <form action={formAction}>
              <input type="hidden" name="topUpId" value={sku.id} />
              <input type="hidden" name="operationId" value={operationIds[sku.id] ?? ''} />
              {operationIds[sku.id] ? (
                <BuyButton
                  // The period belongs on the button too. This is the last
                  // thing read before checkout opens, and "Buy for $5.00" on a
                  // subscription is the sentence somebody remembers when the
                  // second month arrives.
                  label={sku.recurring
                    ? `Subscribe for ${formatUsdFromCents(sku.priceCents)}/month`
                    : `Buy for ${formatUsdFromCents(sku.priceCents)}`}
                  frozen={Boolean(state?.ok) && !clientRedirectError}
                />
              ) : (
                <button className="btn primary" type="button" disabled>Preparing secure checkout…</button>
              )}
            </form>
          </article>
        ))}
      </div>

      <p className="workspace-details-copy plan-usage-intro">
        Stripe securely collects your payment details. Nothing is charged on this page.
      </p>

        <div aria-live="polite">
        {state && !state.ok ? (
          <p className="plan-usage-note warning" role="alert">{state.message}</p>
        ) : null}
        {state?.ok && !clientRedirectError ? (
          <p className="plan-usage-note" role="status">Opening Stripe&apos;s secure checkout…</p>
        ) : null}
        {clientRedirectError ? (
          <p className="plan-usage-note warning" role="alert">
            The checkout link could not be verified in this browser. LGQ did not submit another request;
            contact support so we can reconcile the existing checkout safely.
          </p>
        ) : null}
        </div>
      </details>
    </section>
  );
}
