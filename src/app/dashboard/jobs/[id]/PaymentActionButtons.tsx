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
  // Retry/fail/cancel belong to the active destination-charge lifecycle. A
  // prepared direct row remains owned by the direct runtime even while that
  // runtime is dark, so none of those controls may fall back here.
  canUseLegacyRail?: boolean;
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
  canUseLegacyRail = true,
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

    /**
     * The only irreversible action on this row, and the only one that did not
     * ask.
     *
     * Mark paid, mark failed and cancel all confirm, and all three are
     * administrative -- they move a status somebody can move back. Refund sends
     * real money out of the contractor's balance and Stripe will not return it.
     *
     * It was also the easiest to fire by accident: openRefund pre-fills the FULL
     * remaining balance, so the default action behind one click was a complete
     * refund of the payment. The prefill is worth keeping -- a full refund is
     * genuinely the common case -- which is exactly why the amount has to be
     * said out loud before it goes.
     */
    const confirmed = window.confirm(
      isFull
        ? `Refund the full remaining ${formatUsd(remaining)} to your customer? This cannot be undone.`
        : `Refund ${formatUsd(value)} of ${formatUsd(remaining)} to your customer? This cannot be undone.`,
    );
    if (!confirmed) return;

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

    /**
     * Opened BEFORE the await, and navigated afterwards.
     *
     * `window.open` is only reliably allowed inside the task a user gesture
     * started. This ran it after `await onRetry(...)`, by which point the gesture
     * is long over and every mainstream browser's popup blocker is entitled to
     * refuse -- which it does silently, returning null. The old code ignored the
     * return value, so a blocked retry looked exactly like a working one: the
     * spinner stopped, no tab appeared, no error was shown, and the contractor
     * had no way to tell whether the link had been created.
     *
     * Opening a blank tab first keeps it inside the gesture. If the blocker
     * still refuses, `popup` is null and we say so rather than pretending.
     */
    const popup = window.open('', '_blank');
    /**
     * `noopener` is the usual way to sever this and cannot be used here: it makes
     * window.open return null, and the whole point is to hold the reference and
     * navigate it after the await.
     *
     * So the link is cut by hand instead. Without it the Stripe checkout tab
     * keeps a `window.opener` handle on the dashboard and could navigate it --
     * reverse tabnabbing. Stripe is not the threat; the habit is, and
     * src/lib/templates/SocialLinks.tsx already carries the same note about the
     * same vector.
     */
    if (popup) popup.opener = null;

    try {
      const url = await onRetry(paymentId);
      if (popup) {
        popup.location.href = url;
      } else {
        // No tab to put it in. Navigating this one is better than losing the
        // link entirely -- the checkout is already created either way.
        window.location.href = url;
      }
    } catch (err) {
      // A tab opened for a link that never arrived has to be cleaned up, or the
      // contractor is left staring at a blank page wondering what it is.
      popup?.close();
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
      {status === 'requested' && canUseLegacyRail && (
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
      {canUseLegacyRail && (status === 'processing' || status === 'failed') && (
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
