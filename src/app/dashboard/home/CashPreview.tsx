import Link from 'next/link';
import { formatMoney } from '@/lib/jobs';
import type { CashPreview as CashPreviewType, Loadable } from '@/lib/dashboard-types';

export default function CashPreview({
  cashPreview,
  basePath: _basePath = '/dashboard',
}: {
  cashPreview: Loadable<CashPreviewType>;
  basePath?: string;
}) {
  if (cashPreview.kind === 'unavailable') {
    return null;
  }

  const { expectedIncoming, outstandingInvoiceBalance, netExpectedCash, href } = cashPreview.data;

  return (
    <section className="panel workspace-section-card cash-preview-panel">
      <div className="section-heading workspace-section-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <p className="eyebrow">Cash Preview</p>
          <h2>14-day cash outlook</h2>
        </div>
        <Link href={href} style={{ fontSize: '0.84rem', color: 'var(--accent)', textDecoration: 'none' }}>
          Open full cash flow &rarr;
        </Link>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '0.75rem',
          marginTop: '0.5rem',
        }}
      >
        <div style={{ padding: '0.85rem', borderRadius: '6px', border: '1px solid var(--line, rgba(255,255,255,0.08))', background: 'rgba(255,255,255,0.02)' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block' }}>
            Expected Incoming (14d)
          </span>
          <strong style={{ fontSize: '1.25rem', color: 'var(--good, #10b981)', display: 'block', marginTop: '0.15rem' }}>
            {formatMoney(expectedIncoming)}
          </strong>
          <span style={{ fontSize: '0.76rem', color: 'var(--muted)', display: 'block', marginTop: '0.2rem' }}>
            From deposits &amp; receivables
          </span>
        </div>

        <div style={{ padding: '0.85rem', borderRadius: '6px', border: '1px solid var(--line, rgba(255,255,255,0.08))', background: 'rgba(255,255,255,0.02)' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block' }}>
            Outstanding Invoice Balance
          </span>
          <strong style={{ fontSize: '1.25rem', color: 'var(--text)', display: 'block', marginTop: '0.15rem' }}>
            {formatMoney(outstandingInvoiceBalance)}
          </strong>
          <span style={{ fontSize: '0.76rem', color: 'var(--muted)', display: 'block', marginTop: '0.2rem' }}>
            Across sent/signed invoices
          </span>
        </div>

        <div style={{ padding: '0.85rem', borderRadius: '6px', border: '1px solid var(--line, rgba(255,255,255,0.08))', background: 'rgba(255,255,255,0.02)' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block' }}>
            Net Expected Cash
          </span>
          <strong style={{ fontSize: '1.25rem', color: 'var(--accent)', display: 'block', marginTop: '0.15rem' }}>
            {formatMoney(netExpectedCash)}
          </strong>
          <span style={{ fontSize: '0.76rem', color: 'var(--muted)', display: 'block', marginTop: '0.2rem' }}>
            Projected 14-day inflow
          </span>
        </div>
      </div>
    </section>
  );
}
