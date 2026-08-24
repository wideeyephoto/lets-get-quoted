'use client';

import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import Link from 'next/link';
import { updateQuickStopSettingsAction } from '../settings/actions';
import { WEEKDAY_LABELS } from '@/lib/booking-availability';
import { quickStopSettingsFromAccount, centsToDollars } from '@/lib/quick-stop';
import { refundPolicyWarnings, CONTRACTOR_REFUND_SCOPE_NOTE } from '@/lib/quick-stop-policy';
import RangeSlider, { clockToMinutes, formatClockValue, formatMoneyValue, minutesToClock } from '@/components/range-slider';
import SaveButton from '@/components/save-button';
import {
  quickStopSectionsFlagged,
  quickStopSectionsState,
  reviewQuickStopSections,
  type SectionReview,
} from '@/lib/quick-stop-sections';
import QuickStopCustomerPreviewModal from './QuickStopCustomerPreviewModal';

export type QuickStopSettingsRow = Parameters<typeof quickStopSettingsFromAccount>[0];
export type RefundTierValues = {
  withinGraceMinutes: number;
  grace: number;
  beforeEnRoute: number;
  afterEnRoute: number;
  afterArrived: number;
};

// The five questions the settings actually answer, in the order you would ask
// them. Grouping by question rather than by field type is what lets one drawer
// be open at a time without hiding something you needed beside it.
type SectionKey = 'when' | 'what' | 'far' | 'charge' | 'terms';

const SECTIONS: Array<{ key: SectionKey; num: number; title: string; blurb: string }> = [
  { key: 'when', num: 1, title: 'When you’ll take them', blurb: 'The days, how far ahead a customer can ask, and the earliest and latest an arrival window can run.' },
  { key: 'what', num: 2, title: 'What kind of work', blurb: 'The jobs you’ll fit into today’s route — and what the AI screens out.' },
  { key: 'far', num: 3, title: 'How far you’ll go', blurb: 'How much of a detour off your route is worth it.' },
  { key: 'charge', num: 4, title: 'What you’ll charge', blurb: 'Your fee range, and how many you’ll take in a day.' },
  { key: 'terms', num: 5, title: 'Deadlines & refunds', blurb: 'How long each side has to respond, and what a cancellation returns.' },
];

type TradePreset = {
  id: string;
  icon: string;
  name: string;
  tagline: string;
  categories: string;
  maxVisitMinutes: number;
  maxDetourMiles: number;
  maxDetourMinutes: number;
  minFeeDollars: number;
  maxFeeDollars: number;
  daysAhead: number;
  earliestTime: string;
  latestEnd: string;
};

const TRADE_PRESETS: TradePreset[] = [
  {
    id: 'plumbing',
    icon: '🔧',
    name: 'Plumbing',
    tagline: 'Leaks, clogs, valves & fixtures',
    categories: 'leak repair, running toilet, faucet replacement, drain backup, pipe burst, garbage disposal fix, shutoff valve replacement',
    maxVisitMinutes: 45,
    maxDetourMiles: 10,
    maxDetourMinutes: 20,
    minFeeDollars: 95,
    maxFeeDollars: 225,
    daysAhead: 1,
    earliestTime: '08:00',
    latestEnd: '19:00',
  },
  {
    id: 'electrical',
    icon: '⚡',
    name: 'Electrical',
    tagline: 'Breakers, outlets & switches',
    categories: 'tripped breaker, outlet replacement, switch repair, flickering lights, smoke detector, ceiling fan swap, GFCI reset',
    maxVisitMinutes: 30,
    maxDetourMiles: 8,
    maxDetourMinutes: 15,
    minFeeDollars: 120,
    maxFeeDollars: 250,
    daysAhead: 1,
    earliestTime: '08:00',
    latestEnd: '18:00',
  },
  {
    id: 'hvac',
    icon: '❄️',
    name: 'HVAC',
    tagline: 'AC reset, filters & thermostats',
    categories: 'AC not cooling, furnace reset, thermostat replacement, blower check, capacitor swap, AC drain line clear',
    maxVisitMinutes: 60,
    maxDetourMiles: 15,
    maxDetourMinutes: 25,
    minFeeDollars: 150,
    maxFeeDollars: 300,
    daysAhead: 1,
    earliestTime: '07:30',
    latestEnd: '20:00',
  },
  {
    id: 'handyman',
    icon: '🔨',
    name: 'Handyman',
    tagline: 'Quick repairs & adjustments',
    categories: 'door adjustment, drywall patch, door lock swap, cabinet hinge fix, weatherstripping, curtain/blind repair, trim fix',
    maxVisitMinutes: 30,
    maxDetourMiles: 6,
    maxDetourMinutes: 15,
    minFeeDollars: 75,
    maxFeeDollars: 175,
    daysAhead: 1,
    earliestTime: '08:00',
    latestEnd: '18:00',
  },
];

export default function QuickStopConfigurator({
  quickStop,
  refundTiers,
  stripeConnected,
  readOnly = false,
}: {
  quickStop: QuickStopSettingsRow;
  refundTiers: RefundTierValues;
  stripeConnected: boolean;
  /**
   * The logged-out demo. The whole panel is one settings form, so it is
   * withheld rather than disabled field by field — the settings it holds are
   * already visible as state on the status panel above it.
   */
  readOnly?: boolean;
}) {
  const s = quickStopSettingsFromAccount(quickStop);
  const t = refundTiers;

  // Multi-drawer expansion supported while defaulting to opening the first drawer.
  const [openSections, setOpenSections] = useState<Set<SectionKey>>(new Set(['when']));
  const isOpen = (key: SectionKey) => openSections.has(key);
  const refs = useRef<Partial<Record<SectionKey, HTMLElement | null>>>({});
  const [previewOpen, setPreviewOpen] = useState(false);

  // Live calculator test amount
  const defaultFeeD = Math.round((centsToDollars(s.minFeeCents) + centsToDollars(s.maxFeeCents)) / 2) || 125;
  const [calculatorFee, setCalculatorFee] = useState<number>(defaultFeeD);

  // The five refund tiers are the one group of inputs held in state rather than
  // left uncontrolled. Everything else on this form is a number you either mean
  // or don't; these four percentages are a promise printed on the customer's
  // status page, and the combinations that read as a swindle (no free-cancel
  // window, nothing back before you have even left, a refund that climbs as the
  // job progresses) are only visible when you look at all five together. Warning
  // after the save would be warning after the customer has already been shown
  // the terms, so the warnings recompute as they type.
  //
  // Held as STRINGS, not numbers: a controlled number input whose state is
  // parsed on every keystroke cannot be emptied — clear it, '' parses to 0, and
  // the field snaps back to "0" under the cursor. The raw text is what the input
  // shows and what the form posts; parsing happens only for the warning pass
  // below, and mergeRefundTiers does the real clamping server-side.
  const [refunds, setRefunds] = useState({
    withinGraceMinutes: String(t.withinGraceMinutes),
    grace: String(t.grace),
    beforeEnRoute: String(t.beforeEnRoute),
    afterEnRoute: String(t.afterEnRoute),
    afterArrived: String(t.afterArrived),
  });
  const setRefund = (key: keyof typeof refunds, value: string) => setRefunds((prev) => ({ ...prev, [key]: value }));
  // A blank or half-typed field is read as 0 so a message can never render
  // "NaN%" mid-keystroke. Blank genuinely does save as 0 anyway — pct() in
  // mergeRefundTiers only falls back to the default for a non-finite number, and
  // Number('') is 0.
  // Clamped to the same bounds mergeRefundTiers will apply on save (0–100 for a
  // percentage, 0–120 for the window), so a stray "500" is judged as the 100 it
  // will actually become rather than warning about a number nobody will ever be
  // refunded.
  const refundNum = (raw: string, max: number) => {
    const n = Math.round(Number(raw));
    return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0;
  };
  /**
   * WHAT EACH CLOSED DRAWER IS SET TO.
   *
   * The five blurbs describe what a drawer is ABOUT and never what it holds, so
   * an account could be reported ready while drawer 2 accepted five-hour visits
   * and drawer 5 held refund terms this app's own warnings call unfair. Both
   * were visible only to somebody who opened the drawer and read.
   *
   * The refund tiers are read from STATE rather than from the saved row, so the
   * badge moves as the numbers are typed — the same reason the warnings inside
   * the drawer are live. Everything else on this form is uncontrolled, and a
   * badge that lied until the next page load would be worse than none.
   */
  const refundWarnings = refundPolicyWarnings({
    withinGraceMinutes: refundNum(refunds.withinGraceMinutes, 120),
    grace: refundNum(refunds.grace, 100),
    beforeEnRoute: refundNum(refunds.beforeEnRoute, 100),
    afterEnRoute: refundNum(refunds.afterEnRoute, 100),
    afterArrived: refundNum(refunds.afterArrived, 100),
  });

  const reviews = reviewQuickStopSections({
    weekdayCount: s.weekdays.length,
    daysAhead: s.daysAhead,
    earliestTime: s.earliestTime,
    latestEnd: s.latestEnd,
    maxVisitMinutes: s.maxVisitMinutes,
    categoryCount: s.categories.length,
    maxDetourMiles: s.maxDetourMiles,
    maxDetourMinutes: s.maxDetourMinutes,
    minFeeCents: s.minFeeCents,
    maxFeeCents: s.maxFeeCents,
    maxPerDay: s.maxPerDay,
    refunds: {
      withinGraceMinutes: refundNum(refunds.withinGraceMinutes, 120),
      grace: refundNum(refunds.grace, 100),
      beforeEnRoute: refundNum(refunds.beforeEnRoute, 100),
      afterEnRoute: refundNum(refunds.afterEnRoute, 100),
      afterArrived: refundNum(refunds.afterArrived, 100),
    },
  });
  const reviewFor = (key: SectionKey): SectionReview | undefined => reviews.find((review) => review.key === key);
  const flagged = quickStopSectionsFlagged(reviews);
  const overall = quickStopSectionsState(reviews);

  // Collapsing a drawer moves everything below the heading you clicked, so pin
  // it: flushSync commits the change, then we put the heading back before the
  // browser paints. (Same reasoning as BookingSetup.)
  function toggleSection(key: SectionKey) {
    const before = refs.current[key]?.getBoundingClientRect().top;
    flushSync(() => {
      setOpenSections((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    });
    const after = refs.current[key]?.getBoundingClientRect().top;
    if (before !== undefined && after !== undefined && Math.abs(after - before) > 1) {
      window.scrollBy(0, after - before);
    }
  }

  function expandAll() {
    setOpenSections(new Set(SECTIONS.map((sec) => sec.key)));
  }

  function collapseAll() {
    setOpenSections(new Set());
  }

  function applyPreset(preset: TradePreset) {
    const form = document.querySelector<HTMLFormElement>('.bset-form');
    if (!form) return;

    const setInputValue = (name: string, value: string | number) => {
      const el = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
      if (el) {
        el.value = String(value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    };

    setInputValue('quickStopCategories', preset.categories);
    setInputValue('quickStopMaxVisitMinutes', preset.maxVisitMinutes);
    setInputValue('quickStopMaxDetourMiles', preset.maxDetourMiles);
    setInputValue('quickStopMaxDetourMinutes', preset.maxDetourMinutes);
    setInputValue('quickStopMinFee', preset.minFeeDollars);
    setInputValue('quickStopMaxFee', preset.maxFeeDollars);
    setInputValue('quickStopDaysAhead', preset.daysAhead);
    setInputValue('quickStopEarliest', preset.earliestTime);
    setInputValue('quickStopLatestEnd', preset.latestEnd);

    setCalculatorFee(Math.round((preset.minFeeDollars + preset.maxFeeDollars) / 2));
    expandAll();
  }

  // After the hooks, never before them — an early return above the useState
  // would change the hook call order between renders. React is strict about
  // that, and eslint's rules-of-hooks is what caught it.
  if (readOnly) return null;

  return (
    <section className="panel workspace-section-card" id="quick-stop-setup">
      <div className="section-heading workspace-section-heading compact-heading">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <p className="eyebrow" style={{ margin: 0 }}>Setup</p>
            <h2 style={{ margin: 0 }}>How Quick Stops work for you</h2>
          </div>
          <button
            type="button"
            className="btn secondary qs-preview-trigger"
            onClick={() => setPreviewOpen(true)}
          >
            👁 Preview Customer Experience
          </button>
        </div>
      </div>

      <p className="workspace-details-copy" style={{ marginTop: 0 }}>
        Quick Stop is a separate, faster path alongside normal booking. A customer asks to be fitted in
        today; you review the job, propose an arrival window, and set a one-off fee. They pay only after
        approving the time and the price — nothing is booked until payment clears. It has its own daily
        limit and ignores your usual minimum job value and soonest-booking rules.
      </p>

      {/* Brett asked for this to be unambiguous, and it was not: "add me to your
          route" reads as end-of-day to most people, which made the arrival-window
          settings look pointless. */}
      <p className="workspace-details-copy quick-stop-when-note">
        <strong>A Quick Stop can land mid-day or at the end of the day</strong> — wherever it fits your
        route. You choose the arrival window on every request, so a gap between two booked jobs is as valid
        as tacking one onto the end.
      </p>

      {/* 1-Click Quick Start Trade Presets */}
      <div className="qs-presets-strip">
        <div className="qs-presets-header">
          <div>
            <p className="qs-presets-title">⚡ 1-Click Quick-Start Trade Presets</p>
            <p className="qs-presets-hint">Click a trade below to load recommended categories, detour radii, and fee bands instantly:</p>
          </div>
        </div>
        <div className="qs-presets-grid">
          {TRADE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="qs-preset-btn"
              onClick={() => applyPreset(preset)}
              title={`Load ${preset.name} settings`}
            >
              <div className="qs-preset-btn-top">
                <span>{preset.icon}</span>
                <span>{preset.name}</span>
              </div>
              <span className="qs-preset-btn-sub">{preset.tagline}</span>
              <span style={{ fontSize: '0.72rem', color: '#ff9b54', fontWeight: 600, marginTop: '0.2rem' }}>
                ${preset.minFeeDollars}–${preset.maxFeeDollars} fee · {preset.maxDetourMiles} mi max
              </span>
            </button>
          ))}
        </div>
      </div>

      {!stripeConnected ? (
        <div className="automation-prereq" style={{ marginBottom: '0.9rem' }}>
          <span aria-hidden="true">💳</span>
          <span>
            Quick Stop collects the fee before the visit — <Link href="/dashboard/settings#payments">connect Stripe</Link> to
            get paid. You can still set everything up now.
          </span>
        </div>
      ) : null}

      <div className="qs-section-toolbar">
        <span style={{ fontSize: '0.84rem', color: 'var(--muted)', fontWeight: 600 }}>5 Setup Sections</span>
        <div className="qs-toolbar-actions">
          <button type="button" className="qs-toolbar-btn" onClick={expandAll}>
            Expand all
          </button>
          <button type="button" className="qs-toolbar-btn" onClick={collapseAll}>
            Collapse all
          </button>
        </div>
      </div>

      <QuickStopCustomerPreviewModal
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        businessName="Your Business"
        minFeeDollars={centsToDollars(s.minFeeCents)}
        maxFeeDollars={centsToDollars(s.maxFeeCents)}
        earliestTime={s.earliestTime}
        latestEnd={s.latestEnd}
        categories={s.categories}
      />

      <form action={updateQuickStopSettingsAction} className="bset-form">
        {/* No on/off here. This page already says whether Quick Stop is live —
            in its status header, and in the rail — and a third control saying
            the same thing invites the two to disagree. The switch is on the
            Automations card. updateQuickStopSettingsAction leaves the column
            alone when the field is absent, so saving settings can't flip it. */}
        {SECTIONS.map((section) => (
          <section
            className="bset-section"
            key={section.key}
            ref={(el) => { refs.current[section.key] = el; }}
          >
            <button
              type="button"
              className="bset-section-head"
              onClick={() => toggleSection(section.key)}
              aria-expanded={isOpen(section.key)}
              // Unconditional, unlike the menus elsewhere: this body is hidden
              // rather than unmounted (see the note below), so the id it names
              // is in the document whether the drawer is open or shut.
              aria-controls={`qs-section-${section.key}`}
            >
              <span className="bset-num">{section.num}</span>
              <span className="bset-section-copy">
                <strong>{section.title}</strong>
                {/* The VALUE where the description was. The description is still
                    the answer to "what is this drawer for", but it is the same
                    on every visit, and after the first one the question is
                    always "what is it set to". */}
                <small>{reviewFor(section.key)?.summary ?? section.blurb}</small>
              </span>
              {reviewFor(section.key) && reviewFor(section.key)!.state !== 'ok' ? (
                <span className="bset-section-state" data-state={reviewFor(section.key)!.state}>
                  {reviewFor(section.key)!.state === 'todo' ? 'Not set' : 'Check this'}
                </span>
              ) : null}
              <span className="bset-expand">
                {isOpen(section.key) ? 'Collapse' : 'Expand'}
                <span className={`bset-chev${isOpen(section.key) ? ' open' : ''}`} aria-hidden="true">⌄</span>
              </span>
            </button>

            {/* HIDDEN, NOT UNMOUNTED. These are plain DOM inputs, so a closed
                drawer that isn't rendered contributes nothing to the FormData —
                and the action would write the resulting blanks straight over
                your settings. Saving with only drawer 1 open zeroed the fee
                band. (BookingSetup gets away with unmounting because it builds
                its FormData from React state instead.) */}
            <div id={`qs-section-${section.key}`} className="bset-section-body" hidden={!isOpen(section.key)}>
                {/* Why the badge is on. Inside the drawer rather than beside the
                    badge, because the badge is a two-word summary and this is
                    the argument — and the drawer is where the control that
                    answers it lives.

                    `terms` is skipped: it renders the very same warnings under
                    its own inputs, live as they are typed, and printing them
                    twice in one drawer reads as two different problems. */}
                {section.key !== 'terms' && (reviewFor(section.key)?.issues.length ?? 0) > 0 ? (
                  <ul className="bset-section-issues" data-state={reviewFor(section.key)!.state}>
                    {reviewFor(section.key)!.issues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                ) : null}
                {section.key === 'when' ? (
                  <div className="form-grid compact-form">
                    <div className="field full">
                      <label>Days you accept Quick Stops</label>
                      <div className="checkbox-grid">
                        {WEEKDAY_LABELS.map((label, day) => (
                          <label className="checkbox-chip" key={day}>
                            <input type="checkbox" name="quickStopWeekday" value={day} defaultChecked={s.weekdays.includes(day)} />
                            <span>{label}</span>
                          </label>
                        ))}
                      </div>
                      {/* The "clear them all to pause" hint that used to be here
                          was advice to break the feature. Clearing every weekday
                          does not pause anything — it puts the account into
                          setup_incomplete, which the status block at the top of
                          the page then reports as a missing setup step and asks
                          you to fix. It was also the third competing way to
                          control availability, next to the master switch and a
                          button that did the same thing. The switch is the way. */}
                      <small className="field-hint">The days a Quick Stop is allowed to land at all. To stop taking them entirely, use the switch at the top of the page.</small>
                    </div>

                    <div className="field full">
                      <RangeSlider
                        label="Arrival windows can run between"
                        nameMin="quickStopEarliest"
                        nameMax="quickStopLatestEnd"
                        min={0}
                        max={1440 - 15}
                        step={15}
                        valueMin={clockToMinutes(s.earliestTime, 8 * 60)}
                        valueMax={clockToMinutes(s.latestEnd, 20 * 60)}
                        format={formatClockValue}
                        serialize={minutesToClock}
                        minLabel="Earliest an arrival window may start"
                        maxLabel="Latest an arrival window may end"
                        hint="No Quick Stop will be offered a window outside these hours."
                      />
                    </div>
                    {/* WHEN, NOT WHAT IT COSTS. This lived under "What you'll
                        charge", between the fee slider and the daily cap — a
                        scheduling control filed with the money. It is the
                        setting that decides how soon "sooner" is, so it belongs
                        beside the days and the hours, and every sentence in the
                        app that states the window now reads it. */}
                    <div className="field full">
                      <label htmlFor="quickStopDaysAhead">How far ahead they can ask</label>
                      <select id="quickStopDaysAhead" name="quickStopDaysAhead" defaultValue={String(s.daysAhead)}>
                        <option value="0">Today only</option>
                        <option value="1">Today or tomorrow</option>
                        <option value="2">Up to 2 days out</option>
                        <option value="3">Up to 3 days out</option>
                        <option value="7">Up to a week out</option>
                      </select>
                      <small className="field-hint">
                        By mid-afternoon there is often no room left today, and a customer with a dripping tap is usually
                        fine with tomorrow. Wider reach means more of these fit — and today drops off the list on its own
                        once your last arrival time has passed.
                      </small>
                    </div>
                  </div>
                ) : null}

                {section.key === 'what' ? (
                  <div className="form-grid compact-form">
                    <div className="field full">
                      <label htmlFor="quickStopCategories">Types of work you’ll take as a Quick Stop</label>
                      <input
                        id="quickStopCategories"
                        name="quickStopCategories"
                        defaultValue={s.categories.join(', ')}
                        placeholder="leak repair, faucet swap, unclog, running toilet, minor electrical"
                      />
                      {/* The old hint said "comma-separated" and stopped, which
                          told you the syntax and nothing about what it does. */}
                      <small className="field-hint">
                        Separate them with commas, in the words a customer would use. When someone describes
                        their problem on your Book page, the AI matches that description against this list —
                        so &ldquo;my kitchen tap is dripping&rdquo; matches <em>leak repair</em> without the
                        customer having to pick a category. Anything it can&apos;t match to something here is
                        sent to a normal booking request instead of a Quick Stop.
                        <br />
                        Leave it blank to consider any job that passes the checks below. Listing a few common
                        quick jobs works better than listing everything you do — this is the short list of
                        work you&apos;re happy to be interrupted for.
                      </small>
                    </div>

                    <div className="field">
                      <label htmlFor="quickStopMaxVisitMinutes">Longest Quick Stop visit you’ll take (minutes)</label>
                      <input id="quickStopMaxVisitMinutes" name="quickStopMaxVisitMinutes" type="number" min="5" max="600" step="5" inputMode="numeric" defaultValue={s.maxVisitMinutes} />
                      <small className="field-hint">Jobs the AI estimates will run longer than this are turned away.</small>
                    </div>
                    <div className="field">
                      <label htmlFor="quickStopRequiredPhotos">Photos the customer must send</label>
                      <input id="quickStopRequiredPhotos" name="quickStopRequiredPhotos" type="number" min="0" max="6" step="1" inputMode="numeric" defaultValue={s.requiredPhotos} />
                      <small className="field-hint">0 makes photos optional. One photo is usually the difference between a real quote and a guess.</small>
                    </div>

                    {/* "never become a Quick Stop" was an absolute promise about
                        a screen that is partly a language model. The
                        deterministic half — the fifteen hard exclusions — really
                        is absolute and is worth saying so. The AI half is a
                        judgement, and the owner accepting or declining is the
                        actual gate. Promising perfection on a screen that runs
                        before anyone has seen the job is the wrong thing to be
                        confident about, especially on a page where the next
                        sentence is about taking payment. */}
                    <p className="field full field-hint quick-stop-always-on">
                      <span aria-hidden="true">🛡</span> Every request is screened before it reaches you.
                      A fixed list of exclusions — gas, mould, permits, multi-day work — is refused outright, and
                      the AI reads the rest for anything complex or out of scope. It is a filter, not a guarantee:
                      you see what it passed and you make the final decision on every one. That matters here more
                      than anywhere else in the app, because you are quoting a price and taking payment before
                      anybody has seen the job.
                    </p>
                  </div>
                ) : null}

                {section.key === 'far' ? (
                  <div className="form-grid compact-form">
                    <div className="field">
                      <label htmlFor="quickStopMaxDetourMiles">Max detour off your route (miles)</label>
                      <input id="quickStopMaxDetourMiles" name="quickStopMaxDetourMiles" type="number" min="0" max="500" step="1" inputMode="numeric" defaultValue={s.maxDetourMiles} />
                      <small className="field-hint">Checked against every stop you already have booked that day — whichever is closest. A job near your morning call counts as near, even if your last stop is across town.</small>
                    </div>
                    <div className="field">
                      <label htmlFor="quickStopMaxDetourMinutes">Max added drive time (minutes)</label>
                      <input id="quickStopMaxDetourMinutes" name="quickStopMaxDetourMinutes" type="number" min="0" max="600" step="5" inputMode="numeric" defaultValue={s.maxDetourMinutes} />
                      <small className="field-hint">In traffic, twelve miles and twelve minutes are different questions — this is the one that costs you the day. Measured from the same closest stop.</small>
                    </div>
                  </div>
                ) : null}

                {section.key === 'charge' ? (
                  <div className="form-grid compact-form">
                    <div className="field full">
                      <RangeSlider
                        label="Priority visit fee range"
                        nameMin="quickStopMinFee"
                        nameMax="quickStopMaxFee"
                        min={0}
                        max={1000}
                        step={5}
                        valueMin={centsToDollars(s.minFeeCents)}
                        valueMax={centsToDollars(s.maxFeeCents)}
                        format={formatMoneyValue}
                        minLabel="Lowest fee you’ll accept"
                        maxLabel="Highest fee you’ll charge"
                        hint="You still set the exact fee on every request — this is the band you can set it within. A 10% platform fee applies to the visit fee; work is invoiced separately."
                      />
                    </div>

                    {/* Live Take-Home & Net Fee Calculator Card */}
                    <div className="field full">
                      <div className="qs-calculator-card">
                        <div className="qs-calculator-header">
                          <h4>💰 Live Take-Home &amp; Fee Breakdown</h4>
                          <span className="qs-calc-badge">Direct Deposit via Stripe</span>
                        </div>
                        <div style={{ marginBottom: '0.85rem' }}>
                          <label htmlFor="qs-calc-input" style={{ fontSize: '0.82rem', color: 'var(--muted)', display: 'block', marginBottom: '0.35rem' }}>
                            Test sample visit fee: <strong>${calculatorFee}</strong>
                          </label>
                          <input
                            id="qs-calc-input"
                            type="range"
                            min={Math.max(25, centsToDollars(s.minFeeCents) || 25)}
                            max={Math.max(centsToDollars(s.maxFeeCents) || 250, 100)}
                            step={5}
                            value={calculatorFee}
                            onChange={(e) => setCalculatorFee(Number(e.target.value))}
                            style={{ width: '100%' }}
                          />
                        </div>
                        <div className="qs-calculator-table">
                          <div className="qs-calc-row">
                            <span>Homeowner Pays (Priority Visit Fee):</span>
                            <strong>${calculatorFee}.00</strong>
                          </div>
                          <div className="qs-calc-row fee">
                            <span>10% LGQ Platform Fee:</span>
                            <span>-${(calculatorFee * 0.10).toFixed(2)}</span>
                          </div>
                          <div className="qs-calc-row fee">
                            <span>Est. Stripe Processing (2.9% + 30¢):</span>
                            <span>-${(calculatorFee * 0.029 + 0.30).toFixed(2)}</span>
                          </div>
                          <div className="qs-calc-row net">
                            <span>Net Payout to Your Bank:</span>
                            <strong>${Math.max(0, calculatorFee - (calculatorFee * 0.10) - (calculatorFee * 0.029 + 0.30)).toFixed(2)}</strong>
                          </div>
                        </div>
                        <p className="qs-calc-note">
                          ✨ <strong>Paid out on booking clearance:</strong> You get paid before turning the ignition. Any repair, labor, or parts work performed during the visit is invoiced separately at your normal plan rate.
                        </p>
                      </div>
                    </div>

                    <div className="field">
                      <label htmlFor="quickStopMaxPerDay">Max Quick Stops per day</label>
                      <input id="quickStopMaxPerDay" name="quickStopMaxPerDay" type="number" min="1" max="50" step="1" inputMode="numeric" defaultValue={s.maxPerDay} />
                      <small className="field-hint">Its own limit — these don’t count against your normal daily booking cap.</small>
                    </div>

                    {/* No checkbox for "take them once the day is full". Its own
                        label made the argument against itself — that IS the
                        feature. A switch that turns off the point of the thing
                        it belongs to is not a setting, it is a trap. The daily
                        limit above is the real control over volume. */}
                  </div>
                ) : null}

                {section.key === 'terms' ? (
                  <div className="form-grid compact-form">
                    <div className="field">
                      <label htmlFor="quickStopResponseDeadline">Your response deadline (minutes)</label>
                      <input id="quickStopResponseDeadline" name="quickStopResponseDeadline" type="number" min="1" max="720" step="1" inputMode="numeric" defaultValue={s.responseDeadlineMins} />
                      <small className="field-hint">How long you have to make an offer before the request expires. Default 30.</small>
                    </div>
                    <div className="field">
                      <label htmlFor="quickStopPaymentDeadline">Customer payment deadline (minutes)</label>
                      <input id="quickStopPaymentDeadline" name="quickStopPaymentDeadline" type="number" min="1" max="720" step="1" inputMode="numeric" defaultValue={s.paymentDeadlineMins} />
                      <small className="field-hint">How long they have to pay and lock the window. Default 15.</small>
                    </div>

                    <div className="field full" style={{ marginTop: '.4rem', paddingTop: '.7rem', borderTop: '1px solid rgba(255,255,255,.1)' }}>
                      <label>Cancellation refunds</label>
                      {/* This used to end "your own cancellations and verified
                          no-shows are always refunded in full", which never said
                          whose no-show — and read here, beside the percentages
                          you set to protect yourself, it invites you to believe
                          it covers a customer who isn't home. It is the reverse:
                          a no-show is always YOURS, only the customer can report
                          one, and a confirmed one costs the fee and locks Quick
                          Stop for your account. */}
                      <small className="field-hint">
                        How much of the fee a customer gets back if they cancel, by how far along you are.
                        {' '}
                        {CONTRACTOR_REFUND_SCOPE_NOTE}
                      </small>
                    </div>
                    <div className="field">
                      <label htmlFor="refundGraceMinutes">Free-cancel window (minutes)</label>
                      <input
                        id="refundGraceMinutes"
                        name="refundGraceMinutes"
                        type="number"
                        min="0"
                        max="120"
                        step="1"
                        value={refunds.withinGraceMinutes}
                        onChange={(e) => setRefund('withinGraceMinutes', e.target.value)}
                      />
                      <small className="field-hint">Full refund if they cancel this soon after paying.</small>
                    </div>
                    <div className="field">
                      <label htmlFor="refundGrace">Within that window (%)</label>
                      <input
                        id="refundGrace"
                        name="refundGrace"
                        type="number"
                        min="0"
                        max="100"
                        step="5"
                        value={refunds.grace}
                        onChange={(e) => setRefund('grace', e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="refundBeforeEnRoute">Before you set off (%)</label>
                      <input
                        id="refundBeforeEnRoute"
                        name="refundBeforeEnRoute"
                        type="number"
                        min="0"
                        max="100"
                        step="5"
                        value={refunds.beforeEnRoute}
                        onChange={(e) => setRefund('beforeEnRoute', e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="refundAfterEnRoute">Once you’re en route (%)</label>
                      <input
                        id="refundAfterEnRoute"
                        name="refundAfterEnRoute"
                        type="number"
                        min="0"
                        max="100"
                        step="5"
                        value={refunds.afterEnRoute}
                        onChange={(e) => setRefund('afterEnRoute', e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="refundAfterArrived">After you’ve arrived (%)</label>
                      <input
                        id="refundAfterArrived"
                        name="refundAfterArrived"
                        type="number"
                        min="0"
                        max="100"
                        step="5"
                        value={refunds.afterArrived}
                        onChange={(e) => setRefund('afterArrived', e.target.value)}
                      />
                    </div>

                    {/* Directly under the five inputs, because it is a judgement
                        on the combination and not on any one field. role="status"
                        so a screen reader hears a warning appear as the numbers
                        change, rather than only on save.

                        Color is the LAST thing carrying severity here: the
                        leading word says which it is, and the two levels keep
                        their bar weight and their type weight apart, so the list
                        still sorts itself in greyscale. */}
                    {refundWarnings.length ? (
                      <ul className="field full refund-warnings" role="status">
                        {refundWarnings.map((warning) => (
                          <li key={warning.key} className={warning.severity === 'severe' ? 'is-severe' : 'is-warn'}>
                            <strong>{warning.severity === 'severe' ? 'Unfair to the customer:' : 'Check this:'}</strong>{' '}
                            {warning.message}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
            </div>
          </section>
        ))}

        {/* THE SAVE BAR, STUCK TO THE BOTTOM.
            It was a button below five collapsed drawers, always enabled and
            saying nothing about whether there was anything to save — so the
            only way to find out a save had landed was to scroll back down to a
            button you had already pressed. `onlyWhenChanged` is a SaveButton
            feature that already existed and this form never asked for; with it,
            the bar's presence is itself the answer to "have I changed
            anything". */}
        <div className="qs-savebar" data-state={overall}>
          <p className="qs-savebar-note">
            <strong>Unsaved changes</strong>
            {flagged > 0 ? (
              <span>
                {' · '}
                {flagged} {flagged === 1 ? 'section' : 'sections'} to look at
              </span>
            ) : null}
          </p>
          <SaveButton onlyWhenChanged>Save Quick Stop settings</SaveButton>
        </div>
      </form>
    </section>
  );
}
