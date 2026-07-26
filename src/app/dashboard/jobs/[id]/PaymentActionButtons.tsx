'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PaymentStatus } from '@/lib/payments';

interface PaymentActionButtonsProps {
  jobId: string;
  paymentId: string;
  status: PaymentStatus;
  onRefund: (jobId: string, paymentId: string, amount?: number) => Promise<void>;
  onMarkFailed: (jobId: string, paymentId: string) => Promise<void>;
  onRetry: (paymentId: string) => Promise<string>;
  onCancel: (jobId: string, paymentId: string) => Promise<void>;
  onMarkPaidManually?: (jobId: string, paymentId: string, method: string) => Promise<void>;
  // Refunds go through Stripe, so only offer Refund on rows that were paid via
  // Stripe (they carry a payment intent). Cash/check rows can't be refunded here.
  canRefund?: boolean;
  // The full payment amount and how much has already been refunded, so the refund
  // field can default to (and cap at) the remaining balance.
  amount?: number;
  refundedAmount?: number;
}

const compactBtn = { fontSize: '0.75rem', padding: '0.25rem 0.5rem' } as const;

function formatUsd(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PaymentActionButtons({
  jobId,
  paymentId,
  status,
  onRefund,
  onMarkFailed,
  onRetry,
  onCancel,
  onMarkPaidManually,
  canRefund = true,
  amount = 0,
  refundedAmount = 0,
}: PaymentActionButtonsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState('cash');
  // Remaining refundable balance, rounded to whole cents to avoid float noise.
  const remaining = Math.round((amount - refundedAmount) * 100) / 100;
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundInput, setRefundInput] = useState('');

  const handleMarkPaid = async () => {
    if (!onMarkPaidManually) return;
    if (!window.confirm(`Mark this payment as paid by ${method}? Use this only for money collected outside the app (cash or check).`)) return;

    setLoading('markPaid');
    setError(null);
    try {
      await onMarkPaidManually(jobId, paymentId, method);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark payment as paid');
    } finally {
      setLoading(null);
    }
  };

  const openRefund = () => {
    setError(null);
    setRefundInput(remaining > 0 ? remaining.toFixed(2) : '');
    setRefundOpen(true);
  };

  const handleRefund = async () => {
    const value = Number(refundInput);
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter a refund amount greater than zero.');
      return;
    }
    if (Math.round(value * 100) > Math.round(remaining * 100)) {
      setError(`You can refund at most ${formatUsd(remaining)}.`);
      return;
    }
    // A full-balance refund passes undefined so the server refunds the exact
    // remaining cents (avoids a rounding mismatch with Stripe).
    const isFull = Math.round(value * 100) >= Math.round(remaining * 100);

    setLoading('refund');
    setError(null);
    try {
      await onRefund(jobId, paymentId, isFull ? undefined : value);
      setRefundOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refund failed');
    } finally {
      setLoading(null);
    }
  };

  const handleMarkFailed = async () => {
    if (!window.confirm('Mark this payment as failed? It can be retried later.')) return;
    
    setLoading('markFailed');
    setError(null);
    try {
      await onMarkFailed(jobId, paymentId);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark payment as failed');
    } finally {
      setLoading(null);
    }
  };

  const handleRetry = async () => {
    setLoading('retry');
    setError(null);
    try {
      const url = await onRetry(paymentId);
      window.open(url, '_blank');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retry payment');
    } finally {
      setLoading(null);
    }
  };

  const handleCancel = async () => {
    if (!window.confirm('Cancel this payment request? The payment link will stop working.')) return;

    setLoading('cancel');
    setError(null);
    try {
      await onCancel(jobId, paymentId);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel payment request');
    } finally {
      setLoading(null);
    }
  };

  const showActions = status === 'paid' || status === 'processing' || status === 'failed' || status === 'requested';

  if (!showActions) return null;

  return (
    <div style={{ display: 'flex', gap: '0.25rem' }}>
      {status === 'requested' && (
        <>
          {onMarkPaidManually && (
            <>
              <select
                value={method}
                onChange={(event) => setMethod(event.currentTarget.value)}
                disabled={loading !== null}
                className="btn secondary compact"
                title="Payment method"
                aria-label="Payment method for a payment collected outside the app"
                style={compactBtn}
              >
                <option value="cash">Cash</option>
                <option value="check">Check</option>
                <option value="other">Other</option>
              </select>
              <button
                onClick={handleMarkPaid}
                disabled={loading !== null}
                className="btn secondary compact"
                title="Record a cash or check payment collected outside the app"
                style={compactBtn}
              >
                {loading === 'markPaid' ? '⏳' : '✓'} Mark paid
              </button>
            </>
          )}
          <button
            onClick={handleCancel}
            disabled={loading !== null}
            className="btn secondary compact"
            title="Cancel this payment request"
            style={compactBtn}
          >
            {loading === 'cancel' ? '⏳' : '×'} Cancel
          </button>
        </>
      )}
      {status === 'paid' && canRefund && remaining > 0 && (
        refundOpen ? (
          <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--muted, #64748b)' }}>Refund $</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              max={remaining}
              value={refundInput}
              onChange={(event) => setRefundInput(event.currentTarget.value)}
              disabled={loading !== null}
              aria-label={`Refund amount, up to ${formatUsd(remaining)}`}
              autoFocus
              style={{ width: '5rem', ...compactBtn }}
            />
            <button
              onClick={handleRefund}
              disabled={loading !== null}
              className="btn secondary compact"
              title={`Refund up to ${formatUsd(remaining)}`}
              style={compactBtn}
            >
              {loading === 'refund' ? '⏳' : '↩️'} Refund
            </button>
            <button
              onClick={() => { setRefundOpen(false); setError(null); }}
              disabled={loading !== null}
              className="btn secondary compact"
              title="Cancel refund"
              style={compactBtn}
            >
              ×
            </button>
          </div>
        ) : (
          <button
            onClick={openRefund}
            disabled={loading !== null}
            className="btn secondary compact"
            title={refundedAmount > 0 ? `Refund more (${formatUsd(remaining)} left)` : 'Refund this payment'}
            style={compactBtn}
          >
            ↩️ Refund{refundedAmount > 0 ? ` (${formatUsd(remaining)} left)` : ''}
          </button>
        )
      )}
      {(status === 'processing' || status === 'failed') && (
        <>
          <button
            onClick={handleRetry}
            disabled={loading !== null}
            className="btn secondary compact"
            title="Retry this payment"
            style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
          >
            {loading === 'retry' ? '⏳' : '🔄'} Retry
          </button>
          <button
            onClick={handleMarkFailed}
            disabled={loading !== null}
            className="btn secondary compact"
            title="Mark as failed"
            style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
          >
            {loading === 'markFailed' ? '⏳' : '❌'} Fail
          </button>
        </>
      )}
      {error && <span style={{ fontSize: '0.75rem', color: 'red', marginLeft: '0.5rem' }}>Error: {error}</span>}
    </div>
  );
}
