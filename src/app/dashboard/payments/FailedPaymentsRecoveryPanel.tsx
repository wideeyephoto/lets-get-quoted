'use client';

import { useState } from 'react';
import type { PaymentLedgerItem } from '@/lib/payments-ledger-data';
import { sendPaymentReminderAction } from './actions';
import { getClientInitials, getAvatarColor } from '@/lib/avatar-utils';

interface Props {
  failedPayments: PaymentLedgerItem[];
  onOpenManualPayment: (jobId: string, invoiceId?: string, amount?: number) => void;
  onSuccess: (message: string) => void;
}

function formatUsd(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function FailedPaymentsRecoveryPanel({
  failedPayments,
  onOpenManualPayment,
  onSuccess,
}: Props) {
  const [retryingId, setRetryingId] = useState<string | null>(null);

  async function handleSendCardUpdate(paymentId: string) {
    setRetryingId(paymentId);
    const formData = new FormData();
    formData.set('paymentId', paymentId);
    formData.set('channel', 'sms');

    const res = await sendPaymentReminderAction(formData);
    setRetryingId(null);
    if (res.success) {
      onSuccess('SMS sent with link for customer to update card.');
    } else {
      alert(res.error || 'Failed to send card update link.');
    }
  }

  const totalAtRisk = failedPayments.reduce((sum, p) => sum + p.amount, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header Banner */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
          padding: '1rem 1.25rem',
          background: failedPayments.length > 0 ? 'rgba(239, 68, 68, 0.08)' : 'rgba(16, 185, 129, 0.08)',
          border: `1px solid ${failedPayments.length > 0 ? 'rgba(239, 68, 68, 0.25)' : 'rgba(16, 185, 129, 0.25)'}`,
          borderRadius: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '1.4rem' }}>{failedPayments.length > 0 ? '🔄' : '🎉'}</span>
          <div>
            <strong style={{ fontSize: '0.95rem', color: failedPayments.length > 0 ? '#dc2626' : '#059669' }}>
              {failedPayments.length > 0
                ? `${failedPayments.length} Failed Charges Awaiting Recovery (${formatUsd(totalAtRisk)})`
                : '100% Payment Health — Zero Failed Transactions'}
            </strong>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              {failedPayments.length > 0
                ? 'Smart dunning automations retry cards and text customers a secure portal to update payment methods.'
                : 'All scheduled subscription milestones and charges have cleared successfully.'}
            </p>
          </div>
        </div>
      </div>

      {/* Zero State Celebration Card or List */}
      {failedPayments.length === 0 ? (
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
          <div style={{ fontSize: '2.5rem' }}>🛡️</div>
          <strong style={{ fontSize: '1.1rem', color: 'var(--text-color, #0f172a)' }}>No Failed Payments to Recover</strong>
          <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-muted)', maxWidth: '440px' }}>
            When a customer&apos;s card is declined or expires, it will automatically appear here with automated 1-click recovery tools.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {failedPayments.map((p) => {
            const avatar = getAvatarColor(p.clientName);
            const initials = getClientInitials(p.clientName);

            return (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.85rem 1rem',
                  background: '#fff',
                  border: '1px solid var(--border-subtle, #e2e8f0)',
                  borderRadius: '8px',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '999px',
                      background: avatar.bg,
                      color: avatar.color,
                      fontSize: '0.78rem',
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <strong style={{ fontSize: '0.92rem' }}>{p.clientName}</strong>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({p.jobRef})</span>
                    </div>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{p.label} · {p.paymentMethod}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <strong style={{ fontSize: '1.05rem', color: '#dc2626' }}>{formatUsd(p.amount)}</strong>
                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    <button
                      type="button"
                      className="btn primary"
                      style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                      disabled={retryingId === p.id}
                      onClick={() => handleSendCardUpdate(p.id)}
                    >
                      {retryingId === p.id ? 'Sending…' : '📲 Text Update Link'}
                    </button>
                    <button
                      type="button"
                      className="btn secondary"
                      style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                      onClick={() => onOpenManualPayment(p.jobId, p.invoiceRef ?? undefined, p.amount)}
                    >
                      💵 Record Offline
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
