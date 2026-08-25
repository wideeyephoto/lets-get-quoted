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
  const sellable = SELLABLE_TOP_UP_IDS
    .map((id) => TOP_UPS[id])
    .filter((sku) => (sku.eligiblePlans as readonly string[]).includes(planCode));

  // AI Intake and AI Writing Drafts share a unified flexible pool across the product.
  // Consolidate them into a single 250 AI Credits top-up pack ($19) so AI and draft credits are one.
  const hasAi = sellable.some((sku) => sku.resourceCode === 'ai_writing_drafts');
  const filtered = hasAi
    ? sellable.filter((sku) => sku.resourceCode !== 'ai_intake_threads')
    : sellable;

  return filtered.map((sku) => {
    if (sku.resourceCode === 'ai_writing_drafts') {
      return {
        ...sku,
        label: '250 AI Credits',
      };
    }
    return sku;
  });
}

// unitsLabel used to live here and derived its noun from the resource code,
// which produced "1 crew users". Both halves of the line now come from the
// catalog, which is the only thing that knows whether a SKU recurs.

function TopUpIcon({ id }: { id: string }) {
  if (id.startsWith('text')) {
    return (
      <svg className="plan-usage-resource-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    );
  }
  if (id.startsWith('marketing_email')) {
    return (
      <svg className="plan-usage-resource-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <polyline points="22,6 12,13 2,6" />
      </svg>
    );
  }
  if (id.startsWith('ai')) {
    return (
      <svg className="plan-usage-resource-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      </svg>
    );
  }
  if (id.startsWith('crew')) {
    return (
      <svg className="plan-usage-resource-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    );
  }
  return (
    <svg className="plan-usage-resource-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
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

  // The card used to offer five one-time credit packs and said so throughout --
  // "credits", "never expire", "added to the balances above". A recurring seat
  // is none of those things, so the copy follows what is actually on offer
  // rather than what was on offer the day it was written.
  const hasRecurring = offered.some((sku) => sku.recurring);
  const hasCredits = offered.some((sku) => !sku.recurring);

  return (
    <details
      className="panel workspace-section-card workspace-fold"
      id="buy-credits"
      open={returnStatus !== null}
    >
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
          <article className="plan-usage-balance plan-topup-card" key={sku.id}>
            <div className="plan-topup-card-header">
              <div className="plan-topup-title-row">
                <TopUpIcon id={sku.id} />
                <span>{sku.label}</span>
              </div>
              {sku.recurring ? (
                <span className="plan-topup-badge recurring">MONTHLY ADD-ON</span>
              ) : (
                <span className="plan-topup-badge onetime">ONE-TIME PACK</span>
              )}
            </div>
            <div className="plan-topup-price-row">
              <strong>{formatUsdFromCents(sku.priceCents)}</strong>
              {sku.recurring ? <span className="plan-topup-interval">/ mo</span> : null}
            </div>
            <small>{sku.resourceCode === 'ai_writing_drafts' ? '250 AI credits' : describeTopUpUnits(sku)} · {describeTopUpCadence(sku)}</small>
            {sku.resourceCode === 'ai_writing_drafts' ? (
              <small className="plan-topup-flex-hint">⚡ Powers Smart Intake lead qualification, AI quotes &amp; marketing copy</small>
            ) : null}
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

      <div className="plan-topup-security-badge">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <span>Stripe 256-bit Encrypted Checkout • Instant Provisioning • Zero Card Data Stored on LGQ</span>
      </div>

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
  );
}
