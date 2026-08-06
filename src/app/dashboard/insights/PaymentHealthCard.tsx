import Link from 'next/link';
import { formatMoney } from '@/lib/jobs';
import type { PaymentHealth } from '@/lib/insights-metrics';

// How the money comes in — and what's stuck. Every figure here is age-based, not
// due-date-based: invoices carry no due date, so nothing can honestly be "overdue
// against agreed terms". This is oldest-money — balances that have sat unpaid for
// 30+ days since being raised — plus how long a payment typically takes once
// asked for, and how many card charges failed. The card says "aging", never
// "overdue", so it can't imply a due date the data doesn't have. Server-only.

export default function PaymentHealthCard({ health }: { health: PaymentHealth }) {
  const { overdueBalance, overdueCount, avgDaysToCollect, failedPayments } = health;
  const allClear = overdueBalance === 0 && failedPayments === 0;

  return (
    <section className="panel ins-card ins-payhealth-card">
      <p className="ins-card-head">
        <span className="ins-chip is-pay" aria-hidden="true">♥</span> Payment health
      </p>

      <div className="ins-payhealth-grid">
        <div className="ins-payhealth-stat">
          <span className="ins-figure-label">Aged 30+ days</span>
          <strong className={`ins-mid${overdueBalance > 0 ? ' is-warn' : ''}`}>{formatMoney(overdueBalance)}</strong>
          <span className="ins-sub">
            {overdueCount === 0 ? 'nothing sitting that long' : `${overdueCount} invoice${overdueCount === 1 ? '' : 's'} aging`}
          </span>
        </div>
        <div className="ins-payhealth-stat">
          <span className="ins-figure-label">Avg time to collect</span>
          <strong className="ins-mid">{avgDaysToCollect === null ? '—' : `${avgDaysToCollect.toFixed(1)} days`}</strong>
          <span className="ins-sub">{avgDaysToCollect === null ? 'needs a paid invoice' : 'from asked to paid'}</span>
        </div>
        <div className="ins-payhealth-stat">
          <span className="ins-figure-label">Failed payments</span>
          <strong className={`ins-mid${failedPayments > 0 ? ' is-warn' : ''}`}>{failedPayments}</strong>
          <span className="ins-sub">{failedPayments === 0 ? 'none bounced' : 'card charges that bounced'}</span>
        </div>
      </div>

      <p className="ins-sub ins-payhealth-note">
        {allClear
          ? "Nothing's aging and no payments have failed — collections are healthy."
          : 'Called "aging", not "overdue": invoices don’t carry a due date, so this is money that has sat unpaid 30+ days since it was raised.'}
      </p>

      <div className="ins-card-foot">
        <span />
        <Link className="ins-inline-link" href="/dashboard/jobs">Open jobs →</Link>
      </div>
    </section>
  );
}
