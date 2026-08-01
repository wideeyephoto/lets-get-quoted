import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import { formatMoney } from '@/lib/jobs';
import { listRecurringPlans, todayDateKey } from '@/lib/recurring';
import { planMonthlyValue, visitCountdown } from '@/lib/recurring-display';
import { listServices } from '@/lib/services';
import { listClientsWithStats } from '@/lib/clients';
import RecurringComposer from './RecurringComposer';
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
  // "Run next visit now" passes the created job id so we can link straight to it.
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

  return (
    <main className="wide-shell workspace-shell">
      <section className="workspace-hero panel">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Recurring</p>
          <h1 className="workspace-title">Repeating jobs &amp; auto-billing</h1>
          <p className="workspace-lead">
            Set up services that repeat — lawn care, cleaning, pool service — and each visit becomes a scheduled job
            automatically. Add a saved card and every visit is charged for you, hands-off.
          </p>
        </div>
        {plans.length > 0 ? (
          <div className="recurring-hero-metrics">
            <article className="workspace-metric-card accent recurring-mrr-card">
              <span className="workspace-metric-label">Est. monthly recurring</span>
              <strong className="workspace-metric-value">{formatMoney(monthlyRecurring)}</strong>
              <p className="workspace-metric-note">
                Across {activeCount} active plan{activeCount === 1 ? '' : 's'}, normalized to a month.
              </p>
            </article>
            <div className="workspace-metric-grid condensed recurring-hero-pair">
              <article className="workspace-metric-card">
                <span className="workspace-metric-label">Due this week</span>
                <strong className="workspace-metric-value">{dueThisWeek}</strong>
              </article>
              <article className="workspace-metric-card">
                <span className="workspace-metric-label">Auto-billed</span>
                <strong className="workspace-metric-value">{autoBilledCount}</strong>
              </article>
            </div>
          </div>
        ) : (
          <RecurringHowItWorks />
        )}
      </section>

      {flash ? (
        <section className={`panel workspace-section-card flash-banner flash-${flash.tone === 'warn' ? 'warn' : flash.tone === 'info' ? 'info' : 'success'}`}>
          <p>
            {flash.text}
            {flashJobId ? <> <Link href={`/dashboard/jobs/${flashJobId}`}>View the visit →</Link></> : null}
          </p>
        </section>
      ) : null}

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading compact-heading">
          <p className="eyebrow">Plans{activeCount > 0 ? ` · ${activeCount} active` : ''}</p>
        </div>
        <RecurringComposer today={today} services={services} clients={clients} />

        {plans.length === 0 ? (
          <p className="empty-state">No recurring plans yet. Create one above and its visits will schedule themselves.</p>
        ) : (
          <div className="recurring-list">
            {plans.map((plan) => {
              const paused = !plan.active;
              return (
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
                          ? `Create the next visit now and charge the card on file (•••• ${plan.card_last4}) ${plan.amount > 0 ? formatMoney(plan.amount) : ''}? This bills the customer immediately and moves the schedule forward.`
                          : 'Create the next scheduled visit now and move the schedule forward?'
                      }
                      className="btn secondary"
                      pendingLabel="Running…"
                      savedLabel="Done ✓"
                    >
                      Run next visit now
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
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
