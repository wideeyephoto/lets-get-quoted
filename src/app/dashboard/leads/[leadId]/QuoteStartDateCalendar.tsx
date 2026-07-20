'use client';

import Link from 'next/link';
import { useState, type MouseEvent } from 'react';
import TimeSlotSelect from '@/components/time-slot-select';
import styles from '../leads.module.css';

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

export default function QuoteStartDateCalendar({
  availability,
  windowLabel,
  previousHref,
  nextHref,
  canViewPrevious,
}: {
  availability: AvailabilityDay[];
  windowLabel: string;
  previousHref: string;
  nextHref: string;
  canViewPrevious: boolean;
}) {
  const [selectedOptions, setSelectedOptions] = useState<SelectedOption[]>([]);

  function addOption(event: MouseEvent<HTMLButtonElement>, day: AvailabilityDay) {
    const card = event.currentTarget.closest('[data-start-option-card]');
    if (!card) return;

    const timeInput = card.querySelector(`input[name="quoteSchedulePickerTime-${day.key}"]`) as HTMLInputElement | null;
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

  function clearOptions() {
    setSelectedOptions([]);
  }

  return (
    <div className={styles.quoteStartCalendar}>
      <div className={styles.quoteStartCalendarHeader}>
        <div>
          <strong>30-day start date calendar</strong>
          <p>Pick up to 3 start-day options to include with the quote.</p>
        </div>
        <div className={styles.quoteStartCalendarHeaderMeta}>
          <span>{windowLabel}</span>
          <div className={styles.quoteStartCalendarControls}>
            {canViewPrevious ? <Link className="btn secondary" href={previousHref}>&larr; Previous month</Link> : null}
            <Link className="btn secondary" href={nextHref}>Next month &rarr;</Link>
          </div>
        </div>
      </div>

      <div className={styles.quoteStartCalendarGrid}>
        {availability.map((day) => {
          const isSelected = selectedOptions.some((option) => option.date === day.key);
          const hasSelectionRoom = selectedOptions.length < 3 || isSelected;

          return (
            <div
              className={`${styles.quoteStartDay}${day.busy ? ` ${styles.busyQuoteStartDay}` : ''}${day.isToday ? ` ${styles.todayQuoteStartDay}` : ''}${isSelected ? ` ${styles.selectedQuoteStartDay}` : ''}`}
              data-start-option-card
              key={day.key}
            >
              <div className={styles.quoteStartDayHeader}>
                <strong>{day.label}</strong>
                {day.busy ? <span className={`${styles.quoteStartStatus} ${styles.busyQuoteStartStatus}`}>{day.summary}</span> : null}
              </div>
              {day.busy ? <small className={styles.quoteStartDetail}>{day.detail}</small> : null}
              {day.jobHints.length > 0 ? (
                <div className={styles.quoteStartHintRow}>
                  {day.jobHints.map((hint) => (
                    <span className={styles.quoteStartCityChip} key={hint.id} title={`${hint.clientName} at ${hint.time}`}>
                      {hint.city}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className={styles.quoteStartDayActions}>
                <TimeSlotSelect id={`quoteSchedulePickerTime-${day.key}`} name={`quoteSchedulePickerTime-${day.key}`} defaultValue="09:00" />
                <button type="button" className={`btn secondary ${styles.quoteStartAddButton}`} disabled={!hasSelectionRoom} onClick={(event) => addOption(event, day)}>
                  {isSelected ? 'Update option' : 'Add option'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.quoteStartSelectionTray}>
        <div className={styles.calendarSelectionHeader}>
          <div className={styles.calendarSelectionTitle}>
            <strong>Selected start options</strong>
            <span>These will be included when you send the quote.</span>
          </div>
          <span>{selectedOptions.length}/3 selected</span>
        </div>
        <div className={styles.selectedOptionList}>
          {[0, 1, 2].map((index) => {
            const option = selectedOptions[index];
            return (
              <div className={`${styles.selectedOptionCard}${option ? ` ${styles.selectedOptionFilled}` : ''}`} key={`quote-start-option-${index + 1}`}>
                <span className={styles.selectedOptionTag}>Option {index + 1}</span>
                {option ? (
                  <>
                    <div className={styles.selectedOptionMeta}>
                      <strong>{option.label}</strong>
                      <small>{option.time}</small>
                    </div>
                    <button type="button" className={styles.removeOptionButton} onClick={() => removeOption(option.date)} aria-label={`Remove quote start option ${index + 1}`}>
                      x
                    </button>
                    <input type="hidden" name={`quoteScheduleDate${index + 1}`} value={option.date} />
                    <input type="hidden" name={`quoteScheduleTime${index + 1}`} value={option.time} />
                  </>
                ) : (
                  <small className={styles.emptyOptionCopy}>Pick from the 30-day calendar</small>
                )}
              </div>
            );
          })}
        </div>
        <div className={styles.quoteStartSelectionFooter}>
          <label className={`sms-consent-check ${styles.calendarConsentCheck}`}>
            <input name="quoteScheduleSmsConsent" type="checkbox" />
            <span>The client agreed to receive transactional scheduling texts. Required when sending quick booking options without the quote text flow. Reply STOP to opt out.</span>
          </label>
          <div className={styles.quoteStartFooterActions}>
            <p className={styles.calendarSelectionHint}>{selectedOptions.length > 0 ? `${selectedOptions.length} start option${selectedOptions.length === 1 ? '' : 's'} will be included with the quote.` : 'Select up to 3 start options from the 30-day calendar.'}</p>
            <button type="button" className="btn ghost" onClick={clearOptions} disabled={selectedOptions.length === 0}>Clear</button>
          </div>
        </div>
      </div>
    </div>
  );
}