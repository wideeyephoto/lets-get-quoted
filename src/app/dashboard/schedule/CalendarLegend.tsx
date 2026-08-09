'use client';

/**
 * What the colours on the calendar mean.
 *
 * THEY DID NOT MEAN ANYTHING. Every block took its colour from a six-way hash
 * of the job's id — `(sum of char codes) % 6` — so a day showed blue, yellow,
 * purple and green blocks that encoded nothing at all. A legend for that would
 * have been a legend for randomness, so the colour moved to STATUS first and
 * this names the four it can be.
 *
 * The id hash was not useless: it told two abutting blocks apart. That job is
 * now done by the hairline between them, which is what a separator is for.
 *
 * Not a filter. A legend that also filters is a control disguised as a caption,
 * and hiding a status is exactly how a dispatcher loses a job they needed to
 * see. The weekend chips beside it hide COLUMNS and say so out loud, with the
 * count of what is behind them; a status filter can make no such promise.
 */

const STATUSES = [
  { key: 'new_lead', label: 'Quote not approved' },
  { key: 'in_progress', label: 'Booked' },
  { key: 'complete', label: 'Complete' },
  { key: 'archived', label: 'Archived' },
] as const;

/**
 * Month is a different question, so it gets a different caption.
 *
 * The status colours above are what a BLOCK is in Day and Week. A month cell
 * has no blocks in it — it is one bar answering "how full is this day" — and
 * showing the status key over a grid that uses none of it is a legend for
 * colours that are not on screen. Rendering both at once would be two captions
 * for one grid, so the view picks.
 */
const CAPACITY = [
  { key: 'open', label: 'Open' },
  { key: 'light', label: 'Up to half full' },
  { key: 'busy', label: 'Half to full' },
  { key: 'full', label: 'Full' },
  { key: 'over', label: 'Overbooked' },
] as const;

export default function CalendarLegend({ variant = 'status' }: { variant?: 'status' | 'capacity' }) {
  if (variant === 'capacity') {
    return (
      <div className="calendar-legend" role="group" aria-label="What the day colours mean">
        {CAPACITY.map((band) => (
          <span className="calendar-legend-item" key={band.key}>
            <span className="calendar-legend-dot" data-load={band.key} aria-hidden="true" />
            {band.label}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="calendar-legend" role="group" aria-label="What the calendar colours mean">
      {STATUSES.map((status) => (
        <span className="calendar-legend-item" key={status.key}>
          <span className={`calendar-legend-dot calendar-job-status-${status.key}`} aria-hidden="true" />
          {status.label}
        </span>
      ))}
      <span className="calendar-legend-item">
        <span className="calendar-legend-dot calendar-legend-dot-planned" aria-hidden="true" />
        Recurring, not booked yet
      </span>
    </div>
  );
}
