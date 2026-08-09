'use client';

import { useState } from 'react';
import ScheduledDatePicker from '@/components/scheduled-date-picker';
import TimeSlotSelect from '@/components/time-slot-select';
import SaveButton from '@/components/save-button';

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
 */
export default function JobScheduleFields({
  scheduledFor,
  scheduledTime,
}: {
  scheduledFor: string;
  scheduledTime: string;
}) {
  const [date, setDate] = useState(scheduledFor);

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
      <div className="field full">
        <SaveButton pendingLabel="Saving…" savedLabel="Booked ✓" disabled={!date}>
          {scheduledFor ? 'Move this job' : 'Put it on the calendar'}
        </SaveButton>
        <small className="workspace-details-copy">
          Running over more than one day? Set an end date in Job details.
        </small>
      </div>
    </>
  );
}
