'use client';

import { useEffect, useRef, useState } from 'react';
import type { WeekendDays } from '@/lib/dashboard-views';

// Weekend-column toggles, tucked into a gear at the calendar's bottom-right so
// they're there when wanted and invisible the rest of the time. Closes on
// outside-click / Escape, like the map's view gear.
export default function CalendarDaysGear({
  days,
  onChange,
  hiddenJobCount = 0,
}: {
  days: WeekendDays;
  onChange: (next: WeekendDays) => void;
  /** Jobs booked on the hidden columns in the month on screen. */
  hiddenJobCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const hiddenCount = (days.sat ? 0 : 1) + (days.sun ? 0 : 1);

  return (
    <div className="calendar-days-gear" ref={ref}>
      <button
        type="button"
        className="calendar-days-gear-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Show or hide weekend columns"
        onClick={() => setOpen((o) => !o)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
        <span className="sr-only">Days shown</span>
        {/* Says why the week looks short, without needing the menu opened. */}
        {hiddenCount > 0 && <span className="calendar-days-gear-count">{7 - hiddenCount}</span>}
        {hiddenJobCount > 0 && (
          <span className="calendar-days-gear-warn" title={`${hiddenJobCount} scheduled ${hiddenJobCount === 1 ? 'job is' : 'jobs are'} on a hidden day`}>!</span>
        )}
      </button>

      {open && (
        <div className="calendar-days-pop" role="menu">
          <p>Days shown</p>
          <label className="calendar-days-toggle">
            <input
              type="checkbox"
              checked={days.sun}
              onChange={(e) => onChange({ ...days, sun: e.target.checked })}
            />
            <span className="calendar-days-track" aria-hidden="true"><span /></span>
            <span className="calendar-days-copy">
              <strong>Sundays</strong>
              <small>Show the Sunday column</small>
            </span>
          </label>
          <label className="calendar-days-toggle">
            <input
              type="checkbox"
              checked={days.sat}
              onChange={(e) => onChange({ ...days, sat: e.target.checked })}
            />
            <span className="calendar-days-track" aria-hidden="true"><span /></span>
            <span className="calendar-days-copy">
              <strong>Saturdays</strong>
              <small>Show the Saturday column</small>
            </span>
          </label>
          {hiddenJobCount > 0 ? (
            <p className="calendar-days-note warn">
              {hiddenJobCount} scheduled {hiddenJobCount === 1 ? 'job is' : 'jobs are'} on a hidden day this
              month, so {hiddenJobCount === 1 ? "it isn't" : "they aren't"} on the calendar right now.
            </p>
          ) : (
            <p className="calendar-days-note">
              Hiding a day only changes this calendar. Jobs already booked on it stay booked.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
