'use client';

import type { PaymentLedgerItem } from '@/lib/payments-ledger-data';
import { getClientInitials, getAvatarColor } from '@/lib/avatar-utils';

interface Props {
  disputedPayments: PaymentLedgerItem[];
  onOpenEvidenceModal: (payment: PaymentLedgerItem) => void;
}

function formatUsd(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function DisputesDefensePanel({ disputedPayments, onOpenEvidenceModal }: Props) {
  const totalDisputed = disputedPayments.reduce((sum, p) => sum + p.amount, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header Info */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
          padding: '1rem 1.25rem',
          background: disputedPayments.length > 0 ? 'rgba(239, 68, 68, 0.08)' : 'rgba(16, 185, 129, 0.08)',
          border: `1px solid ${disputedPayments.length > 0 ? 'rgba(239, 68, 68, 0.25)' : 'rgba(16, 185, 129, 0.25)'}`,
          borderRadius: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '1.4rem' }}>{disputedPayments.length > 0 ? '🛡️' : '✨'}</span>
          <div>
            <strong style={{ fontSize: '0.95rem', color: disputedPayments.length > 0 ? 'var(--bad, #dc2626)' : 'var(--good, #047857)' }}>
              {disputedPayments.length > 0
                ? `${disputedPayments.length} Active Dispute Action Required (${formatUsd(totalDisputed)})`
                : '100% Clean Chargeback Record — Zero Open Disputes'}
            </strong>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: 'var(--muted)' }}>
              {disputedPayments.length > 0
                ? 'Generate comprehensive audit counter-evidence packages from signed agreements, photos, and client SMS.'
                : 'Your merchant account has 0 chargebacks. Defense tools stand ready if a dispute is ever initiated.'}
            </p>
          </div>
        </div>
      </div>

      {disputedPayments.length === 0 ? (
        <div
          style={{
            padding: '3rem 1.5rem',
            textAlign: 'center',
            background: 'rgba(var(--tint), 0.03)',
            borderRadius: '8px',
            border: '1px solid var(--line)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <div style={{ fontSize: '2.5rem' }}>🏆</div>
          <strong style={{ fontSize: '1.1rem', color: 'var(--text)' }}>Dispute Defense Studio Standing By</strong>
          <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--muted)', maxWidth: '460px' }}>
            When a credit card issuer opens a dispute, our automated counter-evidence compiler compiles signed agreements, photo logs, and timestamped SMS communications into an audit-ready dossier you can copy and submit directly in the Stripe Disputes portal.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {disputedPayments.map((p) => {
            const avatar = getAvatarColor(p.clientName);
            const initials = getClientInitials(p.clientName);

            return (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '1rem',
                  background: 'var(--bg-2)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  borderRadius: '8px',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                  boxShadow: '0 2px 8px rgba(239, 68, 68, 0.08)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '999px',
                      background: avatar.bg,
                      color: avatar.color,
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {initials}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <strong style={{ fontSize: '0.95rem', color: 'var(--text)' }}>{p.clientName}</strong>
                      <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>({p.jobRef})</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.2rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
                        Dispute opened: {p.disputedAt ? new Date(p.disputedAt).toLocaleDateString() : 'recently'}
                      </span>
                      {p.disputeDueBy && (
                        <span style={{ fontSize: '0.76rem', fontWeight: 600, color: '#dc2626', background: 'rgba(239, 68, 68, 0.1)', padding: '0.1rem 0.45rem', borderRadius: '4px' }}>
                          ⏳ Response deadline: {new Date(p.disputeDueBy).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <strong style={{ fontSize: '1.15rem', color: 'var(--bad, #dc2626)' }}>{formatUsd(p.amount)}</strong>
                  <button
                    type="button"
                    className="btn primary"
                    style={{ fontSize: '0.84rem', padding: '0.4rem 0.8rem' }}
                    onClick={() => onOpenEvidenceModal(p)}
                  >
                    🛡️ Assemble Evidence Package
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
