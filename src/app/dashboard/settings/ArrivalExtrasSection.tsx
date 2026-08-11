'use client';

import SaveButton from '@/components/save-button';
import { updateArrivalExtrasAction } from './actions';

/**
 * The two optional arrival behaviors, kept off the main card.
 *
 * Neither is part of "tell the customer when you're coming". A morning text to
 * today's customers is a scheduled send with its own timing; clocking drive
 * time is job costing that changes margins. Beside the window width they made a
 * one-decision screen look like a six-decision one.
 */
export default function ArrivalExtrasSection({
  morningConfirmation,
  clockTravel,
  timeClockOn,
}: {
  morningConfirmation: boolean;
  clockTravel: boolean;
  timeClockOn: boolean;
}) {
  return (
    <form action={updateArrivalExtrasAction} className="form-grid compact-form">
      <fieldset className="field full crew-permissions">
        <legend>Optional arrival automations</legend>
        <label className="checkbox-row" htmlFor="morningConfirmation">
          <input id="morningConfirmation" name="morningConfirmation" type="checkbox" defaultChecked={morningConfirmation} />
          <span>
            <strong>Text today&rsquo;s customers their window each morning.</strong> Sent around 7am, before anyone
            sets off &mdash; and skipped for anyone your crew has already messaged. Different from the day-before
            appointment reminder: this one gives a time, not just a date.
          </span>
        </label>
        <label className="checkbox-row" htmlFor="clockTravel">
          <input id="clockTravel" name="clockTravel" type="checkbox" defaultChecked={clockTravel} />
          <span>
            <strong>Clock drive time from &ldquo;on my way&rdquo; to &ldquo;arrived&rdquo;.</strong> Logs it against
            the job under <em>Travel</em>, kept separate from time spent on the work.{' '}
            {timeClockOn
              ? 'This adds real cost to jobs, so your margins will drop by whatever the driving actually costs you.'
              : 'Your time clock is currently off — turn it on under Crew & Labor first, or this does nothing.'}
          </span>
        </label>
      </fieldset>

      <div className="form-actions">
        <SaveButton>Save optional automations</SaveButton>
      </div>
    </form>
  );
}
