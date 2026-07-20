'use client';

import Link from 'next/link';
import { useState, type MouseEvent } from 'react';
import { useFormStatus } from 'react-dom';
import TimeSlotSelect from '@/components/time-slot-select';
import styles from '../leads.module.css';

type FormAction = (formData: FormData) => void | Promise<void>;
type VoidAction = () => void | Promise<void>;

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
  bookingLabel: string;
  busy: boolean;
  isToday: boolean;
  jobHints: AvailabilityHint[];
};

type SelectedOption = {
  date: string;
  label: string;
  time: string;
};

type VisitSummary = {
  label: string;
  detail: string;
};

type Props = {
  availability: AvailabilityDay[];
  leadPhone: string;
  previousHref: string;
  nextHref: string;
  canViewPrevious: boolean;
  scheduleVisitAction: FormAction;
  sendQuoteVisitOptionsAction: FormAction;
  clearVisitAction: VoidAction;
  visitSummary: VisitSummary | null;
};

function CalendarSendButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  const isDisabled = disabled || pending;

  return (
    <button type="submit" className="btn primary" disabled={isDisabled} aria-busy={pending}>
      {pending ? 'Sending dates…' : 'Send Dates to Client'}
    </button>
  );
}

export default function LeadAvailabilityScheduler({
  availability,
  leadPhone,
  previousHref,
  nextHref,
  canViewPrevious,
  scheduleVisitAction,
  sendQuoteVisitOptionsAction,
  clearVisitAction,
  visitSummary,
}: Props) {
  const [selectedOptions, setSelectedOptions] = useState<SelectedOption[]>([]);

  function addClientOption(event: MouseEvent<HTMLButtonElement>, day: AvailabilityDay) {
    const form = event.currentTarget.form;
    if (!form) return;

    const formData = new FormData(form);
    const time = String(formData.get('quoteVisitTime') || '09:00');

    setSelectedOptions((current) => {
      const existingIndex = current.findIndex((option) => option.date === day.key);
      const nextOption = { date: day.key, label: day.label, time };

      if (existingIndex >= 0) {
        return current.map((option, index) => (index === existingIndex ? nextOption : option));
      }

      if (current.length >= 3) {
        return current;
      }

      return [...current, nextOption];
    });
  }

  function removeClientOption(date: string) {
    setSelectedOptions((current) => current.filter((option) => option.date !== date));
  }

  function clearClientOptions() {
    setSelectedOptions([]);
  }

  return (
    <section id="availability-snapshot" className={`panel workspace-section-card ${styles.calendarCard}`}>
      <div className={styles.calendarSurfaceHeader}>
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Calendar</p>
          <h2>Availability snapshot</h2>
        </div>
        <span className="workspace-details-copy">Book the quote now or build 3 times for the client from the same calendar.</span>
      </div>

      {visitSummary ? (
        <div className={styles.calendarUtilityRow}>
          <div className={styles.scheduledVisitSummary}>
            <strong>Scheduled</strong>
            <span>{visitSummary.label}</span>
            <small>{visitSummary.detail}</small>
          </div>
          <form action={clearVisitAction} className={styles.rescheduleLaterForm}>
            <button type="submit" className="btn ghost">Reschedule later</button>
          </form>
        </div>
      ) : null}

      <div className={styles.availabilityHeader}>
        <div>
          <p className={styles.calendarHint}>Pick a day and adjust the visit time before booking. Use Add for client to build 3 options below.</p>
          <strong>{availability[0]?.label} - {availability[availability.length - 1]?.label}</strong>
        </div>
        <div className={styles.availabilityControls}>
          {canViewPrevious ? <Link className="btn secondary" href={previousHref}>&larr; Previous week</Link> : null}
          <Link className="btn secondary" href={nextHref}>Next week &rarr;</Link>
        </div>
      </div>

      <div className={styles.availabilityGrid}>
        {availability.map((day) => {
          const isSelected = selectedOptions.some((option) => option.date === day.key);
          const hasSelectionRoom = selectedOptions.length < 3 || isSelected;

          return (
            <form action={scheduleVisitAction} className={styles.availabilityForm} key={day.key}>
              <input type="hidden" name="quoteVisitDate" value={day.key} />
              <input type="hidden" name="quoteVisitDuration" value="60" />
              <input type="hidden" name="quoteVisitNotes" value="Booked from the lead availability snapshot." />
              <div className={`${styles.availabilityDay}${day.busy ? ` ${styles.busyDay}` : ''}${day.isToday ? ` ${styles.todayAvailabilityDay}` : ''}${isSelected ? ` ${styles.selectedAvailabilityDay}` : ''}`}>
                <strong>{day.label}</strong>
                <span>{day.summary}</span>
                <small>{day.detail}</small>
                {day.jobHints.length > 0 ? (
                  <span className={styles.availabilityJobList}>
                    {day.jobHints.map((job) => (
                      <span key={job.id}>
                        <b>{job.clientName}</b>
                        <small>{job.time}</small>
                        <small className={styles.availabilityCity}>{job.city}</small>
                      </span>
                    ))}
                  </span>
                ) : null}
                <div className={styles.availabilityBookingControls}>
                  <TimeSlotSelect id={`quoteVisitTime-${day.key}`} name="quoteVisitTime" defaultValue="09:00" />
                  <div className={styles.availabilityActionButtons}>
                    <button className="btn primary" type="submit">{day.bookingLabel}</button>
                    <button type="button" className={`btn secondary ${styles.clientOptionButton}`} disabled={!hasSelectionRoom} onClick={(event) => addClientOption(event, day)}>
                      {isSelected ? 'Update client option' : 'Add for client'}
                    </button>
                  </div>
                </div>
              </div>
            </form>
          );
        })}
      </div>

      <form
        action={sendQuoteVisitOptionsAction}
        className={`schedule-client-options-form ${styles.calendarSelectionTray}`}
        onSubmit={(event) => {
          if (selectedOptions.length !== 3) event.preventDefault();
        }}
      >
        <div className={styles.calendarSelectionHeader}>
          <div className={styles.calendarSelectionTitle}>
            <strong>Client choices</strong>
            <span>Select up to 3 day/time options from the week above.</span>
          </div>
          <span>{selectedOptions.length}/3 selected</span>
        </div>
        <div className={styles.selectedOptionList}>
          {[0, 1, 2].map((index) => {
            const option = selectedOptions[index];
            return (
              <div className={`${styles.selectedOptionCard}${option ? ` ${styles.selectedOptionFilled}` : ''}`} key={`client-choice-${index + 1}`}>
                <span>Option {index + 1}</span>
                {option ? (
                  <>
                    <strong>{option.label}</strong>
                    <small>{option.time}</small>
                    <button type="button" className={styles.removeOptionButton} onClick={() => removeClientOption(option.date)}>Remove</button>
                    <input type="hidden" name={`quoteVisitOptionDate${index + 1}`} value={option.date} />
                    <input type="hidden" name={`quoteVisitOptionTime${index + 1}`} value={option.time} />
                  </>
                ) : (
                  <small>Pick from week above</small>
                )}
              </div>
            );
          })}
        </div>
        <div className={styles.calendarSelectionFooter}>
          <div className={styles.calendarClientFormRow}>
            <div className="schedule-inline-field schedule-inline-date">
              <label htmlFor="quoteVisitClientPhoneCalendar">Client mobile</label>
              <input id="quoteVisitClientPhoneCalendar" name="quoteVisitClientPhone" type="tel" defaultValue={leadPhone} placeholder="(248) 555-0117" />
            </div>
            <label className={`sms-consent-check ${styles.calendarConsentCheck}`}>
              <input name="quoteVisitOptionsSmsConsent" type="checkbox" required />
              <span>The client agreed to receive transactional scheduling texts. Reply STOP to opt out.</span>
            </label>
          </div>
          <div className={styles.calendarSelectionActions}>
            {selectedOptions.length !== 3 ? <p className={styles.calendarSelectionHint}>Choose exactly 3 options before sending.</p> : <p className={styles.calendarSelectionHint}>Ready to text these 3 options.</p>}
            <div className={styles.calendarActionButtons}>
              <button type="button" className="btn ghost" onClick={clearClientOptions} disabled={selectedOptions.length === 0}>Clear</button>
              <CalendarSendButton disabled={selectedOptions.length !== 3} />
            </div>
          </div>
        </div>
      </form>
    </section>
  );
}