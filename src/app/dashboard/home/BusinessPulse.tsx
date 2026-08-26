import Link from 'next/link';
import InfoTip from '@/components/info-tip';
import type { BusinessPulse, Loadable } from '@/lib/dashboard-types';

export default function BusinessPulseComponent({
  pulse,
}: {
  pulse: Loadable<BusinessPulse>;
}) {
  if (pulse.kind === 'unavailable') {
    return (
      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Money</p>
          <h2>How the business is doing</h2>
        </div>
        <p className="workspace-card-copy" style={{ color: 'var(--muted)' }}>
          Financial metrics are temporarily unavailable.
        </p>
      </section>
    );
  }

  const {
    collectedThisMonth,
    outstandingInvoices,
    quotesAwaitingApproval,
    bookedWorkNext30Days,
    newLeadsThisMonth,
    monthLabel,
  } = pulse.data;

  return (
    <section className="panel workspace-section-card">
      <div className="section-heading workspace-section-heading">
        <p className="eyebrow">Money</p>
        <h2>How the business is doing</h2>
      </div>

      <div className="workspace-metric-grid">
        {/* Unpaid invoices */}
        <Link href={outstandingInvoices.href} style={{ textDecoration: 'none', color: 'inherit' }}>
          <article className={`workspace-metric-card${outstandingInvoices.accent ? ' accent' : ''}`}>
            <span className="workspace-metric-label">
              {outstandingInvoices.label}
              <InfoTip label="More information about unpaid invoices">
                {outstandingInvoices.tooltip}
              </InfoTip>
            </span>
            <strong className="workspace-metric-value">{outstandingInvoices.formattedValue}</strong>
            <p className="workspace-metric-note">{outstandingInvoices.subtitle}</p>
          </article>
        </Link>

        {/* Out for approval */}
        <Link href={quotesAwaitingApproval.href} style={{ textDecoration: 'none', color: 'inherit' }}>
          <article className="workspace-metric-card">
            <span className="workspace-metric-label">
              Out for approval
              <InfoTip label="More information about quotes out for approval">
                {quotesAwaitingApproval.tooltip}
              </InfoTip>
            </span>
            <strong className="workspace-metric-value">{quotesAwaitingApproval.formattedValue}</strong>
            <p className="workspace-metric-note">{quotesAwaitingApproval.subtitle}</p>
          </article>
        </Link>

        {/* Booked, next 30 days */}
        <Link href={bookedWorkNext30Days.href} style={{ textDecoration: 'none', color: 'inherit' }}>
          <article className="workspace-metric-card">
            <span className="workspace-metric-label">
              Booked, next 30 days
              <InfoTip label="More information about booked work">
                The quoted value of approved work on your calendar in the next 30 days. Work
                value, not cash — some of it is already paid and some is not due yet. For money
                in and out by date, see Cash flow.
              </InfoTip>
            </span>
            <strong className="workspace-metric-value">{bookedWorkNext30Days.formattedValue}</strong>
            <p className="workspace-metric-note">{bookedWorkNext30Days.subtitle}</p>
          </article>
        </Link>

        {/* Collected in {monthLabel} */}
        <Link href={collectedThisMonth.href} style={{ textDecoration: 'none', color: 'inherit' }}>
          <article className="workspace-metric-card">
            <span className="workspace-metric-label">
              Collected in {monthLabel}
              <InfoTip label="More information about payments collected">
                {collectedThisMonth.tooltip}
              </InfoTip>
            </span>
            <strong className="workspace-metric-value">{collectedThisMonth.formattedValue}</strong>
            <p className="workspace-metric-note">{collectedThisMonth.subtitle}</p>
          </article>
        </Link>

        {/* New leads this month */}
        <Link href={newLeadsThisMonth.href} style={{ textDecoration: 'none', color: 'inherit' }}>
          <article className="workspace-metric-card">
            <span className="workspace-metric-label">
              {newLeadsThisMonth.label}
              <InfoTip label="More information about new leads">
                {newLeadsThisMonth.tooltip}
              </InfoTip>
            </span>
            <strong className="workspace-metric-value">{newLeadsThisMonth.formattedValue}</strong>
            <p className="workspace-metric-note">{newLeadsThisMonth.subtitle}</p>
          </article>
        </Link>
      </div>
    </section>
  );
}
