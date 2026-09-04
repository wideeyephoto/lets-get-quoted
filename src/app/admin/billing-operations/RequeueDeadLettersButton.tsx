'use client';

import { useState, useTransition } from 'react';
import { requeueBillingDeadLettersAction } from './actions';

export function RequeueDeadLettersButton({
  ledgerId,
  ledgerLabel,
  deadLetterCount,
}: {
  ledgerId: string;
  ledgerLabel: string;
  deadLetterCount: number;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  if (deadLetterCount <= 0) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 4) {
      setFeedback({ type: 'err', text: 'Reason must be at least 4 characters.' });
      return;
    }

    setFeedback(null);
    startTransition(async () => {
      const res = await requeueBillingDeadLettersAction(ledgerId, reason.trim());
      if (res.success) {
        setFeedback({ type: 'ok', text: res.message });
        setReason('');
        setTimeout(() => {
          setIsOpen(false);
          setFeedback(null);
        }, 3000);
      } else {
        setFeedback({ type: 'err', text: res.message });
      }
    });
  };

  return (
    <div style={{ marginTop: '0.4rem' }}>
      {!isOpen ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="btn secondary"
          style={{
            fontSize: '0.72rem',
            padding: '2px 8px',
            color: '#f87171',
            borderColor: 'rgba(239, 68, 68, 0.4)',
          }}
          title={`Requeue ${deadLetterCount} dead letter(s) in ${ledgerLabel} (MFA required)`}
        >
          Requeue {deadLetterCount} dead letter{deadLetterCount === 1 ? '' : 's'} ↺
        </button>
      ) : (
        <form
          onSubmit={handleSubmit}
          style={{
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: '6px',
            padding: '0.5rem',
            maxWidth: '300px',
            marginTop: '0.3rem',
          }}
        >
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#fca5a5', marginBottom: '0.3rem' }}>
            MFA Gated: Requeue {deadLetterCount} item(s)
          </div>
          <input
            type="text"
            required
            minLength={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Operational reason..."
            disabled={isPending}
            style={{
              width: '100%',
              fontSize: '0.75rem',
              padding: '3px 6px',
              borderRadius: '4px',
              border: '1px solid #475569',
              background: '#0f172a',
              color: '#f8fafc',
              marginBottom: '0.4rem',
            }}
          />
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            <button
              type="submit"
              disabled={isPending || reason.trim().length < 4}
              className="btn primary"
              style={{
                fontSize: '0.72rem',
                padding: '2px 8px',
                background: '#dc2626',
                borderColor: '#ef4444',
                cursor: isPending ? 'wait' : 'pointer',
              }}
            >
              {isPending ? 'Requeueing…' : 'Confirm requeue'}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                setIsOpen(false);
                setFeedback(null);
              }}
              className="btn secondary"
              style={{ fontSize: '0.72rem', padding: '2px 8px' }}
            >
              Cancel
            </button>
          </div>
          {feedback ? (
            <div
              style={{
                fontSize: '0.7rem',
                marginTop: '0.3rem',
                color: feedback.type === 'ok' ? '#86efac' : '#fca5a5',
              }}
            >
              {feedback.text}
            </div>
          ) : null}
        </form>
      )}
    </div>
  );
}
