'use client';

import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

import {
  SELLABLE_TOP_UP_IDS,
  TOP_UPS,
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

function BuyButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn primary" type="submit" disabled={pending} aria-busy={pending}>
      {pending ? 'Opening secure checkout…' : label}
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

function unitsLabel(sku: TopUpDefinition): string {
  return `${sku.units.toLocaleString('en-US')} ${sku.resourceCode.replace(/_/g, ' ')}`;
}

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

  return (
    <section className="panel workspace-section-card" id="buy-credits">
      <div className="section-heading workspace-section-heading compact-heading">
        <p className="eyebrow">Need more</p>
        <h2>Buy add-on credits</h2>
      </div>
      <p className="workspace-details-copy plan-usage-intro">
        Purchased credits never expire and are added to the balances above. Prices come from LGQ&apos;s
        current catalog; this form never sends an amount or Stripe Price ID from your browser.
      </p>

      {returnStatus === 'success' ? (
        <p className="plan-usage-note" role="status">
          Thanks — your payment was received. Credits appear in the balances above once Stripe confirms
          the charge, usually within a minute.
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
            <small>{unitsLabel(sku)} · one-time · never expires</small>
            <form action={formAction}>
              <input type="hidden" name="topUpId" value={sku.id} />
              <input type="hidden" name="operationId" value={operationIds[sku.id] ?? ''} />
              {operationIds[sku.id] ? (
                <BuyButton label={`Buy for ${formatUsdFromCents(sku.priceCents)}`} />
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
    </section>
  );
}
