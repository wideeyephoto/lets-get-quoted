'use client';

import { useId, useRef, useState } from 'react';
import FloatingPanel from '@/components/floating-panel';

type QuickDateOption = { label: string; value: string };

type ScheduledDatePickerProps = {
  id: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  // Accepted for API compatibility; no longer needed now that the calendar
  // floats in a portal and is never clipped by a scrolling ancestor.
  scrollIntoViewOnOpen?: boolean;
  /** Reported on every change so a parent can drive a dependent field. */
  onChange?: (value: string) => void;
  /** Controlled value. Omit to leave the picker uncontrolled, as it was. */
  value?: string;
  /** Small caption above the chosen date. */
  displayLabel?: string;
  /** Replaces Today / Tomorrow / Next Mon / Next Fri. */
  quickOptions?: QuickDateOption[];
  clearLabel?: string;
  /** Earliest selectable day, as a YYYY-MM-DD key. Earlier days are disabled. */
  min?: string;
};

function dateToKey(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function nextWeekday(date: Date, weekday: number): Date {
  const distance = (weekday + 7 - date.getDay()) % 7 || 7;
  return addDays(date, distance);
}

function dateFromKey(value: string): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function formatDateLabel(value: string): string {
  if (!value) return 'Pick a date';
  const date = dateFromKey(value);
  if (!date) return 'Pick a date';

  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function buildQuickDateOptions(required: boolean) {
  const today = new Date();

  const options = [
    { label: 'Today', value: dateToKey(today) },
    { label: 'Tomorrow', value: dateToKey(addDays(today, 1)) },
    { label: 'Next Mon', value: dateToKey(nextWeekday(today, 1)) },
    { label: 'Next Fri', value: dateToKey(nextWeekday(today, 5)) },
  ];

  return required ? options : [{ label: 'Schedule later', value: '' }, ...options];
}

function buildCalendarCells(monthDate: Date) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<{ day: number; dateKey: string } | null> = [];

  for (let index = 0; index < firstWeekday; index++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push({ day, dateKey: dateToKey(new Date(year, month, day)) });
  while (cells.length % 7 !== 0) cells.push(null);

  return cells;
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

export default function ScheduledDatePicker({
  id,
  name,
  defaultValue = '',
  required = false,
  onChange,
  value,
  displayLabel = 'Date',
  quickOptions,
  clearLabel = 'Clear date',
  min,
}: ScheduledDatePickerProps) {
  const [internalDate, setInternalDate] = useState(defaultValue);
  const selectedDate = value ?? internalDate;
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => dateFromKey(defaultValue) ?? new Date());
  // Not derived from the `id` prop: that one belongs to the hidden input, and
  // the panel needs an id of its own that no caller can collide with.
  const calendarId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const quickDateOptions = quickOptions ?? buildQuickDateOptions(required);
  const calendarCells = buildCalendarCells(visibleMonth);
  const todayKey = dateToKey(new Date());
  const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(visibleMonth);

  function updateSelectedDate(nextValue: string) {
    setInternalDate(nextValue);
    onChange?.(nextValue);
    const nextDate = dateFromKey(nextValue);
    if (nextDate) setVisibleMonth(nextDate);
  }

  return (
    <div className="scheduled-date-picker">
      <div className="modern-date-control">
        <div className="modern-date-display" aria-hidden="true">
          <span>{displayLabel}</span>
          <strong>{formatDateLabel(selectedDate)}</strong>
        </div>
        <input id={id} name={name} type="hidden" value={selectedDate} />
        <div className="modern-date-picker-shell">
          <button
            ref={buttonRef}
            type="button"
            className="modern-date-button"
            aria-label="Choose scheduled date"
            aria-expanded={isCalendarOpen}
            aria-controls={isCalendarOpen ? calendarId : undefined}
            onClick={() => setIsCalendarOpen((current) => !current)}
          >
            {selectedDate ? formatDateLabel(selectedDate) : 'Choose date'}
          </button>
          <FloatingPanel
            id={calendarId}
            role="dialog"
            label="Choose scheduled date"
            anchorRef={buttonRef}
            open={isCalendarOpen}
            onClose={() => setIsCalendarOpen(false)}
            className="modern-calendar-panel"
            width={312}
          >
              <div className="modern-calendar-header">
                <button type="button" aria-label="Previous month" onClick={() => setVisibleMonth((current) => addMonths(current, -1))}>
                  Prev
                </button>
                <strong>{monthLabel}</strong>
                <button type="button" aria-label="Next month" onClick={() => setVisibleMonth((current) => addMonths(current, 1))}>
                  Next
                </button>
              </div>
              <div className="modern-calendar-weekdays" aria-hidden="true">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}
              </div>
              <div className="modern-calendar-grid">
                {calendarCells.map((cell, index) => cell ? (
                  <button
                    key={cell.dateKey}
                    type="button"
                    // Date keys are zero-padded, so a string compare is a date
                    // compare — no parsing, no timezone to get wrong.
                    disabled={Boolean(min) && cell.dateKey < min!}
                    className={[cell.dateKey === selectedDate ? 'selected' : '', cell.dateKey === todayKey ? 'today' : ''].filter(Boolean).join(' ') || undefined}
                    onClick={() => {
                      updateSelectedDate(cell.dateKey);
                      setIsCalendarOpen(false);
                    }}
                  >
                    {cell.day}
                  </button>
                ) : <span key={`empty-${index}`} />)}
              </div>
              {!required ? (
                <button type="button" className="modern-calendar-clear" onClick={() => { updateSelectedDate(''); setIsCalendarOpen(false); }}>
                  {clearLabel}
                </button>
              ) : null}
          </FloatingPanel>
        </div>
        <div className="quick-add-buttons modern-date-chips" aria-label="Quick date choices">
          {quickDateOptions.map((option) => (
            <button
              key={`${option.label}-${option.value}`}
              type="button"
              className={selectedDate === option.value ? 'active' : undefined}
              onClick={() => {
                updateSelectedDate(option.value);
                setIsCalendarOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}