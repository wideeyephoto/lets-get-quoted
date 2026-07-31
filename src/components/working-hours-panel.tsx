import SaveButton from '@/components/save-button';
import { formatTimeLabel, parseTimeMinutes } from '@/lib/route-plan';
import { updateScheduleDayHoursAction } from '@/app/dashboard/settings/actions';

// Working hours & capacity, where they're actually used.
//
// These four numbers decide when a day is full, what online booking offers, and
// where every arrival time on the plan page lands — so they lived two clicks
// deep in Settings, on a page nobody visits while looking at a schedule that
// doesn't fit. Now they sit under the thing they govern.
//
// Condensed on purpose: the summary line states the current settings, so the
// common case (checking what they are) costs no clicks and no page load, and
// only changing them opens anything. No JS — <details> does it.

function timeLabel(value: string | null | undefined, fallback: string): string {
  const minutes = parseTimeMinutes(value ?? fallback);
  return minutes == null ? fallback : formatTimeLabel(minutes);
}

export default function WorkingHoursPanel({
  scheduleDayHours,
  jobBufferMinutes,
  workdayStart,
  workdayEnd,
}: {
  scheduleDayHours: number;
  jobBufferMinutes: number;
  workdayStart: string | null;
  workdayEnd: string | null;
}) {
  const start = timeLabel(workdayStart, '08:00');
  const end = timeLabel(workdayEnd, '17:00');
  // "0 min buffer" is a number pretending to be a setting.
  const buffer = jobBufferMinutes > 0 ? `${jobBufferMinutes} min between jobs` : 'no buffer between jobs';

  return (
    <details className="panel workhours-panel">
      <summary>
        <span className="workhours-summary">
          <strong>Working hours &amp; capacity</strong>
          <small>
            {start} – {end} · {scheduleDayHours} hr day · {buffer}
          </small>
        </span>
        <span className="workhours-open" aria-hidden="true">Edit</span>
      </summary>

      <p className="workhours-lead">
        These decide when a day is <strong>full</strong> and what your online booking offers. Once a day&apos;s booked
        hours reach your daily capacity, that day stops offering slots — and booking only offers arrival windows inside
        your working hours. The buffer is added to each job so back-to-back visits leave travel time. How many days a job
        takes is set on the job itself, under <strong>Scheduled for</strong> and <strong>Runs through</strong>.
      </p>

      <form action={updateScheduleDayHoursAction} className="workhours-grid">
        <div className="field">
          <label htmlFor="wh-capacity">Daily capacity (hours)</label>
          <input id="wh-capacity" name="scheduleDayHours" type="number" min="1" max="24" step="0.25" defaultValue={scheduleDayHours} required />
          <small className="field-hint">A day fills up (and blocks new bookings) once scheduled hours reach this.</small>
        </div>
        <div className="field">
          <label htmlFor="wh-buffer">Buffer between jobs (minutes)</label>
          <input id="wh-buffer" name="jobBufferMinutes" type="number" min="0" max="240" step="5" defaultValue={jobBufferMinutes} />
          <small className="field-hint">Travel/lunch time counted against capacity for each job.</small>
        </div>
        <div className="field">
          <label htmlFor="wh-start">Workday starts</label>
          <input id="wh-start" name="workdayStart" type="time" defaultValue={String(workdayStart ?? '08:00').slice(0, 5)} />
        </div>
        <div className="field">
          <label htmlFor="wh-end">Workday ends</label>
          <input id="wh-end" name="workdayEnd" type="time" defaultValue={String(workdayEnd ?? '17:00').slice(0, 5)} />
        </div>
        <div className="form-actions">
          <SaveButton>Save working hours</SaveButton>
        </div>
      </form>
    </details>
  );
}
