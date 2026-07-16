import Link from 'next/link';
import { formatMoney } from '@/lib/jobs';
import type { ProfitAndLoss, ScheduleCLine, SubcontractorPayout } from '@/lib/tax-reports';

type Props = {
  year: number;
  availableYears: number[];
  pl: ProfitAndLoss;
  scheduleC: ScheduleCLine[];
  subPrep: SubcontractorPayout[];
};

export default function FinanceReports({ year, availableYears, pl, scheduleC, subPrep }: Props) {
  const needing1099 = subPrep.filter((s) => s.needs1099);

  return (
    <div className="settings-sections">
      <div className="settings-section">
        <div className="section-heading workspace-section-heading compact-heading">
          <p className="eyebrow">Finances</p>
          <h2>Tax &amp; P&amp;L reports</h2>
        </div>
        <p className="workspace-details-copy" style={{ marginTop: '0.5rem' }}>
          A running profit &amp; loss for your business, plus worksheets to make tax time faster.
          These are prep tools, not official IRS forms — hand them to your accountant or use them
          to fill out your own Schedule C.
        </p>

        <div className="tabs" style={{ marginTop: '1.25rem' }}>
          {availableYears.map((y) => (
            <Link
              key={y}
              href={`/dashboard/settings?year=${y}#finances`}
              className={`tab${y === year ? ' active' : ''}`}
            >
              {y}
            </Link>
          ))}
        </div>

        <div className="workspace-metric-grid" style={{ marginTop: '1rem' }}>
          <article className="workspace-metric-card accent">
            <span className="workspace-metric-label">Gross revenue</span>
            <strong className="workspace-metric-value">{formatMoney(pl.revenue)}</strong>
            <p className="workspace-metric-note">Cash actually collected from customers in {year}.</p>
          </article>
          <article className="workspace-metric-card">
            <span className="workspace-metric-label">Total expenses</span>
            <strong className="workspace-metric-value">{formatMoney(pl.totalExpenses)}</strong>
            <p className="workspace-metric-note">Materials, labor, subs, fees, and other costs.</p>
          </article>
          <article className="workspace-metric-card">
            <span className="workspace-metric-label">Net profit</span>
            <strong className="workspace-metric-value">{formatMoney(pl.netProfit)}</strong>
            <p className="workspace-metric-note">What you&apos;d carry to Schedule C / Form 1040.</p>
          </article>
        </div>

        <div className="actions workspace-actions" style={{ marginTop: '1.25rem' }}>
          <a href={`/api/export/tax?type=pl&year=${year}`} className="btn secondary">
            ⬇ Profit &amp; loss (CSV)
          </a>
          <a href={`/api/export/tax?type=schedule-c&year=${year}`} className="btn secondary">
            ⬇ Schedule C worksheet (CSV)
          </a>
          <a href={`/api/export/tax?type=1099&year=${year}`} className="btn secondary">
            ⬇ 1099 prep list (CSV)
          </a>
          <a href="/api/export/quickbooks" className="btn qb">
            ⬇ QuickBooks (CSV)
          </a>
        </div>
      </div>

      <div className="settings-section">
        <div className="section-heading workspace-section-heading compact-heading">
          <p className="eyebrow">Monthly</p>
          <h2>Profit &amp; loss — {year}</h2>
        </div>
        <div className="report-list">
          {pl.monthly.map((m) => (
            <div className="report-row" key={m.month}>
              <span className="report-row-label">{m.label}</span>
              <span className="report-row-figures">
                <span className="report-figure positive">{formatMoney(m.revenue)}</span>
                <span className="report-figure negative">-{formatMoney(m.expenses)}</span>
                <span className="report-row-value">{formatMoney(m.net)}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="settings-section">
        <div className="section-heading workspace-section-heading compact-heading">
          <p className="eyebrow">Worksheet</p>
          <h2>Schedule C breakdown</h2>
        </div>
        <div className="report-list">
          {scheduleC.map((l) => (
            <div className="report-row" key={l.line}>
              <span className="report-row-label">
                <span className="report-row-tag">{l.line}</span> {l.label}
              </span>
              <span className="report-row-value">{formatMoney(l.amount)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="settings-section">
        <div className="section-heading workspace-section-heading compact-heading">
          <p className="eyebrow">1099-NEC prep</p>
          <h2>Subcontractors paid — {year}</h2>
        </div>
        {subPrep.length === 0 ? (
          <p className="empty-state">No subcontractor costs logged for {year} yet.</p>
        ) : (
          <>
            {needing1099.length > 0 ? (
              <p className="workspace-details-copy" style={{ marginBottom: '0.75rem' }}>
                {needing1099.length} subcontractor{needing1099.length === 1 ? '' : 's'} crossed $600 —
                you&apos;ll likely need to file a 1099-NEC for each. Collect a signed W-9 from them
                (their legal name, address, and TIN) before filing.
              </p>
            ) : null}
            <div className="report-list">
              {subPrep.map((s) => (
                <div className="report-row" key={s.supplier}>
                  <span className="report-row-label">{s.supplier}</span>
                  <span className="report-row-figures">
                    {s.needs1099 ? <span className="status-badge status-flag">Needs 1099</span> : null}
                    <span className="report-row-value">{formatMoney(s.total)}</span>
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
