'use client';

import { useState, useTransition } from 'react';

import { BILLING_PLANS, formatUsdFromCents, type BillingCycle, type BillingPlanId } from '@/lib/billing/catalog';
import {
  BASE_PLAN_RECURRING_CONSENT_TEXT,
  BASE_PLAN_RECURRING_CONSENT_TEXT_SHA256,
  BASE_PLAN_RECURRING_CONSENT_VERSION,
} from '@/lib/billing/subscription-consent';

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

const TIERS: readonly BillingPlanId[] = ['flex', 'solo', 'growth', 'scale'];

const TIER_FEATURES: Record<BillingPlanId, readonly string[]> = {
  flex: [
    '1.50% platform fee',
    '1 Office + 2 Crew seats included',
    'Website message-button connect',
    'Free custom SEO website',
  ],
  solo: [
    '1.00% lower platform fee',
    '1 Office + 3 Crew seats included',
    '500 texts + 300 AI credits/mo',
    'Custom domain & SEO website',
  ],
  growth: [
    '0.25% low platform fee',
    '5 Office + 10 Crew seats included',
    '1,500 texts + 750 AI credits/mo',
    'Team dispatch & scheduling',
  ],
  scale: [
    '0.10% lowest platform fee',
    '15 Office + 50 Crew seats included',
    '3,000 texts + 1,500 AI credits/mo',
    '250 GB photo & file storage',
  ],
};

const TIER_SUBTITLES: Record<BillingPlanId, string> = {
  flex: 'Seasonal & starting out',
  solo: 'Owner-operator',
  growth: 'Growing team',
  scale: 'High volume & multi-crew',
};

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
  const [selectedCycle, setSelectedCycle] = useState<BillingCycle>(
    currentBillingInterval === 'annual' ? 'annual' : 'monthly',
  );
  const [state, setState] = useState<PlanChangeActionState>(null);
  const [confirming, setConfirming] = useState<PlanOption | null>(null);
  // Reset per confirmation, never sticky: a tick made for one plan must not
  // carry over to the next one the customer opens.
  const [consentAccepted, setConsentAccepted] = useState(false);
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

  /**
   * What just happened, said once it has.
   *
   * An immediate upgrade invoices the proration on the spot -- the Stripe call
   * uses `proration_behavior: 'always_invoice'` -- so money moves during this
   * click. Until now nothing acknowledged it: the action revalidated, the
   * current-plan line quietly changed from Solo to Growth, and a contractor who
   * had just been charged was left to infer that from a noun.
   *
   * Rendered in BOTH branches below, because a scheduled change revalidates into
   * the pending branch and would otherwise drop its own confirmation on the way
   * through.
   */
  const success = state?.ok === true ? state : null;
  const successNote = success === null ? null : (
    <p className="plan-usage-note" role="status">
      {/* Three outcomes, not two. `activated` is the one that moves money;
          `scheduled` promises a date and charges nothing; `no_change` means the
          request resolved to the plan they are already on, and saying "done"
          for that would imply something happened. */}
      {success.kind === 'activated'
        ? `You're on ${BILLING_PLANS[success.planCode].name} now. The difference for the rest of this billing period has been charged to your card on file.`
        : success.kind === 'scheduled'
          ? `Done — nothing changes today${asDate(success.effectiveAt) ? ` and nothing is charged. Your plan moves on ${asDate(success.effectiveAt)}.` : ' and nothing is charged. Your plan moves at your next renewal.'}`
          : `You are already on ${BILLING_PLANS[success.planCode].name}, so nothing changed.`}
    </p>
  );

  const run = (option: PlanOption) => startTransition(async () => {
    // Only an immediate change mints consent, so only it sends an affirmation.
    // The VERSION and DIGEST are the ones this component rendered; the server
    // compares them rather than trusting the boolean, so a stale tab cannot
    // authorise today's price under a disclosure it never showed.
    const result = await changeBasePlanAction(
      option.planCode,
      option.billingInterval,
      option.effect === 'immediate'
        ? {
          accepted: consentAccepted,
          consentVersion: BASE_PLAN_RECURRING_CONSENT_VERSION,
          consentTextSha256: BASE_PLAN_RECURRING_CONSENT_TEXT_SHA256,
        }
        : null,
    );
    setState(result);
    if (result?.ok) {
      setConfirming(null);
      setConsentAccepted(false);
    }
  });

  const clear = () => startTransition(async () => setState(await cancelScheduledPlanChangeAction()));

  if (pendingPlanCode) {
    const pendingName = BILLING_PLANS[pendingPlanCode as BillingPlanId]?.name ?? pendingPlanCode;
    return (
      <section className="panel workspace-section-card plan-change-panel" id="change-plan">
        <div className="workspace-section-headrow">
          <div className="section-heading workspace-section-heading compact-heading">
            <p className="eyebrow">Scheduled change</p>
            <div className="plan-change-title-row">
              <div className="plan-change-header-icon-wrap" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </div>
              <h3>Plan change scheduled</h3>
            </div>
          </div>
        </div>

        <div className="plan-change-scheduled-banner">
          <div className="plan-change-scheduled-flow">
            <span className="plan-change-step current">{currentName}</span>
            <span className="plan-change-arrow" aria-hidden="true">&rarr;</span>
            <span className="plan-change-step target">{pendingName}</span>
          </div>
          <p className="plan-change-scheduled-desc">
            {scheduledFor
              ? `You stay on ${currentName} until ${scheduledFor}, then move to ${pendingName}. Nothing changes before then.`
              : `You stay on ${currentName} until your renewal, then move to ${pendingName}.`}
          </p>
        </div>

        <p className="muted-note">
          Changed your mind? Cancelling this keeps you on {currentName} and nothing is charged differently.
        </p>
        {successNote}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="btn subtle plan-change-stay-btn" type="button" disabled={pending} aria-busy={pending} onClick={clear}>
          {pending ? 'Cancelling…' : `Stay on ${currentName}`}
        </button>
      </section>
    );
  }

  return (
    <section className="panel workspace-section-card plan-change-panel" id="change-plan">
      <div className="workspace-section-headrow plan-change-top-header">
        <div className="section-heading workspace-section-heading compact-heading">
          <p className="eyebrow">Subscription tier</p>
          <div className="plan-change-title-row">
            <div className="plan-change-header-icon-wrap" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </div>
            <h3>Change your plan</h3>
          </div>
        </div>

        <div className="plan-change-cycle-toggle-wrap" role="group" aria-label="Billing cycle selector">
          <button
            type="button"
            className={`plan-change-cycle-btn ${selectedCycle === 'monthly' ? 'is-active' : ''}`}
            aria-pressed={selectedCycle === 'monthly'}
            onClick={() => {
              setSelectedCycle('monthly');
              setConfirming(null);
              setConsentAccepted(false);
            }}
          >
            Monthly
          </button>
          <button
            type="button"
            className={`plan-change-cycle-btn ${selectedCycle === 'annual' ? 'is-active' : ''}`}
            aria-pressed={selectedCycle === 'annual'}
            onClick={() => {
              setSelectedCycle('annual');
              setConfirming(null);
              setConsentAccepted(false);
            }}
          >
            Annual <span className="plan-change-cycle-save-badge">SAVE 20%</span>
          </button>
        </div>
      </div>

      <div className="plan-change-current-bar">
        <span className="plan-change-current-status-dot" aria-hidden="true" />
        <span>
          {renewsOn
            ? `You are on ${currentName}, renewing ${renewsOn}.`
            : `You are on ${currentName}.`}
        </span>
      </div>

      {successNote}
      {error ? <p className="form-error" role="alert">{error}</p> : null}

      <div className="plan-change-grid" role="list">
        {TIERS.map((tierCode) => {
          const plan = BILLING_PLANS[tierCode];
          const targetInterval: 'none' | BillingCycle = tierCode === 'flex' ? 'none' : selectedCycle;
          const isCurrent = currentPlanCode === tierCode
            && (tierCode === 'flex' ? true : currentBillingInterval === selectedCycle);

          // Find the transition option from server calculations
          const option = isCurrent
            ? null
            : options.find(
              (opt) => opt.planCode === tierCode && opt.billingInterval === targetInterval,
            ) ?? null;

          const isConfirming = Boolean(
            option
            && confirming?.planCode === option.planCode
            && confirming?.billingInterval === option.billingInterval,
          );
          const isImmediate = option?.effect === 'immediate';
          const isAnnual = selectedCycle === 'annual' && tierCode !== 'flex';

          // Price labels
          const monthlyEquiv = tierCode === 'flex'
            ? 0
            : selectedCycle === 'annual'
              ? Math.round(plan.annualPriceCents / 12 / 100)
              : Math.round(plan.monthlyPriceCents / 100);

          const fullPriceSubtitle = tierCode === 'flex'
            ? 'No monthly subscription'
            : selectedCycle === 'annual'
              ? `${formatUsdFromCents(plan.annualPriceCents)}/yr prepaid`
              : 'Billed monthly';

          return (
            <div
              key={tierCode}
              className={`plan-change-card ${isCurrent ? 'is-current' : ''} ${isConfirming ? 'is-confirming' : ''} ${isImmediate ? 'is-immediate' : 'is-renewal'} ${tierCode === 'growth' ? 'is-featured' : ''}`}
              role="listitem"
            >
              {tierCode === 'growth' ? (
                <div className="plan-change-featured-ribbon">Most Popular</div>
              ) : null}

              <div className="plan-change-card-top">
                <div className="plan-change-card-heading">
                  <div className="plan-change-name-row">
                    <h4 className="plan-change-plan-name">{plan.name}</h4>
                    {isAnnual ? (
                      <span className="plan-change-tag-annual">SAVE 20%</span>
                    ) : null}
                  </div>
                  <div className="plan-change-effect-pill-wrap">
                    {isCurrent ? (
                      <span className="plan-change-effect-badge current">
                        ✓ Current Plan
                      </span>
                    ) : isImmediate ? (
                      <span className="plan-change-effect-badge instant">
                        <span className="plan-change-pulse-dot" aria-hidden="true" /> Instant Upgrade
                      </span>
                    ) : (
                      <span className="plan-change-effect-badge renewal">
                        📅 At Renewal
                      </span>
                    )}
                  </div>
                </div>

                <p className="plan-change-tier-subtitle">{TIER_SUBTITLES[tierCode]}</p>

                <div className="plan-change-price-box">
                  <div className="plan-change-price-main">
                    <span className="plan-change-price-currency">$</span>
                    <span className="plan-change-price-val">{monthlyEquiv}</span>
                    <span className="plan-change-price-interval">/mo</span>
                  </div>
                  <span className="plan-change-price-sub">{fullPriceSubtitle}</span>
                </div>

                <ul className="plan-change-perks-list">
                  {TIER_FEATURES[tierCode].map((perk) => (
                    <li key={perk}>
                      <svg className="plan-change-perk-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>{perk}</span>
                    </li>
                  ))}
                </ul>

                <p className="plan-change-timing-note">
                  {isCurrent
                    ? 'Your current active tier and billing cycle.'
                    : isImmediate
                      ? 'Takes effect now. You are charged the difference for the rest of this period.'
                      : renewsOn
                        ? `Takes effect ${renewsOn}, at your renewal. Nothing is charged today.`
                        : 'Takes effect at your renewal. Nothing is charged today.'}
                </p>
              </div>

              {isConfirming && isImmediate ? (
                <div className="base-plan-checkout-consent plan-change-consent-card">
                  <strong className="plan-change-consent-title">Recurring billing authorization</strong>
                  <div className="plan-change-consent-text">
                    {BASE_PLAN_RECURRING_CONSENT_TEXT.split('\n\n').map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                  <label className="base-plan-checkout-affirmation plan-change-affirmation">
                    <input
                      type="checkbox"
                      checked={consentAccepted}
                      onChange={(event) => setConsentAccepted(event.target.checked)}
                    />
                    <span>I have read this disclosure and authorize the recurring charges described above.</span>
                  </label>
                </div>
              ) : null}

              <div className="plan-change-action-row">
                {isCurrent ? (
                  <button
                    className="btn subtle plan-change-current-btn"
                    type="button"
                    disabled
                  >
                    Active Plan
                  </button>
                ) : isConfirming && option ? (
                  <div className="button-row plan-change-button-row">
                    <button
                      className="btn primary plan-change-confirm-btn"
                      type="button"
                      disabled={pending || (isImmediate && !consentAccepted)}
                      aria-busy={pending}
                      onClick={() => run(option)}
                    >
                      {pending
                        ? 'Working…'
                        : isImmediate ? `Upgrade and pay now` : `Schedule for renewal`}
                    </button>
                    <button
                      className="btn subtle plan-change-cancel-btn"
                      type="button"
                      disabled={pending}
                      onClick={() => { setConfirming(null); setConsentAccepted(false); }}
                    >
                      Not now
                    </button>
                  </div>
                ) : option ? (
                  <button
                    className={`btn ${isImmediate ? 'primary' : 'subtle'} plan-change-trigger-btn`}
                    type="button"
                    onClick={() => { setConfirming(option); setConsentAccepted(false); }}
                  >
                    {isImmediate ? 'Upgrade now \u2192' : 'Switch at renewal \u2192'}
                  </button>
                ) : (
                  <button
                    className="btn subtle plan-change-trigger-btn"
                    type="button"
                    disabled
                  >
                    Unavailable
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
