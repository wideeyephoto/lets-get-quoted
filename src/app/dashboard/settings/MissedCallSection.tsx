'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { missedCallStatus, missedCallTextBack } from '@/lib/missed-call';
import { updateMissedCallNumbersAction } from './actions';

/**
 * Missed-call text-back, reduced to the two numbers and the message.
 *
 * The card used to carry a second on/off checkbox beside the switch in its own
 * header, a Twilio webhook URL, and a Save button. One of those was a duplicate
 * control, one was addressed to a developer, and the third made a two-field
 * automation feel like a form.
 *
 * The preview renders missedCallTextBack() rather than sample wording, so it
 * cannot drift from what the caller is actually sent.
 */

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

type Props = {
  enabled: boolean;
  businessName: string;
  forwardNumber: string;
  trackingNumber: string;
  verifiedAt: string | null;
};

export default function MissedCallSection({
  enabled,
  businessName,
  forwardNumber,
  trackingNumber,
  verifiedAt,
}: Props) {
  const [forward, setForward] = useState(forwardNumber);
  const [tracking, setTracking] = useState(trackingNumber);
  const [save, setSave] = useState<SaveState>('idle');
  const [problem, setProblem] = useState<string | null>(null);
  const [, startSaving] = useTransition();
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  // What the server holds, so a debounced save knows if there is anything to
  // send and a failed one knows what to put back.
  const stored = useRef({ forward: forwardNumber, tracking: trackingNumber });

  useEffect(() => () => {
    if (savedTimer.current) clearTimeout(savedTimer.current);
    if (debounce.current) clearTimeout(debounce.current);
  }, []);

  function persist(next: { forward: string; tracking: string }) {
    if (next.forward === stored.current.forward && next.tracking === stored.current.tracking) return;
    const previous = { ...stored.current };
    setSave('saving');
    setProblem(null);
    startSaving(async () => {
      try {
        await updateMissedCallNumbersAction(next);
        stored.current = next;
        setSave('saved');
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSave('idle'), 2400);
      } catch (error) {
        // Put the stored values back. A field still showing the new number
        // after a failed save tells a contractor their calls are routing
        // somewhere they are not.
        setForward(previous.forward);
        setTracking(previous.tracking);
        setSave('error');
        setProblem(error instanceof Error ? error.message : null);
      }
    });
  }

  function edit(field: 'forward' | 'tracking', value: string) {
    const next = field === 'forward' ? { forward: value, tracking } : { forward, tracking: value };
    if (field === 'forward') setForward(value); else setTracking(value);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => persist(next), 900);
  }

  function flush() {
    if (debounce.current) clearTimeout(debounce.current);
    persist({ forward, tracking });
  }

  // Read from what is TYPED, not from what was loaded, so the status answers the
  // state the contractor is looking at.
  const status = missedCallStatus({
    enabled,
    forwardNumber: forward.trim() || null,
    trackingNumber: tracking.trim() || null,
    // A tracking number edited in the box has never been called at that value.
    verifiedAt: tracking.trim() === trackingNumber.trim() ? verifiedAt : null,
  });

  return (
    <div className={`missed-card${enabled ? '' : ' is-paused'}`}>
      <p className="missed-state">
        {enabled
          ? 'Automatically text callers when a call to your tracking number goes unanswered.'
          : 'Paused — your tracking number still rings your phone, but a missed call gets no text.'}
      </p>

      <div className="missed-grid">
        <div className="missed-settings">
          <div className="missed-field">
            <label htmlFor="callForwardNumber">Calls forward to</label>
            <input
              id="callForwardNumber"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="(248) 555-0100"
              value={forward}
              onChange={(event) => edit('forward', event.target.value)}
              onBlur={flush}
            />
            <small>Your phone rings here first.</small>
          </div>

          <div className="missed-field">
            <label htmlFor="callTrackingNumber">Customer-facing number</label>
            <input
              id="callTrackingNumber"
              type="tel"
              inputMode="tel"
              placeholder="(248) 555-0199"
              value={tracking}
              onChange={(event) => edit('tracking', event.target.value)}
              onBlur={flush}
            />
            <small>Use this number on your website, ads, and listings.</small>
          </div>

          <div className={`missed-status is-${status.tone}`}>
            <span className="missed-dot" aria-hidden="true" />
            <div>
              <strong>{status.label}</strong>
              <span>{status.detail}</span>
            </div>
          </div>

          <details className="advanced-settings missed-advanced">
            <summary>Advanced — connecting the number</summary>
            {/* The origin comes from the environment, not a literal. This
                printed letsgetquoted.com on every deployment including staging,
                so anybody following the instruction from a staging dashboard
                pointed a real phone number at an app they were not using. And
                the path no longer names a vendor: the handler answers on
                /api/sms/voice and on the old /api/twilio/voice alias, and the
                one we tell people to paste should be the one that stays true
                when the provider changes. */}
            <p className="missed-note">
              Point the number&apos;s <strong>Voice webhook</strong> to{' '}
              <code>{`${(process.env.NEXT_PUBLIC_APP_URL || 'https://letsgetquoted.com').replace(/\/$/, '')}/api/sms/voice`}</code>.
              Don&apos;t have a separate number yet? Get in touch and we&apos;ll set one up for you — you
              shouldn&apos;t have to do this part.
            </p>
          </details>
        </div>

        <div className="missed-preview">
          <p className="eyebrow">Text-back preview</p>
          <p className="missed-lede">What the caller receives.</p>

          <div className="missed-phone">
            <div className="missed-phone-head">
              <span className="missed-phone-avatar" aria-hidden="true">
                {businessName.slice(0, 2).toUpperCase()}
              </span>
              <strong>{businessName}</strong>
            </div>
            <div className="missed-phone-body">
              <p className="missed-bubble">{missedCallTextBack(businessName)}</p>
            </div>
          </div>

          <div className="missed-tags">
            <span className="missed-tag">Sent instantly</span>
            {/* Messages, not Leads. The missed call creates the lead; the
                caller's REPLY is a text, and texts land in the inbox. */}
            <span className="missed-tag">Replies land in Messages</span>
          </div>
        </div>
      </div>

      <div className="missed-foot">
        <span className="missed-foot-note">
          {problem ?? (enabled
            ? 'Every missed call is also logged on your leads board.'
            : 'Nothing is texted or logged while this is off.')}
        </span>
        <span className={`missed-save missed-save-${save}`} aria-live="polite">
          {save === 'saving' ? 'Saving…' : save === 'saved' ? '✓ Saved' : save === 'error' ? 'Couldn’t save' : ''}
        </span>
      </div>
    </div>
  );
}
