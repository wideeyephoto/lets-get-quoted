import Link from 'next/link';
import { formatMoney } from '@/lib/jobs';
import { todayDateKey, type RecurringPlan } from '@/lib/recurring';
import { planMonthlyValue, visitCountdown } from '@/lib/recurring-display';
import { DEMO_ACCOUNT_ID, dateKeyFromNow } from '@/lib/demo-data';
import RecurringPlanCard from '@/components/recurring-plan-card';

export const dynamic = 'force-dynamic';

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
  const today = todayDateKey();
  const activePlans = plans.filter((plan) => plan.active);
  const activeCount = activePlans.length;
  const autoBilled = activePlans.filter((plan) => plan.auto_charge && plan.card_last4).length;
  const monthlyRecurring = activePlans.reduce((sum, plan) => sum + planMonthlyValue(plan.amount, plan.frequency), 0);
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
            Set up services that repeat — mowing, bed maintenance, seasonal cleanups — and each visit becomes a
            scheduled job automatically. Add a saved card and every visit is charged for you, hands-off.
          </p>
        </div>
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
              <strong className="workspace-metric-value">{autoBilled}</strong>
            </article>
          </div>
        </div>
      </section>

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading compact-heading">
          <p className="eyebrow">Plans{activeCount > 0 ? ` · ${activeCount} active` : ''}</p>
          <button type="button" className="btn secondary" disabled>+ New plan</button>
        </div>

        <div className="recurring-list">
          {plans.map((plan) => (
            <RecurringPlanCard
              key={plan.id}
              plan={plan}
              today={today}
              resendLink={<button type="button" className="linklike" disabled>Resend link</button>}
            >
              {plan.active ? (
                <button type="button" className="btn secondary" disabled>Run next visit now</button>
              ) : null}
              <button type="button" className="btn secondary" disabled>{plan.active ? 'Pause' : 'Resume'}</button>
              <button type="button" className="linklike danger" disabled>Cancel plan</button>
            </RecurringPlanCard>
          ))}
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
