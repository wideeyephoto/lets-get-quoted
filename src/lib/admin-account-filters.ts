/**
 * The vocabulary a count uses to hand its rows to the accounts list.
 *
 * The console is full of numbers — "Not onboarded: 12", "Payouts paused: 3" —
 * and until now every one of them was a dead end: a figure with no way to ask
 * which twelve. The rule this module exists to serve is that clicking a number
 * opens the rows behind it, says what is wrong with each, and offers the thing
 * you would do next.
 *
 * Two halves, both pure:
 *
 *   AccountFilter    the named slices the accounts list can show, so a card can
 *                    link to /admin/accounts?filter=not_onboarded and land on
 *                    exactly its own rows rather than on an unfiltered list the
 *                    reader has to re-derive the number from.
 *   OnboardingStage  which of the two ways "not onboarded" happens — because
 *                    they need different things done about them, and a single
 *                    "not onboarded" label hides that entirely.
 */

import type { DateRange } from '@/lib/command-center-logic';

export const ACCOUNT_FILTERS = ['not_onboarded', 'connect_incomplete', 'payouts_paused', 'suspended'] as const;

export type AccountFilter = (typeof ACCOUNT_FILTERS)[number];

export function isAccountFilter(value: string | null | undefined): value is AccountFilter {
  return !!value && (ACCOUNT_FILTERS as readonly string[]).includes(value);
}

/**
 * What each slice is called and, more usefully, what it means.
 *
 * `blurb` is rendered above the table. A filtered list with no explanation is
 * how two staff members come away with different ideas of what they just
 * counted — which is the same failure as an undefined metric, one screen later.
 */
export const ACCOUNT_FILTER_INFO: Record<AccountFilter, { label: string; blurb: string }> = {
  not_onboarded: {
    label: 'Not onboarded',
    blurb: 'Cannot take a payment yet: Stripe payout setup is unfinished. Each row says how far they got.',
  },
  connect_incomplete: {
    label: 'Stopped partway',
    blurb:
      'Started Stripe payout setup and did not finish. Stripe is usually waiting on an ID document or a bank account — the row links to their Connect record so you can see which.',
  },
  payouts_paused: {
    label: 'Payouts paused',
    blurb: 'Stripe has disabled payouts on these accounts. Money still arrives; it just does not leave.',
  },
  suspended: {
    label: 'Suspended',
    blurb: 'Suspended by staff. The owner cannot sign in. Each row shows who did it and why.',
  },
};

/**
 * "Joined in the last N days", using the Command Center's own range vocabulary.
 *
 * Separate from AccountFilter because it composes with it rather than replacing
 * it — "not onboarded AND joined this month" is a real question, and a single
 * mutually-exclusive filter list cannot express it. It exists so the "New
 * accounts" metric can hand over the same window it counted; a drill-down onto
 * an all-time list would show a different number from the one clicked.
 */
export function joinedSince(range: DateRange, now: Date): string {
  const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

export const JOINED_LABEL: Record<DateRange, string> = {
  '7d': 'Joined in the last 7 days',
  '30d': 'Joined in the last 30 days',
  '90d': 'Joined in the last 90 days',
};

/**
 * How far an account got through payout setup.
 *
 * Deliberately derived from `stripe_connect_id` and `connect_onboarded` alone.
 * The tempting third bucket — "never even signed in" — would have to come from
 * `login_events`, and that table only started being written on 2026-08-08, so
 * every account older than that has no rows in it. A stage computed from it
 * would tell staff that long-standing customers had never signed in, which is
 * worse than not offering the distinction at all.
 */
export type OnboardingStage = 'not_started' | 'in_progress' | 'done';

export function onboardingStage(row: {
  connect_onboarded: boolean | null;
  stripe_connect_id?: string | null;
}): OnboardingStage {
  if (row.connect_onboarded) return 'done';
  return row.stripe_connect_id ? 'in_progress' : 'not_started';
}

/**
 * The three things a staff member needs about a stuck account, in the order
 * they need them: what state it is in, what is actually missing, and what to do.
 *
 * `action` is phrased as an instruction rather than a description because it is
 * rendered next to a button that performs it.
 */
export const ONBOARDING_STAGE_INFO: Record<OnboardingStage, { label: string; missing: string; action: string }> = {
  not_started: {
    label: 'Never started',
    missing: 'No Stripe account exists for them at all — they have not opened payout setup once.',
    action: 'Send the sign-in link again. It lands on Settings, where their own “Connect payouts” button is.',
  },
  in_progress: {
    label: 'Stopped partway',
    missing:
      'A Stripe account exists but Stripe has not cleared it. Almost always a missing ID document or bank account.',
    action: 'Open their Connect record to see what Stripe is waiting on, then send the sign-in link again.',
  },
  done: {
    label: 'Onboarded',
    missing: '',
    action: '',
  },
};

/** The Stripe dashboard page for a Connect account, or null before one exists. */
export function connectDashboardUrl(stripeConnectId: string | null | undefined): string | null {
  return stripeConnectId ? `https://dashboard.stripe.com/connect/accounts/${stripeConnectId}` : null;
}

/**
 * How worried to be about an account that has not finished.
 *
 * Age since signup, not since the last attempt — there is no column recording
 * when they last touched the Connect flow, and inventing a severity from a
 * timestamp that does not exist would be worse than grading on the one that
 * does. A week is the point at which nobody is "still setting up".
 */
export function onboardingSeverity(createdAt: string, now: Date): 'bad' | 'warn' | 'neutral' {
  const age = now.getTime() - new Date(createdAt).getTime();
  if (!Number.isFinite(age)) return 'neutral';
  const days = age / (24 * 60 * 60 * 1000);
  if (days >= 30) return 'bad';
  if (days >= 7) return 'warn';
  return 'neutral';
}
