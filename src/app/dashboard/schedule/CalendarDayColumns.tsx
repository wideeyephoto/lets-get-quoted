'use client';

import type { WeekendDays } from '@/lib/dashboard-views';

/**
 * Saturday and Sunday: the control lives in the views menu, the WARNING lives
 * on its own line under the toolbar.
 *
 * THIS IS THE SECOND MOVE, AND THE FIRST ONE WAS RIGHT ABOUT THE WRONG THING.
 * These two were a gear that opened a popover holding two switches. That was
 * replaced by two chips sitting in the toolbar, on the argument that the fact
 * worth knowing — there is work on a day you cannot see — was two clicks inside
 * the gear. The argument holds. The chips were the wrong shape for it:
 *
 *   - they were 224px of a 728px toolbar, permanently, and that is what pushed
 *     the toolbar onto a second row at every width measured (85px tall at 1920,
 *     1440, 1366 and 1024 alike);
 *   - in a month with no weekend work they read "Saturday 0 / Sunday 0", which
 *     is a control that has taken the loudest position on the row to say
 *     nothing;
 *   - and on a phone they were the ONLY thing left in that toolbar, because the
 *     month nav and the view menu are hidden there — two chips above a day
 *     agenda, switching columns off a grid that is not on the screen.
 *
 * So the fact and the control are split. Hiding a weekend column is something
 * you decide once and then live with, which is a menu row. "Six jobs are booked
 * on a day you cannot see" is not a setting at all, it is news — it gets a line
 * of its own under the toolbar, and only in the months when it is true.
 */

type Item = { key: 'sat' | 'sun'; label: string; on: boolean; count: number };

function items(days: WeekendDays, counts: { sat: number; sun: number }): Item[] {
  return [
    { key: 'sat', label: 'Saturday', on: days.sat, count: counts.sat },
    { key: 'sun', label: 'Sunday', on: days.sun, count: counts.sun },
  ];
}

/** Written out in full — this is a control you read, not a column header. */
function jobsText(count: number) {
  if (count === 0) return 'No jobs this month';
  return `${count} ${count === 1 ? 'job' : 'jobs'} this month`;
}

/**
 * The two switches, as rows in the views menu.
 *
 * Rendered only for the views built out of day COLUMNS (Week and Capacity).
 * Day and Crew day show the single day you picked; the Job list shows days that
 * have work; Projects lays out the whole month; Year has no days at all. In
 * those five the switch was on screen, pressable and inert — which is worse
 * than absent, because pressing a control and watching nothing happen teaches
 * you it is broken everywhere.
 */
export function DayColumnMenuRows({
  days,
  onChange,
  counts,
}: {
  days: WeekendDays;
  onChange: (next: WeekendDays) => void;
  /** Jobs on each weekend day in the month on screen — whether shown or not. */
  counts: { sat: number; sun: number };
}) {
  return (
    <div className="calendar-col-group" role="group" aria-labelledby="calendar-col-heading">
      <p className="calendar-col-heading" id="calendar-col-heading">
        Day columns
      </p>
      {items(days, counts).map((item) => {
        // Hidden with work on it is the one state worth a color of its own.
        // Hidden and empty is just a shorter week, which is what was asked for.
        const hiding = !item.on && item.count > 0;
        return (
          <button
            key={item.key}
            type="button"
            role="menuitemcheckbox"
            aria-checked={item.on}
            className="calendar-view-option calendar-col-option"
            data-hiding={hiding || undefined}
            onClick={() => onChange({ ...days, [item.key]: !item.on })}
          >
            {/* A box that is filled or empty, not a color that is on or off:
                the state has to survive without color vision. */}
            <span className="calendar-col-box" data-on={item.on || undefined} aria-hidden="true">
              {item.on ? '✓' : ''}
            </span>
            <span className="calendar-view-option-text">
              <strong>{item.label}</strong>
              <small>{hiding ? `${item.count} hidden from the calendar` : jobsText(item.count)}</small>
            </span>
            {/* The pressed state is on the button; the consequence is not. A
                screen reader should hear what pressing this does. */}
            <span className="sr-only">{item.on ? 'column shown, press to hide' : 'column hidden, press to show'}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Work booked on a column that is switched off — the one thing the old gear
 * buried, kept on the surface.
 *
 * A LINE UNDER THE TOOLBAR, NOT AN OBJECT IN IT. It went in the toolbar first
 * and did not fit: at 1920 that row is 728px and the nav, this notice and the
 * view controls wanted 1,021 between them, which put the toolbar back on the
 * two rows the rest of this pass had just removed. It also belongs here on its
 * own merits — it is a caption about what the grid is not showing, the same
 * shape as "this window is too narrow for Capacity", and it sits beside it.
 *
 * The fix is in the sentence: reading it and undoing it should not be two
 * different gestures. Nothing renders when nothing is hidden, which is most
 * months.
 */
export function HiddenDaysNotice({
  days,
  onChange,
  counts,
}: {
  days: WeekendDays;
  onChange: (next: WeekendDays) => void;
  counts: { sat: number; sun: number };
}) {
  const hidden = items(days, counts).filter((item) => !item.on && item.count > 0);
  if (hidden.length === 0) return null;

  const restored = { ...days };
  for (const item of hidden) restored[item.key] = true;
  const total = hidden.reduce((sum, item) => sum + item.count, 0);
  const where = hidden.map((item) => `${item.count} on a ${item.label}`).join(' and ');
  const columns = hidden.map((item) => item.label).join(' and ');

  return (
    <p className="calendar-hidden-days">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
        <path d="M12 8.5v4.2M12 16.2v.1" />
        <path d="M10.6 4.3 2.9 18a1.6 1.6 0 0 0 1.4 2.4h15.4a1.6 1.6 0 0 0 1.4-2.4L13.4 4.3a1.6 1.6 0 0 0-2.8 0Z" />
      </svg>
      <span>
        {total === 1 ? '1 job is' : `${total} jobs are`} booked this month on a day the calendar is not showing —{' '}
        {where}.
      </span>
      <button type="button" onClick={() => onChange(restored)}>
        Show {columns}
      </button>
    </p>
  );
}
