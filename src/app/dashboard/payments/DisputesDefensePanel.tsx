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
            <strong style={{ fontSize: '0.95rem', color: disputedPayments.length > 0 ? '#dc2626' : '#059669' }}>
              {disputedPayments.length > 0
                ? `${disputedPayments.length} Active Dispute Action Required (${formatUsd(totalDisputed)})`
                : '100% Clean Chargeback Record — Zero Open Disputes'}
            </strong>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
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
            background: 'var(--panel-subtle, rgba(0,0,0,0.02))',
            borderRadius: '8px',
            border: '1px solid var(--border-subtle, #e2e8f0)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <div style={{ fontSize: '2.5rem' }}>🏆</div>
          <strong style={{ fontSize: '1.1rem', color: 'var(--text-color, #0f172a)' }}>Dispute Defense Studio Standing By</strong>
          <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-muted)', maxWidth: '460px' }}>
            When a credit card issuer opens a dispute, our automated counter-evidence compiler will instantly assemble contract signatures, photo evidence, and timestamped SMS records to submit directly to Stripe.
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
                  background: '#fff',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
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
                      <strong style={{ fontSize: '0.95rem' }}>{p.clientName}</strong>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>({p.jobRef})</span>
                    </div>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                      Dispute initiated on {p.disputedAt ? new Date(p.disputedAt).toLocaleDateString() : 'recently'}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <strong style={{ fontSize: '1.15rem', color: '#dc2626' }}>{formatUsd(p.amount)}</strong>
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
