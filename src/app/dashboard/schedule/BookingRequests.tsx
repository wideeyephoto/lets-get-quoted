'use client';

import SaveButton from '@/components/save-button';
import ConfirmActionButton from '@/app/dashboard/jobs/[id]/ConfirmActionButton';
import type { PendingBooking } from '@/lib/booking-requests';
import { confirmBookingRequestAction, declineBookingRequestAction } from './actions';

// Online bookings waiting on the contractor.
//
// The whole point of this panel is that it is NOT a notification — it is the
// only thing standing between a stranger's click and a contractor's calendar.
// So it says the two facts that matter in plain words, at the top, before any
// individual request:
//
//   · nothing here is on your schedule
//   · confirming books it AND texts the customer
//
// Both are stated again on the buttons, because a person who has scrolled past
// the header is about to press one of them.

export default function BookingRequests({ requests }: { requests: PendingBooking[] }) {
  if (requests.length === 0) return null;

  const overdue = requests.filter((request) => request.isPast).length;

  return (
    <section className="panel workspace-section-card booking-requests" id="booking-requests">
      <header className="booking-requests-head">
        <div>
          <p className="eyebrow">Waiting on you</p>
          <h2>
            {requests.length} online booking{requests.length === 1 ? '' : 's'} to confirm
          </h2>
        </div>
        <span className="booking-requests-pill" title="These are not on your calendar yet">
          Not on your schedule
        </span>
      </header>

      <p className="booking-requests-lead">
        <strong>Nothing here is on your schedule yet.</strong> A customer picked this time on your booking page and
        was told it isn&apos;t locked in until you say so. When you confirm, it goes on your calendar and we text them{' '}
        &ldquo;your appointment has been confirmed&rdquo; straight away.
      </p>

      {overdue > 0 ? (
        <p className="booking-requests-overdue">
          {overdue === 1 ? 'One of these has' : `${overdue} of these have`} already gone past the day{' '}
          {overdue === 1 ? 'it was' : 'they were'} requested for. Decline{' '}
          {overdue === 1 ? 'it' : 'them'} so the customer knows, rather than confirming a date that has been and gone.
        </p>
      ) : null}

      <ul className="booking-requests-list">
        {requests.map((request) => (
          <li key={request.id} className="booking-request" data-past={request.isPast || undefined}>
            <div className="booking-request-main">
              <div className="booking-request-who">
                <strong>{request.clientName}</strong>
                <span className="booking-request-when">
                  {request.whenLabel}
                  {request.isPast ? <em className="booking-request-past">date has passed</em> : null}
                </span>
              </div>
              <div className="booking-request-detail">
                {request.scope ? <span>{request.scope}</span> : null}
                {request.address ? <span className="booking-request-address">{request.address}</span> : null}
                {/* Shown before you decide, not after. "There's no side access"
                    is exactly the thing that changes whether you can take the
                    job at all. */}
                {request.note ? <span className="booking-request-note">“{request.note}”</span> : null}
                <span className="booking-request-contact">
                  {[request.phone, request.email].filter(Boolean).join(' · ') || 'No contact on file'}
                </span>
              </div>
            </div>

            <div className="booking-request-actions">
              <form action={confirmBookingRequestAction.bind(null, request.id)}>
                <SaveButton
                  className="btn primary booking-request-confirm"
                  pendingLabel="Confirming…"
                  savedLabel="Confirmed ✓"
                >
                  {request.phone ? 'Confirm & text customer' : 'Confirm booking'}
                </SaveButton>
              </form>
              {/* Declining sends a "can't make it" text that cannot be recalled,
                  so it asks once. Confirming does not: it is the outcome the
                  customer is already waiting for, and it stays fixable by
                  rescheduling the job like any other. */}
              <ConfirmActionButton
                action={declineBookingRequestAction.bind(null, request.id)}
                confirmMessage={
                  request.phone
                    ? `Decline ${request.clientName}'s booking?\n\nThey'll get a text saying you can't make ${request.whenLabel}, and the slot opens back up for someone else.`
                    : `Decline ${request.clientName}'s booking?\n\nThe slot opens back up for someone else. They have no phone number on file, so they won't be told.`
                }
                className="btn ghost"
                pendingLabel="Declining…"
                savedLabel="Declined ✓"
              >
                Can&apos;t make it
              </ConfirmActionButton>
            </div>

            <p className="booking-request-foot">
              Requested {request.waitedLabel}
              {request.phone ? ' · confirming texts them right away' : ' · no phone on file, so no text will be sent'}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
