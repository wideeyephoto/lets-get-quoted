'use client';

import { useState, useTransition } from 'react';
import { runCronJobNowAction } from './actions';

export function RunCronButton({
  job,
  jobLabel,
  isMoney = false,
  compact = false,
}: {
  job: string;
  jobLabel: string;
  isMoney?: boolean;
  compact?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const handleRun = () => {
    setFeedback(null);
    let confirmation: string | undefined;
    if (isMoney) {
      const typed = window.prompt(
        `CONFIRMATION REQUIRED: '${jobLabel}' is a money-moving worker that touches live balances or settlements.\n\nTo confirm manual execution, type '${job}' below:`,
      );
      if (!typed) {
        return;
      }
      confirmation = typed.trim();
    }

    startTransition(async () => {
      const res = await runCronJobNowAction(job, confirmation);
      if (res.success) {
        setFeedback({ type: 'ok', text: '✓ Triggered' });
        setTimeout(() => setFeedback(null), 4000);
      } else {
        setFeedback({ type: 'err', text: res.message });
      }
    });
  };

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
      <button
        type="button"
        className="btn secondary"
        disabled={isPending}
        onClick={handleRun}
        style={{
          fontSize: compact ? '0.72rem' : '0.78rem',
          padding: compact ? '2px 8px' : '4px 10px',
          whiteSpace: 'nowrap',
          opacity: isPending ? 0.6 : 1,
          cursor: isPending ? 'wait' : 'pointer',
        }}
        title={`Trigger manual run of ${jobLabel}`}
      >
        {isPending ? 'Running…' : 'Run now →'}
      </button>
      {feedback ? (
        <span
          style={{
            fontSize: '0.72rem',
            color: feedback.type === 'ok' ? '#86efac' : '#fca5a5',
            whiteSpace: 'nowrap',
          }}
        >
          {feedback.text}
        </span>
      ) : null}
    </div>
  );
}
