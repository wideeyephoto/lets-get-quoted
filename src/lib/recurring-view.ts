import type { SupabaseClient } from '@supabase/supabase-js';
import { formatMoney } from '@/lib/jobs';
import { listRecurringPlans, projectPlanVisits, type PlannedVisit, type RecurringPlan } from '@/lib/recurring';
import {
  dateKeyPlusDays,
  planMonthlyValue,
  shortDate,
  trailingMonthlyRecurring,
  workloadWindow,
} from '@/lib/recurring-display';
import { listServices } from '@/lib/services';
import { listClientsWithStats } from '@/lib/clients';
import { listCrew } from '@/lib/crew';
import { planContexts, type PlanContext } from '@/lib/recurring-context';
import { autopayCoverage, boardIssues, boardVisits, type BoardPlan, type BoardIssue, type BoardVisit } from '@/lib/recurring-board';

/**
 * Everything the Recurring page derives, in one place.
 *
 * Lifted out of the page — which was 250 lines of arithmetic followed by 250
 * lines of markup — so the logged-out demo can compute the same figures instead
 * of asserting its own. That page's whole discipline is that the tiles, the
 * board, the filter and the map all read ONE set of numbers and therefore cannot
 * disagree; a demo that re-derived them by hand would break exactly that.
 *
 * Pure reads. Nothing here writes, so it is safe against the fixture client.
 */

export type RecurringCalendarMonth = {
  monthKey: string;
  label: string;
  countLabel: string;
  visits: {
    key: string;
    dateLabel: string;
    planId: string;
    planTitle: string;
    clientId: string | null;
    clientName: string;
    amountLabel: string | null;
  }[];
};

export type RecurringView = {
  today: string;
  plans: RecurringPlan[];
  contexts: Map<string, PlanContext>;
  services: { id: string; name: string; unitPrice: number }[];
  clients: { id: string; name: string; phone: string | null; email: string | null; address: string | null }[];
  roster: { id: string; name: string }[];

  activeCount: number;
  monthlyRecurring: number;
  autoBilledCount: number;
  coverage: ReturnType<typeof autopayCoverage>;
  /** Autopay on, card never arrived — every visit would bill nobody. */
  noCardPlans: RecurringPlan[];
  issues: BoardIssue[];
  issueIds: Set<string>;

  trail: { value: number }[];
  next30: { count: number; value: number };
  next90: { count: number; value: number };
  dueThisWeek: number;
  boardVisitList: BoardVisit[];
  boardWindowLabel: string;

  calendarMonths: RecurringCalendarMonth[];
  planPins: {
    planId: string;
    title: string;
    clientName: string;
    lat: number;
    lng: number;
    active: boolean;
    needsAttention: boolean;
  }[];
};

export async function buildRecurringView(
  supabase: SupabaseClient,
  accountId: string,
  today: string,
): Promise<RecurringView> {
  const plans = await listRecurringPlans(supabase, accountId);
  const services = (await listServices(supabase, accountId, { activeOnly: true }))
    .map((service) => ({ id: service.id, name: service.name, unitPrice: Number(service.unit_price) || 0 }));
  // The customer book, so the composer can recognize somebody already in it
  // rather than creating a second copy of them.
  const clients = (await listClientsWithStats(supabase, accountId)).map((client) => ({
    id: client.id,
    name: client.name,
    phone: client.phone ?? null,
    email: client.email ?? null,
    address: client.address ?? null,
  }));

  const activePlans = plans.filter((plan) => plan.active);
  const activeCount = activePlans.length;
  // Normalize every active plan to a monthly figure so the owner sees the real
  // recurring revenue this book of plans throws off — weekly counts ~4.33×/mo.
  const monthlyRecurring = activePlans.reduce((sum, plan) => sum + planMonthlyValue(plan.amount, plan.frequency), 0);
  const autoBilledCount = activePlans.filter((plan) => plan.auto_charge && plan.card_last4).length;

  // Plans whose autopay is on but whose card never landed, so every visit will
  // bill nobody. NOT the same as the "needs attention" count below, and no
  // longer pretending to be: this is one specific problem with a one-click fix.
  const noCardPlans = activePlans.filter((plan) => plan.auto_charge && !plan.card_last4);

  // What the book actually puts on the calendar. projectPlanVisits walks the
  // same cadence the cron will, so this is the work, not an average of it.
  const horizon = dateKeyPlusDays(today, 90);
  const projected = projectPlanVisits(activePlans, { fromKey: today, toKey: horizon });
  const next30 = workloadWindow(projected, today, dateKeyPlusDays(today, 30));
  const next90 = workloadWindow(projected, today, horizon);
  const trail = trailingMonthlyRecurring(plans, today, 6);
  // Four queries for every plan on the page, not four per plan.
  const contexts = await planContexts(supabase, accountId, plans, today);

  // ONE attention figure for the whole page.
  //
  // The tile used to count "no card on file" while the badge on each card ran
  // planHealth, so a plan with nobody assigned to its next visit was flagged on
  // the card, missing from the tile, and invisible to the "Needs attention"
  // filter. Three answers to one question. boardIssues is now the only one, and
  // the tile, the filter, the map pins and the board all read it.
  const issues = boardIssues(
    plans.map<BoardPlan>((plan) => ({
      id: plan.id,
      clientName: plan.client_name,
      title: plan.title,
      active: plan.active,
      autoCharge: plan.auto_charge,
      hasCard: Boolean(plan.card_last4),
      amount: plan.amount,
      nextRunDate: plan.next_run_date,
      nextVisitAssigned: contexts.get(plan.id)?.nextVisitAssigned ?? null,
    })),
    today,
  );
  const issueIds = new Set(issues.map((issue) => issue.planId));

  // The visits due in the next seven days. The tile prints this length rather
  // than counting plans separately, so the tile and the board can never disagree
  // about how much work is coming.
  const weekVisits = boardVisits(projected, today, dateKeyPlusDays(today, 6));

  // A book of monthly plans has an empty week most weeks, and "Coming up · next
  // 7 days · nothing" would be a dead half-panel almost permanently. So the
  // board widens to a month when the week is empty — and SAYS it widened. The
  // tile keeps its seven days either way.
  const boardVisitList = weekVisits.length > 0 ? weekVisits : boardVisits(projected, today, dateKeyPlusDays(today, 29));

  // The roster once for the page, so the crew picker in every plan's menu is
  // already loaded when it opens rather than fetching on click.
  const roster = (await listCrew(supabase, accountId))
    .filter((member) => member.active !== false)
    .map((member) => ({ id: member.id, name: (member.name ?? '').trim() || 'Unnamed' }));

  // One pin per plan whose visits have been geocoded. Derived from the contexts
  // already fetched above — the coordinates ride along on a query that was
  // running anyway, so the map costs the page nothing.
  const planPins = plans.flatMap((plan) => {
    const context = contexts.get(plan.id);
    if (!context || context.lat === null || context.lng === null) return [];
    return [{
      planId: plan.id,
      title: plan.title,
      clientName: plan.client_name,
      lat: context.lat,
      lng: context.lng,
      active: plan.active,
      needsAttention: issueIds.has(plan.id),
    }];
  });

  // Grouped and formatted HERE, not in the client component. Every money and
  // date helper in this app lives in a module that also reaches the database, so
  // importing one into a 'use client' file drags server code into the browser
  // bundle and the build dies on "Can't resolve 'fs'".
  const visitsByMonth: Map<string, PlannedVisit[]> = new Map();
  for (const visit of projected) {
    const key = visit.dateKey.slice(0, 7);
    const bucket = visitsByMonth.get(key);
    if (bucket) bucket.push(visit);
    else visitsByMonth.set(key, [visit]);
  }
  // Which customer each plan belongs to, so a calendar row can link the name to
  // that customer's page. A plan whose client record was deleted keeps its
  // client_name text but has no id — those rows stay plain text rather than
  // linking somewhere that 404s.
  const clientIdByPlan = new Map(plans.map((plan) => [plan.id, plan.client_id ?? null] as const));
  const calendarMonths: RecurringCalendarMonth[] = [...visitsByMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([monthKey, monthVisits]) => {
      const [y, m] = monthKey.split('-').map(Number);
      const total = monthVisits.reduce((sum, visit) => sum + visit.amount, 0);
      const plural = monthVisits.length === 1 ? '' : 's';
      const money = total > 0 ? ` · ${formatMoney(total)}` : '';
      return {
        monthKey,
        label: new Date(Date.UTC(y!, m! - 1, 1)).toLocaleDateString('en-US', {
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        }),
        countLabel: `${monthVisits.length} visit${plural}${money}`,
        visits: monthVisits.map((visit) => ({
          key: `${visit.planId}:${visit.dateKey}`,
          dateLabel: shortDate(visit.dateKey),
          planId: visit.planId,
          planTitle: visit.planTitle,
          clientId: clientIdByPlan.get(visit.planId) ?? null,
          clientName: visit.clientName,
          amountLabel: visit.amount > 0 ? formatMoney(visit.amount) : null,
        })),
      };
    });

  return {
    today,
    plans,
    contexts,
    services,
    clients,
    roster,
    activeCount,
    monthlyRecurring,
    autoBilledCount,
    coverage: autopayCoverage(autoBilledCount, activeCount),
    noCardPlans,
    issues,
    issueIds,
    trail,
    next30,
    next90,
    dueThisWeek: weekVisits.length,
    boardVisitList,
    boardWindowLabel: weekVisits.length > 0 ? 'next 7 days' : 'next 30 days',
    calendarMonths,
    planPins,
  };
}
