'use client';

import Link from 'next/link';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setExtraStopEnabledAction } from '@/app/dashboard/settings/actions';

// The master switch for Extra Stop, and what it currently means.
//
// Deliberately the same shape and the same classes as Booking & availability:
// the two are the same kind of decision — "can a stranger put work on my day" —
// and an owner who has learned one control should not have to learn a second.
//
// The switch says what you CHOSE. The status beside it says whether that choice
// is actually doing anything, which is not the same question: Extra Stop can be
// switched on and still take nothing, because it needs a published booking page
// to be requested from, a fee band to quote, days it is allowed to run on, and
// Stripe to take the payment that confirms a visit. Saying "ON" while any of
// those is missing would be a promise the page cannot keep.

export type ExtraStopStatusProps = {
  enabled: boolean;
  /** Support's no-show lock. Overrides the owner's own switch entirely. */
  locked: boolean;
  lockedUntil: string | null;
  lockReason: string;
  /** False when the fee band or the weekdays have never been set. */
  configured: boolean;
  stripeConnected: boolean;
  bookingUrl: string | null;
  dayNames: string;
  dayCount: number;
  hoursLabel: string;
  feeLabel: string;
  maxPerDay: number;
  todayCount: number;
  openCount: number;
};

const ICONS: Record<string, string> = {
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="17" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  pause: '<rect x="7" y="5" width="3.5" height="14" rx="1"/><rect x="13.5" y="5" width="3.5" height="14" rx="1"/>',
  play: '<path d="M7 4.5 19 12 7 19.5Z"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
};

function Icon({ name, className }: { name: string; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ICONS[name] ?? '' }}
    />
  );
}

// #extra-stop, not #automations. Both open the Automations tab, but only the
// card's own id gets scrolled to and expanded by the settings deep-link handler
// — #automations left you at the top of a dozen collapsed cards, which is why
// these read as buttons that did nothing.
const SETTINGS_HREF = '/dashboard/settings#extra-stop';

/** Where the request queue lives on this page. */
const QUEUE_ANCHOR = '#extra-stop-requests';

export default function ExtraStopStatus(props: ExtraStopStatusProps) {
  const { enabled, locked, lockedUntil, lockReason, configured, stripeConnected, bookingUrl } = props;
  const router = useRouter();
  const [pending, startToggle] = useTransition();

  // Live is the only state that means a customer could actually get a visit out
  // of this today. Everything else is named for the thing that is missing.
  const live = enabled && !locked && configured && stripeConnected && Boolean(bookingUrl);
  const blockedReason = !enabled
    ? 'Nobody can ask to be added to your day. Your normal booking is unaffected.'
    : !bookingUrl
      ? 'Publish your website — Extra Stop requests come in from your booking page.'
      : !configured
        ? 'Set a fee band and the days you accept before this can take a request.'
        : !stripeConnected
          ? 'Connect Stripe — an Extra Stop is only confirmed once the customer has paid.'
          : null;

  function setEnabled(next: boolean) {
    startToggle(() => {
      void setExtraStopEnabledAction(next, 'extra_stops_page')
        .then(() => router.refresh())
        .catch(() => {});
    });
  }

  const lockDate = lockedUntil ? new Date(lockedUntil).toLocaleDateString('en-US', { dateStyle: 'medium' }) : null;

  return (
    <>
      {/* Master switch + what it currently means, side by side: the switch says
          what you've chosen, the status says whether it's actually working. */}
      <section className="bset-master">
        <label className="bset-master-switch">
          <input
            type="checkbox"
            checked={enabled && !locked}
            onChange={(event) => setEnabled(event.target.checked)}
            disabled={pending || locked}
          />
          <span className="bset-switch-track" aria-hidden="true"><span /></span>
          <span className="bset-master-copy">
            <strong>
              Extra Stops is <em className={enabled && !locked ? 'on' : 'off'}>{locked ? 'PAUSED' : enabled ? 'ON' : 'OFF'}</em>
            </strong>
            <small>Customers can ask to be squeezed into today, at a fee you set.</small>
          </span>
        </label>

        <div className={`bset-master-status${live ? ' live' : ''}`}>
          <p><span className="bset-dot" aria-hidden="true" />{locked ? 'Paused by support' : live ? 'Live' : enabled ? 'Not live yet' : 'Paused'}</p>
          <small>
            {locked
              ? `${lockReason || 'Paused after a reported no-show'}${lockDate ? ` — reopens ${lockDate}` : ''}. It lifts automatically.`
              : blockedReason ?? `Taking requests, up to ${props.maxPerDay} a day.`}
          </small>
        </div>

        {/* Support's lock is not the owner's to undo, so it offers an explanation
            rather than a button that would not work. */}
        {locked ? (
          <Link href={SETTINGS_HREF} className="btn secondary bset-pause">
            Why is this paused?
          </Link>
        ) : (
          <button type="button" className="btn secondary bset-pause" onClick={() => setEnabled(!enabled)} disabled={pending}>
            <Icon name={enabled ? 'pause' : 'play'} />
            {pending ? 'Saving…' : enabled ? 'Pause Extra Stops' : 'Turn on Extra Stops'}
          </button>
        )}
      </section>

      <div className="bset-cards">
        <Link href={SETTINGS_HREF} className="bset-card">
          <span className="bset-card-icon tone-days"><Icon name="calendar" /></span>
          <span className="bset-card-label">Days you take them</span>
          <strong>{props.dayNames}</strong>
          <small>
            {props.dayCount > 0
              ? `Up to ${props.maxPerDay} extra stop${props.maxPerDay === 1 ? '' : 's'} on ${props.dayCount} day${props.dayCount === 1 ? '' : 's'} a week`
              : 'No days chosen, so nothing can be requested'}
          </small>
          <span className="bset-card-edit">Edit <Icon name="chevronRight" /></span>
        </Link>

        <Link href={SETTINGS_HREF} className="bset-card">
          <span className="bset-card-icon tone-time"><Icon name="clock" /></span>
          <span className="bset-card-label">Hours</span>
          <strong>{props.hoursLabel}</strong>
          <small>Requests only land inside this window</small>
          <span className="bset-card-edit">Edit <Icon name="chevronRight" /></span>
        </Link>

        <Link href={SETTINGS_HREF} className="bset-card">
          <span className="bset-card-icon tone-off"><Icon name="cash" /></span>
          <span className="bset-card-label">Your fee</span>
          <strong>{props.feeLabel}</strong>
          <small>What a same-day squeeze-in costs the customer</small>
          <span className="bset-card-edit">Edit <Icon name="chevronRight" /></span>
        </Link>

        {/* This one is not a settings shortcut — there is nothing to EDIT about
            requests. It goes to the queue further down the page, and when there
            is no queue to go to it stops being a link at all rather than
            offering a click that lands nowhere. */}
        {props.openCount > 0 || props.todayCount > 0 ? (
          <a href={QUEUE_ANCHOR} className="bset-card">
            <span className="bset-card-icon tone-link"><Icon name="pin" /></span>
            <span className="bset-card-label">Requests</span>
            <strong>{props.openCount > 0 ? `${props.openCount} waiting on you` : `${props.todayCount} today`}</strong>
            <small>
              {props.openCount > 0 && props.todayCount > 0
                ? `${props.todayCount} already accepted for today`
                : props.openCount > 0
                  ? 'Answer them before they expire'
                  : 'Accepted onto today’s route'}
            </small>
            <span className="bset-card-edit">View <Icon name="chevronRight" /></span>
          </a>
        ) : (
          <div className="bset-card is-static">
            <span className="bset-card-icon tone-link"><Icon name="pin" /></span>
            <span className="bset-card-label">Requests</span>
            <strong>{locked ? 'Paused' : live ? 'None waiting' : enabled ? 'Not live' : 'Off'}</strong>
            <small>
              {locked
                ? 'Nothing new can come in while this is paused'
                : live
                  ? 'They appear here the moment one arrives'
                  : blockedReason ?? 'Nothing can come in while this is off'}
            </small>
          </div>
        )}
      </div>
    </>
  );
}

export function ExtraStopHead({ bookingUrl }: { bookingUrl: string | null }) {
  return (
    <header className="bset-head">
      <div>
        <h1>
          Extra Stops <Icon name="pin" />
        </h1>
        <p>Let customers pay to be squeezed into a day you&apos;re already working near them.</p>
      </div>
      {bookingUrl ? (
        <a className="btn secondary bset-head-cta" href={bookingUrl} target="_blank" rel="noopener noreferrer">
          View booking page <Icon name="external" />
        </a>
      ) : (
        <Link className="btn secondary bset-head-cta" href="/dashboard/sites">
          Publish your website <Icon name="external" />
        </Link>
      )}
    </header>
  );
}
