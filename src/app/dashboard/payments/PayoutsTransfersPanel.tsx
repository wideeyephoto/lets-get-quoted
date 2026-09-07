'use client';

import { useState } from 'react';
import type { PayoutsAccountOverview } from '@/lib/payouts-data';
import Link from 'next/link';

interface Props {
  payouts: PayoutsAccountOverview;
  isOwner?: boolean;
  stripeError?: string;
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

export default function PayoutsTransfersPanel({ payouts, isOwner = false, stripeError }: Props) {
  const [dismissedError, setDismissedError] = useState(false);

  const stripeLoginAlert = stripeError === 'stripe_login_failed' && !dismissedError ? (
    <div
      role="alert"
      style={{
        padding: '0.85rem 1rem',
        background: 'rgba(239, 68, 68, 0.08)',
        border: '1px solid rgba(239, 68, 68, 0.28)',
        borderRadius: '8px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '1rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
        <span style={{ fontSize: '1.25rem' }}>⚠️</span>
        <div>
          <strong style={{ color: 'var(--bad)', fontSize: '0.88rem' }}>
            Unable to Open Stripe Express Portal
          </strong>
          <p style={{ margin: '0.15rem 0 0', fontSize: '0.82rem', color: 'var(--muted)' }}>
            The Stripe authentication session could not be established. Ensure your business profile is verified or try again shortly.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setDismissedError(true)}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--muted)',
          fontSize: '1.25rem',
          lineHeight: 1,
          cursor: 'pointer',
          padding: '0.25rem 0.5rem',
        }}
        aria-label="Dismiss alert"
      >
        ×
      </button>
    </div>
  ) : null;

  if (!payouts.connected) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {stripeLoginAlert}
        <div style={{ padding: '2.5rem 1.5rem', textAlign: 'center', background: 'var(--bg-2)', borderRadius: '8px', border: '1px solid var(--line)' }}>
          <div style={{ fontSize: '2.2rem', marginBottom: '0.75rem' }}>🏦</div>
          <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.2rem', color: 'var(--text)' }}>Connect Stripe to Enable Automatic Bank Payouts</h3>
          <p style={{ maxWidth: '480px', margin: '0 auto 1.25rem', color: 'var(--muted)', fontSize: '0.9rem' }}>
            Connect your bank account through Stripe Connect so homeowner payments, deposits, and invoice balances land safely in your checking account.
          </p>
          {isOwner ? (
            <Link href="/dashboard/settings#payments" className="btn primary">
              Set Up Payout Account →
            </Link>
          ) : (
            <p style={{ fontSize: '0.85rem', color: 'var(--muted)', fontStyle: 'italic' }}>
              🔒 Workspace owner authorization required to connect a Stripe payout account.
            </p>
          )}
        </div>
      </div>
    );
  }

  // Calculate Instant Payout fee with Stripe's US minimum ($0.50)
  const instantAvailable = payouts.instantAvailableDollars || 0;
  const instantFeeDollars = instantAvailable > 0 ? Math.max(0.5, instantAvailable * 0.015) : 0;
  const instantNetDollars = Math.max(0, instantAvailable - instantFeeDollars);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Stripe Login Error Alert Banner */}
      {stripeLoginAlert}

      {/* Stripe Outage / Balance Sync Warning Banner */}
      {!payouts.available && (
        <div
          role="status"
          style={{
            padding: '0.85rem 1rem',
            background: 'rgba(245, 181, 68, 0.08)',
            border: '1px solid rgba(245, 181, 68, 0.28)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '0.65rem',
          }}
        >
          <span style={{ fontSize: '1.25rem' }}>⏳</span>
          <div>
            <strong style={{ color: 'var(--warn)', fontSize: '0.88rem' }}>
              Stripe Balance Sync Temporarily Unavailable
            </strong>
            <p style={{ margin: '0.15rem 0 0', fontSize: '0.82rem', color: 'var(--muted)' }}>
              Live balance reporting from Stripe is experiencing temporary delays. Scheduled bank disbursements continue normally.
            </p>
          </div>
        </div>
      )}

      {/* Payout Pause Alert Banner if applicable */}
      {payouts.payoutsPaused && (
        <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <strong style={{ color: 'var(--bad)' }}>⚠️ Payouts Temporarily Paused by Stripe</strong>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: 'var(--muted)' }}>
              Stripe requires updated business identity or tax verification before releasing bank transfers.
            </p>
          </div>
          {isOwner ? (
            <a href="/api/stripe/express-dashboard" target="_blank" rel="noopener noreferrer" className="btn danger" style={{ fontSize: '0.82rem', padding: '0.35rem 0.75rem', minHeight: '34px', display: 'inline-flex', alignItems: 'center' }}>
              Verify on Stripe →
            </a>
          ) : (
            <span style={{ fontSize: '0.82rem', color: 'var(--muted)', fontStyle: 'italic' }}>
              🔒 Workspace owner verification required
            </span>
          )}
        </div>
      )}

      {/* Stripe Balance Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem' }}>
        <div style={{ padding: '1.2rem', background: 'var(--bg-2)', borderRadius: '8px', border: '1px solid var(--line)' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Available Stripe Balance
          </span>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: payouts.available ? 'var(--good)' : 'var(--muted)', marginTop: '0.3rem' }}>
            {payouts.available ? formatUsd(payouts.availableBalanceDollars) : '—'}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
            {payouts.available ? 'Ready for next automatic bank transfer' : 'Syncing live balance from Stripe'}
          </div>
        </div>

        <div style={{ padding: '1.2rem', background: 'var(--bg-2)', borderRadius: '8px', border: '1px solid var(--line)' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            In-Transit / Settling
          </span>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: '0.3rem', color: 'var(--text)' }}>
            {payouts.available ? formatUsd(payouts.pendingBalanceDollars) : '—'}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
            Card &amp; ACH settlements in transit (1–2 business days)
          </div>
        </div>

        <div style={{ padding: '1.2rem', background: 'var(--bg-2)', borderRadius: '8px', border: '1px solid var(--line)' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Payout Schedule
          </span>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, marginTop: '0.45rem', color: payouts.payoutSchedule === 'Unavailable' ? 'var(--muted)' : 'var(--text)' }}>
            {payouts.payoutSchedule === 'Unavailable' ? 'Unavailable' : payouts.payoutSchedule || 'Unavailable'}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.35rem' }}>
            {payouts.payoutSchedule === 'Unavailable'
              ? 'Schedule not reported by Stripe'
              : payouts.payoutSchedule === 'Manual'
              ? 'Transfers initiated on demand in Stripe'
              : 'Transfers directly to bank account'}
          </div>
        </div>
      </div>

      {/* Instant Payout & Tax 1099-K Hub */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '0.85rem' }}>
        {/* Instant Payout Liquidity Card */}
        <div style={{ padding: '1rem 1.25rem', background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.07) 0%, rgba(16, 185, 129, 0.07) 100%), var(--bg-2)', borderRadius: '8px', border: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text)' }}>
              <span>⚡</span> Instant Payout (Emergency Liquidity)
            </strong>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                background: payouts.instantPayoutEligible ? 'rgba(var(--tint), 0.08)' : 'rgba(var(--tint), 0.04)',
                color: payouts.instantPayoutEligible ? 'var(--good)' : 'var(--muted)',
                padding: '0.15rem 0.5rem',
                borderRadius: '999px',
                border: '1px solid var(--line)',
              }}
            >
              {payouts.instantPayoutEligible ? '⚡ 30-Min Transfer Available' : 'Standard Daily ACH Active'}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--muted)' }}>
            {payouts.instantPayoutEligible
              ? 'Need funds before daily ACH settlement? Eligible funds can be transferred within 30 minutes to a linked business debit card inside your Stripe Express portal.'
              : 'Standard automatic daily ACH transfers (1–2 business days) are active. Instant 30-minute transfers require an available instant balance and an eligible debit card on file in Stripe Express.'}
          </p>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem', padding: '0.5rem 0.75rem', background: 'var(--bg-3)', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '0.84rem' }}>
            <div>
              <span style={{ color: 'var(--muted)', display: 'block', fontSize: '0.72rem' }}>
                {payouts.instantPayoutEligible ? 'Instant Transfer Available' : 'Available Balance'}
              </span>
              <strong style={{ color: 'var(--text)' }}>
                {payouts.available ? formatUsd(payouts.instantPayoutEligible ? instantAvailable : payouts.availableBalanceDollars) : '—'}
              </strong>
            </div>
            {payouts.instantPayoutEligible ? (
              <div style={{ textAlign: 'right' }}>
                <span style={{ color: 'var(--muted)', display: 'block', fontSize: '0.72rem' }}>Est. Net After Fee (1.5%, min $0.50)</span>
                <strong style={{ color: 'var(--good)' }}>
                  {formatUsd(instantNetDollars)}
                </strong>
              </div>
            ) : (
              <div style={{ textAlign: 'right' }}>
                <span style={{ color: 'var(--muted)', display: 'block', fontSize: '0.72rem' }}>Transfer Schedule</span>
                <strong style={{ color: payouts.payoutSchedule === 'Unavailable' ? 'var(--muted)' : 'var(--text)' }}>
                  {payouts.payoutSchedule === 'Unavailable' ? 'Unavailable' : payouts.payoutSchedule || 'Unavailable'}
                </strong>
              </div>
            )}
          </div>
          <div style={{ marginTop: '0.35rem' }}>
            {isOwner ? (
              <a
                href="/api/stripe/express-dashboard"
                target="_blank"
                rel="noopener noreferrer"
                className={payouts.instantPayoutEligible ? 'btn primary' : 'btn secondary'}
                style={{ fontSize: '0.82rem', padding: '0.35rem 0.75rem', minHeight: '36px', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
              >
                {payouts.instantPayoutEligible ? '⚡ Transfer via Stripe Express ↗' : 'Manage Payout Methods in Stripe ↗'}
              </a>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  disabled
                  className="btn secondary"
                  style={{ opacity: 0.65, cursor: 'not-allowed', fontSize: '0.82rem', padding: '0.35rem 0.75rem', minHeight: '36px' }}
                  title="Workspace owner authorization required to transfer funds or edit payout settings"
                >
                  🔒 Owner Authorization Required
                </button>
                <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                  Workspace owner required to initiate transfers or manage cards.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 1099-K Annual Tax Compliance Info */}
        <div style={{ padding: '1rem 1.25rem', background: 'var(--bg-2)', borderRadius: '8px', border: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text)' }}>
              <span>📋</span> IRS Form 1099-K Information
            </strong>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, background: 'rgba(var(--tint), 0.06)', color: 'var(--info)', padding: '0.15rem 0.5rem', borderRadius: '999px', border: '1px solid var(--line)' }}>
              Tax Reporting Overview
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--muted)' }}>
            Under IRS rules, payment card transactions have no minimum reporting threshold, while third-party network (TPSO) transactions are subject to federal thresholds ($20,000 and 200 transactions) or applicable state limits. Stripe Connect automatically generates and delivers official year-end tax forms directly to qualifying accounts via Stripe Express.
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
          {isOwner ? (
            <a
              href="/api/stripe/express-dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="btn secondary"
              style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem', minHeight: '34px', display: 'inline-flex', alignItems: 'center' }}
            >
              Stripe Portal ↗
            </a>
          ) : (
            <span
              style={{
                fontSize: '0.78rem',
                color: 'var(--muted)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                padding: '0.35rem 0.5rem',
                borderRadius: '4px',
                background: 'var(--bg-3)',
                border: '1px solid var(--line)',
              }}
              title="Stripe Express portal access requires workspace owner role"
            >
              🔒 Owner Portal
            </span>
          )}
        </div>

        {/* Payout History Outage Warning Banner */}
        {!payouts.recentPayoutsAvailable && (
          <div
            role="status"
            style={{
              padding: '0.85rem 1rem',
              background: 'rgba(245, 181, 68, 0.08)',
              border: '1px solid rgba(245, 181, 68, 0.28)',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem',
              marginBottom: '0.75rem',
            }}
          >
            <span style={{ fontSize: '1.25rem' }}>⏳</span>
            <div>
              <strong style={{ color: 'var(--warn)', fontSize: '0.88rem' }}>
                Payout History Temporarily Unavailable
              </strong>
              <p style={{ margin: '0.15rem 0 0', fontSize: '0.82rem', color: 'var(--muted)' }}>
                Recent bank disbursement records could not be retrieved from Stripe. Check back shortly or view transfers in the Stripe portal.
              </p>
            </div>
          </div>
        )}

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
                    <p style={{ margin: 0, fontWeight: 500 }}>
                      {!payouts.recentPayoutsAvailable
                        ? 'Unable to load recent bank payouts.'
                        : 'No recent bank payouts.'}
                    </p>
                    <small>
                      {!payouts.recentPayoutsAvailable
                        ? 'Live disbursement history is experiencing temporary sync delays from Stripe.'
                        : 'Payouts will appear here as soon as your customer payments settle and transfer to your bank.'}
                    </small>
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
                              ? 'var(--good)'
                              : p.status === 'in_transit' || p.status === 'pending'
                              ? 'var(--info)'
                              : 'var(--bad)',
                          border: '1px solid var(--line)',
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
