'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BOOKING_WINDOW_PRESETS,
  MAX_BOOKING_WINDOWS,
  WEEKDAY_LABELS,
  formatWindowClock,
  isWindowTime,
  labelForWindowTime,
  type BookingAvailability,
} from '@/lib/booking-availability';
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
  const [maxPerDay, setMaxPerDay] = useState(availability.maxPerDay);
  const [leadDays, setLeadDays] = useState(availability.leadDays);
  const [timezone, setTimezone] = useState(availability.timezone);
  const [instant, setInstant] = useState(instantBook);

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    days: true,
    limits: true,
    advanced: false,
    timeoff: true,
  });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  // Compare against what the server sent, so "unsaved" means genuinely
  // different — not merely "touched and put back".
  const dirty = useMemo(() => {
    const sameList = (a: (string | number)[], b: (string | number)[]) =>
      a.length === b.length && a.every((v, i) => v === b[i]);
    return (
      !sameList([...weekdays].sort(), [...availability.weekdays].sort()) ||
      !sameList([...windowTimes].sort(), [...availability.windowTimes].sort()) ||
      maxPerDay !== availability.maxPerDay ||
      leadDays !== availability.leadDays ||
      timezone !== availability.timezone ||
      instant.enabled !== instantBook.enabled ||
      instant.minAmount !== instantBook.minAmount ||
      instant.radiusMiles !== instantBook.radiusMiles ||
      instant.geoMode !== instantBook.geoMode ||
      instant.driveTime !== instantBook.driveTime
    );
  }, [weekdays, windowTimes, maxPerDay, leadDays, timezone, instant, availability, instantBook]);

  // Leaving with unsaved settings loses them silently otherwise.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function toggleSection(key: string) {
    setOpenSections((s) => ({ ...s, [key]: !s[key] }));
  }

  function jumpTo(key: string) {
    setOpenSections((s) => ({ ...s, [key]: true }));
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
    setMaxPerDay(availability.maxPerDay);
    setLeadDays(availability.leadDays);
    setTimezone(availability.timezone);
    setInstant(instantBook);
    setSaveError(null);
  }

  // --- live preview -------------------------------------------------------
  // What the public page would offer with the settings as they stand, including
  // unsaved ones. Blocked days drop out, so this matches what a customer sees.
  const blockedSet = useMemo(() => {
    const set = new Set<string>();
    for (const b of blocks) {
      let cursor = b.start_date;
      // Guard the walk: a corrupt row with end before start would loop forever.
      for (let i = 0; i < 400 && cursor <= b.end_date; i += 1) {
        set.add(cursor);
        cursor = addDays(cursor, 1);
      }
    }
    return set;
  }, [blocks]);

  const previewDays = useMemo(() => {
    if (!enabled || weekdays.length === 0) return [];
    const out: string[] = [];
    let cursor = addDays(todayKey, leadDays);
    for (let i = 0; i < 90 && out.length < 5; i += 1) {
      if (weekdays.includes(weekdayOf(cursor)) && !blockedSet.has(cursor)) out.push(cursor);
      cursor = addDays(cursor, 1);
    }
    return out;
  }, [enabled, weekdays, leadDays, blockedSet, todayKey]);

  const dayNames = useMemo(() => {
    if (weekdays.length === 0) return 'No days';
    const sorted = [...weekdays].sort();
    const isRun = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
    if (isRun && sorted.length > 2) return `${WEEKDAY_LABELS[sorted[0]]} – ${WEEKDAY_LABELS[sorted[sorted.length - 1]]}`;
    return sorted.map((d) => WEEKDAY_LABELS[d]).join(', ');
  }, [weekdays]);

  // Deduped: a 7am and an 8am window are both "Morning", and listing it twice
  // reads as a mistake rather than as two options.
  const windowNames = useMemo(
    () => [...new Set(windowTimes.map((t) => labelForWindowTime(t).split(' · ')[0]))].join(', ') || 'None',
    [windowTimes],
  );

  const nextBlock = blocks[0] ?? null;
  const live = enabled && Boolean(bookingUrl) && weekdays.length > 0 && windowTimes.length > 0;

  return (
    <main className="wide-shell workspace-shell bset">
      <header className="bset-head">
        <div>
          <h1>
            Booking &amp; availability <Icon name="calendar" />
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
          <p><span className="bset-dot" aria-hidden="true" />{live ? 'Live' : enabled ? 'Not live yet' : 'Paused'}</p>
          <small>
            {!bookingUrl
              ? 'Publish your website to switch on self-serve booking.'
              : !enabled
                ? 'Your booking page is turned off and not accepting requests.'
                : weekdays.length === 0
                  ? 'No days are open, so nothing is on offer.'
                  : windowTimes.length === 0
                    ? 'No arrival windows are offered, so nothing is on offer.'
                    : 'Your booking page is active and accepting requests.'}
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
          <small>Customers choose a preferred time window</small>
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
          <strong>{live ? 'Live' : enabled ? 'Not live' : 'Paused'}</strong>
          <small>
            {live
              ? `${openWindowCount} open window${openWindowCount === 1 ? '' : 's'} across ${openDayCount} day${openDayCount === 1 ? '' : 's'}`
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
            <button type="button" className="bset-section-head" onClick={() => toggleSection('days')} aria-expanded={openSections.days}>
              <span className="bset-num">1</span>
              <span className="bset-section-copy">
                <strong>When customers can book</strong>
                <small>Set your available days and preferred arrival time windows.</small>
              </span>
              <Icon name="chevronDown" className={`bset-chev${openSections.days ? ' open' : ''}`} />
            </button>

            {openSections.days && (
              <div className="bset-section-body">
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
                  <p className="bset-group-title">Arrival time options</p>
                  <p className="bset-group-hint">Customers choose a window. You confirm the exact time.</p>
                  <div className="bset-windows" role="group" aria-label="Arrival time options">
                    {[...new Set([...BOOKING_WINDOW_PRESETS.map((w) => w.time), ...windowTimes])].sort().map((time) => {
                      const on = windowTimes.includes(time);
                      const label = labelForWindowTime(time);
                      const custom = !BOOKING_WINDOW_PRESETS.some((w) => w.time === time);
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
                            <strong>{label.split(' · ')[0]}{custom ? <em>Custom</em> : null}</strong>
                            <small>Around {formatWindowClock(time)}</small>
                          </span>
                          <span className="bset-window-check" aria-hidden="true">{on ? <Icon name="check" /> : null}</span>
                        </button>
                      );
                    })}
                  </div>
                  <AddWindow
                    disabled={windowTimes.length >= MAX_BOOKING_WINDOWS}
                    existing={[...new Set([...BOOKING_WINDOW_PRESETS.map((w) => w.time), ...windowTimes])]}
                    onAdd={(time) => setWindowTimes((w) => [...w, time].sort())}
                  />
                </div>

                {/* The settings above, read back as a sentence. */}
                <div className={`bset-live${weekdays.length === 0 || windowTimes.length === 0 ? ' warn' : ''}`}>
                  <Icon name={weekdays.length === 0 || windowTimes.length === 0 ? 'alert' : 'checkCircle'} />
                  <div>
                    <strong>
                      {weekdays.length === 0 || windowTimes.length === 0
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
            <button type="button" className="bset-section-head" onClick={() => toggleSection('limits')} aria-expanded={openSections.limits}>
              <span className="bset-num">2</span>
              <span className="bset-section-copy">
                <strong>Booking limits</strong>
                <small>Control how many jobs you take and how far in advance.</small>
              </span>
              <Icon name="chevronDown" className={`bset-chev${openSections.limits ? ' open' : ''}`} />
            </button>

            {openSections.limits && (
              <div className="bset-section-body">
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
            <button type="button" className="bset-section-head" onClick={() => toggleSection('advanced')} aria-expanded={openSections.advanced}>
              <span className="bset-num">3</span>
              <span className="bset-section-copy">
                <strong>Advanced booking rules</strong>
                <small>Fine-tune how and who can book instantly.</small>
              </span>
              <span className="bset-expand">{openSections.advanced ? 'Collapse' : 'Expand'} <Icon name="chevronDown" className={`bset-chev${openSections.advanced ? ' open' : ''}`} /></span>
            </button>

            {openSections.advanced && (
              <div className="bset-section-body">
                <label className="bset-check">
                  <input type="checkbox" checked={instant.enabled} onChange={(e) => setInstant({ ...instant, enabled: e.target.checked })} />
                  <span className="bset-switch-track small" aria-hidden="true"><span /></span>
                  <span className="bset-check-copy">
                    <strong>Only let qualified jobs book instantly</strong>
                    <small>The Book page asks a few questions for an instant estimate first. Small, out-of-area or work-you-don’t-take jobs are routed to a callback instead.</small>
                  </span>
                </label>

                {/* Dependent fields stay hidden until the gate is on — they do
                    nothing while it's off, and reading them suggests otherwise. */}
                {instant.enabled && (
                  <div className="bset-dependent">
                    <div className="bset-grid">
                      <label className="bset-field">
                        <span>Minimum job value ($) <Tip text="A job estimating below this is sent to request-a-callback instead of taking a slot. Blank or 0 for no floor." /></span>
                        <input
                          type="number"
                          min="0"
                          step="100"
                          inputMode="numeric"
                          placeholder="e.g. 500"
                          value={instant.minAmount || ''}
                          onChange={(e) => setInstant({ ...instant, minAmount: Number(e.target.value) || 0 })}
                        />
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
            <button type="button" className="bset-section-head" onClick={() => toggleSection('timeoff')} aria-expanded={openSections.timeoff}>
              <span className="bset-num">4</span>
              <span className="bset-section-copy">
                <strong>Time off &amp; blocked dates</strong>
                <small>Block days you’re unavailable. They drop off your booking page.</small>
              </span>
              <Icon name="chevronDown" className={`bset-chev${openSections.timeoff ? ' open' : ''}`} />
            </button>

            {openSections.timeoff && (
              <div className="bset-section-body">
                <TimeOff blocks={blocks} todayKey={todayKey} />
              </div>
            )}
          </section>
        </div>

        <aside className="bset-rail">
          <section className="bset-preview">
            <h2>What customers will see</h2>
            <p className="bset-preview-sub">This is how your booking looks to them.</p>

            <div className="bset-phone" role="img" aria-label="Preview of your public booking page">
              {previewDays.length === 0 || windowTimes.length === 0 ? (
                <div className="bset-phone-empty">
                  <Icon name="alert" />
                  <strong>{enabled ? 'Nothing on offer' : 'Booking is paused'}</strong>
                  <p>
                    {!enabled
                      ? 'Customers see a “request a callback” form instead of a calendar.'
                      : weekdays.length === 0
                        ? 'Pick at least one booking day above.'
                        : windowTimes.length === 0
                          ? 'Pick at least one arrival time option above.'
                          : 'Every upcoming day is blocked or full.'}
                  </p>
                </div>
              ) : (
                <>
                  <strong className="bset-phone-title">Choose a date &amp; time</strong>
                  <p className="bset-phone-sub">We’ll confirm the exact time with you.</p>
                  <div className="bset-phone-days">
                    {previewDays.map((key, i) => {
                      const d = formatDay(key);
                      return (
                        <span className={`bset-phone-day${i === 0 ? ' on' : ''}`} key={key}>
                          <small>{d.dow}</small>
                          <strong>{d.num}</strong>
                        </span>
                      );
                    })}
                  </div>
                  <p className="bset-phone-label">Preferred time</p>
                  {windowTimes.map((time, i) => (
                    <span className={`bset-phone-window${i === 0 ? ' on' : ''}`} key={time}>
                      <Icon name={Number(time.slice(0, 2)) < 12 ? 'sunrise' : 'sun'} />
                      <span>
                        <strong>{labelForWindowTime(time).split(' · ')[0]}</strong>
                        <small>Around {formatWindowClock(time)}</small>
                      </span>
                      <span className="bset-phone-check" aria-hidden="true">{i === 0 ? <Icon name="check" /> : null}</span>
                    </span>
                  ))}
                  <span className="bset-phone-cta">Continue</span>
                </>
              )}
            </div>
          </section>

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
              <Link href="/dashboard/extra-stops">Learn more <Icon name="external" /></Link>
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
                    onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === block.id ? null : block.id); }}
                  >
                    <Icon name="dots" />
                  </button>
                  {menuFor === block.id && (
                    <span className="bset-dots-pop" role="menu" onClick={(e) => e.stopPropagation()}>
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
