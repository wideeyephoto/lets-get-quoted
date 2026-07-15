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
}

export default function PaymentActionButtons({
  jobId,
  paymentId,
  status,
  onRefund,
  onMarkFailed,
  onRetry,
}: PaymentActionButtonsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const showActions = status === 'paid' || status === 'processing' || status === 'failed';

  if (!showActions) return null;

  return (
    <div style={{ display: 'flex', gap: '0.25rem' }}>
      {status === 'paid' && (
        <button
          onClick={handleRefund}
          disabled={loading !== null}
          className="btn secondary compact"
          title="Refund this payment"
          style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
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
