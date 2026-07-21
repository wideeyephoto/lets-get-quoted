'use client';

import { useRef, useState } from 'react';
import FloatingPanel from '@/components/floating-panel';

type TimeSlotSelectProps = {
  id: string;
  name: string;
  defaultValue?: string;
  // Accepted for API compatibility; no longer needed now that the panel floats
  // in a portal and is never clipped by a scrolling ancestor.
  scrollIntoViewOnOpen?: boolean;
};

const QUICK_TIME_SLOTS = [
  { label: '7:00 AM', value: '07:00' },
  { label: '8:00 AM', value: '08:00' },
  { label: '9:00 AM', value: '09:00' },
  { label: '12:00 PM', value: '12:00' },
  { label: '1:00 PM', value: '13:00' },
];

function formatTimeLabel(value: string): string {
  const [hourText, minute] = value.split(':');
  const hour = Number(hourText);
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${minute} ${period}`;
}

function buildTimeSlots() {
  const slots: Array<{ label: string; value: string }> = [];

  for (let minutes = 6 * 60; minutes <= 19 * 60; minutes += 15) {
    const hour = Math.floor(minutes / 60).toString().padStart(2, '0');
    const minute = (minutes % 60).toString().padStart(2, '0');
    const value = `${hour}:${minute}`;

    slots.push({ label: formatTimeLabel(value), value });
  }

  return slots;
}

export default function TimeSlotSelect({ id, name, defaultValue = '' }: TimeSlotSelectProps) {
  const [selectedTime, setSelectedTime] = useState(defaultValue);
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const timeSlots = buildTimeSlots();
  const selectedLabel = selectedTime ? formatTimeLabel(selectedTime) : 'No set time';

  function selectTime(value: string) {
    setSelectedTime(value);
    setIsOpen(false);
  }

  return (
    <div className="modern-time-picker">
      <input id={id} name={name} type="hidden" value={selectedTime} readOnly />
      <button
        ref={buttonRef}
        type="button"
        className="modern-time-button"
        aria-label="Choose scheduled time"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        {selectedLabel}
      </button>
      <FloatingPanel anchorRef={buttonRef} open={isOpen} onClose={() => setIsOpen(false)} className="modern-time-panel" width={224}>
        <div className="modern-time-quick" aria-label="Quick time choices">
          {QUICK_TIME_SLOTS.map((slot) => (
            <button
              key={slot.value}
              type="button"
              className={selectedTime === slot.value ? 'active' : undefined}
              onClick={() => selectTime(slot.value)}
            >
              {slot.label}
            </button>
          ))}
        </div>
        <div className="modern-time-list" aria-label="All time choices">
          <button type="button" className={!selectedTime ? 'active' : undefined} onClick={() => selectTime('')}>
            No set time
          </button>
          {timeSlots.map((slot) => (
            <button
              key={slot.value}
              type="button"
              className={selectedTime === slot.value ? 'active' : undefined}
              onClick={() => selectTime(slot.value)}
            >
              {slot.label}
            </button>
          ))}
        </div>
      </FloatingPanel>
    </div>
  );
}