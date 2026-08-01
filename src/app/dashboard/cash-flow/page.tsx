import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import { todayDateKey } from '@/lib/recurring';
import { loadCashForecastSources, DEFAULT_HORIZON_DAYS } from '@/lib/cash-forecast-data';
import { payDaySentence } from '@/lib/pay-day';
import CashFlowBoard from './CashFlowBoard';
import ScheduledPaymentsPanel from './ScheduledPaymentsPanel';
import { saveCashSettingsAction } from './actions';

export const metadata = { title: 'Cash flow' };

const WINDOWS: { key: string; label: string; days: number }[] = [
  { key: '30', label: '30 days', days: 30 },
  { key: '60', label: '60 days', days: 60 },
  { key: '90', label: '90 days', days: 90 },
];

const PERIOD_WORD: Record<string, string> = {
  weekly: 'weekly',
  biweekly: 'every two weeks',
  monthly: 'monthly',
  custom: 'weekly',
};

export default async function CashFlowPage({ searchParams }: { searchParams: { window?: string } }) {
  const { supabase, accountId } = await requireOwnerContext();

  const selected = WINDOWS.find((option) => option.key === searchParams.window) ?? WINDOWS[0];
  const todayKey = todayDateKey();
  const sources = await loadCashForecastSources(supabase, accountId, {
    todayKey,
    days: selected.days || DEFAULT_HORIZON_DAYS,
  });

  return (
    <main className="wide-shell workspace-shell">
      <section className="workspace-hero panel">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Cash flow</p>
          <h1 className="workspace-title">Will the money be there?</h1>
          <p className="workspace-lead">
            Payroll, bills and materials going out; deposits, invoices and plans coming in. Put in what&rsquo;s actually in the
            bank and this shows you the balance day by day — and the first day it gets uncomfortable.
          </p>
          <div className="insight-window-tabs" role="tablist" aria-label="Forecast window">
            {WINDOWS.map((option) => (
              <Link
                key={option.key}
                href={`/dashboard/cash-flow?window=${option.key}`}
                className={`insight-window-tab${option.key === selected.key ? ' is-active' : ''}`}
                aria-selected={option.key === selected.key}
                role="tab"
              >
                {option.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <CashFlowBoard
        events={sources.events}
        todayKey={todayKey}
        horizonDays={selected.days}
        savedBalance={sources.settings.balance}
        savedBuffer={sources.settings.buffer}
        savedCreditLine={sources.settings.creditLine}
        balanceAt={sources.settings.balanceAt}
        paymentLagDays={sources.paymentLagDays}
        paymentLagMeasured={sources.paymentLagMeasured}
        unbilled={sources.unbilled}
        settingsAvailable={sources.settings.available}
        saveSettings={saveCashSettingsAction}
      />

      <ScheduledPaymentsPanel rows={sources.scheduled} todayKey={todayKey} available={sources.scheduledAvailable} />

      <section className="panel workspace-section-card cash-where-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Where these numbers come from</p>
          <h2>So you can tell what to trust</h2>
        </div>
        <ul className="cash-where-list">
          <li>
            <strong>Payroll</strong> — pay periods run {PERIOD_WORD[sources.payrollMode] ?? 'weekly'}, paid{' '}
            {payDaySentence(sources.payDay).toLowerCase()}. Approved hours are confirmed; hours nobody has approved yet are
            priced from what&rsquo;s logged. A future period with no hours yet is projected from your recent ones.{' '}
            <Link href="/dashboard/crew">Hours &amp; pay →</Link>
          </li>
          <li>
            <strong>Money coming in</strong> — payment requests you&rsquo;ve sent, payment-plan installments, recurring plan
            visits, and quoted work sitting on the calendar (less anything already collected on it).
          </li>
          <li>
            <strong>Bills</strong> — only what you add above. Nothing else in here knows your insurance renews.
          </li>
          <li>
            <strong>Not counted</strong> — finished work you haven&rsquo;t invoiced. It&rsquo;s real money, but there&rsquo;s
            no honest date to put it on until somebody is asked for it, and a forecast that guesses cheerfully is worse than
            one that admits the gap.
          </li>
        </ul>
      </section>
    </main>
  );
}
