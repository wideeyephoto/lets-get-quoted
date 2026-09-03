'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useId, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import FieldIntakeHint from '@/components/field-intake-hint';
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
  maxDetourMiles?: number;
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

function Icon({ name, className, style }: { name: string; className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      className={className}
      style={style}
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
            <small id={describedId}>
              Nearby customers, and anyone in a priority area, can request a paid priority visit{' '}
              {windowPhrase} at a fee you set.
            </small>
          </span>
        </label>
        <div className={`bset-master-status${live ? ' live' : ''}`}>
          <p>
            <span className="bset-dot" aria-hidden="true" />
            {props.openCount > 0 ? (
              <strong style={{ color: '#ff9a52' }}>
                {props.openCount} open {props.openCount === 1 ? 'request' : 'requests'} waiting on you
              </strong>
            ) : (
              quickStopStateHeadline(state)
            )}
          </p>
          <small>
            {props.openCount > 0
              ? 'Review and respond before the customer response deadline passes.'
              : quickStopStateDetail(state)}
          </small>
        </div>

        {/* Action Controls */}
        <div className="bset-master-actions">
          {props.openCount > 0 ? (
            <a href={QUEUE_ANCHOR} className="btn primary" style={{ minHeight: '44px' }}>
              <Icon name="pin" />
              Review {props.openCount} open {props.openCount === 1 ? 'request' : 'requests'}
            </a>
          ) : null}

          {locked ? (
            <Link href={SETTINGS_HREF} className="btn secondary bset-pause" style={{ minHeight: '44px' }}>
              Why is this paused?
            </Link>
          ) : null}

          {firstGap ? (
            <Link href={firstGap.href} className="btn primary bset-setup" style={{ minHeight: '44px' }}>
              <Icon name={GAP_ICON[firstGap.key] ?? 'cash'} />
              {asButtonLabel(firstGap.label)}
            </Link>
          ) : state.kind === 'ready_off' && !readOnly ? (
            <button
              type="button"
              className="btn primary bset-setup"
              onClick={() => setEnabled(true)}
              disabled={pending}
              style={{ minHeight: '44px' }}
            >
              <Icon name="play" />
              {pending ? 'Turning on…' : 'Turn on Quick Stops'}
            </button>
          ) : null}

          <Link href={SETTINGS_HREF} className="btn secondary bset-setup" style={{ minHeight: '44px' }}>
            <Icon name="cash" />
            Review settings
          </Link>

          {bookingUrl ? (
            <a href={bookingUrl} target="_blank" rel="noopener noreferrer" className="btn secondary bset-open" style={{ minHeight: '44px' }}>
              <Icon name="external" />
              {live ? 'Preview what customers see' : 'View booking page — Quick Stops hidden'}
            </a>
          ) : null}

          <button type="button" className="btn ghost bset-how" onClick={jumpToHowItWorks} style={{ minHeight: '44px' }}>
            <Icon name="help" />
            How it works
          </button>
        </div>

        {/* Compact Configuration Chips */}
        <div className="qs-config-chips" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', marginTop: '0.75rem', alignItems: 'center' }}>
          <Link
            href={SETTINGS_HREF}
            className="qs-chip"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.4rem 0.75rem',
              borderRadius: '999px',
              background: 'rgba(255, 122, 33, 0.08)',
              border: '1px solid rgba(255, 122, 33, 0.25)',
              color: 'var(--text)',
              fontSize: '0.8rem',
              textDecoration: 'none',
              minHeight: '36px',
            }}
          >
            <Icon name="calendar" style={{ width: '0.9rem', height: '0.9rem', color: '#ff7a21' }} />
            <span>
              <strong>{props.daysAhead === 0 ? 'Today only' : props.daysAhead === 1 ? 'Today or tomorrow' : `Today + ${props.daysAhead}d`}</strong> · {props.dayNames}
            </span>
          </Link>

          <Link
            href={SETTINGS_HREF}
            className="qs-chip"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.4rem 0.75rem',
              borderRadius: '999px',
              background: 'rgba(255, 209, 102, 0.08)',
              border: '1px solid rgba(255, 209, 102, 0.25)',
              color: 'var(--text)',
              fontSize: '0.8rem',
              textDecoration: 'none',
              minHeight: '36px',
            }}
          >
            <Icon name="clock" style={{ width: '0.9rem', height: '0.9rem', color: '#ffd166' }} />
            <span>{props.hoursLabel}</span>
          </Link>

          <Link
            href={SETTINGS_HREF}
            className="qs-chip"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.4rem 0.75rem',
              borderRadius: '999px',
              background: 'rgba(167, 139, 250, 0.08)',
              border: '1px solid rgba(167, 139, 250, 0.25)',
              color: 'var(--text)',
              fontSize: '0.8rem',
              textDecoration: 'none',
              minHeight: '36px',
            }}
          >
            <Icon name="cash" style={{ width: '0.9rem', height: '0.9rem', color: '#a78bfa' }} />
            <span>{props.feeLabel}</span>
          </Link>

          <Link
            href={SETTINGS_HREF}
            className="qs-chip"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.4rem 0.75rem',
              borderRadius: '999px',
              background: 'rgba(52, 199, 123, 0.08)',
              border: '1px solid rgba(52, 199, 123, 0.25)',
              color: 'var(--text)',
              fontSize: '0.8rem',
              textDecoration: 'none',
              minHeight: '36px',
            }}
          >
            <Icon name="pin" style={{ width: '0.9rem', height: '0.9rem', color: '#34c77b' }} />
            <span>{props.maxDetourMiles ?? 10}-mile detour</span>
          </Link>

          <div
            className="qs-chip is-static"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.4rem 0.75rem',
              borderRadius: '999px',
              background: 'rgba(var(--tint, 255, 255, 255), 0.03)',
              border: '1px solid var(--edge-t10, rgba(255, 255, 255, 0.06))',
              color: 'var(--muted)',
              fontSize: '0.8rem',
              minHeight: '36px',
            }}
          >
            <span>⚡ {props.todayCount}/{props.maxPerDay} used today</span>
          </div>
        </div>

        {bookingUrl && !live ? (
          <p className="bset-preview-note">
            It shows what customers see today, without Quick Stops. They appear on that page the moment this is{' '}
            {state.kind === 'paused' ? 'unpaused' : 'live'}.
          </p>
        ) : null}
      </section>
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
      <div className="bset-head-actions">
        <FieldIntakeHint page="quick-stops" />
      </div>
    </header>
  );
}
