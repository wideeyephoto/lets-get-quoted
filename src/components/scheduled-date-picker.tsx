'use client';

import { useRef, useState } from 'react';

type ScheduledDatePickerProps = {
  id: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  scrollIntoViewOnOpen?: boolean;
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

export default function ScheduledDatePicker({ id, name, defaultValue = '', required = false, scrollIntoViewOnOpen = false }: ScheduledDatePickerProps) {
  const [selectedDate, setSelectedDate] = useState(defaultValue);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => dateFromKey(defaultValue) ?? new Date());
  const pickerRef = useRef<HTMLDivElement>(null);
  const quickDateOptions = buildQuickDateOptions(required);
  const calendarCells = buildCalendarCells(visibleMonth);
  const todayKey = dateToKey(new Date());
  const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(visibleMonth);

  function updateSelectedDate(value: string) {
    setSelectedDate(value);
    const nextDate = dateFromKey(value);
    if (nextDate) setVisibleMonth(nextDate);
  }

  function toggleCalendar() {
    setIsCalendarOpen((current) => {
      const nextIsOpen = !current;
      if (nextIsOpen && scrollIntoViewOnOpen) {
        requestAnimationFrame(() => {
          pickerRef.current?.scrollIntoView({ block: 'start', inline: 'nearest' });
        });
      }
      return nextIsOpen;
    });
  }

  return (
    <div className="scheduled-date-picker" ref={pickerRef}>
      <div className="modern-date-control">
        <div className="modern-date-display" aria-hidden="true">
          <span>Date</span>
          <strong>{formatDateLabel(selectedDate)}</strong>
        </div>
        <input id={id} name={name} type="hidden" value={selectedDate} />
        <div className="modern-date-picker-shell">
          <button
            type="button"
            className="modern-date-button"
            aria-label="Choose scheduled date"
            aria-expanded={isCalendarOpen}
            onClick={toggleCalendar}
          >
            {selectedDate ? formatDateLabel(selectedDate) : 'Choose date'}
          </button>
          {isCalendarOpen ? (
            <div className="modern-calendar-panel">
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
                  Clear date
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
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
  );
}