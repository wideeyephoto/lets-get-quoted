import { parseBillingPlanId, type BillingCycle, type BillingPlanId } from '@/lib/billing/catalog';

/**
 * The plan a visitor picked on /pricing, carried across the sign-up boundary.
 *
 * Every CTA on /pricing already appended `plan=<id>&billing=<cycle>` to the
 * signup link, and /login read neither. The choice reached our own front door in
 * the address bar and was dropped there: the account was created with no plan,
 * so someone who clicked "Choose Scale" and someone who clicked "Start with
 * Flex" produced byte-identical rows.
 *
 * Three constraints shaped this:
 *
 *  - The apex marketing host and the app host are different origins, so a cookie
 *    set on /pricing does not arrive. The query string is the only carrier that
 *    already crosses, and `next` is the only rail already built to carry one
 *    through a magic-link round trip. This rides that rail rather than adding a
 *    second one -- see the exploit recorded in src/lib/app-origin.ts for why
 *    inventing another redirect parameter is not free.
 *  - Flex is free. It parses to null rather than to an intent, because there is
 *    nothing to buy and the far side would have to guess what to do with it.
 *    That is the same rule the /pricing CTA already applies to AI Voice.
 *  - This module is imported by client components, so it must not pull in
 *    'server-only'. It reads nothing from the environment; deciding whether the
 *    checkout surface is live is the server's job, not this file's.
 */

export type PaidPlanCode = Exclude<BillingPlanId, 'flex'>;

export type PlanIntent = Readonly<{
  planCode: PaidPlanCode;
  billingInterval: BillingCycle;
}>;

export const PLAN_INTENT_PLAN_PARAM = 'plan';
export const PLAN_INTENT_BILLING_PARAM = 'billing';

/** Where a first-run visitor carrying an intent is sent to finish signing up. */
export const WELCOME_PATH = '/welcome';

/**
 * The section id the paid-plan checkout renders under, so the deep link opens on
 * the right part of a long settings page. It only exists when the checkout is
 * enabled -- see the anchors list in src/app/dashboard/settings/page.tsx.
 */
export const PLAN_CHECKOUT_ANCHOR = 'choose-paid-plan';

/**
 * Parse a (plan, billing) pair from untrusted input -- a query string typed by
 * anyone. Returns null for anything that is not a paid plan, so callers get a
 * value they can act on or nothing at all, never a half-parsed one.
 *
 * A missing or unrecognised billing cycle falls back to monthly rather than
 * voiding the whole intent. This only pre-selects a control the customer still
 * has to operate, and monthly is the smaller commitment of the two; it is also
 * what the checkout form already defaults to on its own.
 */
export function parsePlanIntent(plan: unknown, billing: unknown): PlanIntent | null {
  // parseBillingPlanId also resolves the legacy free/pro/crew_plus aliases, and
  // returns null for anything it does not recognise.
  const planCode = parseBillingPlanId(plan);
  if (planCode === null || planCode === 'flex') return null;
  return { planCode, billingInterval: billing === 'annual' ? 'annual' : 'monthly' };
}

/** `plan=growth&billing=annual`, ready to append to a path. */
export function planIntentQuery(intent: PlanIntent): string {
  return new URLSearchParams({
    [PLAN_INTENT_PLAN_PARAM]: intent.planCode,
    [PLAN_INTENT_BILLING_PARAM]: intent.billingInterval,
  }).toString();
}

/**
 * Where /login points `next` when the visitor arrived carrying an intent.
 *
 * /welcome, not the checkout: requireOwnerContext sends every first-run owner
 * there unconditionally, and /welcome forwards nothing, so any deeper
 * destination would be swallowed for exactly the population /pricing sends.
 * Landing on the screen they were going to see anyway keeps the intent in hand
 * until there is an account to attach it to.
 */
export function welcomePathWithPlanIntent(intent: PlanIntent): string {
  return `${WELCOME_PATH}?${planIntentQuery(intent)}`;
}

/** The settings deep link that pre-selects the plan, once checkout is live. */
export function planCheckoutPath(intent: PlanIntent): string {
  return `/dashboard/settings?${planIntentQuery(intent)}#${PLAN_CHECKOUT_ANCHOR}`;
}
