import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import { formatMoney } from '@/lib/jobs';
import { listRecurringPlans, todayDateKey, FREQUENCY_LABEL } from '@/lib/recurring';
import { listServices } from '@/lib/services';
import RecurringComposer from './RecurringComposer';
import ConfirmActionButton from '@/app/dashboard/jobs/[id]/ConfirmActionButton';
import { setPlanActiveAction, deletePlanAction, resendCardLinkAction, runPlanNowAction } from './actions';

function formatDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

const FLASH_MESSAGES: Record<string, { tone: 'success' | 'info' | 'warn'; text: string }> = {
  created: { tone: 'success', text: 'Recurring plan created. The first visit will be created automatically on its date.' },
  'card-sent': { tone: 'success', text: 'Plan saved and a secure card-setup link was sent to your customer.' },
  'card-failed': { tone: 'warn', text: 'Plan saved, but the card link couldn’t be sent. Add an email or opted-in phone, then resend it.' },
  deleted: { tone: 'info', text: 'Recurring plan cancelled. No more visits will be created.' },
  'ran-paid': { tone: 'success', text: 'Visit created and the saved card was charged. Check the job and its payment to confirm.' },
  'ran-skipped': { tone: 'info', text: 'Visit created and the schedule advanced. Nothing was charged (auto-charge off or no card on file).' },
  'ran-failed': { tone: 'warn', text: 'Visit created, but the card charge didn’t go through — the customer was sent a pay link. See the job’s payment.' },
};

export default async function RecurringPage({ searchParams }: { searchParams: { flash?: string; job?: string } }) {
  const { supabase, accountId } = await requireOwnerContext();

  const plans = await listRecurringPlans(supabase, accountId);
  const services = (await listServices(supabase, accountId, { activeOnly: true }))
    .map((service) => ({ id: service.id, name: service.name, unitPrice: Number(service.unit_price) || 0 }));
  const today = todayDateKey();
  const flash = searchParams.flash ? FLASH_MESSAGES[searchParams.flash] : null;
  // "Run next visit now" passes the created job id so we can link straight to it.
  const flashJobId = flash && searchParams.flash?.startsWith('ran-') ? searchParams.job ?? null : null;

  const activePlans = plans.filter((plan) => plan.active);
  const activeCount = activePlans.length;
  // Normalize every active plan to a monthly figure so the owner sees the real
  // recurring revenue this book of plans throws off — weekly counts ~4.33×/mo.
  const MONTHLY_MULTIPLIER: Record<string, number> = { weekly: 52 / 12, biweekly: 26 / 12, monthly: 1 };
  const monthlyRecurring = activePlans.reduce((sum, plan) => sum + plan.amount * (MONTHLY_MULTIPLIER[plan.frequency] ?? 1), 0);
  const autoBilledCount = activePlans.filter((plan) => plan.auto_charge && plan.card_last4).length;

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
          <div className="workspace-metric-grid">
            <article className="workspace-metric-card accent">
              <span className="workspace-metric-label">Est. monthly recurring</span>
              <strong className="workspace-metric-value">{formatMoney(monthlyRecurring)}</strong>
              <p className="workspace-metric-note">Across {activeCount} active plan{activeCount === 1 ? '' : 's'}, normalized to a month.</p>
            </article>
            <article className="workspace-metric-card">
              <span className="workspace-metric-label">Active plans</span>
              <strong className="workspace-metric-value">{activeCount}</strong>
            </article>
            <article className="workspace-metric-card">
              <span className="workspace-metric-label">Auto-billed</span>
              <strong className="workspace-metric-value">{autoBilledCount}</strong>
            </article>
          </div>
        ) : null}
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
        <RecurringComposer today={today} services={services} />

        {plans.length === 0 ? (
          <p className="empty-state">No recurring plans yet. Create one above and its visits will schedule themselves.</p>
        ) : (
          <div className="recurring-list">
            {plans.map((plan) => {
              const paused = !plan.active;
              return (
                <div key={plan.id} className={`recurring-card${paused ? ' is-paused' : ''}`}>
                  <div className="recurring-card-main">
                    <div className="recurring-card-head">
                      <strong>{plan.title}</strong>
                      <span className="recurring-freq">{FREQUENCY_LABEL[plan.frequency]}</span>
                      {paused ? <span className="recurring-paused-tag">Paused</span> : null}
                    </div>
                    <p className="recurring-card-meta">
                      {plan.client_name}
                      {plan.amount > 0 ? ` · ${formatMoney(plan.amount)}/visit` : ''}
                      {plan.active ? ` · Next ${formatDateKey(plan.next_run_date)}` : ''}
                      {plan.active && plan.remaining_cycles != null ? ` · ${plan.remaining_cycles} visit${plan.remaining_cycles === 1 ? '' : 's'} left` : ''}
                    </p>
                    <div className="recurring-billing">
                      {plan.auto_charge ? (
                        plan.card_last4 ? (
                          <span className="recurring-card-onfile">
                            💳 {plan.card_brand ? plan.card_brand.replace(/^\w/, (c) => c.toUpperCase()) : 'Card'} •••• {plan.card_last4}
                          </span>
                        ) : (
                          <span className="recurring-card-pending">
                            Awaiting card
                            <form action={resendCardLinkAction.bind(null, plan.id)}>
                              <button type="submit" className="linklike">Resend link</button>
                            </form>
                          </span>
                        )
                      ) : (
                        <span className="recurring-manual">Manual billing</span>
                      )}
                    </div>
                  </div>

                  <div className="recurring-card-actions">
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
                    <form action={setPlanActiveAction.bind(null, plan.id, paused)}>
                      <button type="submit" className="btn secondary">{paused ? 'Resume' : 'Pause'}</button>
                    </form>
                    <form action={deletePlanAction.bind(null, plan.id)}>
                      <button type="submit" className="linklike danger">Cancel plan</button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
