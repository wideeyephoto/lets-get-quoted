import { requireOwnerContext } from '@/lib/auth';
import { formatMoney } from '@/lib/jobs';
import { listRecurringPlans, todayDateKey, FREQUENCY_LABEL } from '@/lib/recurring';
import RecurringComposer from './RecurringComposer';
import { setPlanActiveAction, deletePlanAction, resendCardLinkAction } from './actions';

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
};

export default async function RecurringPage({ searchParams }: { searchParams: { flash?: string } }) {
  const { supabase, accountId } = await requireOwnerContext();

  const plans = await listRecurringPlans(supabase, accountId);
  const today = todayDateKey();
  const flash = searchParams.flash ? FLASH_MESSAGES[searchParams.flash] : null;

  const activeCount = plans.filter((plan) => plan.active).length;

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
      </section>

      {flash ? (
        <section className={`panel workspace-section-card flash-banner flash-${flash.tone === 'warn' ? 'warn' : flash.tone === 'info' ? 'info' : 'success'}`}>
          <p>{flash.text}</p>
        </section>
      ) : null}

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading compact-heading">
          <p className="eyebrow">Plans{activeCount > 0 ? ` · ${activeCount} active` : ''}</p>
        </div>
        <RecurringComposer today={today} />

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
