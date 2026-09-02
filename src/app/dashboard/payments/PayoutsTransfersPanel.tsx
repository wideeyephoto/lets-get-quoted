'use client';

import type { PayoutsAccountOverview } from '@/lib/payouts-data';
import Link from 'next/link';

interface Props {
  payouts: PayoutsAccountOverview;
}

function formatUsd(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function PayoutsTransfersPanel({ payouts }: Props) {
  if (!payouts.connected) {
    return (
      <div style={{ padding: '2.5rem 1.5rem', textAlign: 'center', background: 'var(--panel-bg, #fff)', borderRadius: '8px', border: '1px solid var(--border-subtle, #e2e8f0)' }}>
        <div style={{ fontSize: '2.2rem', marginBottom: '0.75rem' }}>🏦</div>
        <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.2rem' }}>Connect Stripe to Enable Automatic Bank Payouts</h3>
        <p style={{ maxWidth: '480px', margin: '0 auto 1.25rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Connect your bank account through Stripe Connect so homeowner payments, deposits, and invoice balances land safely in your checking account.
        </p>
        <Link href="/dashboard/settings#payments" className="btn primary">
          Set Up Payout Account →
        </Link>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Payout Pause Alert Banner if applicable */}
      {payouts.payoutsPaused && (
        <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid #ef4444', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong style={{ color: '#dc2626' }}>⚠️ Payouts Temporarily Paused by Stripe</strong>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Stripe requires updated business identity or tax verification before releasing bank transfers.
            </p>
          </div>
          <a href="https://dashboard.stripe.com" target="_blank" rel="noreferrer" className="btn primary" style={{ background: '#dc2626', borderColor: '#dc2626' }}>
            Verify on Stripe →
          </a>
        </div>
      )}

      {/* Stripe Balance Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem' }}>
        <div style={{ padding: '1.2rem', background: 'var(--bg-2)', borderRadius: '8px', border: '1px solid var(--line)' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Available Stripe Balance
          </span>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--good, #047857)', marginTop: '0.3rem' }}>
            {formatUsd(payouts.availableBalanceDollars)}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
            Ready for next automatic bank transfer
          </div>
        </div>

        <div style={{ padding: '1.2rem', background: 'var(--bg-2)', borderRadius: '8px', border: '1px solid var(--line)' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            In-Transit / Settling
          </span>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: '0.3rem', color: 'var(--text)' }}>
            {formatUsd(payouts.pendingBalanceDollars)}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
            Card &amp; ACH settlements in transit (1–2 business days)
          </div>
        </div>

        <div style={{ padding: '1.2rem', background: 'var(--bg-2)', borderRadius: '8px', border: '1px solid var(--line)' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Payout Schedule
          </span>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, marginTop: '0.45rem', color: 'var(--text)' }}>
            Daily Automatic
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.35rem' }}>
            Transfers directly to bank account
          </div>
        </div>
      </div>

      {/* Instant Payout & Tax 1099-K Hub */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '0.85rem' }}>
        {/* Instant Payout Liquidity Card */}
        <div style={{ padding: '1rem 1.25rem', background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.05) 0%, rgba(16, 185, 129, 0.05) 100%)', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.2)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text)' }}>
              <span>⚡</span> Instant Payout (Emergency Liquidity)
            </strong>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, background: 'rgba(59, 130, 246, 0.15)', color: 'var(--info, #2563eb)', padding: '0.15rem 0.5rem', borderRadius: '999px' }}>
              Within 30 Mins
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--muted)' }}>
            Need material funds on Friday afternoon before banks open Monday? Transfer available funds immediately to your debit card.
          </p>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem', padding: '0.5rem 0.75rem', background: 'var(--bg-3)', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '0.84rem' }}>
            <div>
              <span style={{ color: 'var(--muted)', display: 'block', fontSize: '0.72rem' }}>Available to Transfer</span>
              <strong style={{ color: 'var(--text)' }}>{formatUsd(payouts.availableBalanceDollars)}</strong>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ color: 'var(--muted)', display: 'block', fontSize: '0.72rem' }}>Net After 1.5% Fee</span>
              <strong style={{ color: 'var(--good, #047857)' }}>
                {formatUsd(Math.max(0, payouts.availableBalanceDollars * 0.985))}
              </strong>
            </div>
          </div>
        </div>

        {/* 1099-K Annual Tax Compliance Info */}
        <div style={{ padding: '1rem 1.25rem', background: 'var(--bg-2)', borderRadius: '8px', border: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text)' }}>
              <span>📋</span> IRS Form 1099-K Information
            </strong>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, background: 'rgba(59, 130, 246, 0.12)', color: 'var(--info, #2563eb)', padding: '0.15rem 0.5rem', borderRadius: '999px' }}>
              Stripe Connect Auto-Issue
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--muted)' }}>
            Under IRS rules, payment card transactions have no minimum reporting threshold, while third-party network (TPSO) transactions are subject to federal thresholds ($20,000 and 200 transactions) or applicable state limits. Stripe Connect automatically generates and delivers official year-end tax forms to eligible contractor accounts.
          </p>
        </div>
      </div>

      {/* Payouts Table */}
      <div style={{ background: 'var(--bg-2)', borderRadius: '8px', border: '1px solid var(--line)', overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text)' }}>Recent Bank Transfers &amp; Payouts</h3>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: 'var(--muted)' }}>
              Completed and in-flight disbursements to your linked checking account.
            </p>
          </div>
          <a
            href="https://dashboard.stripe.com"
            target="_blank"
            rel="noreferrer"
            className="btn secondary"
            style={{ fontSize: '0.8rem' }}
          >
            Stripe Portal ↗
          </a>
        </div>

        <div className="table-wrap" style={{ overflowX: 'auto' }}>
          <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'rgba(var(--tint), 0.03)', borderBottom: '1px solid var(--line)', fontSize: '0.8rem', color: 'var(--muted)' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Arrival Date</th>
                <th style={{ padding: '0.75rem 1rem' }}>Destination Account</th>
                <th style={{ padding: '0.75rem 1rem' }}>Method</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Transfer Amount</th>
                <th style={{ padding: '0.75rem 1rem' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {payouts.recentPayouts.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--muted)' }}>
                    <p style={{ margin: 0, fontWeight: 500 }}>No recent bank payouts.</p>
                    <small>Payouts will appear here as soon as your customer payments settle and transfer to your bank.</small>
                  </td>
                </tr>
              ) : (
                payouts.recentPayouts.map((p) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--line)', fontSize: '0.88rem' }}>
                    <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 500, color: 'var(--text)' }}>{formatDate(p.arrivalDate)}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Initiated {formatDate(p.created)}</div>
                    </td>

                    <td style={{ padding: '0.75rem 1rem', color: 'var(--text)' }}>
                      <strong>{p.destination || 'Bank Account'}</strong>
                    </td>

                    <td style={{ padding: '0.75rem 1rem', textTransform: 'capitalize', color: 'var(--text)' }}>
                      {p.method}
                    </td>

                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>
                      {formatUsd(p.amount)}
                    </td>

                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '0.2rem 0.55rem',
                          borderRadius: '999px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          textTransform: 'capitalize',
                          background:
                            p.status === 'paid'
                              ? 'rgba(16, 185, 129, 0.12)'
                              : p.status === 'in_transit' || p.status === 'pending'
                              ? 'rgba(59, 130, 246, 0.12)'
                              : 'rgba(239, 68, 68, 0.12)',
                          color:
                            p.status === 'paid'
                              ? 'var(--good, #047857)'
                              : p.status === 'in_transit' || p.status === 'pending'
                              ? 'var(--info, #2563eb)'
                              : 'var(--bad, #dc2626)',
                        }}
                      >
                        {p.status === 'paid' ? 'Arrived / Paid' : p.status === 'in_transit' ? 'In Transit' : p.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
