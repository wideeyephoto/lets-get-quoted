import { planHealth, shortDate, visitCountdown, type PlanHealthLevel } from '@/lib/recurring-display';

/**
 * The work board that sits under the stat tiles in the Operations view.
 *
 * The mockup this came from had SEVEN panels above the plan list: four stat
 * tiles, then a "Needs attention" card, an "Upcoming visits" card and an
 * "Autopay coverage" donut. Three of those repeat a tile they sit directly
 * beneath — the donut in particular draws "80%, 14 of 18 plans" underneath a
 * tile already reading "80% / 14 of 18 plans", which is the same sentence twice
 * in two typefaces.
 *
 * So the board keeps only the two that say something a number cannot: WHICH
 * plans need you and WHICH visits are coming. Autopay coverage stays a tile and
 * gets a meter, because a proportion in a row of figures is a bar, not a donut.
 *
 * Everything here is pure and takes already-derived values, so it unit-tests
 * without a database and can be shared with the demo.
 */

export type BoardPlan = {
  id: string;
  clientName: string;
  title: string;
  active: boolean;
  autoCharge: boolean;
  hasCard: boolean;
  amount: number;
  nextRunDate: string;
  /** Null when no visit job exists yet — not the same as "nobody assigned". */
  nextVisitAssigned: boolean | null;
};

export type BoardIssue = {
  planId: string;
  /** "No payment method" — what is wrong, in three words. */
  headline: string;
  /** Who it belongs to. */
  clientName: string;
  /** What it costs you if it stays wrong. */
  detail: string;
  /** "In 4 days" / "3 days late" — the countdown to when it starts mattering. */
  when: string;
  /** Days until the next visit; negative is late. What `when` is built from. */
  days: number;
  level: Exclude<PlanHealthLevel, 'healthy'>;
};

export type BoardVisit = {
  key: string;
  planId: string;
  dateKey: string;
  /** "AUG" */
  monthLabel: string;
  /** "19" */
  dayLabel: string;
  /** "Tue" */
  weekdayLabel: string;
  planTitle: string;
  clientName: string;
  amount: number;
};

type VisitLike = { planId: string; dateKey: string; planTitle: string; clientName: string; amount: number };

/**
 * Every reason planHealth can give, turned into something an owner can act on.
 *
 * planHealth's reasons are diagnoses ("No payment method on file"). A board row
 * has to say what happens if you ignore it, because that is what decides whether
 * this is today's problem or next month's.
 */
const ISSUE_COPY: Record<string, { headline: string; detail: string }> = {
  'No payment method on file': {
    headline: 'No payment method',
    detail: 'Autopay is on but no card ever landed, so every visit bills nobody.',
  },
  'Nobody assigned to the next visit': {
    headline: 'Nobody assigned',
    detail: 'The visit is on the calendar with no crew on it.',
  },
  'Next visit is past due': {
    headline: 'Visit past due',
    detail: 'The date came and went without the visit being created.',
  },
  'No price set': {
    headline: 'No price set',
    detail: 'Visits become jobs but never invoice for anything.',
  },
};

/**
 * The plans that need a decision, worst first.
 *
 * One row per PLAN rather than per reason: a plan with no card, nobody assigned
 * and a late visit is one conversation, and three rows about the same customer
 * reads as three problems. The extra reasons ride along in the detail line.
 */
export function boardIssues(plans: BoardPlan[], today: string): BoardIssue[] {
  const issues: BoardIssue[] = [];

  for (const plan of plans) {
    if (!plan.active) continue;
    const countdown = visitCountdown(plan.nextRunDate, today);
    const health = planHealth({
      active: plan.active,
      autoCharge: plan.autoCharge,
      hasCard: plan.hasCard,
      amount: plan.amount,
      daysUntilNext: countdown.days,
      nextVisitAssigned: plan.nextVisitAssigned,
    });
    if (health.level === 'healthy') continue;

    const [first, ...rest] = health.reasons;
    const copy = ISSUE_COPY[first] ?? { headline: first, detail: '' };
    const alsoNames = rest.map((reason) => (ISSUE_COPY[reason]?.headline ?? reason).toLowerCase());
    const also = alsoNames.length
      ? ` Also: ${alsoNames.length === 1 ? alsoNames[0] : `${alsoNames.slice(0, -1).join(', ')} and ${alsoNames[alsoNames.length - 1]}`}.`
      : '';

    issues.push({
      planId: plan.id,
      headline: copy.headline,
      clientName: plan.clientName,
      detail: `${copy.detail}${also}`.trim(),
      when: countdown.label,
      days: countdown.days,
      level: health.level,
    });
  }

  // At risk before attention, then soonest first. A plan whose visit is already
  // late sorts ahead of one due next month, which is the order somebody would
  // work them in — and the name breaks ties so the list doesn't reshuffle
  // between two renders of the same data.
  const rank: Record<Exclude<PlanHealthLevel, 'healthy'>, number> = { 'at-risk': 0, attention: 1 };
  return issues.sort((a, b) => {
    if (rank[a.level] !== rank[b.level]) return rank[a.level] - rank[b.level];
    if (a.days !== b.days) return a.days - b.days;
    return a.clientName.localeCompare(b.clientName);
  });
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/**
 * The visits inside a window, in the order they will happen.
 *
 * The projection is already exact — projectPlanVisits walks the same cadence the
 * cron will — so this only slices and labels it. UTC throughout, like every other
 * date in this app: a visit on the 19th is on the 19th in every timezone.
 */
export function boardVisits(visits: VisitLike[], fromKey: string, toKey: string): BoardVisit[] {
  return visits
    .filter((visit) => visit.dateKey >= fromKey && visit.dateKey <= toKey)
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.clientName.localeCompare(b.clientName))
    .map((visit) => {
      const [year, month, day] = visit.dateKey.split('-').map(Number);
      const at = new Date(Date.UTC(year, month - 1, day));
      return {
        key: `${visit.planId}:${visit.dateKey}`,
        planId: visit.planId,
        dateKey: visit.dateKey,
        monthLabel: MONTH[month - 1] ?? '',
        dayLabel: String(day),
        weekdayLabel: WEEKDAY[at.getUTCDay()] ?? '',
        planTitle: visit.planTitle,
        clientName: visit.clientName,
        amount: visit.amount,
      };
    });
}

/**
 * Autopay coverage as a percentage of the plans that could have it.
 *
 * Rounded, but never rounded to 100 while a plan is still uncovered — "100%"
 * beside "17 of 18 plans" is the kind of contradiction that makes somebody stop
 * trusting every other figure on the page.
 */
export function autopayCoverage(covered: number, active: number): { pct: number; label: string } {
  if (active <= 0) return { pct: 0, label: 'No active plans' };
  const raw = (covered / active) * 100;
  const pct = covered >= active ? 100 : Math.min(99, Math.round(raw));
  return { pct, label: `${covered} of ${active} plan${active === 1 ? '' : 's'}` };
}

/** "Aug 19" — re-exported so the board's callers need only this module. */
export { shortDate };
