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
  // "Off" states what is true; it does not state what tapping would do. A row
  // whose off state is a dead end for the reader can override the words —
  // "Turn on" reads as the invitation it is. Defaults keep every other card
  // exactly as it was. The accessible name is unaffected: it already spells out
  // the automation and its current state in full.
  onLabel = 'On',
  offLabel = 'Off',
  enableBlocked = false,
  blockedReason,
}: {
  label: string;
  on: boolean;
  action: (next: boolean) => Promise<void>;
  onLabel?: string;
  offLabel?: string;
  /** Block only an off -> on transition; an already-on switch stays stoppable. */
  enableBlocked?: boolean;
  blockedReason?: string;
}) {
  const [optimistic, setOptimistic] = useState(on);
  const [failed, setFailed] = useState(false);
  // Explicit rather than useTransition: on React 18 an async transition callback
  // drops its pending flag at the first await, so the switch would un-disable
  // itself mid-save.
  const [saving, setSaving] = useState(false);
  const [showBlockedNotice, setShowBlockedNotice] = useState(false);

  // The server is the source of truth: once revalidation lands a new `on`, take it.
  useEffect(() => {
    setOptimistic(on);
  }, [on]);

  const checked = optimistic;
  const activationBlocked = !checked && enableBlocked;
  const accessibleState = activationBlocked
    ? `${label} — off. ${blockedReason ?? 'Setup is required before this can be turned on.'}`
    : `${label} — currently ${checked ? 'on' : 'off'}`;

  useEffect(() => {
    if (!activationBlocked) {
      setShowBlockedNotice(false);
    }
  }, [activationBlocked]);

  return (
    <span className="automation-switch-wrap">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={accessibleState}
        aria-disabled={activationBlocked ? true : undefined}
        title={activationBlocked ? blockedReason : undefined}
        className={`automation-switch ${checked ? 'on' : 'off'}${activationBlocked ? ' is-blocked' : ''}`}
        disabled={saving}
        onClick={async (event) => {
          // Keep the click off the <summary> so the card doesn't expand.
          event.preventDefault();
          event.stopPropagation();
          if (activationBlocked) {
            setShowBlockedNotice((prev) => !prev);
            return;
          }
          setShowBlockedNotice(false);
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
        <span className="automation-switch-text">{checked ? onLabel : offLabel}</span>
      </button>
      {failed ? <span className="automation-switch-error">Didn&apos;t save</span> : null}
      {showBlockedNotice ? (
        <span className="automation-switch-blocked" role="status">
          {blockedReason ?? 'Setup is required before this can be turned on.'}
        </span>
      ) : null}
    </span>
  );
}
