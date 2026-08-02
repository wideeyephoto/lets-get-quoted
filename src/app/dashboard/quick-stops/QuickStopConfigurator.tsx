'use client';

import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import Link from 'next/link';
import { updateQuickStopSettingsAction } from '../settings/actions';
import { WEEKDAY_LABELS } from '@/lib/booking-availability';
import { quickStopSettingsFromAccount, centsToDollars } from '@/lib/quick-stop';
import RangeSlider, { clockToMinutes, formatClockValue, formatMoneyValue, minutesToClock } from '@/components/range-slider';
import SaveButton from '@/components/save-button';

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
  { key: 'when', num: 1, title: 'When you’ll take them', blurb: 'The days, and the earliest and latest an arrival window can run.' },
  { key: 'what', num: 2, title: 'What kind of work', blurb: 'The jobs you’ll squeeze in — and what the AI screens out.' },
  { key: 'far', num: 3, title: 'How far you’ll go', blurb: 'How much of a detour off your route is worth it.' },
  { key: 'charge', num: 4, title: 'What you’ll charge', blurb: 'Your fee range, and how many you’ll take in a day.' },
  { key: 'terms', num: 5, title: 'Deadlines & refunds', blurb: 'How long each side has to respond, and what a cancellation returns.' },
];

export default function QuickStopConfigurator({
  quickStop,
  refundTiers,
  stripeConnected,
}: {
  quickStop: QuickStopSettingsRow;
  refundTiers: RefundTierValues;
  stripeConnected: boolean;
}) {
  const s = quickStopSettingsFromAccount(quickStop);
  const t = refundTiers;

  // One drawer at a time — same rule as the booking setup page. All five open
  // was a wall of thirty controls with no way to skim what the page covers.
  const [openSection, setOpenSection] = useState<SectionKey | null>('when');
  const isOpen = (key: SectionKey) => openSection === key;
  const refs = useRef<Partial<Record<SectionKey, HTMLElement | null>>>({});

  // Collapsing a drawer moves everything below the heading you clicked, so pin
  // it: flushSync commits the change, then we put the heading back before the
  // browser paints. (Same reasoning as BookingSetup.)
  function toggleSection(key: SectionKey) {
    const before = refs.current[key]?.getBoundingClientRect().top;
    flushSync(() => setOpenSection((current) => (current === key ? null : key)));
    const after = refs.current[key]?.getBoundingClientRect().top;
    if (before !== undefined && after !== undefined && Math.abs(after - before) > 1) {
      window.scrollBy(0, after - before);
    }
  }

  return (
    <section className="panel workspace-section-card" id="quick-stop-setup">
      <div className="section-heading workspace-section-heading compact-heading">
        <p className="eyebrow">Setup</p>
        <h2>How Quick Stops work for you</h2>
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

      {!stripeConnected ? (
        <div className="automation-prereq" style={{ marginBottom: '0.9rem' }}>
          <span aria-hidden="true">💳</span>
          <span>
            Quick Stop collects the fee before the visit — <Link href="/dashboard/settings#payments">connect Stripe</Link> to
            get paid. You can still set everything up now.
          </span>
        </div>
      ) : null}

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
            >
              <span className="bset-num">{section.num}</span>
              <span className="bset-section-copy">
                <strong>{section.title}</strong>
                <small>{section.blurb}</small>
              </span>
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
            <div className="bset-section-body" hidden={!isOpen(section.key)}>
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
                      <small className="field-hint">Clear them all to pause Quick Stop without switching it off.</small>
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
                      <label htmlFor="quickStopMaxVisitMinutes">Longest visit you’ll squeeze in (minutes)</label>
                      <input id="quickStopMaxVisitMinutes" name="quickStopMaxVisitMinutes" type="number" min="5" max="600" step="5" inputMode="numeric" defaultValue={s.maxVisitMinutes} />
                      <small className="field-hint">Jobs the AI estimates will run longer than this are turned away.</small>
                    </div>
                    <div className="field">
                      <label htmlFor="quickStopRequiredPhotos">Photos the customer must send</label>
                      <input id="quickStopRequiredPhotos" name="quickStopRequiredPhotos" type="number" min="0" max="6" step="1" inputMode="numeric" defaultValue={s.requiredPhotos} />
                      <small className="field-hint">0 makes photos optional. One photo is usually the difference between a real quote and a guess.</small>
                    </div>

                    <p className="field full field-hint quick-stop-always-on">
                      <span aria-hidden="true">🛡</span> Every Quick Stop request is screened by the AI
                      eligibility check before it reaches you — complex, unsafe or out-of-scope jobs never
                      become a Quick Stop. That isn&apos;t optional: you&apos;re quoting a price and taking
                      payment before anyone has seen the job.
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
                        label="Quick Stop fee range"
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
                        hint="You still set the exact fee on every request — this is the band you can set it within."
                      />
                    </div>

                    <div className="field">
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
                      <small className="field-hint">
                        How much of the fee a customer gets back if they cancel, by how far along you are.
                        Your own cancellations and verified no-shows are always refunded in full.
                      </small>
                    </div>
                    <div className="field">
                      <label htmlFor="refundGraceMinutes">Free-cancel window (minutes)</label>
                      <input id="refundGraceMinutes" name="refundGraceMinutes" type="number" min="0" max="120" step="1" defaultValue={t.withinGraceMinutes} />
                      <small className="field-hint">Full refund if they cancel this soon after paying.</small>
                    </div>
                    <div className="field">
                      <label htmlFor="refundGrace">Within that window (%)</label>
                      <input id="refundGrace" name="refundGrace" type="number" min="0" max="100" step="5" defaultValue={t.grace} />
                    </div>
                    <div className="field">
                      <label htmlFor="refundBeforeEnRoute">Before you set off (%)</label>
                      <input id="refundBeforeEnRoute" name="refundBeforeEnRoute" type="number" min="0" max="100" step="5" defaultValue={t.beforeEnRoute} />
                    </div>
                    <div className="field">
                      <label htmlFor="refundAfterEnRoute">Once you’re en route (%)</label>
                      <input id="refundAfterEnRoute" name="refundAfterEnRoute" type="number" min="0" max="100" step="5" defaultValue={t.afterEnRoute} />
                    </div>
                    <div className="field">
                      <label htmlFor="refundAfterArrived">After you’ve arrived (%)</label>
                      <input id="refundAfterArrived" name="refundAfterArrived" type="number" min="0" max="100" step="5" defaultValue={t.afterArrived} />
                    </div>
                  </div>
                ) : null}
            </div>
          </section>
        ))}

        <div className="form-actions">
          <SaveButton>Save Quick Stop settings</SaveButton>
        </div>
      </form>
    </section>
  );
}
