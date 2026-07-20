'use client';

import { useState, type MouseEvent } from 'react';
import TimeSlotSelect from '@/components/time-slot-select';

type AvailabilityHint = {
  id: string;
  clientName: string;
  time: string;
  city: string;
};

type AvailabilityDay = {
  key: string;
  label: string;
  summary: string;
  detail: string;
  busy: boolean;
  isToday: boolean;
  jobHints: AvailabilityHint[];
};

type SelectedOption = {
  date: string;
  label: string;
  time: string;
};

export default function ClientScheduleOptionsCalendar({ availability }: { availability: AvailabilityDay[] }) {
  const [selectedOptions, setSelectedOptions] = useState<SelectedOption[]>([]);

  function addOption(event: MouseEvent<HTMLButtonElement>, day: AvailabilityDay) {
    const card = event.currentTarget.closest('[data-client-schedule-option-card]');
    if (!card) return;

    const timeInput = card.querySelector(`input[name="schedulePickerTime-${day.key}"]`) as HTMLInputElement | null;
    const time = timeInput?.value || '09:00';

    setSelectedOptions((current) => {
      const existingIndex = current.findIndex((option) => option.date === day.key);
      const nextOption = { date: day.key, label: day.label, time };

      if (existingIndex >= 0) {
        return current.map((option, index) => (index === existingIndex ? nextOption : option));
      }

      if (current.length >= 3) return current;
      return [...current, nextOption];
    });
  }

  function removeOption(date: string) {
    setSelectedOptions((current) => current.filter((option) => option.date !== date));
  }

  return (
    <div className="client-schedule-calendar">
      <div className="client-schedule-calendar-grid">
        {availability.map((day) => {
          const isSelected = selectedOptions.some((option) => option.date === day.key);
          const hasSelectionRoom = selectedOptions.length < 3 || isSelected;

          return (
            <div
              className={`client-schedule-day${day.busy ? ' busy' : ''}${day.isToday ? ' today' : ''}${isSelected ? ' selected' : ''}`}
              data-client-schedule-option-card
              key={day.key}
            >
              <div className="client-schedule-day-header">
                <strong>{day.label}</strong>
                {day.busy ? <span>{day.summary}</span> : null}
              </div>
              {day.busy ? <small className="client-schedule-day-detail">{day.detail}</small> : null}
              {day.jobHints.length > 0 ? (
                <div className="client-schedule-city-row">
                  {day.jobHints.map((hint) => (
                    <span className="client-schedule-city-pill" key={hint.id} title={`${hint.clientName} at ${hint.time}`}>
                      {hint.city}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="client-schedule-day-actions">
                <TimeSlotSelect id={`schedulePickerTime-${day.key}`} name={`schedulePickerTime-${day.key}`} defaultValue="09:00" />
                <button type="button" className="btn secondary client-schedule-add-button" disabled={!hasSelectionRoom} onClick={(event) => addOption(event, day)}>
                  {isSelected ? 'Update option' : 'Add option'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="client-schedule-selection-tray">
        <div className="client-schedule-selection-header">
          <div>
            <strong>Selected schedule options</strong>
            <span>Choose exactly 3 dates to text the client.</span>
          </div>
          <span>{selectedOptions.length}/3 selected</span>
        </div>
        <div className="client-schedule-selected-list">
          {[0, 1, 2].map((index) => {
            const option = selectedOptions[index];
            return (
              <div className={`client-schedule-selected-card${option ? ' filled' : ''}`} key={`schedule-option-${index + 1}`}>
                <span className="client-schedule-selected-tag">Option {index + 1}</span>
                {option ? (
                  <>
                    <div className="client-schedule-selected-meta">
                      <strong>{option.label}</strong>
                      <small>{option.time}</small>
                    </div>
                    <button type="button" className="client-schedule-remove-button" onClick={() => removeOption(option.date)} aria-label={`Remove schedule option ${index + 1}`}>
                      x
                    </button>
                    <input type="hidden" name={`scheduleDate${index + 1}`} value={option.date} />
                    <input type="hidden" name={`scheduleTime${index + 1}`} value={option.time} />
                  </>
                ) : (
                  <small>Pick from the calendar</small>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
