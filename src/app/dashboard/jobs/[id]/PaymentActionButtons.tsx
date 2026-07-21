'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PaymentStatus } from '@/lib/payments';

interface PaymentActionButtonsProps {
  jobId: string;
  paymentId: string;
  status: PaymentStatus;
  onRefund: (jobId: string, paymentId: string) => Promise<void>;
  onMarkFailed: (jobId: string, paymentId: string) => Promise<void>;
  onRetry: (paymentId: string) => Promise<string>;
  onCancel: (jobId: string, paymentId: string) => Promise<void>;
  onMarkPaidManually?: (jobId: string, paymentId: string, method: string) => Promise<void>;
  // Refunds go through Stripe, so only offer Refund on rows that were paid via
  // Stripe (they carry a payment intent). Cash/check rows can't be refunded here.
  canRefund?: boolean;
}

const compactBtn = { fontSize: '0.75rem', padding: '0.25rem 0.5rem' } as const;

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
}: PaymentActionButtonsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState('cash');

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

  const handleRefund = async () => {
    if (!window.confirm('Are you sure you want to refund this payment?')) return;
    
    setLoading('refund');
    setError(null);
    try {
      await onRefund(jobId, paymentId);
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
      {status === 'paid' && canRefund && (
        <button
          onClick={handleRefund}
          disabled={loading !== null}
          className="btn secondary compact"
          title="Refund this payment"
          style={compactBtn}
        >
          {loading === 'refund' ? '⏳' : '↩️'} Refund
        </button>
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
