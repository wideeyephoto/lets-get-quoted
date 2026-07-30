'use client';

import { useEffect, useState } from 'react';

// The on/off switch on an automation row. It lives inside the card's <summary>,
// so the click must be stopped from also expanding the card — flipping a switch
// and having the whole panel unfold underneath you is jarring.
//
// Optimistic: the switch moves the moment you tap it, then reconciles with the
// server value once the page revalidates. If the save fails it snaps back and
// says so rather than sitting there looking on when it isn't.
export default function AutomationSwitch({
  label,
  on,
  action,
}: {
  label: string;
  on: boolean;
  action: (next: boolean) => Promise<void>;
}) {
  const [optimistic, setOptimistic] = useState(on);
  const [failed, setFailed] = useState(false);
  // Explicit rather than useTransition: on React 18 an async transition callback
  // drops its pending flag at the first await, so the switch would un-disable
  // itself mid-save.
  const [saving, setSaving] = useState(false);

  // The server is the source of truth: once revalidation lands a new `on`, take it.
  useEffect(() => {
    setOptimistic(on);
  }, [on]);

  const checked = optimistic;

  return (
    <span className="automation-switch-wrap">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={`${label} — currently ${checked ? 'on' : 'off'}`}
        className={`automation-switch ${checked ? 'on' : 'off'}`}
        disabled={saving}
        onClick={async (event) => {
          // Keep the click off the <summary> so the card doesn't expand.
          event.preventDefault();
          event.stopPropagation();
          const next = !checked;
          setOptimistic(next);
          setFailed(false);
          setSaving(true);
          try {
            await action(next);
          } catch {
            setOptimistic(!next);
            setFailed(true);
          } finally {
            setSaving(false);
          }
        }}
      >
        <span className="automation-switch-track">
          <span className="automation-switch-knob" />
        </span>
        <span className="automation-switch-text">{checked ? 'On' : 'Off'}</span>
      </button>
      {failed ? <span className="automation-switch-error">Didn&apos;t save</span> : null}
    </span>
  );
}
