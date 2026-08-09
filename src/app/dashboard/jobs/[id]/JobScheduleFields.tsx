'use client';

import { useState } from 'react';
import ScheduledDatePicker from '@/components/scheduled-date-picker';
import TimeSlotSelect from '@/components/time-slot-select';
import SaveButton from '@/components/save-button';
import { dayLoad, dayLoadSummary, spanDays } from '@/lib/job-day-load';

/**
 * Put a date on the job, without asking the customer.
 *
 * The date lives in this component rather than in the form because
 * ScheduledDatePicker submits through a hidden input, and a hidden input cannot
 * be `required` — the browser skips validation on it. Submitting with nothing
 * chosen would reach scheduleJobAction with an empty date, which it reads as
 * "send me to the unscheduled queue" — correct when the schedule board calls it,
 * a silent bounce off this page when this form does. Disabling the button until
 * a day is picked removes the state instead of handling it.
 *
 * THE END DATE IS HERE NOW, and it is not a convenience.
 *
 * A contractor doing three hours a day at one site for a fortnight could always
 * express that — total hours, plus a range, and lib/booking divides one by the
 * other. Nothing said so. The end date lived in "Job details" behind an edit
 * form, this card said only "Running over more than one day? Set an end date in
 * Job details", and the hours field's own note said the hours were "not for how
 * many days this blocks" — true of the span, false of the daily load, which is
 * exactly hours ÷ days.
 *
 * So the range is asked for at the moment somebody is deciding when to be
 * there, and the division is printed back at them. An owner should not have to
 * infer from a calendar whether the app understood their week.
 */
export default function JobScheduleFields({
  scheduledFor,
  scheduledTime,
  scheduledUntil,
  estimatedHours,
  capacityHours,
}: {
  scheduledFor: string;
  scheduledTime: string;
  scheduledUntil: string;
  /** From the job, for the hours ÷ days line. Not editable here. */
  estimatedHours: number | null;
  /** The account's working day — schedule_day_hours. */
  capacityHours: number;
}) {
  const [date, setDate] = useState(scheduledFor);
  const [until, setUntil] = useState(scheduledUntil);

  // Recomputed on every keystroke of either date, because the whole point is
  // that the owner sees the consequence while they are choosing it.
  const load = dayLoad({ totalHours: estimatedHours, days: spanDays(date, until), capacityHours });
  const summary = dayLoadSummary(load);

  return (
    <>
      <div className="field">
        <label htmlFor="jobScheduledFor">Start date</label>
        <ScheduledDatePicker id="jobScheduledFor" name="scheduledFor" required value={date} onChange={setDate} />
      </div>
      <div className="field">
        <label htmlFor="jobScheduledTime">Time of day</label>
        <TimeSlotSelect id="jobScheduledTime" name="scheduledTime" defaultValue={scheduledTime} />
      </div>
      <div className="field">
        <label htmlFor="jobScheduledUntil">Last day <span className="job-meta">(optional)</span></label>
        {/* A plain date input, not ScheduledDatePicker: this one is genuinely
            optional, and the picker's calendar UI reads as a decision to make
            rather than a field to leave alone. `min` stops a range that runs
            backwards, which spanDays would return null for anyway — better to
            refuse it at the field than to silently ignore it. */}
        <input
          id="jobScheduledUntil"
          name="scheduledUntil"
          type="date"
          value={until}
          min={date || undefined}
          onChange={(event) => setUntil(event.target.value)}
        />
        <small className="job-meta">
          Leave blank for a one-day job. Set it and the estimated hours spread evenly across the range —
          that is how you say &ldquo;a few hours a day&rdquo;.
        </small>
      </div>
      {summary ? (
        <p className={`field full job-day-load${load.kind === 'over' ? ' is-over' : ''}`} role="status">
          {summary}
        </p>
      ) : null}
      <div className="field full">
        <SaveButton pendingLabel="Saving…" savedLabel="Booked ✓" disabled={!date}>
          {scheduledFor ? 'Move this job' : 'Put it on the calendar'}
        </SaveButton>
      </div>
    </>
  );
}
