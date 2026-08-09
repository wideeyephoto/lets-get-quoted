'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  CHOICE_ELIGIBILITY_LABEL,
  CHOICE_OFFSET_CHOICES,
  CHOICE_REMINDER_HOUR_CHOICES,
  CHOICE_STOP_LABEL,
  CHOICE_TEMPLATE_MAX,
  CHOICE_TEMPLATE_TOKENS,
  DEFAULT_CHOICE_REMINDER_TEMPLATE,
  MAX_CHOICE_REMINDERS,
  choiceGroupingLabel,
  choiceOffsetLabel,
  choiceReminderHourLabel,
  choiceReminderPreview,
  choiceScheduleLabel,
  normalizeChoiceOffsets,
  validateChoiceTemplate,
  type ChoiceGrouping,
} from '@/lib/choice-reminders';
import { sendChoiceReminderTestAction, updateChoiceReminderSettingsAction } from './actions';

/**
 * Choice reminders, from the contractor's side.
 *
 * The on/off switch is the one in the card's own header, so it is not repeated
 * here — the same rule the Review requests and Appointment reminders cards were
 * rebuilt around after each was found carrying a second control for the same
 * boolean. This form owns WHEN and WHAT, and nothing in it can enable or
 * disable the automation.
 *
 * Two columns: what it does on the left, what the customer receives on the
 * right. The preview is rendered by choiceReminderPreview — the sender's own
 * function, given the template as it stands in the box RIGHT NOW — so it moves
 * as you type and cannot drift from what actually goes out. Every hand-written
 * preview in this app has drifted from its sender at least once.
 */

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** The visible word beside each schedule slot, and the start of its accessible name. */
const SLOT_LABELS = ['First', 'Then', 'And then'] as const;

type Props = {
  /** The card's master switch — selection_reminders_enabled. Read-only here. */
  enabled: boolean;
  businessName: string;
  offsets: number[];
  hour: number;
  /** Null means the default wording is in force. */
  template: string | null;
  grouping: ChoiceGrouping;
  /** "EDT" — derived from a moment on the server, because it is DST-dependent. */
  timeZoneLabel: string;
};

export default function ChoiceRemindersSection({
  enabled,
  businessName,
  offsets,
  hour,
  template,
  grouping,
  timeZoneLabel,
}: Props) {
  // Three slots, because the schedule may be one, two or three reminders and an
  // empty slot is "don't send that one". Same shape as the follow-up day fields.
  const asSlots = (values: number[]): string[] => {
    const safe = normalizeChoiceOffsets(values).map(String);
    return [safe[0] ?? '0', safe[1] ?? '', safe[2] ?? ''];
  };

  const [slots, setSlots] = useState<string[]>(() => asSlots(offsets));
  const [sendHour, setSendHour] = useState(String(hour));
  const [editingMessage, setEditingMessage] = useState(false);
  const [body, setBody] = useState(template ?? DEFAULT_CHOICE_REMINDER_TEMPLATE);
  const [save, setSave] = useState<SaveState>('idle');
  const [problem, setProblem] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testNote, setTestNote] = useState<string | null>(null);
  const [, startSaving] = useTransition();
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current); }, []);

  // KEYED ON THE VALUE, NOT THE ARRAY. `offsets` is a fresh array on every
  // server render, so an effect depending on it directly would fire on every
  // revalidation of this page — including ones this form did not cause, like
  // flipping the card's own switch — and reset whatever was half-typed. The
  // string is stable when the numbers are.
  const offsetsKey = useMemo(() => normalizeChoiceOffsets(offsets).join(','), [offsets]);

  // The server wins once a revalidation lands. Without this the form keeps
  // showing what was typed after a save that the server normalised — two
  // reminders on the same day become one, and the box would still show two.
  useEffect(() => { setSlots(asSlots(offsetsKey.split(',').map(Number))); }, [offsetsKey]);
  useEffect(() => { setSendHour(String(hour)); }, [hour]);
  useEffect(() => { setBody(template ?? DEFAULT_CHOICE_REMINDER_TEMPLATE); }, [template]);

  // What the server currently holds, for the dirty comparison. A form that is
  // "modified" because a select re-rendered is a Save button that never goes
  // back to disabled.
  const stored = useMemo(
    () => JSON.stringify({
      slots: asSlots(offsetsKey.split(',').map(Number)),
      hour: String(hour),
      body: template ?? DEFAULT_CHOICE_REMINDER_TEMPLATE,
    }),
    [offsetsKey, hour, template],
  );
  const current = JSON.stringify({ slots, hour: sendHour, body });
  const dirty = current !== stored;

  const parsedOffsets = normalizeChoiceOffsets(slots.filter((slot) => slot !== ''));
  const templateCheck = validateChoiceTemplate(body);
  const scheduleLine = `${choiceScheduleLabel(parsedOffsets)}, at ${choiceReminderHourLabel(Number(sendHour))} ${timeZoneLabel}`;

  /**
   * Clear a refusal the moment the contractor starts fixing it.
   *
   * Without this, "Couldn't save" and the reason beside it are sticky: the
   * client-side guard below returns before any submit, so nothing else ever
   * resets them, and the message stays on screen contradicting a form that is
   * now perfectly valid.
   */
  function clearRefusal() {
    if (save === 'error') setSave('idle');
    if (problem) setProblem(null);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty || save === 'saving') return;
    if (!templateCheck.ok) {
      setProblem(templateCheck.message ?? 'That message cannot be sent.');
      setSave('error');
      return;
    }

    // Normalised HERE, and the same values are both submitted and adopted
    // locally on success.
    //
    // THE STUCK-DIRTY BUG THIS AVOIDS. The effects above re-sync from the props,
    // which only change when the stored value changes. Pick "2 days later"
    // twice, or add trailing whitespace to the message, and the server
    // normalises the submission straight back to what the row already held — so
    // no prop changes, no effect fires, the local state keeps its un-normalised
    // form, and Save stays enabled forever over a form that is already saved.
    const payloadOffsets = normalizeChoiceOffsets(slots.filter((slot) => slot !== ''));
    const trimmed = body.trim();
    const payloadBody = trimmed || DEFAULT_CHOICE_REMINDER_TEMPLATE;

    const form = new FormData();
    payloadOffsets.forEach((offset, index) => form.set(`choiceOffset${index + 1}`, String(offset)));
    form.set('choiceHour', sendHour);
    form.set('choiceTemplate', payloadBody);

    setSave('saving');
    setProblem(null);
    startSaving(async () => {
      try {
        const result = await updateChoiceReminderSettingsAction(form);
        if (!result.ok) {
          // A refused save is not a crash. The wording is the contractor's to
          // fix, so it is shown beside the box rather than thrown at them.
          setProblem(result.message ?? 'Could not save your changes.');
          setSave('error');
          return;
        }
        // What was submitted is the new resting state, whether or not the props
        // move underneath us.
        setSlots(asSlots(payloadOffsets));
        setBody(payloadBody);
        setSave('saved');
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSave('idle'), 2400);
      } catch (error) {
        setProblem(error instanceof Error ? error.message : 'Could not save your changes.');
        setSave('error');
      }
    });
  }

  function sendTest() {
    if (testing) return;
    setTesting(true);
    setTestNote(null);
    startSaving(async () => {
      try {
        const result = await sendChoiceReminderTestAction();
        setTestNote(result.ok ? `Test sent. ${result.message}` : result.message);
      } catch (error) {
        setTestNote(error instanceof Error ? error.message : 'Could not send the test.');
      } finally {
        setTesting(false);
      }
    });
  }

  const saveLabel = save === 'saving' ? 'Saving…' : save === 'saved' ? 'Saved ✓' : 'Save changes';

  return (
    <form className={`choice-card${enabled ? '' : ' is-paused'}`} onSubmit={onSubmit}>
      <p className="choice-state">
        {enabled
          ? `Active — ${scheduleLine.charAt(0).toLowerCase()}${scheduleLine.slice(1)}.`
          : 'Off — a customer sitting on a decision hears nothing, and the job waits.'}
      </p>

      <div className="choice-grid">
        {/* ---------------------------------------------------------------- */}
        {/* Left: what it does.                                              */}
        {/* ---------------------------------------------------------------- */}
        <div className="choice-facts">
          <div className="choice-fact">
            <strong id="choice-schedule-label">Reminder schedule</strong>
            <span>{scheduleLine}</span>

            <details className="choice-edit">
              <summary>Edit schedule</summary>
              <div className="choice-edit-form">
                <fieldset className="choice-slots">
                  <legend>Send a reminder</legend>
                  {slots.map((slot, index) => (
                    <label key={index} className="choice-slot">
                      <span>{SLOT_LABELS[index]}</span>
                      <select
                        value={slot}
                        /* The visible word comes FIRST in the accessible name.
                           An aria-label overrides the wrapping <label>, so one
                           that did not contain "First" would leave somebody
                           using voice control unable to say the thing they can
                           see (WCAG 2.5.3, Label in Name). */
                        aria-label={`${SLOT_LABELS[index]} — days after the needed-by date`}
                        onChange={(event) => {
                          clearRefusal();
                          const next = [...slots];
                          next[index] = event.target.value;
                          // Clearing a slot clears the ones after it. A schedule
                          // with a hole in the middle is not a schedule anybody
                          // meant, and normalizeChoiceOffsets would silently
                          // close the gap on save — so close it here, where it
                          // can be seen.
                          if (event.target.value === '') for (let i = index; i < next.length; i += 1) next[i] = '';
                          setSlots(next);
                        }}
                      >
                        {/* The first reminder is not optional: an automation
                            with no reminders is the off switch, and that lives
                            in the card header. */}
                        {index > 0 && <option value="">Don&apos;t send this one</option>}
                        {CHOICE_OFFSET_CHOICES.map((offset) => (
                          <option key={offset} value={String(offset)}>
                            {choiceOffsetLabel(offset, index)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </fieldset>

                <label className="choice-slot">
                  <span>At</span>
                  <select
                    value={sendHour}
                    aria-label="At — the hour of the day reminders are sent"
                    onChange={(event) => { clearRefusal(); setSendHour(event.target.value); }}
                  >
                    {CHOICE_REMINDER_HOUR_CHOICES.map((choice) => (
                      <option key={choice} value={String(choice)}>{choiceReminderHourLabel(choice)}</option>
                    ))}
                  </select>
                </label>

                <p className="choice-note">
                  Times are {timeZoneLabel} — your own clock, not the server&apos;s.{' '}
                  <Link href="/dashboard/settings#business">Change your timezone</Link>
                </p>
                <p className="choice-note">
                  At most {MAX_CHOICE_REMINDERS} reminders. Past that it is nagging, and a thread somebody
                  mutes takes the urgent message with it.
                </p>
              </div>
            </details>
          </div>

          <div className="choice-fact">
            <strong>Eligible choices</strong>
            <span>{CHOICE_ELIGIBILITY_LABEL}</span>
            <span className="choice-fact-note">
              Leave the needed-by date blank on a choice that genuinely isn&apos;t urgent and nothing is
              ever sent about it.
            </span>
          </div>

          <div className="choice-fact">
            <strong>Message grouping</strong>
            <span>{choiceGroupingLabel(grouping)}</span>
            <span className="choice-fact-note">
              Six choices due the same day is one text, not six.
            </span>
          </div>

          <div className="choice-fact">
            <strong>Stops automatically</strong>
            <span>{CHOICE_STOP_LABEL}</span>
            <span className="choice-fact-note">
              Also when the needed-by dates are removed, or the customer replies STOP. Move a date and
              the reminder moves with it.
            </span>
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Right: what the customer receives.                               */}
        {/* ---------------------------------------------------------------- */}
        <div className="choice-preview">
          <p className="eyebrow">What the client sees</p>
          <p className="choice-lede">Sent {scheduleLine.charAt(0).toLowerCase()}{scheduleLine.slice(1)}.</p>

          <div className="choice-phone">
            <div className="choice-phone-head">
              <span className="choice-phone-avatar" aria-hidden="true">
                {businessName.slice(0, 2).toUpperCase()}
              </span>
              <strong>{businessName}</strong>
            </div>
            <div className="choice-phone-body">
              {/* Rendered from the sender's own function, against whatever is in
                  the box this instant. */}
              <p className="choice-bubble">{choiceReminderPreview({ businessName, template: body })}</p>
            </div>
          </div>

          <div className="choice-actions">
            <button
              type="button"
              className="choice-edit-message"
              aria-expanded={editingMessage}
              aria-controls="choice-message-editor"
              onClick={() => setEditingMessage((open) => !open)}
            >
              {editingMessage ? 'Done editing' : 'Edit message'}
            </button>
            {/* `btn secondary`, not the `btn ghost` the other cards' test
                buttons wear: .btn.ghost has no base rule in globals.css — it is
                styled only inside .selection-chosen — so those buttons have
                been rendering as plain .btn all along. */}
            <button type="button" className="btn secondary" onClick={sendTest} disabled={testing} aria-busy={testing}>
              {testing ? 'Sending…' : 'Send a test'}
            </button>
            <small>Goes to your account email.</small>
          </div>

          <div id="choice-message-editor" className="choice-editor" hidden={!editingMessage}>
            <label htmlFor="choice-template">Message</label>
            <textarea
              id="choice-template"
              value={body}
              rows={5}
              maxLength={CHOICE_TEMPLATE_MAX}
              spellCheck
              aria-describedby="choice-template-help choice-template-error"
              aria-invalid={!templateCheck.ok}
              onChange={(event) => { clearRefusal(); setBody(event.target.value); }}
            />
            <p id="choice-template-help" className="choice-note">
              {CHOICE_TEMPLATE_TOKENS.map((token, index) => (
                <span key={token.token}>
                  {index > 0 ? ' · ' : ''}
                  <code>{token.token}</code> {token.means}
                </span>
              ))}
            </p>
            <p className="choice-note">
              &ldquo;{'Reply STOP to opt out.'}&rdquo; is added for you and can&apos;t be removed &mdash; it is
              what makes this legal to text.
            </p>
            <p id="choice-template-error" className="choice-invalid" role="alert">
              {templateCheck.ok ? '' : templateCheck.message}
            </p>
            <button
              type="button"
              className="choice-reset"
              onClick={() => setBody(DEFAULT_CHOICE_REMINDER_TEMPLATE)}
              disabled={body === DEFAULT_CHOICE_REMINDER_TEMPLATE}
            >
              Reset to the default wording
            </button>
          </div>

          {testNote && <p className="choice-test-note" role="status">{testNote}</p>}
        </div>
      </div>

      <div className="choice-foot">
        <span className="choice-foot-note">
          {problem ?? (enabled
            ? 'Every reminder is logged on the job and in Messages.'
            : 'Nothing is sent while this is off.')}
        </span>
        <span className={`choice-save choice-save-${save}`} aria-live="polite">
          {save === 'saving' ? 'Saving…' : save === 'saved' ? '✓ Saved' : save === 'error' ? 'Couldn’t save' : ''}
        </span>
        <button
          type="submit"
          className="btn primary"
          /* Disabled until something is actually different. A Save button that is
             always live makes the one form you HAVE edited look exactly like the
             six you have not, so the honest answer to "did I save that?" becomes
             "press Save on all of them and hope". */
          disabled={!dirty || save === 'saving'}
          aria-busy={save === 'saving'}
        >
          {saveLabel}
        </button>
      </div>
    </form>
  );
}
