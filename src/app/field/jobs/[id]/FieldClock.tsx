'use client';

import { useEffect, useState } from 'react';
import SaveButton from '@/components/save-button';

// The crew member's clock, on the job page in the field app.
//
// Two states and nothing else: you're on the clock or you aren't. The running
// timer ticks client-side from the server-supplied start time — it isn't
// decoration, it's the thing that makes a forgotten clock-out obvious while
// you're still standing there, which is far cheaper than the owner finding it
// three days later.

function elapsedFrom(startedAt: string): string {
  const totalMinutes = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours === 0 ? `${minutes}m` : `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

export default function FieldClock({
  clockIn,
  clockOut,
  startedAt,
  startedLabel,
  elapsedLabel,
  busyElsewhere,
  required,
}: {
  jobId: string;
  clockIn: () => Promise<void>;
  clockOut: (formData: FormData) => Promise<void>;
  startedAt: string | null;
  startedLabel: string | null;
  elapsedLabel: string | null;
  /** They're clocked in on a different job — one shift at a time. */
  busyElsewhere: boolean;
  required: boolean;
}) {
  // Server-rendered first so the number is right before hydration, then ticked.
  const [elapsed, setElapsed] = useState(elapsedLabel ?? '');

  useEffect(() => {
    if (!startedAt) return;
    setElapsed(elapsedFrom(startedAt));
    // Every 30s: a minute-resolution readout doesn't need a per-second timer
    // burning battery in someone's pocket all afternoon.
    const timer = setInterval(() => setElapsed(elapsedFrom(startedAt)), 30_000);
    return () => clearInterval(timer);
  }, [startedAt]);

  if (startedAt) {
    return (
      <div className="field-clock is-running">
        <div className="field-clock-state">
          <span className="field-clock-dot" aria-hidden="true" />
          <div>
            <strong>On the clock</strong>
            <span>Since {startedLabel} · {elapsed}</span>
          </div>
        </div>
        <form action={clockOut} className="field-clock-form">
          <input name="description" type="text" placeholder="What you worked on (optional)" />
          <SaveButton className="btn primary" pendingLabel="Clocking out…" savedLabel="Clocked out ✓">
            Clock out
          </SaveButton>
        </form>
      </div>
    );
  }

  return (
    <div className="field-clock">
      <div className="field-clock-state">
        <div>
          <strong>Not clocked in</strong>
          <span>
            {busyElsewhere
              ? "You're on the clock on another job — clock out of that one first."
              : required
                ? 'Clock in when you start. Your hours are counted from the clock.'
                : 'Clock in when you start, or type your hours below.'}
          </span>
        </div>
      </div>
      {!busyElsewhere ? (
        <form action={clockIn}>
          <SaveButton className="btn primary" pendingLabel="Clocking in…" savedLabel="Clocked in ✓">
            Clock in
          </SaveButton>
        </form>
      ) : null}
    </div>
  );
}
