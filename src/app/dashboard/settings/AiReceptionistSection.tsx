'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { updateVoiceSettingsAction } from './voice-actions';

/**
 * The AI receptionist card.
 *
 * SAVED ON A BUTTON, not on a debounce like the missed-call card next to it.
 * That card edits two phone numbers; this one decides whether a machine answers
 * a business's phone, in which hours, saying what. A half-typed greeting
 * auto-saving between keystrokes would go live to the next caller.
 *
 * The status line reads from what is TYPED rather than from what was loaded, so
 * it answers the state the contractor is looking at — the same rule the
 * missed-call card follows, and for the same reason.
 */

const DAYS = [
  ['1', 'Monday'], ['2', 'Tuesday'], ['3', 'Wednesday'], ['4', 'Thursday'],
  ['5', 'Friday'], ['6', 'Saturday'], ['0', 'Sunday'],
] as const;

type Hours = Record<string, [string, string] | null>;

type Props = {
  status: 'off' | 'active' | 'paused';
  answerMode: 'always' | 'after_hours';
  greeting: string;
  transferNumber: string;
  businessHours: Hours;
  timezone: string;
  /** Base-plan inclusion or an active recurring AI Voice add-on. */
  entitled: boolean;
  /** Distinguishes a verified no-entitlement result from a failed billing read. */
  entitlementAvailable: boolean;
  /** False when the saved settings row could not be read. */
  settingsAvailable: boolean;
  /** Route-specific evidence for the current customer-facing number. */
  routeState: 'ready' | 'missing_number' | 'dedicated_number_not_ready' | 'unverified' | 'unavailable';
  /** The capacity within an entitlement, never the entitlement itself. */
  concurrentCalls: number;
};

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function AiReceptionistSection(props: Props) {
  const router = useRouter();
  const [status, setStatus] = useState(props.status);
  const [answerMode, setAnswerMode] = useState(props.answerMode);
  const [greeting, setGreeting] = useState(props.greeting);
  const [transferNumber, setTransferNumber] = useState(props.transferNumber);
  const [hours, setHours] = useState<Hours>(props.businessHours);
  const [save, setSave] = useState<SaveState>('idle');
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [, startSaving] = useTransition();
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const unsold = props.entitlementAvailable && !props.entitled;
  const activationBlockedReason = !props.settingsAvailable
    ? 'Saved receptionist settings could not be loaded.'
    : !props.entitlementAvailable
      ? 'AI Voice entitlement could not be verified.'
      : !props.entitled
        ? 'This workspace does not include AI Voice or an active add-on.'
        : props.routeState === 'unavailable'
          ? 'The customer-facing call route could not be verified.'
          : props.routeState === 'missing_number'
            ? 'A valid customer-facing number has not been configured.'
            : props.routeState === 'dedicated_number_not_ready'
              ? 'The customer-facing number is not an active dedicated SignalWire number.'
            : props.routeState === 'unverified'
              ? 'The customer-facing number has not completed a signed test call to the AI Voice route.'
              : null;
  const editingBlocked = !props.settingsAvailable;
  const controlsDisabled = editingBlocked || save === 'saving';

  useEffect(() => () => {
    if (savedTimer.current) clearTimeout(savedTimer.current);
  }, []);

  function markEdited() {
    if (savedTimer.current) clearTimeout(savedTimer.current);
    setSave('idle');
    setProblem(null);
    setNotice(null);
  }

  function setDay(day: string, open: string | null, close: string | null) {
    markEdited();
    setHours((current) => ({
      ...current,
      [day]: open && close ? [open, close] : null,
    }));
  }

  function submit() {
    setSave('saving');
    setProblem(null);
    setNotice(null);
    startSaving(async () => {
      try {
        const result = await updateVoiceSettingsAction({
          status, answerMode, greeting, transferNumber,
          businessHours: hours,
        });
        // The server drops a day whose closing time is at or before its opening
        // one. Saying so beats a silently-vanished row: the alternative is a
        // contractor seeing "Saved" and their receptionist answering all day.
        if (result.droppedDays.length > 0) {
          const names = result.droppedDays
            .map((day) => DAYS.find(([value]) => value === day)?.[1] ?? day)
            .join(', ');
          setNotice(`${names} was not saved — the closing time must be after the opening time.`);
          setHours((current) => {
            const next = { ...current };
            for (const day of result.droppedDays) next[day] = null;
            return next;
          });
        }
        setSave('saved');
        router.refresh();
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSave('idle'), 2400);
      } catch (error) {
        setSave('error');
        setProblem(error instanceof Error ? error.message : 'Could not save.');
      }
    });
  }

  return (
    <div className="voice-card">
      {!props.settingsAvailable ? (
        <p className="voice-unsold" role="alert">
          We couldn&apos;t load the saved receptionist settings. The controls are locked so an
          unknown live configuration cannot be overwritten with defaults. Refresh the page or contact support.
        </p>
      ) : !props.entitlementAvailable ? (
        <p className="voice-unsold" role="status">
          We couldn&apos;t verify AI Voice access right now. Existing settings are shown, but Answering
          cannot be activated until the billing check succeeds.
        </p>
      ) : unsold ? (
        <p className="voice-unsold">
          This workspace doesn&apos;t include AI Voice and has no active AI Voice add-on. You can
          prepare the greeting and hours here, but it cannot be switched to Answering.
        </p>
      ) : props.routeState === 'unavailable' ? (
        <p className="voice-unsold" role="status">
          We couldn&apos;t verify the customer-facing call route right now. Answering stays unavailable;
          refresh the page or contact support if it continues.
        </p>
      ) : props.routeState === 'missing_number' ? (
        <p className="voice-unsold" role="status">
          Add a valid customer-facing number in Missed-call text-back before turning on Answering.
        </p>
      ) : props.routeState === 'dedicated_number_not_ready' ? (
        <div className="alert alert-warning" role="status">
          AI Voice requires an active dedicated SignalWire number assigned to this workspace.
        </div>
      ) : props.routeState === 'unverified' ? (
        <p className="voice-unsold" role="status">
          Before Answering can be turned on, point the customer-facing number at the AI Voice webhook
          and place one test call. The signed call is the proof that calls really reach LGQ.
        </p>
      ) : (
        <p className="voice-unsold">
          Included: {props.concurrentCalls} simultaneous AI {props.concurrentCalls === 1 ? 'call' : 'calls'}.
        </p>
      )}

      <div className="voice-field">
        <span className="voice-label">Receptionist</span>
        <div className="voice-choices" role="group" aria-label="Receptionist status">
          {(['off', 'active', 'paused'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={status === value}
              disabled={controlsDisabled || (value === 'active' && activationBlockedReason !== null)}
              title={value === 'active' ? activationBlockedReason ?? undefined : undefined}
              onClick={() => { markEdited(); setStatus(value); }}
            >
              {value === 'off' ? 'Off' : value === 'active' ? 'Answering' : 'Paused'}
            </button>
          ))}
        </div>
        <small>
          {status === 'active'
            ? activationBlockedReason
              ? `Configured, but not answering: ${activationBlockedReason}`
              : 'Calls covered by the schedule below reach the receptionist.'
            : status === 'paused'
              ? 'Paused — your settings are kept, and nothing answers for now.'
              : 'Off — calls follow your normal forwarding.'}
        </small>
      </div>

      <div className="voice-field">
        <span className="voice-label">When it answers</span>
        <div className="voice-choices" role="group" aria-label="When the receptionist answers">
          <button type="button" disabled={controlsDisabled} aria-pressed={answerMode === 'after_hours'} onClick={() => { markEdited(); setAnswerMode('after_hours'); }}>
            Outside business hours
          </button>
          <button type="button" disabled={controlsDisabled} aria-pressed={answerMode === 'always'} onClick={() => { markEdited(); setAnswerMode('always'); }}>
            Every call
          </button>
        </div>
        <small>Times are in {props.timezone.replace(/_/g, ' ')}, the timezone on your account.</small>
      </div>

      {answerMode === 'after_hours' ? (
        <div className="voice-hours">
          {DAYS.map(([day, label]) => {
            const window = hours[day];
            return (
              <div className="voice-hours-row" key={day}>
                <label htmlFor={`voice-open-${day}`}>{label}</label>
                <input
                  id={`voice-open-${day}`}
                  type="time"
                  disabled={controlsDisabled}
                  value={window?.[0] ?? ''}
                  onChange={(event) => setDay(day, event.target.value || null, window?.[1] ?? '17:00')}
                />
                <span aria-hidden="true">to</span>
                <input
                  aria-label={`${label} closing time`}
                  type="time"
                  disabled={controlsDisabled}
                  value={window?.[1] ?? ''}
                  onChange={(event) => setDay(day, window?.[0] ?? '08:00', event.target.value || null)}
                />
                <button type="button" className="voice-clear" disabled={controlsDisabled} onClick={() => setDay(day, null, null)}>
                  Closed
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="voice-field">
        <label className="voice-label" htmlFor="voice-greeting">Greeting</label>
        <textarea
          id="voice-greeting"
          rows={3}
          maxLength={1000}
          disabled={controlsDisabled}
          placeholder="Thanks for calling Rivera Plumbing."
          value={greeting}
          onChange={(event) => { markEdited(); setGreeting(event.target.value); }}
        />
        <small>
          Callers are always told they&apos;re speaking with an AI assistant, whatever you write here.
        </small>
      </div>

      <div className="voice-field">
        <label className="voice-label" htmlFor="voice-transfer">Transfer calls to</label>
        <input
          id="voice-transfer"
          type="tel"
          inputMode="tel"
          disabled={controlsDisabled}
          placeholder="(248) 555-0100"
          value={transferNumber}
          onChange={(event) => { markEdited(); setTransferNumber(event.target.value); }}
        />
        <small>
          Where the receptionist puts a caller through. Leave blank to use your account&apos;s normal
          forwarding number; without either number, it won&apos;t offer a transfer.
        </small>
      </div>

      <div className="voice-field">
        <span className="voice-label">Emergency routing</span>
        <small>
          Not available yet. The receptionist can use only the primary transfer number above;
          it does not currently classify an emergency into a separate route.
        </small>
      </div>

      <div className="voice-field voice-recording">
        <span className="voice-label">Record calls</span>
        <small>
          Not available yet. Calls are not recorded; LGQ will not offer this switch until
          recording storage, disclosure, retention and deletion all work end to end.
        </small>
      </div>

      <div className="voice-foot">
        <span className="voice-foot-note">{problem ?? notice ?? ''}</span>
        <span className={`voice-save voice-save-${save}`} aria-live="polite">
          {save === 'saving' ? 'Saving…' : save === 'saved' ? '✓ Saved' : save === 'error' ? 'Couldn’t save' : ''}
        </span>
        <button
          type="button"
          className="voice-submit"
          onClick={submit}
          disabled={controlsDisabled || (status === 'active' && activationBlockedReason !== null)}
        >
          Save settings
        </button>
      </div>
    </div>
  );
}
