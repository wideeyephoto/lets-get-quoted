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
        <div style={{ padding: '1.2rem', background: 'var(--panel-bg, #fff)', borderRadius: '8px', border: '1px solid var(--border-subtle, #e2e8f0)' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Available Stripe Balance
          </span>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--primary, #10b981)', marginTop: '0.3rem' }}>
            {formatUsd(payouts.availableBalanceDollars)}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Ready for next automatic bank transfer
          </div>
        </div>

        <div style={{ padding: '1.2rem', background: 'var(--panel-bg, #fff)', borderRadius: '8px', border: '1px solid var(--border-subtle, #e2e8f0)' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            In-Transit / Settling
          </span>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: '0.3rem' }}>
            {formatUsd(payouts.pendingBalanceDollars)}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Card &amp; ACH settlements in transit (1–2 business days)
          </div>
        </div>

        <div style={{ padding: '1.2rem', background: 'var(--panel-bg, #fff)', borderRadius: '8px', border: '1px solid var(--border-subtle, #e2e8f0)' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Payout Schedule
          </span>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, marginTop: '0.45rem' }}>
            Daily Automatic
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
            Transfers directly to bank account
          </div>
        </div>
      </div>

      {/* Payouts Table */}
      <div style={{ background: 'var(--panel-bg, #ffffff)', borderRadius: '8px', border: '1px solid var(--border-subtle, #e2e8f0)', overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-subtle, #e2e8f0)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Recent Bank Transfers &amp; Payouts</h3>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
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
              <tr style={{ background: 'var(--panel-subtle, rgba(0,0,0,0.02))', borderBottom: '1px solid var(--border-subtle, #e2e8f0)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
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
                  <td colSpan={5} style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <p style={{ margin: 0, fontWeight: 500 }}>No recent bank payouts.</p>
                    <small>Payouts will appear here as soon as your customer payments settle and transfer to your bank.</small>
                  </td>
                </tr>
              ) : (
                payouts.recentPayouts.map((p) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--border-subtle, #e2e8f0)', fontSize: '0.88rem' }}>
                    <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 500 }}>{formatDate(p.arrivalDate)}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Initiated {formatDate(p.created)}</div>
                    </td>

                    <td style={{ padding: '0.75rem 1rem' }}>
                      <strong>{p.destination || 'Bank Account'}</strong>
                    </td>

                    <td style={{ padding: '0.75rem 1rem', textTransform: 'capitalize' }}>
                      {p.method}
                    </td>

                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700, fontSize: '0.95rem' }}>
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
                              ? '#059669'
                              : p.status === 'in_transit' || p.status === 'pending'
                              ? '#2563eb'
                              : '#dc2626',
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
