'use client';

import type { WeekendDays } from '@/lib/dashboard-views';

// Saturday and Sunday, as two chips at the calendar's bottom-right.
//
// This replaced a gear that opened a popover holding two switches. The gear had
// to be found, opened and read before it could tell you anything, and the one
// fact that actually matters — there is work on a day you cannot see — was two
// clicks inside it. As chips, the count IS the control: "Sat 6" struck through
// says six Saturday jobs are off the calendar, and clicking it puts them back.
//
// Modelled on the map legend rather than sharing its classes. Same idea (a pill
// you click to show or hide a slice of what is drawn, carrying its own count),
// but the legend's rules are the map's and carry its pin colors, which would
// mean nothing here.

export default function CalendarWeekendToggles({
  days,
  onChange,
  counts,
}: {
  days: WeekendDays;
  onChange: (next: WeekendDays) => void;
  /** Jobs on each weekend day in the month on screen — whether shown or not. */
  counts: { sat: number; sun: number };
}) {
  // Written out in full. "Sat 6" is two abbreviations deep — a shortened day
  // next to a bare number — and this is a control you press, not a column
  // header fighting for width.
  const items = [
    { key: 'sat' as const, label: 'Saturday', on: days.sat, count: counts.sat },
    { key: 'sun' as const, label: 'Sunday', on: days.sun, count: counts.sun },
  ];

  return (
    <div className="calendar-days-chips" role="group" aria-label="Weekend columns">
      {items.map((item) => {
        // A hidden day with work on it is the only state worth a warning color.
        // Hidden and empty is just a shorter week, which is what was asked for.
        const hiding = !item.on && item.count > 0;
        return (
          <button
            key={item.key}
            type="button"
            className="calendar-days-chip"
            // Each weekend day gets its own shade so the pair reads as two
            // things at a glance, before either word is read.
            data-day={item.key}
            aria-pressed={item.on}
            data-off={!item.on || undefined}
            data-hiding={hiding || undefined}
            title={
              item.on
                ? `${item.count} ${item.count === 1 ? 'job' : 'jobs'} on a ${item.label} this month. Click to hide the ${item.label} column — jobs already booked stay booked.`
                : hiding
                  ? `${item.count} scheduled ${item.count === 1 ? 'job is' : 'jobs are'} on a ${item.label} this month and not on the calendar. Click to show the column.`
                  : `The ${item.label} column is hidden. Click to show it.`
            }
            onClick={() => onChange({ ...days, [item.key]: !item.on })}
          >
            <span className="calendar-days-chip-dot" aria-hidden="true" />
            {/* The word carries the strike-through when the column is off; the
                count never does. It needs its own class to be targeted, because
                a strike set on the BUTTON is drawn across every descendant and
                a child cannot take it back off — `text-decoration: none` on the
                count is silently ignored. */}
            <span className="calendar-days-chip-label">{item.label}</span>
            <b>{item.count}</b>
            {/* The pressed state is on the button, but the consequence is not:
                a screen reader should hear what clicking does, not just "on". */}
            <span className="sr-only">
              {item.on ? '— column shown, click to hide' : '— column hidden, click to show'}
            </span>
          </button>
        );
      })}
    </div>
  );
}
