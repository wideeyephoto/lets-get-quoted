import Link from 'next/link';
import { expandRecurrence } from '@/lib/cash-forecast';
import { DEMO_CASH_BILLS, DEMO_CASH_EVENTS, DEMO_CASH_SETTINGS, dateKeyFromNow } from '@/lib/demo-data';
import DemoCashBoard from './DemoCashBoard';

export const metadata = { title: 'Cash flow — Live Demo' };
export const dynamic = 'force-dynamic';

// The forecast board itself is the REAL component, handed fictional events. That
// is deliberate: the chart is the thing worth showing, and a hand-built replica
// of it would drift away from the product within a release. Only the bills panel
// is rebuilt here, because the real one reaches straight for its server actions
// and a demo must not be able to write anything.

const RECURRENCE_WORD: Record<string, string> = {
  once: 'One-off',
  weekly: 'Weekly',
  biweekly: 'Every two weeks',
  monthly: 'Monthly',
};

const CATEGORY_WORD: Record<string, string> = {
  bill: 'bill',
  loan: 'loan',
  tax: 'tax',
  materials: 'materials',
  equipment: 'equipment',
  payroll: 'payroll',
  other: 'other',
};

function money(amount: number): string {
  return `$${Math.round(amount).toLocaleString('en-US')}`;
}

function dayLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function DemoBillsPanel({ todayKey }: { todayKey: string }) {
  const active = DEMO_CASH_BILLS.filter((row) => row.active);
  const paused = DEMO_CASH_BILLS.filter((row) => !row.active);
  const monthlyOut = active
    .filter((row) => row.direction === 'out')
    .reduce((sum, row) => sum + (row.recurrence === 'weekly' ? row.amount * 4.33 : row.recurrence === 'biweekly' ? row.amount * 2.17 : row.amount), 0);

  return (
    <section className="panel workspace-section-card cash-bills-card">
      <div className="section-heading workspace-section-heading">
        <p className="eyebrow">Money out</p>
        <h2>Bills the jobs don&rsquo;t know about</h2>
        <span className="cash-bills-total">about {money(monthlyOut)} a month</span>
      </div>

      <p className="cash-bills-lead">
        Insurance, the truck payment, rent, a supply-house account, quarterly tax. None of these belong to a job, so nothing
        else in here knows about them — and they&rsquo;re most of what actually empties the account.
      </p>

      <div className="cash-bill-list">
        {active.map((row) => {
          const next = expandRecurrence(row.dueDate, row.recurrence, { fromKey: todayKey, toKey: dateKeyFromNow(90) }, row.endsOn)[0] ?? null;
          return (
            <div className="cash-bill" key={row.id}>
              <div className="cash-bill-main">
                <strong>{row.label}</strong>
                <small>
                  {RECURRENCE_WORD[row.recurrence]} · {CATEGORY_WORD[row.category] ?? 'bill'}
                  {next ? ` · next ${dayLabel(next)}` : ' · finished'}
                </small>
                {row.note ? <p className="cash-bill-note">{row.note}</p> : null}
              </div>
              <div className="cash-bill-side">
                <span className="cash-bill-amount is-out">− {money(row.amount)}</span>
                <span className={`cash-chip ${row.confirmed ? 'is-confirmed' : 'is-estimated'}`}>
                  {row.confirmed ? 'Confirmed' : 'Estimated'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {paused.length > 0 ? (
        <div className="cash-bill-list is-paused">
          {paused.map((row) => (
            <div className="cash-bill" key={row.id}>
              <div className="cash-bill-main">
                <strong>{row.label}</strong>
                <small>
                  {RECURRENCE_WORD[row.recurrence]} · {money(row.amount)} · paused, so it&rsquo;s off the forecast
                </small>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="cash-bill-add">
        <button type="button" className="btn secondary" disabled>+ Add a bill</button>
      </div>
    </section>
  );
}

// The 30/60/90 tabs are real links, so the page has to honour the one it is
// given. It didn't: the board was hardcoded to a 30-day horizon, so the tabs
// changed the URL and the chart stayed put — the one visibly broken control in
// the whole demo. Unknown values fall back to 30 rather than rendering nothing.
const HORIZONS: Record<string, number> = { '30': 30, '60': 60, '90': 90 };

export default async function DemoCashFlowPage({ searchParams: searchParamsPromise }: { searchParams: Promise<{ window?: string }> }) {
  const searchParams = (await searchParamsPromise) || {};
  const todayKey = dateKeyFromNow(0);
  const windowKey = searchParams.window && HORIZONS[searchParams.window] ? searchParams.window : '30';

  return (
    <main className="wide-shell workspace-shell">
      <DemoCashBoard
        events={[...DEMO_CASH_EVENTS]}
        todayKey={todayKey}
        windowKey={windowKey}
        horizonDays={HORIZONS[windowKey]}
        savedBalance={DEMO_CASH_SETTINGS.balance}
        savedBuffer={DEMO_CASH_SETTINGS.buffer}
        savedCreditLine={DEMO_CASH_SETTINGS.creditLine}
        paymentLagDays={DEMO_CASH_SETTINGS.paymentLagDays}
        billsPanel={<DemoBillsPanel todayKey={todayKey} />}
      />

      {/* Closed, and last — same as the real page. Four paragraphs of
          methodology is read once, when somebody is deciding whether to believe
          the line, and then never again. */}
      <details className="panel cash-collapse cash-where-card">
        <summary>
          <span>Where these numbers come from</span>
          <small>So you can tell what to trust.</small>
        </summary>
        <ul className="cash-where-list">
          <li>
            <strong>Payroll</strong> — pay periods run every two weeks, paid the Friday after the period closes. Approved
            hours are confirmed; hours nobody has approved yet are priced from what&rsquo;s logged. A future period with no
            hours yet is projected from your recent ones. <Link href="/demo/payroll">Hours &amp; pay →</Link>
          </li>
          <li>
            <strong>Money coming in</strong> — payment requests you&rsquo;ve sent, payment-plan installments, recurring plan
            visits, and quoted work sitting on the calendar (less anything already collected on it).
          </li>
          <li>
            <strong>Bills</strong> — only what you add above. Nothing else in here knows your insurance renews.
          </li>
          <li>
            <strong>Not counted</strong> — finished work you haven&rsquo;t invoiced, and declined charges waiting on a new
            card. All of it is real money with no honest date to put it on, and a forecast that guesses cheerfully is worse
            than one that admits the gap.
          </li>
        </ul>
      </details>
    </main>
  );
}
