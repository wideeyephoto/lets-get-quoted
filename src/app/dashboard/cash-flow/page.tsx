import Link from 'next/link';
import { requireOfficeContext } from '@/lib/auth';
import { todayDateKey } from '@/lib/recurring';
import { loadCashForecastSources, loadPreviousSnapshot, MAX_HORIZON_DAYS } from '@/lib/cash-forecast-data';
import { compareForecast } from '@/lib/cash-accuracy';
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

export default async function CashFlowPage({ searchParams: searchParamsPromise }: { searchParams: Promise<{ window?: string }> }) {
  const searchParams = (await searchParamsPromise) || {};
  const { supabase, accountId } = await requireOfficeContext('reports.read');

  const selected = WINDOWS.find((option) => option.key === searchParams.window) ?? WINDOWS[0];
  const todayKey = todayDateKey();
  // ALWAYS the full quarter, whatever the tabs say.
  //
  // Loading only the selected window is why the 30-day view could report "First
  // warning: None" while the account went negative on day 33 — the event that
  // would have contradicted it was never fetched. The window is a drawing
  // choice; it should not decide what the page is allowed to know. buildForecast
  // drops anything past its own horizon, so the chart is unaffected.
  const sources = await loadCashForecastSources(supabase, accountId, {
    todayKey,
    days: MAX_HORIZON_DAYS,
  });

  // Only worth showing against a balance they have actually just checked. A
  // three-week-old number compared against a two-week-old forecast is two stale
  // things being held up next to each other.
  const balanceAge = sources.settings.balanceAt
    ? Math.floor((Date.now() - new Date(sources.settings.balanceAt).getTime()) / 86400000)
    : null;
  const accuracy =
    sources.settings.balance !== null && balanceAge !== null && balanceAge <= 1
      ? compareForecast(await loadPreviousSnapshot(supabase, accountId, todayKey), {
          todayKey,
          actualBalance: sources.settings.balance,
        })
      : null;

  return (
    <main className="wide-shell workspace-shell">
      {/* The hero is rendered by the board, not here: the chart lives inside it,
          and the chart is client state. Splitting the hero across a server and a
          client component to keep two static paragraphs up here would buy
          nothing. */}
      <CashFlowBoard
        windows={WINDOWS}
        selectedKey={selected.key}
        events={sources.events}
        todayKey={todayKey}
        horizonDays={selected.days}
        longDays={MAX_HORIZON_DAYS}
        savedBalance={sources.settings.balance}
        savedBuffer={sources.settings.buffer}
        savedCreditLine={sources.settings.creditLine}
        balanceAt={sources.settings.balanceAt}
        paymentLagDays={sources.paymentLagDays}
        paymentLagMeasured={sources.paymentLagMeasured}
        unbilled={sources.unbilled}
        accuracy={accuracy}
        settingsAvailable={sources.settings.available}
        saveSettings={saveCashSettingsAction}
        billsPanel={
          <ScheduledPaymentsPanel rows={sources.scheduled} todayKey={todayKey} available={sources.scheduledAvailable} />
        }
      />

      {/* Closed, and last. Four paragraphs of methodology is the right thing to
          have and the wrong thing to put between somebody and their week — it
          is read once, when they are deciding whether to believe the line, and
          then never again. */}
      <details className="panel cash-collapse cash-where-card">
        <summary>
          <span>Where these numbers come from</span>
          <small>So you can tell what to trust.</small>
        </summary>
        <ul className="cash-where-list">
          <li>
            <strong>Payroll</strong> — pay periods run {PERIOD_WORD[sources.payrollMode] ?? 'weekly'}, paid{' '}
            {payDaySentence(sources.payDay).toLowerCase()}. Approved hours are confirmed; hours nobody has approved yet are
            priced from what&rsquo;s logged. A future period with no hours yet is projected from your recent ones.{' '}
            <Link href="/dashboard/crew">Hours &amp; pay →</Link>
          </li>
          <li>
            <strong>Money coming in</strong> — payment requests you&rsquo;ve sent, payment-plan installments (including a
            plan still waiting on its deposit, spread across its real dates), recurring plan visits, declined charges with
            a retry scheduled, and quoted work sitting on the calendar (less anything already collected on it).
          </li>
          <li>
            <strong>Bills</strong> — only what you add above. Nothing else in here knows your insurance renews.
          </li>
          <li>
            <strong>Not counted</strong> — finished work you haven&rsquo;t invoiced, and declined charges that are waiting
            on the client to enter a new card or have run out of retries. All of it is real money with no honest date to
            put it on, and a forecast that guesses cheerfully is worse than one that admits the gap.
          </li>
        </ul>
      </details>
    </main>
  );
}
