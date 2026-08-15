'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { flushSync } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BOOKING_WINDOW_PRESET_TIMES,
  MAX_BOOKING_WINDOWS,
  WEEKDAY_LABELS,
  formatWindowClock,
  formatWindowRange,
  isWindowTime,
  outsideWorkdayWindowTimes,
  overlappingWindowTimes,
  timeToMinutes,
  windowEndTime,
  windowPartName,
  type BookingAvailability,
} from '@/lib/booking-availability';

// What an owner can promise. Shorter is a better customer experience and a worse
// day when a job runs long — so the trade-off is named on the control rather
// than left for them to discover from an angry phone call.
const WINDOW_LENGTHS: { minutes: number; label: string; note: string }[] = [
  { minutes: 60, label: '1 hour', note: 'Tightest promise. Only if you run a very predictable book.' },
  { minutes: 120, label: '2 hours', note: 'Tight. Good for short, well-understood visits.' },
  { minutes: 180, label: '3 hours', note: 'A comfortable half-morning.' },
  { minutes: 240, label: '4 hours', note: 'What utilities use. Survives an ordinary bad morning.' },
  { minutes: 360, label: '6 hours', note: 'Very loose. Customers will ask you to narrow it.' },
];
import type { AvailabilityBlock } from '@/lib/availability-blocks';
import { updateBookingAvailabilityAction } from '../../settings/actions';
import {
  addAvailabilityBlockAction,
  addRecurringBlockAction,
  removeAvailabilityBlockAction,
  removeBlocksByReasonAction,
  setBookingEnabledAction,
} from '../actions';
import { Icon } from './icons';

type InstantBook = {
  enabled: boolean;
  minAmount: number;
  radiusMiles: number;
  geoMode: string;
  driveTime: boolean;
};

// The four numbered drawers, in the order they appear. A union rather than
// `string` so a typo in a toggleSection/jumpTo call is a build error instead of
// a section that silently never opens.
type SectionKey = 'days' | 'limits' | 'advanced' | 'timeoff';

const FULL_WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const LEAD_OPTIONS = [
  { value: 0, label: 'Same day' },
  { value: 1, label: 'From tomorrow' },
  { value: 2, label: '2 days out' },
  { value: 3, label: '3 days out' },
  { value: 7, label: 'A week out' },
];

function addDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function weekdayOf(dateKey: string): number {
  return new Date(`${dateKey}T00:00:00`).getDay();
}

function formatDay(dateKey: string): { dow: string; num: string } {
  const d = new Date(`${dateKey}T00:00:00`);
  return { dow: WEEKDAY_LABELS[d.getDay()].toUpperCase(), num: String(d.getDate()) };
}

function formatBlockRange(start: string, end: string): string {
  const fmt = (k: string) =>
    new Date(`${k}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const dow = new Date(`${start}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short' });
  return start === end ? `${fmt(start)} (${dow})` : `${fmt(start)} – ${fmt(end)}`;
}

function blockLength(start: string, end: string): string {
  const days = Math.round((new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime()) / 86400000) + 1;
  return `${days} day${days === 1 ? '' : 's'}`;
}

// A short "why" beside a label, rather than a paragraph under every field.
function Tip({ text }: { text: string }) {
  return (
    <span className="bset-tip" title={text} aria-label={text} role="img">
      <Icon name="info" />
    </span>
  );
}

export default function BookingSetup({
  availability,
  instantBook,
  blocks,
  bookingUrl,
  sitePublished,
  openWindowCount,
  openDayCount,
  bookableDays,
  timezoneOptions,
  todayKey,
}: {
  availability: BookingAvailability;
  instantBook: InstantBook;
  blocks: AvailabilityBlock[];
  bookingUrl: string | null;
  sitePublished: boolean;
  openWindowCount: number;
  openDayCount: number;
  /** The days the public page is offering right now, in the order it offers them. */
  bookableDays: { dateKey: string; dayLabel: string; times: string[] }[];
  timezoneOptions: { value: string; label: string }[];
  todayKey: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // The master switch applies on click rather than waiting for the save bar:
  // "stop taking bookings" is something you do in a hurry, and hiding it behind
  // a second click is how someone ends up taking work they can't do.
  const [enabled, setEnabled] = useState(availability.enabled);

  const [weekdays, setWeekdays] = useState<number[]>(availability.weekdays);
  const [windowTimes, setWindowTimes] = useState<string[]>(availability.windowTimes);
  const [windowMinutes, setWindowMinutes] = useState(availability.windowMinutes);
  const [maxPerDay, setMaxPerDay] = useState(availability.maxPerDay);
  const [leadDays, setLeadDays] = useState(availability.leadDays);
  const [timezone, setTimezone] = useState(availability.timezone);
  const [instant, setInstant] = useState(instantBook);

  // ONE SECTION OPEN AT A TIME. Three of these four were expanded on arrival and
  // the page opened as a wall of controls — every heading pushed off screen by
  // the body above it, so there was nothing to skim to decide where to go. As an
  // accordion the four headings stay together as a contents page. null is a
  // legitimate state: clicking the open one closes it and shows all four.
  const [openSection, setOpenSection] = useState<SectionKey | null>('days');
  const isOpen = (key: SectionKey) => openSection === key;
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const sectionRefs = useRef<Partial<Record<SectionKey, HTMLElement | null>>>({});

  // Compare against what the server sent, so "unsaved" means genuinely
  // different — not merely "touched and put back".
  const dirty = useMemo(() => {
    const sameList = (a: (string | number)[], b: (string | number)[]) =>
      a.length === b.length && a.every((v, i) => v === b[i]);
    return (
      !sameList([...weekdays].sort(), [...availability.weekdays].sort()) ||
      !sameList([...windowTimes].sort(), [...availability.windowTimes].sort()) ||
      windowMinutes !== availability.windowMinutes ||
      maxPerDay !== availability.maxPerDay ||
      leadDays !== availability.leadDays ||
      timezone !== availability.timezone ||
      instant.enabled !== instantBook.enabled ||
      instant.minAmount !== instantBook.minAmount ||
      instant.radiusMiles !== instantBook.radiusMiles ||
      instant.geoMode !== instantBook.geoMode ||
      instant.driveTime !== instantBook.driveTime
    );
  }, [weekdays, windowTimes, windowMinutes, maxPerDay, leadDays, timezone, instant, availability, instantBook]);

  // Leaving with unsaved settings loses them silently otherwise.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // Opening one section closes whichever was open, which means everything below
  // the heading you clicked moves. Without pinning it, clicking section 4 while
  // section 1 is open yanks the heading up by the height of section 1's body and
  // you end up somewhere else on the page — the classic accordion lurch.
  //
  // flushSync commits the collapse synchronously, so we can measure where the
  // heading actually landed and put it back before the browser paints. Doing
  // this in an effect instead would show one frame in the wrong place.
  function toggleSection(key: SectionKey) {
    const before = sectionRefs.current[key]?.getBoundingClientRect().top;
    flushSync(() => setOpenSection((current) => (current === key ? null : key)));
    const after = sectionRefs.current[key]?.getBoundingClientRect().top;
    if (before !== undefined && after !== undefined && Math.abs(after - before) > 1) {
      window.scrollBy(0, after - before);
    }
  }

  // From the summary cards at the top, where the point IS to travel — so this
  // one scrolls to the section rather than holding position.
  function jumpTo(key: SectionKey) {
    setOpenSection(key);
    requestAnimationFrame(() => {
      sectionRefs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function toggleWeekday(day: number) {
    setWeekdays((d) => (d.includes(day) ? d.filter((x) => x !== day) : [...d, day].sort()));
  }

  function toggleWindow(time: string) {
    setWindowTimes((w) => (w.includes(time) ? w.filter((t) => t !== time) : [...w, time].sort()));
  }

  function setMaster(next: boolean) {
    setEnabled(next);
    startTransition(async () => {
      try {
        await setBookingEnabledAction(next);
        router.refresh();
      } catch {
        setEnabled(!next); // put the switch back rather than lie about the state
      }
    });
  }

  function save() {
    const data = new FormData();
    data.set('bookingEnabled', enabled ? 'on' : 'off');
    data.set('timezone', timezone);
    for (const d of weekdays) data.append('bookingWeekday', String(d));
    for (const t of windowTimes) data.append('bookingWindow', t);
    data.set('bookingWindowMinutes', String(windowMinutes));
    data.set('bookingMaxPerDay', String(maxPerDay));
    data.set('bookingLeadDays', String(leadDays));
    if (instant.enabled) data.set('instantBookEnabled', 'on');
    data.set('instantBookMinAmount', String(instant.minAmount || ''));
    data.set('instantBookRadius', String(instant.radiusMiles));
    data.set('instantBookGeoMode', instant.geoMode);
    if (instant.driveTime) data.set('instantBookDriveTime', 'on');

    startTransition(async () => {
      try {
        await updateBookingAvailabilityAction(data);
        setSaveError(null);
        setSavedAt(Date.now());
        router.refresh();
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Could not save. Please try again.');
      }
    });
  }

  function discard() {
    setWeekdays(availability.weekdays);
    setWindowTimes(availability.windowTimes);
    setWindowMinutes(availability.windowMinutes);
    setMaxPerDay(availability.maxPerDay);
    setLeadDays(availability.leadDays);
    setTimezone(availability.timezone);
    setInstant(instantBook);
    setSaveError(null);
  }

  // --- live preview -------------------------------------------------------
  /* The days the public page is actually offering, straight from the offer
     engine. This used to walk the calendar here applying weekdays, lead time
     and blocks — and nothing else, so a day already at its job limit or fully
     taken still appeared, and the empty state said "blocked or full" about a
     "full" it had never worked out. The cost of using the real answer is that
     it reflects SAVED settings, so unsaved edits say so below rather than
     showing a preview of an offer that does not exist yet. */
  const previewDays = useMemo(() => bookableDays.slice(0, 5), [bookableDays]);

  const dayNames = useMemo(() => {
    if (weekdays.length === 0) return 'No days';
    const sorted = [...weekdays].sort();
    const isRun = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
    if (isRun && sorted.length > 2) return `${WEEKDAY_LABELS[sorted[0]]} – ${WEEKDAY_LABELS[sorted[sorted.length - 1]]}`;
    return sorted.map((d) => WEEKDAY_LABELS[d]).join(', ');
  }, [weekdays]);

  // Windows that swallow the next one at the current length. Recomputed with the
  // length so the warning appears the moment they widen past a clash.
  const overlaps = useMemo(() => overlappingWindowTimes(windowTimes, windowMinutes), [windowTimes, windowMinutes]);

  /* Windows the public page will refuse to offer because they fall outside the
     working day at one end or the other. Same function the offer filter uses,
     so the warning and the behavior cannot disagree. The workday is the SAVED
     value — it is set in Settings → Schedule, not on this screen, so there is
     no local state to prefer over it. */
  const workdayStart = availability.workdayStart;
  const workdayEnd = availability.workdayEnd;
  const outside = useMemo(
    () => outsideWorkdayWindowTimes(windowTimes, windowMinutes, workdayStart, workdayEnd),
    [windowTimes, windowMinutes, workdayStart, workdayEnd],
  );

  /* What a customer is actually offered — the ticked windows minus the ones the
     offer filter drops. Everything on this page that claims to describe the
     public page reads this and not `windowTimes`, which is how the preview came
     to show a green check beside a window the paragraph below it said was not
     offered. */
  const offeredTimes = useMemo(() => windowTimes.filter((t) => !outside.includes(t)), [windowTimes, outside]);

  /* What the FIRST previewed day is really offering, from the engine that chose
     the day. `offeredTimes` is this config's windows minus the ones the workday
     drops; it knows nothing about that particular Monday's booked slots, so a
     day the engine offered with Afternoon only was drawn leading with Morning
     and the green check on it. While there are unsaved edits the local set is
     the better guess, because the saved answer is the stale one — which is what
     the note above the preview already says. */
  const previewTimes = useMemo(
    () => (dirty ? offeredTimes : previewDays[0]?.times ?? offeredTimes),
    [dirty, offeredTimes, previewDays],
  );

  /* Which end each dropped window falls off, so the warning can say what to
     change. Three cases, not two: `outside` also catches a window that OPENS
     after the day is over, and rolling that into "finishes after your working
     day ends" advised shortening it, which can never bring it back. They are
     not exclusive either — a 4-hour window at 08:00 against a 09:00–10:00
     workday falls off both ends, and "move the start later" alone sends
     somebody to 09:00 where it still overruns. */
  const startsEarly = useMemo(
    () => outside.filter((t) => timeToMinutes(t) < timeToMinutes(workdayStart)),
    [outside, workdayStart],
  );
  const startsAfterClose = useMemo(
    () => outside.filter((t) => timeToMinutes(t) >= timeToMinutes(workdayEnd)),
    [outside, workdayEnd],
  );
  const endsLate = useMemo(
    () => outside.filter((t) => !startsAfterClose.includes(t) && timeToMinutes(windowEndTime(t, windowMinutes)) > timeToMinutes(workdayEnd)),
    [outside, startsAfterClose, windowMinutes, workdayEnd],
  );

  // Deduped: a 7am and an 8am window are both "Morning", and listing it twice
  // reads as a mistake rather than as two options.
  const windowNames = useMemo(
    () => [...new Set(offeredTimes.map(windowPartName))].join(', ') || 'None',
    [offeredTimes],
  );

  const nextBlock = blocks[0] ?? null;
  /* Configured is not live. The header read "Live — customers can request an
     available arrival window" straight above a card reading "0 open windows
     across 0 days", because it asked the settings and never the offer engine.
     Every self-serve booking is lost while that holds, so the real count
     decides — and the in-between state is named rather than rounded to
     whichever extreme is nearer. */
  const configured = enabled && Boolean(bookingUrl) && weekdays.length > 0 && offeredTimes.length > 0;
  const live = configured && openWindowCount > 0;
  /* The offer counts were measured with booking as the SERVER last saw it. The
     master switch commits locally before its round trip lands, and while
     booking was paused computeBookingDays short-circuits — so `openWindowCount`
     is 0 and `bookableDays` is empty because nobody asked, not because every day
     is full. For the second between the click and the refresh that read as
     "Nothing bookable · they are blocked, at their booking limit, or already
     taken": a specific diagnosis of something that was never measured, directly
     after the single most important click on the page. */
  const countsPredateSwitch = enabled !== availability.enabled;

  return (
    <main className="wide-shell workspace-shell bset">
      <header className="bset-head">
        <div>
          <h1>
            Online booking <Icon name="calendar" />
          </h1>
          <p>Control when customers can book and how your time is managed.</p>
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

      {/* Master switch + what it currently means, side by side: the switch says
          what you've chosen, the status says whether it's actually working. */}
      <section className="bset-master">
        <label className="bset-master-switch">
          <input type="checkbox" checked={enabled} onChange={(e) => setMaster(e.target.checked)} disabled={pending} />
          <span className="bset-switch-track" aria-hidden="true"><span /></span>
          <span className="bset-master-copy">
            <strong>Online booking is <em className={enabled ? 'on' : 'off'}>{enabled ? 'ON' : 'OFF'}</em></strong>
            <small>Customers can request available dates from your website.</small>
          </span>
        </label>

        <div className={`bset-master-status${live ? ' live' : ''}`}>
          <p>
            <span className="bset-dot" aria-hidden="true" />
            {live ? 'Live' : countsPredateSwitch ? 'Checking…' : configured ? 'Nothing bookable' : enabled ? 'Not live yet' : 'Paused'}
          </p>
          <small>
            {!bookingUrl
              ? 'Publish your website to switch on self-serve booking.'
              : !enabled
                ? 'Your booking page is turned off and not accepting requests.'
                : countsPredateSwitch
                  ? 'Switching your booking page back on — working out which days it can offer.'
                  : weekdays.length === 0
                  ? 'No days are open, so nothing is on offer.'
                  : windowTimes.length === 0
                    ? 'No arrival windows are offered, so nothing is on offer.'
                    : offeredTimes.length === 0
                      ? 'Every arrival window you offer falls outside your working hours, so nothing is on offer.'
                      : live
                        ? 'Customers can request an available arrival window from your website.'
                        : 'Your settings are on, but no day in the next few weeks has a free window — they are blocked, at their booking limit, or already taken. Customers see “No windows on offer right now”.'}
          </small>
        </div>

        <button type="button" className="btn secondary bset-pause" onClick={() => setMaster(!enabled)} disabled={pending}>
          <Icon name={enabled ? 'pause' : 'play'} />
          {enabled ? 'Pause booking' : 'Resume booking'}
        </button>
      </section>

      <div className="bset-cards">
        <button type="button" className="bset-card" onClick={() => jumpTo('days')}>
          <span className="bset-card-icon tone-days"><Icon name="calendar" /></span>
          <span className="bset-card-label">Open days</span>
          <strong>{dayNames}</strong>
          <small>Customers can book {weekdays.length} day{weekdays.length === 1 ? '' : 's'} a week</small>
          <span className="bset-card-edit">Edit <Icon name="chevronRight" /></span>
        </button>

        <button type="button" className="bset-card" onClick={() => jumpTo('days')}>
          <span className="bset-card-icon tone-time"><Icon name="clock" /></span>
          <span className="bset-card-label">Arrival options</span>
          <strong>{windowNames}</strong>
          {/* The value can read "None" — windowNames counts what is OFFERED,
              and every ticked window can fall outside the working day. "Customers
              choose a preferred time window" under the word None is the card
              contradicting itself. */}
          <small>{offeredTimes.length === 0 ? 'No window is on offer right now' : 'Customers choose a preferred time window'}</small>
          <span className="bset-card-edit">Edit <Icon name="chevronRight" /></span>
        </button>

        <button type="button" className="bset-card" onClick={() => jumpTo('timeoff')}>
          <span className="bset-card-icon tone-off"><Icon name="briefcase" /></span>
          <span className="bset-card-label">Time off</span>
          <strong>{blocks.length} upcoming</strong>
          <small>
            {nextBlock
              ? `Next: ${formatBlockRange(nextBlock.start_date, nextBlock.end_date).split(' (')[0]}${nextBlock.reason ? ` · ${nextBlock.reason}` : ''}`
              : 'No days blocked off'}
          </small>
          <span className="bset-card-edit">Edit <Icon name="chevronRight" /></span>
        </button>

        <button type="button" className="bset-card" onClick={() => jumpTo('limits')}>
          <span className="bset-card-icon tone-link"><Icon name="link" /></span>
          <span className="bset-card-label">Booking page</span>
          <strong>{live ? 'Live' : configured ? 'Nothing bookable' : enabled ? 'Not live' : 'Paused'}</strong>
          <small>
            {live
              ? `${openWindowCount} open window${openWindowCount === 1 ? '' : 's'} across ${openDayCount} day${openDayCount === 1 ? '' : 's'}`
              : configured
                ? 'Set up, but no open windows in the next few weeks'
                : sitePublished ? 'Nothing on offer right now' : 'Publish your website first'}
          </small>
          <span className="bset-card-edit">Edit <Icon name="chevronRight" /></span>
        </button>
      </div>

      <div className="bset-body">
        <div className="bset-main">
          {/* 1 — days & windows */}
          <section
            className="bset-section"
            ref={(el) => { sectionRefs.current.days = el; }}
          >
            <button
              type="button"
              className="bset-section-head"
              onClick={() => toggleSection('days')}
              aria-expanded={isOpen('days')}
              aria-controls={isOpen('days') ? 'booking-section-days' : undefined}
            >
              <span className="bset-num">1</span>
              <span className="bset-section-copy">
                <strong>When customers can book</strong>
                <small>Set your available days and preferred arrival time windows.</small>
              </span>
              <Icon name="chevronDown" className={`bset-chev${isOpen('days') ? ' open' : ''}`} />
            </button>

            {isOpen('days') && (
              <div id="booking-section-days" className="bset-section-body">
                <div className="bset-field-group">
                  <p className="bset-group-title">Booking days</p>
                  <p className="bset-group-hint">Customers can request these days.</p>
                  <div className="bset-daygrid" role="group" aria-label="Booking days">
                    {WEEKDAY_LABELS.map((label, day) => {
                      const on = weekdays.includes(day);
                      return (
                        <button
                          type="button"
                          key={day}
                          className={`bset-day${on ? ' on' : ''}`}
                          aria-pressed={on}
                          aria-label={FULL_WEEKDAY[day]}
                          onClick={() => toggleWeekday(day)}
                        >
                          <span className="bset-day-check" aria-hidden="true">{on ? <Icon name="check" /> : null}</span>
                          {label.toUpperCase()}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="bset-divider" />

                <div className="bset-field-group">
                  <p className="bset-group-title">How long a window runs</p>
                  <p className="bset-group-hint">
                    Customers are shown a span, not a time. Promising &ldquo;8:00 AM&rdquo; makes you late the first
                    morning a job runs over.
                  </p>
                  <div className="bset-lengths" role="radiogroup" aria-label="Arrival window length">
                    {WINDOW_LENGTHS.map((option) => (
                      <button
                        type="button"
                        key={option.minutes}
                        role="radio"
                        aria-checked={windowMinutes === option.minutes}
                        className={`bset-length${windowMinutes === option.minutes ? ' on' : ''}`}
                        onClick={() => setWindowMinutes(option.minutes)}
                      >
                        <strong>{option.label}</strong>
                        <small>{option.note}</small>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bset-field-group">
                  <p className="bset-group-title">Arrival time options</p>
                  <p className="bset-group-hint">Pick the windows you offer. You set the exact time when you confirm.</p>
                  <div className="bset-windows" role="group" aria-label="Arrival time options">
                    {[...new Set([...BOOKING_WINDOW_PRESET_TIMES, ...windowTimes])].sort().map((time) => {
                      const on = windowTimes.includes(time);
                      const custom = !BOOKING_WINDOW_PRESET_TIMES.includes(time);
                      return (
                        <button
                          type="button"
                          key={time}
                          className={`bset-window${on ? ' on' : ''}`}
                          aria-pressed={on}
                          onClick={() => toggleWindow(time)}
                        >
                          <span className="bset-window-icon"><Icon name={Number(time.slice(0, 2)) < 12 ? 'sunrise' : 'sun'} /></span>
                          <span className="bset-window-copy">
                            <strong>{windowPartName(time)}{custom ? <em>Custom</em> : null}</strong>
                            <small>{formatWindowRange(time, windowMinutes)}</small>
                          </span>
                          <span className="bset-window-check" aria-hidden="true">{on ? <Icon name="check" /> : null}</span>
                        </button>
                      );
                    })}
                  </div>
                  {overlaps.length > 0 ? (
                    <p className="bset-window-warn">
                      <Icon name="alert" /> {overlaps.map((t) => windowPartName(t)).join(' and ')} run into the next
                      window at this length. Customers will see two options covering the same hours.
                    </p>
                  ) : null}
                  {/* A window outside the working day is NOT offered — the
                      public page used to offer "3:00 – 7:00 PM" against a day
                      ending at 6:00 PM, which promises a homeowner an arrival
                      window an hour after work stops. It is dropped rather than
                      shortened, so this says which one and why: a window that
                      silently stops appearing reads as the booking page being
                      broken. Split by which end it falls off, because the fix
                      differs — an early window moves later or the day starts
                      earlier; a late one shortens or the day runs longer. */}
                  {startsEarly.length > 0 ? (
                    <p className="bset-window-warn">
                      <Icon name="alert" /> {startsEarly.map((t) => windowPartName(t)).join(' and ')}{' '}
                      {startsEarly.length === 1 ? 'starts' : 'start'} before your working day begins at{' '}
                      {formatWindowClock(workdayStart)}, so {startsEarly.length === 1 ? 'it is' : 'they are'} not
                      offered. Move the start later, or start your working day earlier.
                    </p>
                  ) : null}
                  {startsAfterClose.length > 0 ? (
                    <p className="bset-window-warn">
                      <Icon name="alert" /> {startsAfterClose.map((t) => windowPartName(t)).join(' and ')}{' '}
                      {startsAfterClose.length === 1 ? 'starts' : 'start'} after your working day ends at{' '}
                      {formatWindowClock(workdayEnd)}, so {startsAfterClose.length === 1 ? 'it is' : 'they are'} not
                      offered. Move the start earlier, or extend your working hours — shortening the window
                      won&rsquo;t help.
                    </p>
                  ) : null}
                  {endsLate.length > 0 ? (
                    <p className="bset-window-warn">
                      <Icon name="alert" /> {endsLate.map((t) => windowPartName(t)).join(' and ')}{' '}
                      {endsLate.length === 1 ? 'finishes' : 'finish'} after your working day ends at{' '}
                      {formatWindowClock(workdayEnd)}, so {endsLate.length === 1 ? 'it is' : 'they are'} not offered.
                      Shorten the window length, move the start earlier, or extend your working hours.
                    </p>
                  ) : null}
                  <AddWindow
                    disabled={windowTimes.length >= MAX_BOOKING_WINDOWS}
                    existing={[...new Set([...BOOKING_WINDOW_PRESET_TIMES, ...windowTimes])]}
                    onAdd={(time) => setWindowTimes((w) => [...w, time].sort())}
                  />
                </div>

                {/* The settings above, read back as a sentence — from what is
                    actually offered, so a window named in the warning above
                    cannot also be listed here as something a customer can
                    choose. */}
                <div className={`bset-live${weekdays.length === 0 || offeredTimes.length === 0 ? ' warn' : ''}`}>
                  <Icon name={weekdays.length === 0 || offeredTimes.length === 0 ? 'alert' : 'checkCircle'} />
                  <div>
                    <strong>
                      {weekdays.length === 0 || offeredTimes.length === 0
                        ? 'Customers can’t choose anything yet:'
                        : 'Customers can currently choose:'}
                    </strong>
                    <p>
                      <span>{dayNames}</span>
                      <span>{windowNames}</span>
                      <span>{LEAD_OPTIONS.find((o) => o.value === leadDays)?.label ?? 'From tomorrow'}</span>
                    </p>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* 2 — limits */}
          <section className="bset-section" ref={(el) => { sectionRefs.current.limits = el; }}>
            <button
              type="button"
              className="bset-section-head"
              onClick={() => toggleSection('limits')}
              aria-expanded={isOpen('limits')}
              aria-controls={isOpen('limits') ? 'booking-section-limits' : undefined}
            >
              <span className="bset-num">2</span>
              <span className="bset-section-copy">
                <strong>Booking limits</strong>
                <small>Control how many jobs you take and how far in advance.</small>
              </span>
              <Icon name="chevronDown" className={`bset-chev${isOpen('limits') ? ' open' : ''}`} />
            </button>

            {isOpen('limits') && (
              <div id="booking-section-limits" className="bset-section-body">
                <div className="bset-grid">
                  <label className="bset-field">
                    <span>Max bookings per day <Tip text="Once a day reaches this many jobs it stops offering slots." /></span>
                    <select value={maxPerDay} onChange={(e) => setMaxPerDay(Number(e.target.value))}>
                      {[1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20].map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </label>

                  <label className="bset-field">
                    <span>Earliest booking <Tip text="How soon a customer can book with you. Gives you lead time to plan your route." /></span>
                    <select value={leadDays} onChange={(e) => setLeadDays(Number(e.target.value))}>
                      {LEAD_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="bset-field bset-field-wide">
                    <span>Timezone <Tip text="So booking days line up with your local calendar, not the server's." /></span>
                    <select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                      {timezoneOptions.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            )}
          </section>

          {/* 3 — advanced, folded by default */}
          <section className="bset-section bset-section-quiet" ref={(el) => { sectionRefs.current.advanced = el; }}>
            <button
              type="button"
              className="bset-section-head"
              onClick={() => toggleSection('advanced')}
              aria-expanded={isOpen('advanced')}
              aria-controls={isOpen('advanced') ? 'booking-section-advanced' : undefined}
            >
              <span className="bset-num">3</span>
              <span className="bset-section-copy">
                <strong>Advanced booking rules</strong>
                <small>Fine-tune whose requests are accepted without your review.</small>
              </span>
              <span className="bset-expand">{isOpen('advanced') ? 'Collapse' : 'Expand'} <Icon name="chevronDown" className={`bset-chev${isOpen('advanced') ? ' open' : ''}`} /></span>
            </button>

            {isOpen('advanced') && (
              <div id="booking-section-advanced" className="bset-section-body">
                <label className="bset-check">
                  <input type="checkbox" checked={instant.enabled} onChange={(e) => setInstant({ ...instant, enabled: e.target.checked })} />
                  <span className="bset-switch-track small" aria-hidden="true"><span /></span>
                  <span className="bset-check-copy">
                    <strong>Only accept qualified jobs without review</strong>
                    <small>The Book page asks a few questions for an instant estimate first. Small, out-of-area or work-you-don’t-take jobs are routed to a callback instead.</small>
                  </span>
                </label>

                {/* Dependent fields stay hidden until the gate is on — they do
                    nothing while it's off, and reading them suggests otherwise. */}
                {instant.enabled && (
                  <div className="bset-dependent">
                    <div className="bset-grid">
                      <label className="bset-field">
                        <span>Minimum job value <Tip text="A job estimating below this is sent to request-a-callback instead of taking a slot. Blank or 0 for no floor." /></span>
                        <MoneyInput value={instant.minAmount} onChange={(n) => setInstant({ ...instant, minAmount: n })} />
                      </label>
                      <label className="bset-field">
                        <span>“Nearby” radius (miles) <Tip text="How close an existing job counts as “we'll already be in your area” that day." /></span>
                        <input
                          type="number"
                          min="1"
                          max="100"
                          step="1"
                          inputMode="numeric"
                          value={instant.radiusMiles}
                          onChange={(e) => setInstant({ ...instant, radiusMiles: Number(e.target.value) || 1 })}
                        />
                      </label>
                      <label className="bset-field bset-field-wide">
                        <span>Days near your existing jobs <Tip text="Restrict keeps routes tight; a customer with no nearby day is offered a callback instead. Needs your business address geocoded." /></span>
                        <select value={instant.geoMode} onChange={(e) => setInstant({ ...instant, geoMode: e.target.value })}>
                          <option value="prefer">Prefer — show nearby days first</option>
                          <option value="restrict">Restrict — only offer nearby days</option>
                        </select>
                      </label>
                    </div>

                    <label className="bset-check">
                      <input type="checkbox" checked={instant.driveTime} onChange={(e) => setInstant({ ...instant, driveTime: e.target.checked })} />
                      <span className="bset-switch-track small" aria-hidden="true"><span /></span>
                      <span className="bset-check-copy">
                        <strong>Use real driving distance &amp; time</strong>
                        <small>More accurate than straight-line, and shows “~X min away”. Falls back to straight-line if the Distance Matrix API isn’t enabled.</small>
                      </span>
                    </label>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* 4 — time off */}
          <section className="bset-section" ref={(el) => { sectionRefs.current.timeoff = el; }}>
            <button
              type="button"
              className="bset-section-head"
              onClick={() => toggleSection('timeoff')}
              aria-expanded={isOpen('timeoff')}
              aria-controls={isOpen('timeoff') ? 'booking-section-timeoff' : undefined}
            >
              <span className="bset-num">4</span>
              <span className="bset-section-copy">
                <strong>Time off &amp; blocked dates</strong>
                <small>Block days you’re unavailable. They drop off your booking page.</small>
              </span>
              <Icon name="chevronDown" className={`bset-chev${isOpen('timeoff') ? ' open' : ''}`} />
            </button>

            {isOpen('timeoff') && (
              <div id="booking-section-timeoff" className="bset-section-body">
                <TimeOff blocks={blocks} todayKey={todayKey} />
              </div>
            )}
          </section>
        </div>

        <aside className="bset-rail">
          <section className="bset-preview">
            <h2>What customers will see</h2>
            <p className="bset-preview-sub">
              {dirty
                ? 'The dates come from your live booking page — save to see your changes here.'
                : 'This is how your booking looks to them.'}
            </p>

            <div className="bset-phone" role="img" aria-label="Preview of your public booking page">
              {previewDays.length === 0 || previewTimes.length === 0 ? (
                <div className="bset-phone-empty">
                  <Icon name="alert" />
                  <strong>{!enabled ? 'Booking is paused' : countsPredateSwitch ? 'Checking…' : 'Nothing on offer'}</strong>
                  <p>
                    {!enabled
                      ? 'Customers see a “request a callback” form instead of a calendar.'
                      : !bookingUrl
                        ? 'Publish your website and this becomes a live booking page.'
                        : countsPredateSwitch
                          ? 'Working out what your booking page can offer now that it is back on.'
                          : weekdays.length === 0
                            ? 'Pick at least one booking day above.'
                            : windowTimes.length === 0
                              ? 'Pick at least one arrival time option above.'
                              : offeredTimes.length === 0
                                ? 'Every window you offer falls outside your working hours, so none can be shown.'
                                : 'Every upcoming day is blocked, at its booking limit, or already taken.'}
                  </p>
                </div>
              ) : (
                <>
                  <strong className="bset-phone-title">Choose a date &amp; time</strong>
                  <p className="bset-phone-sub">We’ll confirm your arrival window after reviewing the request.</p>
                  {/* The month is spelled out, because "the 22nd" is not an
                      answer to "when can somebody actually book me?" — which is
                      the question this whole panel exists to answer and never
                      did. */}
                  <p className="bset-phone-label">Next available · {previewDays[0].dayLabel}</p>
                  <div className="bset-phone-days">
                    {previewDays.map((day, i) => {
                      const d = formatDay(day.dateKey);
                      return (
                        <span className={`bset-phone-day${i === 0 ? ' on' : ''}`} key={day.dateKey}>
                          <small>{d.dow}</small>
                          <strong>{d.num}</strong>
                        </span>
                      );
                    })}
                  </div>
                  <p className="bset-phone-label">Preferred time</p>
                  {previewTimes.map((time, i) => (
                    <span className={`bset-phone-window${i === 0 ? ' on' : ''}`} key={time}>
                      <Icon name={Number(time.slice(0, 2)) < 12 ? 'sunrise' : 'sun'} />
                      <span>
                        <strong>{windowPartName(time)}</strong>
                        <small>{formatWindowRange(time, windowMinutes)}</small>
                      </span>
                      <span className="bset-phone-check" aria-hidden="true">{i === 0 ? <Icon name="check" /> : null}</span>
                    </span>
                  ))}
                  <span className="bset-phone-cta">Continue</span>
                </>
              )}
            </div>
          </section>

          {/* The link follows the tip, rather than always pointing at Quick
              Stops. Two of these three tips are about controls on this very
              page — arrival windows and lead time — and sending someone from
              "add more arrival windows" to a different product entirely reads
              as a mis-wired link, because it was one. Only the third tip is
              about an open day, which is the one thing here Quick Stops has
              anything to do with. */}
          <section className="bset-tipcard">
            <Icon name="bulb" />
            <div>
              <strong>Tip</strong>
              <p>
                {windowTimes.length < 2
                  ? 'Add more arrival windows to give customers more flexibility.'
                  : leadDays >= 3
                    ? 'A long lead time turns away urgent work. “From tomorrow” books more jobs.'
                    : 'Keep a weekday free and it shows up here as an open window automatically.'}
              </p>
              {windowTimes.length >= 2 && leadDays < 3 ? (
                <Link href="/dashboard/quick-stops">
                  How Quick Stops fill an open day <Icon name="external" />
                </Link>
              ) : null}
            </div>
          </section>

          <RecurringCard todayKey={todayKey} />
        </aside>
      </div>

      {/* Sticky only once something has changed. */}
      {(dirty || saveError) && (
        <div className="bset-savebar">
          <p aria-live="polite">
            <Icon name={saveError ? 'alert' : 'checkCircle'} />
            <span>
              <strong>{saveError ? 'Couldn’t save' : 'You have unsaved changes'}</strong>
              <small>{saveError ?? 'Don’t forget to save your schedule.'}</small>
            </span>
          </p>
          <div>
            <button type="button" className="btn secondary" onClick={discard} disabled={pending}>Discard changes</button>
            <button type="button" className="btn primary" onClick={save} disabled={pending}>{pending ? 'Saving…' : 'Save schedule'}</button>
          </div>
        </div>
      )}
      {!dirty && savedAt && !saveError && (
        <p className="bset-saved" aria-live="polite"><Icon name="checkCircle" /> Schedule saved</p>
      )}
    </main>
  );
}

// --- money field -----------------------------------------------------------

/**
 * WHOLE DOLLARS, AND IT LOOKS LIKE IT.
 *
 * This printed two decimal places, the input asked for `decimal`, and the
 * placeholder was "0.00" - so the field invited cents. It then rounded them
 * away without a word: typing 250.50 left 251.00 sitting in the box, which is
 * indistinguishable from "my setting did not save". The floor for taking a job
 * without review is a whole-dollar decision; the field says so now.
 */
function formatDollars(n: number): string {
  return Math.round(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

// Reads as money at rest ($5,000.00) and as plain digits while you're typing —
// thousands separators fight the cursor if they're inserted mid-edit.
//
// The threshold is stored in whole dollars, so the value is rounded on the way
// out and always redisplays with .00. Showing cents you can't actually save
// would be the field lying about what it kept.
function MoneyInput({ value, onChange }: { value: number; onChange: (next: number) => void }) {
  const [text, setText] = useState(value > 0 ? formatDollars(value) : '');
  const [editing, setEditing] = useState(false);

  // Reflect a change made elsewhere (Discard changes) unless it's being typed in.
  useEffect(() => {
    if (!editing) setText(value > 0 ? formatDollars(value) : '');
  }, [value, editing]);

  return (
    <div className="bset-money">
      <span aria-hidden="true">$</span>
      <input
        type="text"
        inputMode="numeric"
        placeholder="0"
        value={text}
        aria-label="Minimum job value in whole dollars"
        onFocus={() => { setEditing(true); setText(value > 0 ? String(value) : ''); }}
        onBlur={() => setEditing(false)}
        onChange={(event) => {
          /*
           * THE DOT STAYS WHILE YOU TYPE, and only the whole-dollar part counts.
           *
           * Deleting "." from the text of a CONTROLLED input is a trap: "250.50"
           * becomes "250", and the "5" and "0" still to come land after it —
           * 25050, a hundredfold larger floor than the one that was typed, on
           * the number that decides which jobs get taken without review.
           *
           * So the text keeps what was typed and the VALUE reads the part before
           * the point. On blur the box redraws as the whole dollars that were
           * actually kept, so the truncation is visible the moment it happens
           * rather than discovered later.
           */
          const raw = event.target.value.replace(/[^\d.]/g, '');
          const [whole = '', ...rest] = raw.split('.');
          setText(rest.length > 0 ? `${whole}.${rest.join('')}` : whole);
          const parsed = Number(whole);
          onChange(whole && Number.isFinite(parsed) ? Math.max(0, parsed) : 0);
        }}
      />
    </div>
  );
}

// --- add a custom arrival window ------------------------------------------

function AddWindow({ existing, disabled, onAdd }: { existing: string[]; disabled: boolean; onAdd: (time: string) => void }) {
  const [open, setOpen] = useState(false);
  const [time, setTime] = useState('07:00');
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button type="button" className="bset-addwindow" onClick={() => setOpen(true)} disabled={disabled}>
        <Icon name="plus" /> {disabled ? `Limit of ${MAX_BOOKING_WINDOWS} windows reached` : 'Add custom window'}
      </button>
    );
  }

  function add() {
    if (!isWindowTime(time)) { setError('Pick a valid time.'); return; }
    if (existing.includes(time)) { setError('That time is already an option.'); return; }
    onAdd(time);
    setOpen(false);
    setError(null);
  }

  return (
    <div className="bset-addwindow-form">
      <label>
        <span>Arrival time</span>
        <input type="time" value={time} step={900} onChange={(e) => { setTime(e.target.value); setError(null); }} />
      </label>
      <button type="button" className="btn primary" onClick={add}>Add window</button>
      <button type="button" className="btn secondary" onClick={() => { setOpen(false); setError(null); }}>Cancel</button>
      {error && <p className="bset-addwindow-error">{error}</p>}
    </div>
  );
}

// --- time off --------------------------------------------------------------

function TimeOff({ blocks, todayKey }: { blocks: AvailabilityBlock[]; todayKey: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [choosing, setChoosing] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!menuFor) return;
    const close = () => setMenuFor(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menuFor]);

  // How many blocks share a reason — a repeat lays down one block per date, so
  // this is what makes "remove the whole series" possible.
  const byReason = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of blocks) {
      const key = (b.reason ?? '').trim();
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [blocks]);

  function quickBlock(start: string, end: string, reason: string) {
    const data = new FormData();
    data.set('startDate', start);
    data.set('endDate', end);
    data.set('reason', reason);
    startTransition(async () => {
      try {
        await addAvailabilityBlockAction(data);
        setError(null);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not block those days.');
      }
    });
  }

  // The coming Saturday and Sunday. On a Saturday that means today+tomorrow,
  // not the weekend six days away.
  function thisWeekend(): [string, string] {
    const dow = weekdayOf(todayKey);
    const toSat = dow === 0 ? -1 : 6 - dow;
    const sat = addDays(todayKey, toSat);
    return [dow === 0 ? todayKey : sat, dow === 0 ? todayKey : addDays(sat, 1)];
  }

  return (
    <>
      <div className="bset-timeoff-actions">
        <button type="button" className="btn primary bset-addblock" onClick={() => setChoosing((c) => !c)} disabled={pending}>
          <Icon name="plus" /> Add blocked dates
        </button>
        <button type="button" className="bset-quick" onClick={() => quickBlock(todayKey, todayKey, '')} disabled={pending}>Today</button>
        <button type="button" className="bset-quick" onClick={() => quickBlock(addDays(todayKey, 1), addDays(todayKey, 1), '')} disabled={pending}>Tomorrow</button>
        <button type="button" className="bset-quick" onClick={() => { const [s, e] = thisWeekend(); quickBlock(s, e, ''); }} disabled={pending}>This weekend</button>
        <button type="button" className="bset-quick" onClick={() => setChoosing((c) => !c)} disabled={pending}>
          <Icon name="calendar" /> Choose dates
        </button>
      </div>

      {choosing && (
        <form
          className="bset-blockform"
          action={async (data) => {
            try {
              await addAvailabilityBlockAction(data);
              setChoosing(false);
              setError(null);
              router.refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Could not block those days.');
            }
          }}
        >
          <label><span>From</span><input name="startDate" type="date" required /></label>
          <label><span>To</span><input name="endDate" type="date" /></label>
          <label className="bset-blockform-reason"><span>Reason (only you see this)</span><input name="reason" placeholder="Vacation, training…" /></label>
          <button type="submit" className="btn primary">Block these days</button>
        </form>
      )}

      {error && <p className="bset-error">{error}</p>}

      {blocks.length === 0 ? (
        <p className="bset-empty">No days blocked off. Your booking page is offering every open day.</p>
      ) : (
        <ul className="bset-blocks">
          {blocks.map((block) => {
            const reason = (block.reason ?? '').trim();
            const seriesCount = reason ? byReason.get(reason) ?? 0 : 0;
            return (
              <li key={block.id}>
                <span className="bset-block-icon"><Icon name="calendar" /></span>
                <span className="bset-block-copy">
                  <strong>{formatBlockRange(block.start_date, block.end_date)}</strong>
                  <small>{reason || 'Blocked off'}</small>
                </span>
                <span className="bset-block-len">{blockLength(block.start_date, block.end_date)}</span>
                <span className="bset-block-menu">
                  <button
                    type="button"
                    className="bset-dots"
                    aria-label={`Actions for ${formatBlockRange(block.start_date, block.end_date)}`}
                    aria-expanded={menuFor === block.id}
                    aria-controls={menuFor === block.id ? `timeoff-menu-${block.id}` : undefined}
                    onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === block.id ? null : block.id); }}
                  >
                    <Icon name="dots" />
                  </button>
                  {menuFor === block.id && (
                    <span id={`timeoff-menu-${block.id}`} className="bset-dots-pop" role="menu" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => startTransition(async () => { await removeAvailabilityBlockAction(block.id); setMenuFor(null); router.refresh(); })}
                      >
                        Remove this block
                      </button>
                      {seriesCount > 1 && (
                        <button
                          type="button"
                          onClick={() => startTransition(async () => { await removeBlocksByReasonAction(reason); setMenuFor(null); router.refresh(); })}
                        >
                          Remove all {seriesCount} “{reason}”
                        </button>
                      )}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

// --- recurring time off ----------------------------------------------------

function RecurringCard({ todayKey }: { todayKey: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section className="bset-recurring">
      <Icon name="repeat" />
      <div>
        <strong>Need recurring time off?</strong>
        <p>Block the same day each week, fortnight, or month in one go.</p>

        {!open ? (
          <button type="button" className="bset-recurring-link" onClick={() => setOpen(true)}>
            Set up recurring time off <Icon name="chevronRight" />
          </button>
        ) : (
          <form
            className="bset-recurring-form"
            action={(data) => {
              startTransition(async () => {
                try {
                  await addRecurringBlockAction(data);
                  setOpen(false);
                  setMessage('Recurring time off added.');
                  router.refresh();
                } catch (e) {
                  setMessage(e instanceof Error ? e.message : 'Could not add that repeat.');
                }
              });
            }}
          >
            <label><span>Starting</span><input name="startDate" type="date" defaultValue={todayKey} required /></label>
            <label>
              <span>Repeats</span>
              <select name="frequency" defaultValue="weekly">
                <option value="weekly">Every week</option>
                <option value="biweekly">Every 2 weeks</option>
                <option value="monthly">Every month</option>
              </select>
            </label>
            <label>
              <span>How many times</span>
              <select name="occurrences" defaultValue="8">
                {[4, 8, 12, 26, 52].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label><span>Reason</span><input name="reason" placeholder="Day off" /></label>
            <div className="bset-recurring-actions">
              <button type="submit" className="btn primary" disabled={pending}>{pending ? 'Adding…' : 'Add repeat'}</button>
              <button type="button" className="btn secondary" onClick={() => setOpen(false)}>Cancel</button>
            </div>
            <p className="bset-recurring-note">Each date is added as its own blocked day, so you can remove any one of them later.</p>
          </form>
        )}
        {message && <p className="bset-recurring-msg" aria-live="polite">{message}</p>}
      </div>
    </section>
  );
}
