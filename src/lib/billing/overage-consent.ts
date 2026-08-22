/**
 * The exact words a contractor agrees to when they switch extra usage on.
 *
 * Same discipline as BASE_PLAN_RECURRING_CONSENT: the digest is what makes
 * "they agreed to THESE words" provable years later, so changing so much as a
 * comma requires a new version AND a new SHA-256, or old evidence stops being
 * interpretable. `set_workspace_overage_authorization` refuses a digest that is
 * not 64 hex characters, and test/overage-consent pins that this constant is
 * genuinely the hash of the text above it -- a hardcoded digest that drifted
 * from its text would be worse than no digest, because it would look like proof.
 *
 * WHAT THE TEXT HAD TO SAY, and why each clause is load-bearing:
 *
 *  - "up to the spending limit I set and never beyond it" -- the cap is a hard
 *    ceiling enforced in one statement under one lock, not a target.
 *  - "refused rather than partly charged" -- the surprising half. A text that
 *    would cross the cap does not go out half-billed; it does not go out. That
 *    is a thing that happens TO them and it belongs in what they agreed to,
 *    not in a help article.
 *  - "does not reverse usage already recorded" -- lowering the cap or switching
 *    off stops the future, not the past. Saying so here is what makes it fair
 *    that the function allows a cap below what is already spent.
 */

export const OVERAGE_AUTHORIZATION_VERSION = 'overage-authorization-2026-08-22' as const;

export const OVERAGE_AUTHORIZATION_TEXT = String.raw`By switching on extra usage, I authorize LETS GET QUOTED LLC to charge my payment method for usage beyond my plan's included allowances, at the published per-unit rates, up to the spending limit I set and never beyond it. Nothing is ever charged past my plan without this switch on and a limit set.

When the limit is reached, further sends and drafts are refused rather than partly charged. I may lower the limit or switch this off at any time; doing so stops further usage being charged and does not reverse usage already recorded.`;

/** SHA-256 of the exact UTF-8 text above, lowercase hex. */
export const OVERAGE_AUTHORIZATION_TEXT_SHA256 =
  '457e3ff72e48a93f85d9001d9fe714994265c8966771cdc6f0284810ea15bd33' as const;

export const OVERAGE_AUTHORIZATION_CONSENT = Object.freeze({
  version: OVERAGE_AUTHORIZATION_VERSION,
  text: OVERAGE_AUTHORIZATION_TEXT,
  textSha256: OVERAGE_AUTHORIZATION_TEXT_SHA256,
});

/**
 * The ceiling the database enforces, repeated here so the form can refuse a
 * number before a round trip rather than surfacing a Postgres error code.
 *
 * It is a UNITS guard, not a policy limit: the parameter is cents, and a caller
 * sending dollars-as-cents is out by a hundred in the expensive direction.
 * Kept in step with 20260822100000 by test/overage-authorization.
 */
export const OVERAGE_CAP_MAX_CENTS = 1_000_000;
export const OVERAGE_CAP_MIN_CENTS = 1;
