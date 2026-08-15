'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useId, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setQuickStopEnabledAction } from '@/app/dashboard/settings/actions';
import { jumpToHowItWorks } from './quick-stop-jump';
import {
  quickStopState,
  quickStopStateDetail,
  quickStopStateHeadline,
  quickStopStateLabel,
} from '@/lib/quick-stop-state';
import { quickStopWindowPhrase } from '@/lib/quick-stop-window';

// The master switch for Quick Stop, and what it currently means.
//
// Deliberately the same shape and the same classes as Booking & availability:
// the two are the same kind of decision — "can a stranger put work on my day" —
// and an owner who has learned one control should not have to learn a second.
//
// The switch says what you CHOSE. The status beside it says whether that choice
// is actually doing anything, which is not the same question: Quick Stop can be
// switched on and still take nothing, because it needs a published booking page
// to be requested from, a fee band to quote, days it is allowed to run on, and
// Stripe to take the payment that confirms a visit. Saying "ON" while any of
// those is missing would be a promise the page cannot keep.

export type QuickStopStatusProps = {
  enabled: boolean;
  /** The logged-out demo: the switch shows state, it does not flip it. */
  readOnly?: boolean;
  /** Support's no-show lock. Overrides the owner's own switch entirely. */
  locked: boolean;
  lockedUntil: string | null;
  lockReason: string;
  // Kept apart on purpose. These were one `configured` boolean, which forced the
  // status line to name both whenever either was missing — so an owner who had
  // set a $100–$375 band was told to "set a fee band" while the real gap was the
  // weekdays.
  /** The fee band has a ceiling above zero. */
  feeSet: boolean;
  /** At least one weekday is ticked. */
  daysSet: boolean;
  stripeConnected: boolean;
  bookingUrl: string | null;
  dayNames: string;
  dayCount: number;
  hoursLabel: string;
  feeLabel: string;
  maxPerDay: number;
  /** Days beyond today a customer may ask for. Decides how soon "sooner" is. */
  daysAhead: number;
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
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 0 1 4.9.8c0 1.7-2.5 2.1-2.5 3.7"/><path d="M12 17.3h.01"/>',
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

// #quick-stop, not #automations. Both open the Automations tab, but only the
// card's own id gets scrolled to and expanded by the settings deep-link handler
// — #automations left you at the top of a dozen collapsed cards, which is why
// these read as buttons that did nothing.
const SETTINGS_HREF = '/dashboard/quick-stops#quick-stop-setup';

/** Where the request queue lives on this page. */
const QUEUE_ANCHOR = '#quick-stop-requests';

/** Which icon belongs to which missing thing. */
const GAP_ICON: Record<string, string> = {
  website: 'link',
  weekdays: 'calendar',
  fee: 'cash',
  stripe: 'cash',
};

/** Gap labels are written lower-case to join into a sentence; a button is not one. */
function asButtonLabel(label: string): string {
  return label.replace(/^./, (first) => first.toUpperCase());
}

export default function QuickStopStatus(props: QuickStopStatusProps) {
  const { enabled, locked, lockedUntil, lockReason, feeSet, daysSet, stripeConnected, bookingUrl, readOnly = false } = props;
  const router = useRouter();
  const [pending, startToggle] = useTransition();
  const describedId = useId();

  // ONE OPINION. This block used to compute `live`, `missing` and
  // `blockedReason` itself, while page.tsx computed its own `quickStopLive` from
  // the same five booleans, the footer decided from `enabled` alone, the
  // explainer counted three of the five requirements, and the nav-rail API
  // ignored setup gaps entirely. Six deciders, four of them on screen at once.
  // See lib/quick-stop-state for what each of them got wrong.
  const state = quickStopState({
    enabled,
    locked,
    lockedUntil,
    lockReason,
    feeSet,
    daysSet,
    stripeConnected,
    hasBookingUrl: Boolean(bookingUrl),
    maxPerDay: props.maxPerDay,
  });
  const live = state.kind === 'on';
  /* The first thing still missing — what the primary action points at. The
     detail line beside it names all of them; a button can only do one, and the
     list is already in the order things have to be true in. */
  const firstGap = state.kind === 'setup_incomplete' ? state.gaps[0] ?? null : null;
  /* "same-day" was written into this sentence while the setting behind it
     offers up to a week — so the page contradicted the account's own
     configuration. It reads the setting now. */
  const windowPhrase = quickStopWindowPhrase(props.daysAhead);

  function setEnabled(next: boolean) {
    if (readOnly) return;
    startToggle(() => {
      void setQuickStopEnabledAction(next, 'extra_stops_page')
        .then(() => router.refresh())
        .catch(() => {});
    });
  }



  return (
    <>
      {/* Master switch + what it currently means, side by side: the switch says
          what you've chosen, the status says whether it's actually working. */}
      <section className="bset-master">
        <label className="bset-master-switch">
          {/* THE SWITCH IS NAMED "QUICK STOPS", NOT PARAGRAPHED.
              The <label> wraps the copy as well as the box, so the accessible
              name was the whole block — "Quick Stops is OFF Nearby customers,
              and anyone in a priority area, can request a paid same-day visit
              at a fee you set." — read out in full on every focus, and again on
              every toggle. aria-label gives it the name; the sentence becomes
              the description, which assistive tech announces once and can skip.
              The ON/OFF word is not lost: a checkbox states its own checked
              state, and the status block beside it says it in words. */}
          <input
            type="checkbox"
            aria-label="Quick Stops"
            aria-describedby={describedId}
            checked={enabled && !locked}
            onChange={(event) => setEnabled(event.target.checked)}
            disabled={pending || locked}
          />
          <span className="bset-switch-track" aria-hidden="true"><span /></span>
          <span className="bset-master-copy">
            <strong>
              Quick Stops is <em className={live ? 'on' : 'off'}>{quickStopStateLabel(state)}</em>
            </strong>
            {/* "Only customers near your route" was the old promise here, and it
                is not what the product does — priority areas exist precisely to
                let a customer further out qualify. */}
            <small id={describedId}>
              Nearby customers, and anyone in a priority area, can request a paid priority visit{' '}
              {windowPhrase} at a fee you set.
            </small>
          </span>
        </label>

        <div className={`bset-master-status${live ? ' live' : ''}`}>
          <p><span className="bset-dot" aria-hidden="true" />{quickStopStateHeadline(state)}</p>
          <small>{quickStopStateDetail(state)}</small>
        </div>

        {/* THE PRIMARY ACTION IS WHATEVER THIS STATE ACTUALLY CALLS FOR.
            It used to be "Review settings" in all four states — so an account
            that was configured and simply switched off had the page tell it, in
            its largest button, to go and review settings that needed no
            reviewing, while the one thing left to do (turn it on) was an
            unlabelled toggle. Worse in setup_incomplete: the detail line named
            four missing things and the button went somewhere that could fix two
            of them.

            THIS IS NOT THE THIRD TURN-ON CONTROL THAT WAS REMOVED. That one was
            a "Pause / Turn on" button sitting beside the switch in every state,
            doing the identical thing at all times — two controls for one fact.
            This appears only in ready_off, where turning it on is the entire
            remaining step, and it calls the same setter the switch does. In
            every other state there is no primary at all, because there is
            nothing the page should be pushing. */}
        <div className="bset-master-actions">
          {/* Support's lock is not the owner's to undo, so it offers an
              explanation rather than a button that would not work. */}
          {locked ? (
            <Link href={SETTINGS_HREF} className="btn secondary bset-pause">
              Why is this paused?
            </Link>
          ) : null}

          {firstGap ? (
            <Link href={firstGap.href} className="btn primary bset-setup">
              <Icon name={GAP_ICON[firstGap.key] ?? 'cash'} />
              {asButtonLabel(firstGap.label)}
            </Link>
          ) : state.kind === 'ready_off' && !readOnly ? (
            <button
              type="button"
              className="btn primary bset-setup"
              onClick={() => setEnabled(true)}
              disabled={pending}
            >
              <Icon name="play" />
              {pending ? 'Turning on…' : 'Turn on Quick Stops'}
            </button>
          ) : null}

          <Link href={SETTINGS_HREF} className="btn secondary bset-setup">
            <Icon name="cash" />
            Review settings
          </Link>

          {/* THE LABEL SAYS WHAT IS ON THE OTHER SIDE OF THE CLICK.
              "Preview customer experience" was a promise the link could not
              keep: it opens the live booking page, and Quick Stops is hidden
              there whenever the feature is not live — so an owner pressed
              "preview" on the thing they had just configured and found no sign
              of it. There is no unpublished preview mode to send them to, so
              the label stops claiming one. */}
          {/* bset-OPEN, not bset-preview. That name already belonged to the
              right-rail preview CARD in BookingSetup — a section with a heading
              and a phone mock — so this button was inheriting 1.2rem of
              padding, a 2px border and an 18px radius, and rendering as a card
              in a row of buttons. Its icon came out oversized for the same
              reason: the 0.95rem svg cap is on .bset-setup, which this never
              had. Two symptoms, one collision. */}
          {bookingUrl ? (
            <a href={bookingUrl} target="_blank" rel="noopener noreferrer" className="btn secondary bset-open">
              <Icon name="external" />
              {live ? 'Preview what customers see' : 'View booking page — Quick Stops hidden'}
            </a>
          ) : null}

          <button type="button" className="btn ghost bset-how" onClick={jumpToHowItWorks}>
            <Icon name="help" />
            How it works
          </button>
        </div>
        {bookingUrl && !live ? (
          <p className="bset-preview-note">
            It shows what customers see today, without Quick Stops. They appear on that page the moment this is{' '}
            {state.kind === 'paused' ? 'unpaused' : 'live'}.
          </p>
        ) : null}
      </section>

      <div className="bset-cards">
        <Link href={SETTINGS_HREF} className="bset-card">
          <span className="bset-card-icon tone-days"><Icon name="calendar" /></span>
          <span className="bset-card-label">Days you take them</span>
          <strong>{props.dayNames}</strong>
          <small>
            {props.dayCount > 0
              ? `Up to ${props.maxPerDay} quick stop${props.maxPerDay === 1 ? '' : 's'} on ${props.dayCount} day${props.dayCount === 1 ? '' : 's'} a week`
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
          <small>What a priority visit costs the customer</small>
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
            {/* Reads from the one state, like everything else on this page. It
                used to say "Off" for a fully-configured account that simply had
                not been switched on, with a sub-line about finishing a setup
                that was finished. */}
            <strong>{live ? 'None waiting' : quickStopStateLabel(state)}</strong>
            <small>
              {live ? 'They appear here the moment one arrives' : quickStopStateDetail(state)}
            </small>
          </div>
        )}
      </div>
    </>
  );
}

/**
 * TWO BUTTONS, ONE URL.
 *
 * The head carried "View booking page" and the master card carried "Preview
 * customer experience", and they opened exactly the same page — the largest
 * call to action on a page about turning a feature on was a link to somewhere
 * that does not show it. And when the site was unpublished this one said
 * "Publish your website", which is the same thing the master card's primary
 * action now says in that state, in the same words.
 *
 * So the head has no button. It is a title and a sentence; the actions live in
 * the master card six inches below it, where the state they depend on is.
 */
export function QuickStopHead() {
  return (
    <header className="bset-head">
      <div>
        {/* The logo IS the heading, so it stays inside the h1 rather than
            replacing it — an <img> beside a removed h1 throws the page name out
            of the document outline. The name is now real text next to it rather
            than alt text: alt satisfies a screen reader, but anything that
            reads the text and not the tree — reader mode, translation, a
            crawler, a page-title scraper — saw a top heading with no words in
            it. sr-only, so nothing on screen moves, and the badge is decorative
            once the name is spelled out beside it. */}
        <h1 className="qs-logo-head">
          <span className="sr-only">Quick Stops</span>
          <Image
            src="/brand/quick-stops-badge.png"
            alt=""
            width={300}
            height={77}
            priority
            className="qs-logo-badge"
          />
        </h1>
        <p>
          Quick Stops lets nearby customers pay to be fitted in sooner than your normal schedule. You review every
          request, choose the arrival window and fee, and accept only when it fits your route. Nothing is booked until
          the customer pays.
        </p>
      </div>
    </header>
  );
}
