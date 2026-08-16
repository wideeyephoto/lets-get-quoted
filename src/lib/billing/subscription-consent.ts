/**
 * Canonical assent shown immediately before a paid base-plan Checkout.
 *
 * This is deliberately separate from the platform Terms. Terms acceptance is
 * account-wide; this shorter artifact records the owner's affirmative assent
 * to a specific recurring billing decision. Changing even punctuation requires
 * a new version and SHA-256 value so old evidence remains interpretable.
 */

export const BASE_PLAN_RECURRING_CONSENT_VERSION = 'base-plan-recurring-2026-08-16' as const;
/** A click that never reaches a durable Checkout claim must be repeated. */
export const BASE_PLAN_RECURRING_CONSENT_CLAIM_TTL_SECONDS = 30 * 60;

export const BASE_PLAN_RECURRING_CONSENT_TEXT = String.raw`By subscribing, I authorize LETS GET QUOTED LLC, through Stripe, to charge the payment method I provide in advance at the selected monthly or annual base-plan price shown at checkout. The subscription automatically renews on the same billing cadence until canceled. I may cancel before the next renewal; cancellation takes effect at the end of the current paid billing period.

First annual base-plan guarantee: once per verified business, I may convert the first annual base plan within 30 days after its initial charge. The refund equals the annual prepayment minus one normal month-to-month base charge for the selected plan. LGQ platform fees are not recalculated retroactively. Consumed add-ons, AI Voice Receptionist or carrier costs, Stripe fees, taxes, and custom work are excluded.`;

/** SHA-256 of the exact UTF-8 consent text above, encoded as lowercase hex. */
export const BASE_PLAN_RECURRING_CONSENT_TEXT_SHA256 = 'f39aeedb379d397f941d3c5fc48357703b4cc97148d8b1bb3c2f55b04e449c75' as const;

export const BASE_PLAN_RECURRING_CONSENT = Object.freeze({
  version: BASE_PLAN_RECURRING_CONSENT_VERSION,
  text: BASE_PLAN_RECURRING_CONSENT_TEXT,
  textSha256: BASE_PLAN_RECURRING_CONSENT_TEXT_SHA256,
});
