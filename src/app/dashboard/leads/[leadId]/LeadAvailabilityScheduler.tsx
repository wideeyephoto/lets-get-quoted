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

/** A booking somebody has pressed for and not yet confirmed. See BookingReview. */
type PendingBooking = {
  date: string;
  label: string;
  time: string;
  /** The day already has work on it. Named in the review rather than in a toast. */
  busy: boolean;
};

type VisitSummary = {
  label: string;
  detail: string;
};

type Props = {
  availability: AvailabilityDay[];
  leadPhone: string;
  /**
   * Where the visit is. Empty on plenty of real leads — a phone inquiry, a
   * form somebody abandoned halfway — which is exactly why booking now asks.
   */
  leadAddress: string;
  leadName: string;
  previousHref: string;
  nextHref: string;
  canViewPrevious: boolean;
  scheduleVisitAction: FormAction;
  sendQuoteVisitOptionsAction: FormAction;
  clearVisitAction: VoidAction;
  visitSummary: VisitSummary | null;
  className?: string;
  /** Whether this half of the lead accordion starts open. See page.tsx. */
  defaultOpen?: boolean;
};

/**
 * WHAT YOU ARE ABOUT TO PUT IN YOUR DIARY, before it goes in.
 *
 * One click on a calendar square used to be a confirmed visit. The duration was
 * hardcoded to 60 minutes, the note was hardcoded to a sentence about the UI it
 * came from, and the address — the part that decides whether the visit is a
 * twenty-minute drive or an hour and a half — was neither asked for nor shown.
 * "Not provided" was an acceptable answer to where a van was being sent.
 *
 * So the four things that make a visit real are on one screen, editable, before
 * anything is written: when, how long, where, and whether the customer is told.
 * The address defaults to whatever the lead already has and saves back to the
 * lead when it is changed here — a booking is the moment somebody finally asks,
 * and making them go to a different form to record the answer is how it stays
 * blank.
 */
function BookingReview({
  booking,
  leadName,
  leadAddress,
  leadPhone,
  action,
  onCancel,
}: {
  booking: PendingBooking;
  leadName: string;
  leadAddress: string;
  leadPhone: string;
  action: FormAction;
  onCancel: () => void;
}) {
  const who = leadName.trim() || 'this lead';

  return (
    <div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-labelledby="bookingReviewTitle">
      <form action={action} className={styles.bookingReview}>
        <input type="hidden" name="quoteVisitDate" value={booking.date} />

        <div className={styles.bookingReviewHead}>
          <div>
            <p className="eyebrow">Confirm the estimate visit</p>
            <h2 id="bookingReviewTitle">{booking.label}</h2>
          </div>
          <button type="button" className={styles.modalCloseButton} onClick={onCancel} aria-label="Cancel this booking">
            x
          </button>
        </div>

        {booking.busy ? (
          <p className={styles.bookingReviewBusy}>
            You already have work on this day. Booking here adds to it rather than replacing anything.
          </p>
        ) : null}

        <div className={styles.bookingReviewGrid}>
          <label>
            <span>Start time</span>
            <TimeSlotSelect id="bookingReviewTime" name="quoteVisitTime" defaultValue={booking.time} />
          </label>
          <label>
            <span>How long</span>
            {/* Was hardcoded to 60. A roof measure and a tap replacement are not
                the same appointment, and the diary they land in is shared. */}
            <select name="quoteVisitDuration" defaultValue="60">
              <option value="30">30 minutes</option>
              <option value="60">1 hour</option>
              <option value="90">1½ hours</option>
              <option value="120">2 hours</option>
            </select>
          </label>
        </div>

        <label className={styles.bookingReviewField}>
          <span>Where the visit is</span>
          <input
            name="quoteVisitAddress"
            defaultValue={leadAddress}
            required
            placeholder="1421 Maple Street, Royal Oak MI"
            autoComplete="street-address"
          />
          <small>
            {leadAddress
              ? 'Saved back to the lead if you change it.'
              : `${who} has no address on file — this saves it to the lead as well.`}
          </small>
        </label>

        <label className={styles.bookingReviewField}>
          <span>Note on the visit (optional)</span>
          <input name="quoteVisitNotes" placeholder="Gate code, dog in the yard, park on the street…" maxLength={200} />
        </label>

        {/* Named as what it does, off by default: a text going out is the one
            part of this dialog that reaches somebody else. */}
        <label className={`sms-consent-check ${styles.bookingReviewNotify}`}>
          <input name="quoteVisitSmsConsent" type="checkbox" disabled={!leadPhone.trim()} />
          <span>
            <strong>Text {who} a confirmation now</strong>
            <small>
              {leadPhone.trim()
                ? `Sends the day and time to ${leadPhone}. They agreed to transactional scheduling texts. Reply STOP to opt out.`
                : 'No mobile number on this lead, so there is nowhere to send it.'}
            </small>
          </span>
        </label>

        <div className={styles.bookingReviewActions}>
          <button type="button" className="btn ghost" onClick={onCancel}>
            Back to the calendar
          </button>
          <BookingConfirmButton />
        </div>
      </form>
    </div>
  );
}

function BookingConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn primary" disabled={pending} aria-busy={pending}>
      {pending ? 'Booking…' : 'Book this visit'}
    </button>
  );
}

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
  leadAddress,
  leadName,
  previousHref,
  nextHref,
  canViewPrevious,
  scheduleVisitAction,
  sendQuoteVisitOptionsAction,
  clearVisitAction,
  visitSummary,
  className,
  defaultOpen = false,
}: Props) {
  const [selectedOptions, setSelectedOptions] = useState<SelectedOption[]>([]);
  const [pending, setPending] = useState<PendingBooking | null>(null);

  /**
   * A press on a day is now a proposal, not a booking.
   *
   * It used to be one click from a calendar square to a confirmed visit, with
   * the duration hardcoded to 60 minutes, the notes hardcoded to "Booked from
   * the lead availability snapshot", and — the expensive one — no address
   * required or even shown. A quote visit is somebody driving somewhere, and
   * "Not provided" was a perfectly acceptable answer to where.
   */
  function openReview(event: MouseEvent<HTMLButtonElement>, day: AvailabilityDay) {
    const form = event.currentTarget.form;
    const time = form ? String(new FormData(form).get('quoteVisitTime') || '09:00') : '09:00';
    setPending({ date: day.key, label: day.label, time, busy: day.busy });
  }

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
    /* Half of a two-panel accordion — see the `name` note in page.tsx. The
       browser closes the other half when this one opens; nothing here has to
       know the other exists. */
    <details
      id="availability-snapshot"
      name="lead-action"
      open={defaultOpen}
      className={`panel workspace-section-card workspace-details job-action-details ${styles.calendarCard}${className ? ` ${className}` : ''}`}
    >
      <summary className={`workspace-details-summary job-action-summary ${styles.calendarSurfaceHeader}`}>
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Calendar</p>
          <h2>Schedule Client Estimate</h2>
        </div>
        <span className="workspace-details-copy">Book the quote now or build 3 times for the client from the same calendar.</span>
      </summary>

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
          <p className={styles.calendarHint}>“Book this time” puts the visit in your diary now. “Offer to client” builds up to 3 times for them to choose from — nothing is booked until they pick one.</p>
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
            /* Still a form, because the time picker inside it is read through
               FormData when either button is pressed — but nothing submits it
               any more. Booking goes through the review below. */
            <form className={styles.availabilityForm} key={day.key} onSubmit={(event) => event.preventDefault()}>
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
                    <button className="btn primary" type="button" onClick={(event) => openReview(event, day)}>
                      {day.bookingLabel}
                    </button>
                    <button type="button" className={`btn secondary ${styles.clientOptionButton}`} disabled={!hasSelectionRoom} onClick={(event) => addClientOption(event, day)}>
                      {isSelected ? '✓ Offered' : 'Offer to client'}
                    </button>
                  </div>
                </div>
              </div>
            </form>
          );
        })}
      </div>

      {pending ? (
        <BookingReview
          booking={pending}
          leadName={leadName}
          leadAddress={leadAddress}
          leadPhone={leadPhone}
          action={scheduleVisitAction}
          onCancel={() => setPending(null)}
        />
      ) : null}

      <form
        action={sendQuoteVisitOptionsAction}
        className={`schedule-client-options-form ${styles.calendarSelectionTray}`}
        onSubmit={(event) => {
          if (selectedOptions.length === 0) event.preventDefault();
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
                <span className={styles.selectedOptionTag}>Option {index + 1}</span>
                {option ? (
                  <>
                    <div className={styles.selectedOptionMeta}>
                      <strong>{option.label}</strong>
                      <small>{option.time}</small>
                    </div>
                    <button type="button" className={styles.removeOptionButton} onClick={() => removeClientOption(option.date)} aria-label={`Remove option ${index + 1}`}>
                      x
                    </button>
                    <input type="hidden" name={`quoteVisitOptionDate${index + 1}`} value={option.date} />
                    <input type="hidden" name={`quoteVisitOptionTime${index + 1}`} value={option.time} />
                  </>
                ) : (
                  <small className={styles.emptyOptionCopy}>Pick from week above</small>
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
            {selectedOptions.length === 0 ? <p className={styles.calendarSelectionHint}>Choose up to 3 options before sending.</p> : <p className={styles.calendarSelectionHint}>Ready to text {selectedOptions.length} option{selectedOptions.length === 1 ? '' : 's'}.</p>}
            <div className={styles.calendarActionButtons}>
              <button type="button" className="btn ghost" onClick={clearClientOptions} disabled={selectedOptions.length === 0}>Clear</button>
              <CalendarSendButton disabled={selectedOptions.length === 0} />
            </div>
          </div>
        </div>
      </form>
    </details>
  );
}