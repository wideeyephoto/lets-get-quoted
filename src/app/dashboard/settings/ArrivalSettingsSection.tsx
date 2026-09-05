'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import {
  ARRIVAL_WINDOW_CHOICES, arrivalWindowTimes, buildArrivalMessage, DEFAULT_ARRIVAL_TEMPLATE,
  formatArrivalWindow, TRACKING_LINK_HOURS, zonedInstant,
} from '@/lib/arrival';
import { updateArrivalWindowAction } from './actions';

/**
 * Arrival updates, reduced to the one decision a contractor actually has.
 *
 * This screen used to carry six controls: window vs exact time, window width as
 * a free number, the location-sharing policy, map precision, link duration, and
 * an editable message template with tokens. Five of them had no decision behind
 * them — one answer is right for essentially every contractor and the wrong
 * answer is quietly harmful, which is the definition of a setting that should
 * be a constant. They are fixed in code now and the columns are kept unread, so
 * any of them can come back as a real choice without a migration.
 *
 * What is left answers the three questions the screen exists for: is it on, how
 * wide is the window, and what will my customer receive.
 */

type Props = {
  businessName: string;
  timeZone: string;
  windowMinutes: number;
  enabled: boolean;
};

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function ArrivalSettingsSection({ businessName, timeZone, windowMinutes, enabled }: Props) {
  const [minutes, setMinutes] = useState(windowMinutes);
  const [save, setSave] = useState<SaveState>('idle');
  const [, startSaving] = useTransition();
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (savedTimer.current) clearTimeout(savedTimer.current);
  }, []);

  function choose(next: number) {
    if (next === minutes) return;
    const previous = minutes;
    setMinutes(next);
    setSave('saving');
    startSaving(async () => {
      try {
        await updateArrivalWindowAction(next);
        setSave('saved');
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSave('idle'), 2400);
      } catch {
        // Put the old value back. A failed save that leaves the new choice
        // highlighted tells the contractor their customers are being promised
        // something they are not.
        setMinutes(previous);
        setSave('error');
      }
    });
  }

  // A worked example on a fixed sample ETA, so the times are stable while the
  // width changes and the only thing moving is the thing being chosen. Uses zonedInstant
  // with an explicit UTC fallback so SSR and client hydration parse the exact same moment.
  const sampleDeparture = zonedInstant('2026-01-01', '08:45', timeZone) ?? new Date('2026-01-01T13:45:00Z');
  const times = arrivalWindowTimes(sampleDeparture, 0, { windowStyle: 'window', windowMinutes: minutes });
  const windowLabel = formatArrivalWindow(times, timeZone) ?? '';

  const preview = buildArrivalMessage({
    template: DEFAULT_ARRIVAL_TEMPLATE,
    business: businessName,
    crewName: 'Danny',
    customerName: 'Sarah',
    times,
    trackingUrl: 'letsgetquoted.com/track/abc123',
    timeZone,
  });

  return (
    <div className={`arrival-card${enabled ? '' : ' is-paused'}`}>
      <p className="arrival-state">
        {enabled ? 'Arrival updates are active.' : 'Arrival updates are paused — your crew’s tap sends nothing.'}
      </p>

      <div className="arrival-grid">
        <div className="arrival-settings">
          <p className="eyebrow">Arrival window</p>
          <p className="arrival-lede">The time window customers will see for your arrival.</p>

          <div className="arrival-choices" role="radiogroup" aria-label="Arrival window length">
            {ARRIVAL_WINDOW_CHOICES.map((choice) => (
              <button
                key={choice}
                type="button"
                role="radio"
                aria-checked={minutes === choice}
                className={`arrival-choice${minutes === choice ? ' is-on' : ''}`}
                disabled={!enabled}
                onClick={() => choose(choice)}
              >
                {choice} min
              </button>
            ))}
          </div>

          <div className="arrival-example">
            <span>Example window</span>
            <strong>You arrive between {windowLabel}</strong>
          </div>

          <p className="arrival-note">
            Customers see an approximate location, about a block away — close enough to answer &ldquo;are they
            nearby?&rdquo; without answering &ldquo;are they parked outside number 42?&rdquo;. Location sharing
            stops the moment your crew marks arrived.
          </p>
          <p className="arrival-note">
            The private tracking link stays active for {TRACKING_LINK_HOURS} hours, then shows nothing about the visit.
          </p>
        </div>

        <div className="arrival-preview">
          <p className="eyebrow">Preview</p>
          <p className="arrival-lede">A sample of what your customer receives.</p>

          <div className="arrival-phone">
            <div className="arrival-phone-head">
              <span className="arrival-phone-avatar" aria-hidden="true">
                {businessName.slice(0, 2).toUpperCase()}
              </span>
              <strong>{businessName}</strong>
            </div>
            <div className="arrival-phone-body">
              <p className="arrival-bubble">
                {/* Split on the window text so the promise is the thing the eye
                    lands on — it is the only part of the message that changes. */}
                {preview.split(windowLabel).map((chunk, index, all) => (
                  <span key={index}>
                    {chunk}
                    {index < all.length - 1 ? <strong className="arrival-window-time">{windowLabel}</strong> : null}
                  </span>
                ))}
              </p>
            </div>
            <p className="arrival-phone-foot">🔒 Link active for {TRACKING_LINK_HOURS} hours</p>
          </div>
        </div>
      </div>

      <div className="arrival-foot">
        <span className="arrival-privacy">Private link. Only this customer can view it.</span>
        <span className={`arrival-save arrival-save-${save}`} aria-live="polite">
          {save === 'saving' ? 'Saving…' : save === 'saved' ? '✓ Saved' : save === 'error' ? 'Couldn’t save — pick again to retry' : ''}
        </span>
      </div>
    </div>
  );
}
