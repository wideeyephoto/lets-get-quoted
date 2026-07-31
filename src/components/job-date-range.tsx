'use client';

import { useState } from 'react';
import ScheduledDatePicker from '@/components/scheduled-date-picker';

// Date keys are YYYY-MM-DD and zero-padded, so string compare IS date compare.
// Kept local rather than imported from lib/jobs so this stays out of the
// server module's dependency graph.
function addDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function spanDays(start: string, end: string): number {
  if (!start || !end) return 1;
  const from = new Date(`${start}T00:00:00`).getTime();
  const to = new Date(`${end}T00:00:00`).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return 1;
  return Math.max(1, Math.round((to - from) / 86_400_000) + 1);
}

function label(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

type Props = {
  startName: string;
  endName: string;
  startDefault: string;
  endDefault: string;
};

/**
 * The start and end of a job, as one control.
 *
 * These two dates are the ONLY thing that decides how many days a job takes up
 * on the calendar. It used to be worked out from the job's estimated hours
 * divided by the account's daily capacity, which meant editing one number in
 * settings silently redrew every job.
 *
 * One component owns both so the day-count chips always know the real start —
 * including a start the owner is changing in this same edit — and so an end
 * date can never be left stranded behind its start.
 */
export default function JobDateRange({ startName, endName, startDefault, endDefault }: Props) {
  const [start, setStart] = useState(startDefault);
  const [end, setEnd] = useState(endDefault);

  // Derived, not stored in an effect: an end date is meaningless without a
  // start, and one that lands before the start would draw the job backwards.
  const effectiveEnd = start && end && end >= start ? end : '';
  const days = effectiveEnd ? spanDays(start, effectiveEnd) : 1;

  function onStartChange(next: string) {
    setStart(next);
    // Keep the length when the job is moved, the same way dragging it on the
    // calendar does — a rescheduled 3-day job is still 3 days.
    if (next && effectiveEnd && days > 1) setEnd(addDays(next, days - 1));
    else if (!next) setEnd('');
  }

  const dayChips = start
    ? [1, 2, 3, 4, 5].map((n) => ({
        label: n === 1 ? 'Single day' : `${n} days`,
        value: n === 1 ? '' : addDays(start, n - 1),
      }))
    : [];

  return (
    <div className="job-date-range">
      <div className="field">
        <label htmlFor={startName}>Scheduled for</label>
        <ScheduledDatePicker id={startName} name={startName} value={start} defaultValue={startDefault} onChange={onStartChange} />
      </div>

      <div className="field">
        <label htmlFor={endName}>Runs through</label>
        <ScheduledDatePicker
          id={endName}
          name={endName}
          value={effectiveEnd}
          defaultValue={endDefault}
          onChange={setEnd}
          displayLabel="Last day"
          clearLabel="Single day only"
          min={start || undefined}
          quickOptions={dayChips}
        />
        <p className="job-meta">
          {!start
            ? 'Pick a start date first. Leave this empty for a one-day job.'
            : effectiveEnd
              ? `Blocks ${days} days on the calendar — ${label(start)} through ${label(effectiveEnd)}.`
              : `Blocks one day — ${label(start)}. Set a last day for work that runs longer.`}
        </p>
      </div>
    </div>
  );
}
