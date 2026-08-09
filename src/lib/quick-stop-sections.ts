/**
 * WHAT EACH SETTINGS DRAWER CURRENTLY SAYS, WITHOUT OPENING IT.
 *
 * The configurator is five closed drawers with a fixed blurb apiece — "The
 * days, and the earliest and latest an arrival window can run" — which
 * describes what the drawer is ABOUT and never what it is set to. So the page
 * could report an account as ready while, inside drawer 2, the longest visit it
 * would accept was five hours (which is not a quick stop, it is a day's work),
 * and inside drawer 5 the refund tiers were a combination the app's own
 * warnings call unfair to the customer. Both are visible only to somebody who
 * opens the drawer and reads.
 *
 * So each drawer now carries its current value and a state:
 *
 *   todo   something required is not set. Nothing can be taken until it is.
 *   warn   set, and set to something worth a second look. Never blocking —
 *          these are judgements, and the owner is allowed to disagree.
 *   ok     set, and unremarkable.
 *
 * Pure, no IO, and deliberately not in the component: "is a five-hour visit
 * limit odd?" is a rule, and a rule that lives inside JSX is a rule nobody can
 * test.
 */

import { refundPolicyWarnings, type CustomerRefundTiers } from './quick-stop-policy';

export type SectionKey = 'when' | 'what' | 'far' | 'charge' | 'terms';
export type SectionState = 'ok' | 'warn' | 'todo';

export type SectionReview = {
  key: SectionKey;
  state: SectionState;
  /** What it is set to, in the fewest words that are still true. */
  summary: string;
  /** Why it is flagged. Empty when state is 'ok'. */
  issues: string[];
};

export type SectionInput = {
  weekdayCount: number;
  daysAhead: number;
  earliestTime: string;
  latestEnd: string;
  maxVisitMinutes: number;
  categoryCount: number;
  maxDetourMiles: number;
  maxDetourMinutes: number;
  minFeeCents: number;
  maxFeeCents: number;
  maxPerDay: number;
  refunds: CustomerRefundTiers;
};

/**
 * Above this, "quick stop" stops being an honest description.
 *
 * Not a limit and not enforced anywhere — an owner who wants to take a
 * four-hour job off their booking page is entitled to. It is the threshold at
 * which the page should say so out loud rather than describing a day's work as
 * a stop.
 */
export const LONG_VISIT_MINUTES = 180;

function money(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}

/** "8 AM", "4:30 PM" — the same clock the status cards use. */
function clock(hhmm: string): string {
  const [hours, minutes] = hhmm.split(':').map(Number);
  if (!Number.isFinite(hours)) return hhmm;
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return minutes ? `${hour12}:${String(minutes).padStart(2, '0')} ${period}` : `${hour12} ${period}`;
}

function worst(states: SectionState[]): SectionState {
  if (states.includes('todo')) return 'todo';
  if (states.includes('warn')) return 'warn';
  return 'ok';
}

export function reviewQuickStopSections(input: SectionInput): SectionReview[] {
  const reviews: SectionReview[] = [];

  // 1 — when -----------------------------------------------------------------
  {
    const issues: string[] = [];
    if (input.weekdayCount === 0) issues.push('No days chosen, so nothing can be requested at all.');
    const window = `${clock(input.earliestTime)} – ${clock(input.latestEnd)}`;
    reviews.push({
      key: 'when',
      state: input.weekdayCount === 0 ? 'todo' : 'ok',
      summary:
        input.weekdayCount === 0
          ? 'No days chosen'
          : `${input.weekdayCount} day${input.weekdayCount === 1 ? '' : 's'} a week · ${window}`,
      issues,
    });
  }

  // 2 — what -----------------------------------------------------------------
  {
    const issues: string[] = [];
    /* THE FIVE-HOUR "QUICK" STOP. The account this was found on was reported as
       ready to go with a 300-minute limit — a full day's work arriving through
       a form built for filling a gap. */
    if (input.maxVisitMinutes > LONG_VISIT_MINUTES) {
      issues.push(
        `A ${input.maxVisitMinutes}-minute visit is ${(input.maxVisitMinutes / 60).toFixed(1).replace(/\.0$/, '')} hours — closer to a day's work than a stop. Requests that long will be offered to you.`,
      );
    }
    reviews.push({
      key: 'what',
      state: issues.length ? 'warn' : 'ok',
      summary: `Up to ${input.maxVisitMinutes} min · ${
        input.categoryCount > 0 ? `${input.categoryCount} type${input.categoryCount === 1 ? '' : 's'} of work` : 'any work'
      }`,
      issues,
    });
  }

  // 3 — far ------------------------------------------------------------------
  {
    const issues: string[] = [];
    if (input.maxDetourMiles <= 0) issues.push('No detour limit, so nothing is near enough to qualify.');
    reviews.push({
      key: 'far',
      state: input.maxDetourMiles <= 0 ? 'todo' : 'ok',
      summary:
        input.maxDetourMiles <= 0
          ? 'No limit set'
          : `${input.maxDetourMiles} mi · ${input.maxDetourMinutes} min off your route`,
      issues,
    });
  }

  // 4 — charge ---------------------------------------------------------------
  {
    const issues: string[] = [];
    if (input.maxFeeCents <= 0) issues.push('No fee ceiling, so there is nothing to quote.');
    // A band of one number is a fixed price, which is fine and worth saying —
    // it is not a warning.
    const band =
      input.maxFeeCents <= 0
        ? 'No fee set'
        : input.minFeeCents > 0 && input.minFeeCents !== input.maxFeeCents
          ? `${money(input.minFeeCents)} – ${money(input.maxFeeCents)}`
          : money(input.maxFeeCents);
    reviews.push({
      key: 'charge',
      state: input.maxFeeCents <= 0 ? 'todo' : 'ok',
      summary: `${band} · up to ${input.maxPerDay} a day`,
      issues,
    });
  }

  // 5 — terms ----------------------------------------------------------------
  {
    /* The same function the drawer itself renders, so the badge and the list
       inside can never disagree — and 'severe' is the word the drawer already
       prints as "Unfair to the customer". */
    const warnings = refundPolicyWarnings(input.refunds);
    reviews.push({
      key: 'terms',
      state: warnings.length ? 'warn' : 'ok',
      summary: `${input.refunds.grace}% back within ${input.refunds.withinGraceMinutes} min · ${input.refunds.afterArrived}% once you arrive`,
      issues: warnings.map((warning) =>
        warning.severity === 'severe' ? `Unfair to the customer: ${warning.message}` : warning.message,
      ),
    });
  }

  return reviews;
}

/** The one word for the whole form — what the sticky bar reports. */
export function quickStopSectionsState(reviews: SectionReview[]): SectionState {
  return worst(reviews.map((review) => review.state));
}

/** How many drawers are flagged, for "2 things to look at" without opening any. */
export function quickStopSectionsFlagged(reviews: SectionReview[]): number {
  return reviews.filter((review) => review.state !== 'ok').length;
}
