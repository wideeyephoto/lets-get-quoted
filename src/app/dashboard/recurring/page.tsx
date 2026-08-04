import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import { formatMoney } from '@/lib/jobs';
import { listRecurringPlans, projectPlanVisits, todayDateKey, type PlannedVisit } from '@/lib/recurring';
import {
  dateKeyPlusDays,
  planMonthlyValue,
  shortDate,
  trailingMonthlyRecurring,
  visitCountdown,
  workloadWindow,
} from '@/lib/recurring-display';
import { listServices } from '@/lib/services';
import { listClientsWithStats } from '@/lib/clients';
import RecurringComposer from './RecurringComposer';
import RecurringWorkspace, { type PlanRow } from './RecurringWorkspace';
import Sparkline from '@/components/sparkline';
import RecurringPlanCard from '@/components/recurring-plan-card';
import RecurringHowItWorks from '@/components/recurring-how-it-works';
import ConfirmActionButton from '@/app/dashboard/jobs/[id]/ConfirmActionButton';
import { setPlanActiveAction, deletePlanAction, resendCardLinkAction, runPlanNowAction, updatePlanAction } from './actions';
import EditPlanPanel from './EditPlanPanel';

const FLASH_MESSAGES: Record<string, { tone: 'success' | 'info' | 'warn'; text: string }> = {
  created: { tone: 'success', text: 'Recurring plan created — the next visits are on your calendar already. Each one is invoiced on the day it happens, not before.' },
  'card-sent': { tone: 'success', text: 'Plan saved, the next visits are on your calendar, and a secure card-setup link was sent to your customer.' },
  'card-failed': { tone: 'warn', text: 'Plan saved and the visits are on your calendar, but the card link couldn’t be sent. Add an email or opted-in phone, then resend it.' },
  deleted: { tone: 'info', text: 'Recurring plan cancelled. Its upcoming visits were taken off the calendar; anything already worked or billed stays.' },
  'ran-paid': { tone: 'success', text: 'Visit created and the saved card was charged. Check the job and its payment to confirm.' },
  'ran-skipped': { tone: 'info', text: 'Visit created and the schedule advanced. Nothing was charged (auto-charge off or no card on file).' },
  'ran-failed': { tone: 'warn', text: 'Visit created, but the card charge didn’t go through — the customer was sent a pay link. See the job’s payment.' },
};

export default async function RecurringPage({ searchParams }: { searchParams: { flash?: string; job?: string } }) {
  const { supabase, accountId } = await requireOwnerContext();

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
  const flash = searchParams.flash ? FLASH_MESSAGES[searchParams.flash] : null;
  // Creating a visit early passes the created job id so we can link straight to it.
  const flashJobId = flash && searchParams.flash?.startsWith('ran-') ? searchParams.job ?? null : null;

  const activePlans = plans.filter((plan) => plan.active);
  const activeCount = activePlans.length;
  // Normalize every active plan to a monthly figure so the owner sees the real
  // recurring revenue this book of plans throws off — weekly counts ~4.33×/mo.
  const monthlyRecurring = activePlans.reduce((sum, plan) => sum + planMonthlyValue(plan.amount, plan.frequency), 0);
  const autoBilledCount = activePlans.filter((plan) => plan.auto_charge && plan.card_last4).length;
  // Visits the owner should expect this week — the thing a recurring book is
  // actually promising, and the one number that was nowhere on this page.
  const dueThisWeek = activePlans.filter((plan) => {
    const days = visitCountdown(plan.next_run_date, today).days;
    return days >= 0 && days < 7;
  }).length;

  // "Needs attention" is one thing today: auto-charge is on but no card ever
  // landed, so every visit will bill nobody. Named per plan so the banner can
  // say WHO, which is the only version of this an owner can act on.
  const needsAttention = activePlans.filter((plan) => plan.auto_charge && !plan.card_last4);

  // What the book actually puts on the calendar. projectPlanVisits walks the
  // same cadence the cron will, so this is the work, not an average of it.
  const horizon = dateKeyPlusDays(today, 90);
  const projected = projectPlanVisits(activePlans, { fromKey: today, toKey: horizon });
  const next30 = workloadWindow(projected, today, dateKeyPlusDays(today, 30));
  const next90 = workloadWindow(projected, today, horizon);
  const trail = trailingMonthlyRecurring(plans, today, 6);

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
          planTitle: visit.planTitle,
          clientName: visit.clientName,
          amountLabel: visit.amount > 0 ? formatMoney(visit.amount) : null,
        })),
      };
    });

  return (
    <main className="wide-shell workspace-shell">
      <section className={`workspace-hero panel${plans.length > 0 ? ' workspace-hero-solo' : ''}`}>
        <div className="workspace-hero-copy">
          <p className="eyebrow">Recurring</p>
          <h1 className="workspace-title">Repeating jobs &amp; auto-billing</h1>
          <p className="workspace-lead">
            Set up services that repeat — lawn care, cleaning, pool service — and each visit becomes a scheduled job
            automatically. Add a saved card and every visit is charged for you, hands-off.
          </p>
        </div>
        {plans.length > 0 ? null : <RecurringHowItWorks />}
      </section>

      {plans.length > 0 ? (
        <>
          <div className="workspace-metric-grid four-up recurring-stat-grid">
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
              <p className="workspace-metric-note">this week</p>
            </article>
            <article className="workspace-metric-card">
              <span className="workspace-metric-label">Autopay coverage</span>
              {/* "1 of 2" rather than a bare count: the number only means
                  anything against how many plans could be on autopay. */}
              <strong className="workspace-metric-value">
                {autoBilledCount} <span className="recurring-stat-of">of {activeCount}</span>
              </strong>
              <p className="workspace-metric-note">plan{activeCount === 1 ? '' : 's'}</p>
            </article>
            <article className={`workspace-metric-card${needsAttention.length > 0 ? ' is-loss' : ''}`}>
              <span className="workspace-metric-label">Needs attention</span>
              <strong className="workspace-metric-value">{needsAttention.length}</strong>
              <p className="workspace-metric-note">
                {needsAttention.length === 1 ? 'plan' : 'plans'}
              </p>
            </article>
          </div>

          {/* Workload, not revenue: the line that ties a book of plans to the
              days it will actually take up. */}
          <p className="recurring-workload">
            <strong>Next 30 days:</strong> {next30.count} visit{next30.count === 1 ? '' : 's'}
            {next30.value > 0 ? ` · ${formatMoney(next30.value)} expected` : ''}
            <span className="recurring-workload-sep" aria-hidden="true">·</span>
            <strong>Next 90 days:</strong> {next90.count} visit{next90.count === 1 ? '' : 's'}
            {next90.value > 0 ? ` · ${formatMoney(next90.value)} expected` : ''}
          </p>
        </>
      ) : null}

      {/* .client-attention-card is a MODIFIER — it paints the orange edge and
          wash and nothing else, so it needs .panel underneath it for padding,
          radius and the light-theme flip. Without it the copy sits flush
          against the card edge. */}
      {needsAttention.length > 0 ? (
        <section className="panel client-attention-card recurring-attention">
          <div className="recurring-attention-copy">
            <strong>
              {needsAttention.length} plan{needsAttention.length === 1 ? '' : 's'} need
              {needsAttention.length === 1 ? 's' : ''} attention
            </strong>
            <p>
              {needsAttention.length === 1
                ? `${needsAttention[0].client_name} has not added a payment method — that plan's visits will bill nobody.`
                : `${needsAttention.map((plan) => plan.client_name).slice(0, 3).join(', ')}${needsAttention.length > 3 ? ` and ${needsAttention.length - 3} more` : ''} have not added a payment method.`}
            </p>
          </div>
          {needsAttention.length === 1 ? (
            <form action={resendCardLinkAction.bind(null, needsAttention[0].id)}>
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
          rather than trying to read anything back out of the JSX. */}
      <RecurringWorkspace
        activeCount={activeCount}
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
            needsAttention: Boolean(plan.active && plan.auto_charge && !plan.card_last4),
            card: (
                <RecurringPlanCard
                  key={plan.id}
                  plan={plan}
                  today={today}
                  resendLink={
                    <form action={resendCardLinkAction.bind(null, plan.id)}>
                      <button type="submit" className="linklike">Resend link</button>
                    </form>
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
                  <form action={deletePlanAction.bind(null, plan.id)} className="danger">
                    <button type="submit" className="linklike danger">Cancel plan</button>
                  </form>
                </RecurringPlanCard>
            ),
          };
        })}
      />
    </main>
  );
}
