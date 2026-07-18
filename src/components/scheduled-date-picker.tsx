'use client';

import { useState } from 'react';

type ScheduledDatePickerProps = {
  id: string;
  name: string;
  defaultValue?: string;
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

function formatDateLabel(value: string): string {
  if (!value) return 'Pick a date';
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function buildQuickDateOptions() {
  const today = new Date();

  return [
    { label: 'No day', value: '' },
    { label: 'Today', value: dateToKey(today) },
    { label: 'Tomorrow', value: dateToKey(addDays(today, 1)) },
    { label: 'Next Mon', value: dateToKey(nextWeekday(today, 1)) },
    { label: 'Next Fri', value: dateToKey(nextWeekday(today, 5)) },
  ];
}

export default function ScheduledDatePicker({ id, name, defaultValue = '' }: ScheduledDatePickerProps) {
  const [selectedDate, setSelectedDate] = useState(defaultValue);
  const quickDateOptions = buildQuickDateOptions();

  function updateSelectedDate(value: string) {
    setSelectedDate(value);
  }

  return (
    <div className="scheduled-date-picker">
      <div className="modern-date-control">
        <div className="modern-date-display" aria-hidden="true">
          <span>Date</span>
          <strong>{formatDateLabel(selectedDate)}</strong>
        </div>
        <input
          id={id}
          name={name}
          aria-label="Scheduled date"
          type="date"
          value={selectedDate}
          onChange={(event) => updateSelectedDate(event.currentTarget.value)}
        />
      </div>
      <div className="quick-add-buttons modern-date-chips" aria-label="Quick date choices">
        {quickDateOptions.map((option) => (
          <button
            key={`${option.label}-${option.value}`}
            type="button"
            className={selectedDate === option.value ? 'active' : undefined}
            onClick={() => updateSelectedDate(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}