'use client';

import { useState, useTransition } from 'react';

import { setVoiceRecordingAction, updateVoiceSettingsAction } from './voice-actions';

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
  emergencyTransferNumber: string;
  businessHours: Hours;
  recordingEnabled: boolean;
  timezone: string;
  /** From the plan. Zero means the plan carries no AI Voice at all. */
  concurrentCalls: number;
};

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function AiReceptionistSection(props: Props) {
  const [status, setStatus] = useState(props.status);
  const [answerMode, setAnswerMode] = useState(props.answerMode);
  const [greeting, setGreeting] = useState(props.greeting);
  const [transferNumber, setTransferNumber] = useState(props.transferNumber);
  const [emergency, setEmergency] = useState(props.emergencyTransferNumber);
  const [hours, setHours] = useState<Hours>(props.businessHours);
  const [recording, setRecording] = useState(props.recordingEnabled);
  const [acknowledged, setAcknowledged] = useState(props.recordingEnabled);
  const [save, setSave] = useState<SaveState>('idle');
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [, startSaving] = useTransition();

  const unsold = props.concurrentCalls < 1;

  function setDay(day: string, open: string | null, close: string | null) {
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
          emergencyTransferNumber: emergency,
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
      } catch (error) {
        setSave('error');
        setProblem(error instanceof Error ? error.message : 'Could not save.');
      }
    });
  }

  function toggleRecording(next: boolean) {
    setProblem(null);
    startSaving(async () => {
      try {
        const result = await setVoiceRecordingAction({ enabled: next, acknowledged });
        setRecording(result.enabled);
      } catch (error) {
        setProblem(error instanceof Error ? error.message : 'Could not change recording.');
      }
    });
  }

  return (
    <div className="voice-card">
      {unsold ? (
        <p className="voice-unsold">
          Your plan doesn&apos;t include the AI Voice Receptionist yet. You can set it up here, and
          it will start answering once it&apos;s on your plan.
        </p>
      ) : null}

      <div className="voice-field">
        <span className="voice-label">Receptionist</span>
        <div className="voice-choices" role="group" aria-label="Receptionist status">
          {(['off', 'active', 'paused'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={status === value}
              onClick={() => setStatus(value)}
            >
              {value === 'off' ? 'Off' : value === 'active' ? 'Answering' : 'Paused'}
            </button>
          ))}
        </div>
        <small>
          {status === 'active'
            ? 'Callers you don’t pick up reach the receptionist.'
            : status === 'paused'
              ? 'Paused — your settings are kept, and nothing answers for now.'
              : 'Off — calls follow your normal forwarding.'}
        </small>
      </div>

      <div className="voice-field">
        <span className="voice-label">When it answers</span>
        <div className="voice-choices" role="group" aria-label="When the receptionist answers">
          <button type="button" aria-pressed={answerMode === 'after_hours'} onClick={() => setAnswerMode('after_hours')}>
            Outside business hours
          </button>
          <button type="button" aria-pressed={answerMode === 'always'} onClick={() => setAnswerMode('always')}>
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
                  value={window?.[0] ?? ''}
                  onChange={(event) => setDay(day, event.target.value || null, window?.[1] ?? '17:00')}
                />
                <span aria-hidden="true">to</span>
                <input
                  aria-label={`${label} closing time`}
                  type="time"
                  value={window?.[1] ?? ''}
                  onChange={(event) => setDay(day, window?.[0] ?? '08:00', event.target.value || null)}
                />
                <button type="button" className="voice-clear" onClick={() => setDay(day, null, null)}>
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
          placeholder="Thanks for calling Rivera Plumbing."
          value={greeting}
          onChange={(event) => setGreeting(event.target.value)}
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
          placeholder="(248) 555-0100"
          value={transferNumber}
          onChange={(event) => setTransferNumber(event.target.value)}
        />
        <small>Where the receptionist puts a caller through. Leave blank and it won&apos;t offer to.</small>
      </div>

      <div className="voice-field">
        <label className="voice-label" htmlFor="voice-emergency">Emergencies go to</label>
        <input
          id="voice-emergency"
          type="tel"
          inputMode="tel"
          placeholder="(248) 555-0111"
          value={emergency}
          onChange={(event) => setEmergency(event.target.value)}
        />
        <small>Used when a caller describes something urgent. Falls back to the number above.</small>
      </div>

      <div className="voice-field voice-recording">
        <span className="voice-label">Record calls</span>
        <label htmlFor="voice-recording-ack" className="voice-check">
          <input
            id="voice-recording-ack"
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          <span>
            I&apos;ll make sure callers are told the call is recorded. Recording without telling
            people is illegal in much of the US.
          </span>
        </label>
        <button
          type="button"
          className="voice-recording-toggle"
          aria-pressed={recording}
          disabled={!recording && !acknowledged}
          onClick={() => toggleRecording(!recording)}
        >
          {recording ? 'Recording is on — turn it off' : 'Turn recording on'}
        </button>
        {recording ? (
          <small>Turning it off stops new recordings. It doesn&apos;t delete ones already made.</small>
        ) : null}
      </div>

      <div className="voice-foot">
        <span className="voice-foot-note">{problem ?? notice ?? ''}</span>
        <span className={`voice-save voice-save-${save}`} aria-live="polite">
          {save === 'saving' ? 'Saving…' : save === 'saved' ? '✓ Saved' : save === 'error' ? 'Couldn’t save' : ''}
        </span>
        <button type="button" className="voice-submit" onClick={submit} disabled={save === 'saving'}>
          Save settings
        </button>
      </div>
    </div>
  );
}
