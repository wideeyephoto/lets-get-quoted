'use client';

import { useEffect, useState } from 'react';

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
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function buildDateOptions() {
  const today = new Date();
  const options: Array<{ label: string; value: string }> = [];

  for (let dayOffset = 0; dayOffset <= 45; dayOffset += 1) {
    const value = dateToKey(addDays(today, dayOffset));
    const prefix = dayOffset === 0 ? 'Today' : dayOffset === 1 ? 'Tomorrow' : formatDateLabel(value);
    options.push({ label: prefix, value });
  }

  return options;
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
  const [dateOptions, setDateOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [quickDateOptions, setQuickDateOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [selectedDate, setSelectedDate] = useState(defaultValue);
  const selectedDateIsListed = !selectedDate || dateOptions.some((option) => option.value === selectedDate);

  useEffect(() => {
    setDateOptions(buildDateOptions());
    setQuickDateOptions(buildQuickDateOptions());
  }, []);

  function updateSelectedDate(value: string) {
    setSelectedDate(value);
  }

  return (
    <div className="scheduled-date-picker">
      <select id={id} name={name} value={selectedDate} onChange={(event) => updateSelectedDate(event.currentTarget.value)}>
        <option value="">Not scheduled</option>
        {!selectedDateIsListed ? <option value={selectedDate}>Custom: {formatDateLabel(selectedDate)}</option> : null}
        {dateOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <div className="quick-add-buttons" aria-label="Quick add:">
        <span>Quick add:</span>
        {quickDateOptions.map((option) => (
          <button key={`${option.label}-${option.value}`} type="button" onClick={() => updateSelectedDate(option.value)}>
            {option.label}
          </button>
        ))}
      </div>
      <input
        aria-label="Custom scheduled date"
        type="date"
        value={selectedDate}
        onChange={(event) => updateSelectedDate(event.currentTarget.value)}
      />
    </div>
  );
}