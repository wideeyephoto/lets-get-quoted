'use client';

import { useState, useTransition } from 'react';
import { sendSelectionsAction } from './selection-actions';

/**
 * "Send these to them."
 *
 * Its own component because the outcome needs saying out loud: the two ways
 * this fails — nothing to choose between yet, and nowhere to send it — are both
 * fixable, and a button that silently does nothing teaches a contractor the
 * feature is broken.
 */
export default function SendSelectionsButton({ jobId, lastSentAt }: { jobId: string; lastSentAt: string | null }) {
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="selection-send">
      <button
        type="button"
        className="btn secondary"
        disabled={pending}
        onClick={() => {
          setResult(null);
          startTransition(async () => {
            try {
              setResult(await sendSelectionsAction(jobId));
            } catch {
              setResult({ ok: false, message: 'Could not send that just now. Please try again.' });
            }
          });
        }}
      >
        {pending ? 'Sending…' : lastSentAt ? 'Send these again' : 'Send these to the customer'}
      </button>
      {result ? (
        <span className={`selection-send-note${result.ok ? ' is-ok' : ' is-bad'}`} aria-live="polite">
          {result.message}
        </span>
      ) : lastSentAt ? (
        <span className="selection-send-note">Last sent {lastSentAt.slice(0, 10)}</span>
      ) : (
        <span className="selection-send-note">
          Nothing has been sent yet — they won&apos;t know these are waiting.
        </span>
      )}
    </div>
  );
}
