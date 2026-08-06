import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatMoney } from '@/lib/jobs';
import type { RecurringPlan } from '@/lib/recurring';
import type { PlanContext } from '@/lib/recurring-context';
import type { RecurringView } from '@/lib/recurring-view';
import { planMonthlyValue } from '@/lib/recurring-display';
import type { RecurringView as RecurringViewMode } from '@/lib/dashboard-views';
import Sparkline from '@/components/sparkline';
import RecurringPlanCard from '@/components/recurring-plan-card';
import RecurringPlanRow from '@/components/recurring-plan-row';
import RecurringHowItWorks from '@/components/recurring-how-it-works';
import RecurringMap from './RecurringMap';
import RecurringWorkspace, { type BoardModel, type PlanRow } from './RecurringWorkspace';

/**
 * Repeating jobs and auto-billing, given the book.
 *
 * Split out of page.tsx so the logged-out demo renders the same screen. The
 * split here is shaped differently from the other screens, and the reason is
 * worth stating: every plan card carries SERVER ACTIONS bound to that plan's id
 * — resend the card link, toggle autopay, skip the next visit, cancel the plan.
 * Those are not display, and they genuinely differ between the app and a public
 * page that cannot call them.
 *
 * So the markup is shared and the actions are a hole in it. `planActions`
 * renders the cluster of controls for one plan; the app passes its bound forms,
 * and the demo passes nothing. Everything else — the tiles, the sparkline, the
 * attention banner, the board, the calendar, the map — has exactly one copy.
 */

/**
 * The three action slots one plan card exposes.
 *
 * All three, not just the buttons at the foot: `resendLink` and `autopayToggle`
 * are bound server actions too, and leaving them out of the contract would have
 * meant the demo silently rendering the app's forms with no way to suppress
 * them. Returning `{}` — which is what the demo does — yields a card that shows
 * the plan and offers nothing.
 */
export type PlanActionSlots = {
  resendLink?: ReactNode;
  autopayToggle?: ReactNode;
  /** The row of buttons along the foot of the card. */
  controls?: ReactNode;
};

export type PlanActionsRenderer = (plan: RecurringPlan, context: PlanContext | undefined) => PlanActionSlots;

export default function RecurringScreen({
  view,
  mode,
  planActions,
  composer = null,
  gear = null,
  attentionAction = null,
  flash = null,
  flashJobId = null,
  basePath = '/dashboard',
}: {
  view: RecurringView;
  mode: RecurringViewMode;
  planActions: PlanActionsRenderer;
  /** The "new plan" form. Omitted in the demo, which cannot save one. */
  composer?: ReactNode;
  gear?: ReactNode;
  /** "Resend payment link" on the no-card banner. Omitted in the demo. */
  attentionAction?: ReactNode;
  flash?: { tone: 'success' | 'info' | 'warn'; text: string } | null;
  flashJobId?: string | null;
  basePath?: string;
}) {
  const ops = mode === 'ops';
  const {
    plans, contexts, today, planPins, activeCount, monthlyRecurring, autoBilledCount,
    coverage, noCardPlans, issues, issueIds, trail, next30, next90, dueThisWeek,
    boardVisitList, boardWindowLabel, calendarMonths,
  } = view;

  // The card and the row take the same props, so the view picks a component
  // instead of the page branching around two near-identical blocks of JSX.
  const PlanShell = ops ? RecurringPlanRow : RecurringPlanCard;

  const workload = (
    <>
      <strong>Next 30 days:</strong> {next30.count} visit{next30.count === 1 ? '' : 's'}
      {next30.value > 0 ? ` · ${formatMoney(next30.value)} expected` : ''}
      <span className="recurring-workload-sep" aria-hidden="true">·</span>
      <strong>Next 90 days:</strong> {next90.count} visit{next90.count === 1 ? '' : 's'}
      {next90.value > 0 ? ` · ${formatMoney(next90.value)} expected` : ''}
    </>
  );

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
    workload,
  };

  return (
    <main className="wide-shell workspace-shell">
      {/* Operations trades the hero for a title bar.
          The lead paragraph explains what a recurring plan IS, which is worth a
          hero to somebody who has none and is dead weight to somebody managing
          eighteen. The map is not dropped — it moves to a tab, where it costs
          nothing until you ask for it. */}
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
                  of figures is a bar — it fits the tile it belongs to. */}
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
              along the foot of its board instead. */}
          {ops ? null : <p className="recurring-workload">{workload}</p>}
        </>
      ) : null}

      {/* .client-attention-card is a MODIFIER — it paints the orange edge and
          wash and nothing else, so it needs .panel underneath it for padding,
          radius and the light-theme flip.

          Cards only. Operations opens with a board whose first half is this
          same list, longer and with the plan one click away.

          The heading names the actual problem: it used to say "N plans need
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
                ? `${noCardPlans[0]!.client_name} has not added a card — that plan's visits will bill nobody.`
                : `${noCardPlans.map((plan) => plan.client_name).slice(0, 3).join(', ')}${noCardPlans.length > 3 ? ` and ${noCardPlans.length - 3} more` : ''} have not added a card.`}
            </p>
          </div>
          {noCardPlans.length === 1 ? attentionAction : null}
        </section>
      ) : null}

      {flash ? (
        <section className={`panel workspace-section-card flash-banner flash-${flash.tone === 'warn' ? 'warn' : flash.tone === 'info' ? 'info' : 'success'}`}>
          <p>
            {flash.text}
            {flashJobId ? <> <Link href={`${basePath}/jobs/${flashJobId}`}>View the visit →</Link></> : null}
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
        view={mode}
        board={ops ? board : null}
        pins={ops ? planPins : []}
        totalPlans={plans.length}
        activeCount={activeCount}
        gear={gear}
        composer={composer}
        months={calendarMonths}
        rows={plans.map<PlanRow>((plan) => {
          const context = contexts.get(plan.id);
          const slots = planActions(plan, context);
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
                context={context}
                resendLink={slots.resendLink ?? null}
                autopayToggle={slots.autopayToggle ?? null}
              >
                {slots.controls ?? null}
              </PlanShell>
            ),
          };
        })}
      />
    </main>
  );
}
