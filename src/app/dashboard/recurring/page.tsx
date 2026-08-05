import Link from 'next/link';
import { cookies } from 'next/headers';
import { requireOwnerContext } from '@/lib/auth';
import { formatMoney } from '@/lib/jobs';
import { listRecurringPlans, projectPlanVisits, todayDateKey, type PlannedVisit } from '@/lib/recurring';
import {
  dateKeyPlusDays,
  planMonthlyValue,
  shortDate,
  trailingMonthlyRecurring,
  workloadWindow,
} from '@/lib/recurring-display';
import { listServices } from '@/lib/services';
import { listClientsWithStats } from '@/lib/clients';
import RecurringComposer from './RecurringComposer';
import RecurringMap, { type PlanPin } from './RecurringMap';
import RecurringViewGear from './RecurringViewGear';
import RecurringWorkspace, { type BoardModel, type PlanRow } from './RecurringWorkspace';
import { planContexts } from '@/lib/recurring-context';
import { autopayCoverage, boardIssues, boardVisits, type BoardPlan } from '@/lib/recurring-board';
import { RECURRING_VIEW_COOKIE, normalizeRecurringView } from '@/lib/dashboard-views';
import Sparkline from '@/components/sparkline';
import RecurringPlanCard from '@/components/recurring-plan-card';
import RecurringPlanRow from '@/components/recurring-plan-row';
import RecurringHowItWorks from '@/components/recurring-how-it-works';
import ConfirmActionButton from '@/app/dashboard/jobs/[id]/ConfirmActionButton';
import {
  setPlanActiveAction,
  deletePlanAction,
  remindNextVisitAction,
  resendCardLinkAction,
  runPlanNowAction,
  setPlanAutopayAction,
  skipNextVisitAction,
  updatePlanAction,
} from './actions';
import EditPlanPanel from './EditPlanPanel';
import PlanActionsMenu from './PlanActionsMenu';
import { listCrew } from '@/lib/crew';

const FLASH_MESSAGES: Record<string, { tone: 'success' | 'info' | 'warn'; text: string }> = {
  created: { tone: 'success', text: 'Recurring plan created — the next visits are on your calendar already. Each one is invoiced on the day it happens, not before.' },
  'card-sent': { tone: 'success', text: 'Plan saved, the next visits are on your calendar, and a secure card-setup link was sent to your customer.' },
  'card-failed': { tone: 'warn', text: 'Plan saved and the visits are on your calendar, but the card link couldn’t be sent. Add an email or opted-in phone, then resend it.' },
  deleted: { tone: 'info', text: 'Recurring plan cancelled. Its upcoming visits were taken off the calendar; anything already worked or billed stays.' },
  'ran-paid': { tone: 'success', text: 'Visit created and the saved card was charged. Check the job and its payment to confirm.' },
  'ran-skipped': { tone: 'info', text: 'Visit created and the schedule advanced. Nothing was charged (auto-charge off or no card on file).' },
  'ran-failed': { tone: 'warn', text: 'Visit created, but the card charge didn’t go through — the customer was sent a pay link. See the job’s payment.' },
  'autopay-on': { tone: 'success', text: 'Autopay is on. The card already on file is charged on the day of each visit — nothing was charged now.' },
  'autopay-card-sent': { tone: 'success', text: 'Autopay is on and a secure card-setup link was sent to your customer. Visits bill nobody until they add a card, so the plan stays flagged until then.' },
  'autopay-card-failed': { tone: 'warn', text: 'Autopay is on, but the card link couldn’t be sent. Add an email or opted-in phone to the plan, then resend it — until a card lands these visits bill nobody.' },
  'autopay-off': { tone: 'info', text: 'Switched to manual billing. Visits still happen and still invoice; no card is charged automatically. Any card on file was kept.' },
  skipped: { tone: 'info', text: 'Visit skipped and taken off the calendar. The plan carries on from the next one, and a fixed term didn’t lose a visit.' },
  reminded: { tone: 'success', text: 'Reminder texted. Tonight’s automatic reminder for this visit won’t also go out.' },
  'reminded-email': { tone: 'success', text: 'Reminder emailed — they’re not opted in to texts. Tonight’s automatic reminder for this visit won’t also go out.' },
  'remind-nochannel': { tone: 'warn', text: 'No way to reach them: the visit has no email, and the phone on it isn’t opted in to texts. Add one to the job and try again.' },
  'remind-failed': { tone: 'warn', text: 'The reminder couldn’t be sent. Nothing reached the customer — check the job’s contact details and try again.' },
};

export default async function RecurringPage({
  searchParams,
}: {
  searchParams: { flash?: string; job?: string; on?: string; then?: string };
}) {
  const { supabase, accountId } = await requireOwnerContext();
  const view = normalizeRecurringView(cookies().get(RECURRING_VIEW_COOKIE)?.value);
  const ops = view === 'ops';

  const plans = await listRecurringPlans(supabase, accountId);
  const services = (await listServices(supabase, accountId, { activeOnly: true }))
    .map((service) => ({ id: service.id, name: service.name, unitPrice: Number(service.unit_price) || 0 }));
  // The customer book, so the composer can recognise somebody already in it
  // rather than creating a second copy of them.
  const clients = (await listClientsWithStats(supabase, accountId)).map((client) => ({
    id: client.id,
    name: client.name,
    phone: client.phone ?? null,
    email: client.email ?? null,
    address: client.address ?? null,
  }));
  const today = todayDateKey();
  const baseFlash = searchParams.flash ? FLASH_MESSAGES[searchParams.flash] : null;
  // A skip is about two specific days, and naming them is the difference between
  // "a visit was skipped" and knowing which one, and when they're next due.
  const flash =
    baseFlash && searchParams.flash === 'skipped' && searchParams.on && searchParams.then
      ? {
          ...baseFlash,
          text: `${shortDate(searchParams.on)} skipped and taken off the calendar — the next visit is ${shortDate(searchParams.then)}. A fixed term didn’t lose a visit.`,
        }
      : baseFlash;
  // Creating a visit early passes the created job id so we can link straight to it.
  const flashJobId = flash && searchParams.flash?.startsWith('ran-') ? searchParams.job ?? null : null;

  const activePlans = plans.filter((plan) => plan.active);
  const activeCount = activePlans.length;
  // Normalize every active plan to a monthly figure so the owner sees the real
  // recurring revenue this book of plans throws off — weekly counts ~4.33×/mo.
  const monthlyRecurring = activePlans.reduce((sum, plan) => sum + planMonthlyValue(plan.amount, plan.frequency), 0);
  const autoBilledCount = activePlans.filter((plan) => plan.auto_charge && plan.card_last4).length;
  const coverage = autopayCoverage(autoBilledCount, activeCount);

  // Plans whose autopay is on but whose card never landed, so every visit will
  // bill nobody. NOT the same as the "needs attention" count below, and no
  // longer pretending to be: this is one specific problem with a one-click fix,
  // which is why it gets a banner with the fix on it.
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
  const dueThisWeek = weekVisits.length;

  // A book of monthly plans has an empty week most weeks, and "Coming up · next
  // 7 days · nothing" would be a dead half-panel almost permanently. So the
  // board widens to a month when the week is empty — and SAYS it widened. The
  // tile keeps its seven days either way: a tile has room for a figure and a
  // window, not for a window that moves.
  const boardVisitList = weekVisits.length > 0 ? weekVisits : boardVisits(projected, today, dateKeyPlusDays(today, 29));
  const boardWindowLabel = weekVisits.length > 0 ? 'next 7 days' : 'next 30 days';
  // The roster once for the page, so the crew picker in every plan's menu is
  // already loaded when it opens rather than fetching on click.
  const roster = (await listCrew(supabase, accountId))
    .filter((member) => member.active !== false)
    .map((member) => ({ id: member.id, name: (member.name ?? '').trim() || 'Unnamed' }));

  // One pin per plan whose visits have been geocoded. Derived from the contexts
  // already fetched above — the coordinates ride along on a query that was
  // running anyway, so the map costs the page nothing.
  const planPins = plans.flatMap<PlanPin>((plan) => {
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
  // Annotated rather than `new Map<...>()`: a type argument list on a call in a
  // .tsx file is ambiguous with a JSX open tag, and SWC resolves it the other
  // way from tsc — the typecheck passes and the dev build dies on the next JSX
  // tag it meets, pointing at a line that is not the problem.
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
  const calendarMonths = [...visitsByMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([monthKey, monthVisits]) => {
      const [y, m] = monthKey.split('-').map(Number);
      const total = monthVisits.reduce((sum, visit) => sum + visit.amount, 0);
      const plural = monthVisits.length === 1 ? '' : 's';
      const money = total > 0 ? ` · ${formatMoney(total)}` : '';
      return {
        monthKey,
        label: new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', {
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

  // The card and the row take the same props, so the view picks a component
  // instead of the page branching around two near-identical blocks of JSX.
  const PlanShell = ops ? RecurringPlanRow : RecurringPlanCard;

  // The amount is dropped here rather than sent across and formatted there:
  // formatMoney lives in @/lib/jobs, which reaches the database, and pulling it
  // into the client bundle fails the build with "Can't resolve 'fs'".
  const board: BoardModel = {
    issues,
    visits: boardVisitList.map(({ amount, ...rest }) => ({
      ...rest,
      amountLabel: amount > 0 ? formatMoney(amount) : null,
    })),
    windowLabel: boardWindowLabel,
    workload: (
      <>
        <strong>Next 30 days:</strong> {next30.count} visit{next30.count === 1 ? '' : 's'}
        {next30.value > 0 ? ` · ${formatMoney(next30.value)} expected` : ''}
        <span className="recurring-workload-sep" aria-hidden="true">·</span>
        <strong>Next 90 days:</strong> {next90.count} visit{next90.count === 1 ? '' : 's'}
        {next90.value > 0 ? ` · ${formatMoney(next90.value)} expected` : ''}
      </>
    ),
  };

  return (
    <main className="wide-shell workspace-shell">
      {/* Operations trades the hero for a title bar.
          The lead paragraph explains what a recurring plan IS, which is worth a
          hero to somebody who has none and is dead weight to somebody managing
          eighteen. The map is not dropped — it moves to a tab, where it costs
          nothing until you ask for it. Between them that is ~330px the plan list
          no longer starts below. */}
      {ops ? (
        <div className="rops-pagehead">
          <p className="eyebrow">Recurring</p>
          <h1 className="workspace-title">Repeating jobs &amp; auto-billing</h1>
        </div>
      ) : (
        <section className="workspace-hero panel">
          <div className="workspace-hero-copy">
            <p className="eyebrow">Recurring</p>
            <h1 className="workspace-title">Repeating jobs &amp; auto-billing</h1>
            <p className="workspace-lead">
              Set up services that repeat — lawn care, cleaning, pool service — and each visit becomes a scheduled job
              automatically. Add a saved card and every visit is charged for you, hands-off.
            </p>
          </div>
          {/* The hero's second column was empty the moment somebody had a plan —
              the how-it-works block is for people who don't. Once they do, the
              question changes from "what is this" to "where is it", and that is
              the one thing a list of plans can never answer. */}
          {plans.length > 0 ? <RecurringMap pins={planPins} totalPlans={plans.length} /> : <RecurringHowItWorks />}
        </section>
      )}

      {plans.length > 0 ? (
        <>
          <div className={`workspace-metric-grid four-up recurring-stat-grid${ops ? ' rops-tiles' : ''}`}>
            <article className="workspace-metric-card accent recurring-mrr-card">
              <span className="workspace-metric-label">Estimated monthly recurring</span>
              <strong className="workspace-metric-value">{formatMoney(monthlyRecurring)}</strong>
              {/* The figure is exact; the line behind it is only the shape of
                  the book over time — see trailingMonthlyRecurring. */}
              <Sparkline
                values={trail.map((point) => point.value)}
                gradientId="recurring-mrr-spark"
                className="recurring-mrr-spark"
                ariaLabel={`Monthly recurring value over the last ${trail.length} months`}
              />
              <p className="workspace-metric-note">
                Across {activeCount} active plan{activeCount === 1 ? '' : 's'}, normalized to a month.
              </p>
            </article>
            <article className="workspace-metric-card">
              <span className="workspace-metric-label">Upcoming visits</span>
              <strong className="workspace-metric-value">{dueThisWeek}</strong>
              <p className="workspace-metric-note">next 7 days</p>
            </article>
            <article className="workspace-metric-card">
              <span className="workspace-metric-label">Autopay coverage</span>
              {/* "1 of 2" rather than a bare count: the number only means
                  anything against how many plans could be on autopay. */}
              <strong className="workspace-metric-value">
                {autoBilledCount} <span className="recurring-stat-of">of {activeCount}</span>
              </strong>
              {/* The mockup drew this as a donut in a panel of its own, under a
                  tile already reading "14 of 18". A proportion sitting in a row
                  of figures is a bar — it fits the tile it belongs to, and it
                  costs 6px instead of a panel. */}
              {ops && activeCount > 0 ? (
                <span
                  className="rops-meter"
                  role="img"
                  aria-label={`Autopay covers ${coverage.pct}% of active plans`}
                >
                  <span className="rops-meter-fill" style={{ width: `${coverage.pct}%` }} />
                </span>
              ) : null}
              <p className="workspace-metric-note">plan{activeCount === 1 ? '' : 's'}</p>
            </article>
            <article className={`workspace-metric-card${issues.length > 0 ? ' is-loss' : ''}`}>
              <span className="workspace-metric-label">Needs attention</span>
              <strong className="workspace-metric-value">{issues.length}</strong>
              <p className="workspace-metric-note">
                {issues.length === 1 ? 'plan' : 'plans'}
              </p>
            </article>
          </div>

          {/* Workload, not revenue: the line that ties a book of plans to the
              days it will actually take up. Operations shows the same sentence
              along the foot of its board, where it sits under the work it is
              summarising instead of floating on its own. */}
          {ops ? null : (
            <p className="recurring-workload">
              <strong>Next 30 days:</strong> {next30.count} visit{next30.count === 1 ? '' : 's'}
              {next30.value > 0 ? ` · ${formatMoney(next30.value)} expected` : ''}
              <span className="recurring-workload-sep" aria-hidden="true">·</span>
              <strong>Next 90 days:</strong> {next90.count} visit{next90.count === 1 ? '' : 's'}
              {next90.value > 0 ? ` · ${formatMoney(next90.value)} expected` : ''}
            </p>
          )}
        </>
      ) : null}

      {/* .client-attention-card is a MODIFIER — it paints the orange edge and
          wash and nothing else, so it needs .panel underneath it for padding,
          radius and the light-theme flip. Without it the copy sits flush
          against the card edge.

          Cards only. Operations opens with a board whose first half is this
          same list, longer and with the plan one click away — stacking a banner
          on top of it would be the duplication this view exists to remove.

          The heading names the actual problem now. It used to say "N plans need
          attention" while counting only the ones with no card, so it disagreed
          with both the tile above it and the badges on the cards below. */}
      {!ops && noCardPlans.length > 0 ? (
        <section className="panel client-attention-card recurring-attention">
          <div className="recurring-attention-copy">
            <strong>
              {noCardPlans.length} plan{noCardPlans.length === 1 ? '' : 's'} ha
              {noCardPlans.length === 1 ? 's' : 've'} no payment method
            </strong>
            <p>
              {noCardPlans.length === 1
                ? `${noCardPlans[0].client_name} has not added a card — that plan's visits will bill nobody.`
                : `${noCardPlans.map((plan) => plan.client_name).slice(0, 3).join(', ')}${noCardPlans.length > 3 ? ` and ${noCardPlans.length - 3} more` : ''} have not added a card.`}
            </p>
          </div>
          {noCardPlans.length === 1 ? (
            <form action={resendCardLinkAction.bind(null, noCardPlans[0].id)}>
              <button type="submit" className="btn secondary">Resend payment link</button>
            </form>
          ) : null}
        </section>
      ) : null}

      {flash ? (
        <section className={`panel workspace-section-card flash-banner flash-${flash.tone === 'warn' ? 'warn' : flash.tone === 'info' ? 'info' : 'success'}`}>
          <p>
            {flash.text}
            {flashJobId ? <> <Link href={`/dashboard/jobs/${flashJobId}`}>View the visit →</Link></> : null}
          </p>
        </section>
      ) : null}

      {/* The cards are built here, on the server, because each one carries bound
          Server Actions. RecurringWorkspace owns only the tab, the filters and
          the order — so it gets each plan's FIELDS alongside its rendered card
          rather than trying to read anything back out of the JSX.

          Only ONE of the two shapes is ever built. The card and the row take the
          same props on purpose, so the view picks a component rather than the
          page rendering both and hiding one — a hidden card is still bytes on
          the wire and still a mounted form. */}
      <RecurringWorkspace
        view={view}
        board={ops ? board : null}
        pins={ops ? planPins : []}
        totalPlans={plans.length}
        activeCount={activeCount}
        gear={<RecurringViewGear view={view} />}
        composer={<RecurringComposer today={today} services={services} clients={clients} />}
        months={calendarMonths}
        rows={plans.map<PlanRow>((plan) => {
          const paused = !plan.active;
          return {
            id: plan.id,
            title: plan.title,
            clientName: plan.client_name,
            frequency: plan.frequency,
            active: plan.active,
            nextRunDate: plan.next_run_date,
            monthly: planMonthlyValue(plan.amount, plan.frequency),
            needsAttention: issueIds.has(plan.id),
            card: (
                <PlanShell
                  key={plan.id}
                  plan={plan}
                  today={today}
                  context={contexts.get(plan.id)}
                  resendLink={
                    <form action={resendCardLinkAction.bind(null, plan.id)}>
                      <button type="submit" className="linklike">Resend link</button>
                    </form>
                  }
                  /* Hidden at $0 rather than offered and refused: the server
                     rejects autopay without a price, and a button whose only
                     outcome is an error is worse than no button. */
                  autopayToggle={
                    plan.auto_charge ? (
                      <form action={setPlanAutopayAction.bind(null, plan.id, false)}>
                        <button type="submit" className="linklike">Switch to manual billing</button>
                      </form>
                    ) : plan.amount > 0 ? (
                      <ConfirmActionButton
                        action={setPlanAutopayAction.bind(null, plan.id, true)}
                        confirmMessage={
                          plan.card_last4
                            ? `Turn on autopay for ${plan.client_name}? The card already on file (•••• ${plan.card_last4}) is charged ${formatMoney(plan.amount)} on the day of each visit from here on. Nothing is charged right now.`
                            : `Turn on autopay for ${plan.client_name}? They get a secure link to add a card, and each visit then charges ${formatMoney(plan.amount)} on the day it happens. Nothing is charged right now.`
                        }
                        className="linklike"
                        pendingLabel="Turning on…"
                        savedLabel="Autopay on ✓"
                      >
                        Turn on autopay
                      </ConfirmActionButton>
                    ) : null
                  }
                >
                  {plan.active ? (
                    <ConfirmActionButton
                      action={runPlanNowAction.bind(null, plan.id)}
                      confirmMessage={
                        plan.auto_charge && plan.card_last4
                          ? `Create this visit today instead of ${shortDate(plan.next_run_date)}, and charge the card on file (•••• ${plan.card_last4}) ${plan.amount > 0 ? formatMoney(plan.amount) : ''}? The customer is billed immediately and the plan moves on to the visit after this one.`
                          : `Create this visit today instead of ${shortDate(plan.next_run_date)}? The plan then moves on to the visit after this one.`
                      }
                      className="btn secondary"
                      pendingLabel="Creating…"
                      savedLabel="Created ✓"
                    >
                      {/* "Run next visit now" was engineer's language — a plan
                          "runs" in a scheduler, not in a yard. What actually
                          happens is a visit gets created early and the plan
                          points at the one after, so the button says that, in
                          the same words the confirmation dialog uses one click
                          later. The card already says when the next visit is
                          due right beside this, so "early" is the whole idea. */}
                      Create the next visit early
                    </ConfirmActionButton>
                  ) : null}
                  <EditPlanPanel plan={plan} today={today} action={updatePlanAction.bind(null, plan.id)} />
                  <form action={setPlanActiveAction.bind(null, plan.id, paused)}>
                    <button type="submit" className="btn secondary">{paused ? 'Resume' : 'Pause'}</button>
                  </form>
                  <PlanActionsMenu
                    clientName={plan.client_name}
                    nextVisitLabel={shortDate(plan.next_run_date)}
                    nextVisitJobId={contexts.get(plan.id)?.nextVisitJobId ?? null}
                    visitScheduledFor={contexts.get(plan.id)?.nextVisitScheduledFor ?? null}
                    crew={roster}
                    assignedCrewIds={contexts.get(plan.id)?.crewIds ?? []}
                    active={plan.active}
                    skipAction={skipNextVisitAction.bind(null, plan.id)}
                    remindAction={remindNextVisitAction.bind(null, plan.id)}
                  />
                  <form action={deletePlanAction.bind(null, plan.id)} className="danger">
                    <button type="submit" className="linklike danger">Cancel plan</button>
                  </form>
                </PlanShell>
            ),
          };
        })}
      />
    </main>
  );
}
