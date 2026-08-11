'use client';

import { useState } from 'react';
import SaveButton from '@/components/save-button';
import { useQuoteDeck } from './QuoteDeck';

/**
 * The dates, as dates.
 *
 * The options a contractor offered were reachable only by reading down a
 * chronological activity feed, and the page mentioned start dates in prose
 * several times without ever presenting one that could be chosen. They are
 * cards now, at the point in the page where somebody is deciding.
 *
 * ONE FORM, NOT ONE PER CARD. Each option used to be its own form with its own
 * note field, which meant the note somebody typed under option two was
 * discarded the moment they picked option three, and only the note attached to
 * the pressed button ever reached the server. A radio group shares the note
 * with whichever option wins, which is what the person writing it assumed all
 * along. The action, the field names and the index it posts are unchanged.
 */
export default function ScheduleChoice({
  options,
  selectAction,
  differentAction,
  /** Selecting a date accepts the quote when one has not been accepted yet —
   *  existing behavior, so the button has to say so. */
  awaitingApproval,
}: {
  options: Array<{ label: string; index: number }>;
  selectAction: (formData: FormData) => void;
  differentAction: (formData: FormData) => void;
  awaitingApproval: boolean;
}) {
  const { setPreferredDate } = useQuoteDeck();
  const [chosen, setChosen] = useState<number | null>(null);

  return (
    <>
      <form action={selectAction} className="date-choice">
        <fieldset className="date-choice-set">
          <legend className="sr-only">Choose a start date</legend>
          <div className="date-choice-grid">
            {options.map((option) => (
              <label className={`date-card${chosen === option.index ? ' is-chosen' : ''}`} key={option.index}>
                <input
                  type="radio"
                  name="optionIndex"
                  value={option.index}
                  checked={chosen === option.index}
                  onChange={() => {
                    setChosen(option.index);
                    // The rail is showing "Preferred start" and this is where
                    // that fact is made.
                    setPreferredDate(option.label);
                  }}
                />
                <span className="date-card-body">
                  <span className="date-card-label">Option {option.index + 1}</span>
                  <strong className="date-card-when">{option.label}</strong>
                </span>
                <span className="date-card-tick" aria-hidden="true">
                  {chosen === option.index ? '✓' : ''}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="date-choice-note" htmlFor="date-notes">
          <span>Anything we should know? (optional)</span>
          <textarea id="date-notes" name="notes" rows={2} placeholder="Gate code, dogs, best time of day…" />
        </label>

        <SaveButton disabled={chosen === null} pendingLabel="Confirming…" savedLabel="Confirmed ✓">
          {awaitingApproval ? 'Approve quote and book this date' : 'Confirm this date'}
        </SaveButton>
      </form>

      <details className="client-ask date-choice-alt">
        <summary>None of these work?</summary>
        <form action={differentAction} className="client-ask-form">
          <label htmlFor="different-notes">Tell them what usually works better</label>
          <textarea id="different-notes" name="notes" rows={3} placeholder="Weekday mornings, or any Saturday." />
          <SaveButton className="btn secondary" pendingLabel="Sending…" savedLabel="Sent">
            Request different dates
          </SaveButton>
        </form>
      </details>
    </>
  );
}
