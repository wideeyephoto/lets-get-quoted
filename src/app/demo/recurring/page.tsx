import Link from 'next/link';
import { formatMoney } from '@/lib/jobs';
import { FREQUENCY_LABEL, type RecurringPlan } from '@/lib/recurring';
import { DEMO_ACCOUNT_ID, dateKeyFromNow } from '@/lib/demo-data';

export const dynamic = 'force-dynamic';

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

// Inline, correctly-typed demo plans for the fictional "Evergreen Lawn &
// Landscape". No DB, no Supabase, no server actions — this page is read-only.
function makePlan(seed: {
  id: string;
  title: string;
  clientName: string;
  amount: number;
  frequency: RecurringPlan['frequency'];
  nextOffset: number;
  active?: boolean;
  autoCharge?: boolean;
  cardBrand?: string | null;
  cardLast4?: string | null;
}): RecurringPlan {
  const hasCard = Boolean(seed.cardLast4);
  return {
    id: seed.id,
    account_id: DEMO_ACCOUNT_ID,
    client_id: null,
    title: seed.title,
    scope: null,
    client_name: seed.clientName,
    client_phone: null,
    client_email: null,
    address: null,
    amount: seed.amount,
    frequency: seed.frequency,
    next_run_date: dateKeyFromNow(seed.nextOffset),
    active: seed.active ?? true,
    auto_charge: seed.autoCharge ?? false,
    remaining_cycles: null,
    stripe_customer_id: hasCard ? `cus_demo_${seed.id}` : null,
    stripe_payment_method_id: hasCard ? `pm_demo_${seed.id}` : null,
    card_brand: seed.cardBrand ?? null,
    card_last4: seed.cardLast4 ?? null,
    last_job_id: null,
    last_run_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

const DEMO_PLANS: RecurringPlan[] = [
  makePlan({ id: 'plan-1', title: 'Weekly Mowing', clientName: 'Karen Whitfield', amount: 55, frequency: 'weekly', nextOffset: 2, autoCharge: true, cardBrand: 'Visa', cardLast4: '4242' }),
  makePlan({ id: 'plan-2', title: 'Weekly Mowing', clientName: 'Diane Kim', amount: 60, frequency: 'weekly', nextOffset: 1, autoCharge: true, cardBrand: 'Amex', cardLast4: '0005' }),
  makePlan({ id: 'plan-3', title: 'Weekly Mowing', clientName: 'Marcus Delgado', amount: 48, frequency: 'weekly', nextOffset: 4 }),
  makePlan({ id: 'plan-4', title: 'Bi-weekly Mowing', clientName: 'Isabel Reyes', amount: 70, frequency: 'biweekly', nextOffset: 6, autoCharge: true, cardBrand: 'Mastercard', cardLast4: '4444' }),
  makePlan({ id: 'plan-5', title: 'Seasonal Fertilization Program', clientName: 'Paul Grant', amount: 120, frequency: 'monthly', nextOffset: 9, autoCharge: true }),
  makePlan({ id: 'plan-6', title: 'Monthly Bed Maintenance', clientName: 'Grace Foster', amount: 95, frequency: 'monthly', nextOffset: 12, autoCharge: true, cardBrand: 'Visa', cardLast4: '1881' }),
  makePlan({ id: 'plan-7', title: 'Spring & Fall Cleanup', clientName: 'Yuki Nakamura', amount: 185, frequency: 'monthly', nextOffset: 18 }),
  makePlan({ id: 'plan-8', title: 'Monthly Bed Maintenance', clientName: 'Tom Alvarez', amount: 110, frequency: 'monthly', nextOffset: 21, active: false }),
];

export default function DemoRecurringPage() {
  const plans = DEMO_PLANS;
  const activeCount = plans.filter((plan) => plan.active).length;
  const autoBilled = plans.filter((plan) => plan.auto_charge && plan.card_last4).length;
  const monthlyRecurring = plans
    .filter((plan) => plan.active)
    .reduce((sum, plan) => {
      const perMonth = plan.frequency === 'weekly' ? plan.amount * 4.33 : plan.frequency === 'biweekly' ? plan.amount * 2.17 : plan.amount;
      return sum + perMonth;
    }, 0);

  return (
    <main className="wide-shell workspace-shell">
      <section className="workspace-hero panel">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Recurring</p>
          <h1 className="workspace-title">Repeating jobs &amp; auto-billing</h1>
          <p className="workspace-lead">
            Set up services that repeat — mowing, bed maintenance, seasonal cleanups — and each visit becomes a
            scheduled job automatically. Add a saved card and every visit is charged for you, hands-off.
          </p>
        </div>
        <div className="workspace-metric-grid compact">
          <article className="workspace-metric-card accent">
            <span className="workspace-metric-label">Active plans</span>
            <strong className="workspace-metric-value">{activeCount}</strong>
            <p className="workspace-metric-note">Repeating jobs generating visits automatically.</p>
          </article>
          <article className="workspace-metric-card">
            <span className="workspace-metric-label">Auto-billed</span>
            <strong className="workspace-metric-value">{autoBilled}</strong>
            <p className="workspace-metric-note">Plans with a card on file, charged every visit.</p>
          </article>
          <article className="workspace-metric-card">
            <span className="workspace-metric-label">Recurring / mo</span>
            <strong className="workspace-metric-value">{formatMoney(monthlyRecurring)}</strong>
            <p className="workspace-metric-note">Estimated monthly value across active plans.</p>
          </article>
        </div>
      </section>

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading compact-heading">
          <p className="eyebrow">Plans{activeCount > 0 ? ` · ${activeCount} active` : ''}</p>
          <button type="button" className="btn secondary" disabled>+ New plan</button>
        </div>

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
                          <button type="button" className="linklike" disabled>Resend link</button>
                        </span>
                      )
                    ) : (
                      <span className="recurring-manual">Manual billing</span>
                    )}
                  </div>
                </div>

                <div className="recurring-card-actions">
                  {plan.active ? (
                    <button type="button" className="btn secondary" disabled>Run next visit now</button>
                  ) : null}
                  <button type="button" className="btn secondary" disabled>{paused ? 'Resume' : 'Pause'}</button>
                  <button type="button" className="linklike danger" disabled>Cancel plan</button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel workspace-section-card demo-locked-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Try it yourself</p>
          <h2>+ New plan</h2>
        </div>
        <p className="workspace-card-copy">
          Setting up recurring plans, saving a customer&apos;s card, and letting every visit bill itself takes
          about a minute once you&apos;re signed in — this demo account is read-only.
        </p>
        <Link href="/login" className="btn primary">
          Create free account
        </Link>
      </section>
    </main>
  );
}
