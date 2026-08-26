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

type SectionKey = 'when' | 'what' | 'far' | 'charge' | 'terms';

const SECTIONS: Array<{ key: SectionKey; num: number; title: string; blurb: string }> = [
  { key: 'when', num: 1, title: 'When you’ll take them', blurb: 'Days, response window reach, and earliest/latest arrival hours.' },
  { key: 'what', num: 2, title: 'What kind of work', blurb: 'Quick jobs to fit in — and what the AI filter screens out.' },
  { key: 'far', num: 3, title: 'How far you’ll go', blurb: 'Maximum detour miles and drive-time radius off existing routes.' },
  { key: 'charge', num: 4, title: 'What you’ll charge', blurb: 'Fee range, daily limit, and take-home earnings breakdown.' },
  { key: 'terms', num: 5, title: 'Deadlines & refunds', blurb: 'Response deadlines and cancellation refund tiers.' },
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
  readOnly?: boolean;
}) {
  const s = quickStopSettingsFromAccount(quickStop);
  const t = refundTiers;

  const [openSections, setOpenSections] = useState<Set<SectionKey>>(new Set(['when']));
  const isOpen = (key: SectionKey) => openSections.has(key);
  const refs = useRef<Partial<Record<SectionKey, HTMLElement | null>>>({});
  const [previewOpen, setPreviewOpen] = useState(false);

  // Preset preview state
  const [pendingPreset, setPendingPreset] = useState<TradePreset | null>(null);

  // Live calculator test amount
  const defaultFeeD = Math.round((centsToDollars(s.minFeeCents) + centsToDollars(s.maxFeeCents)) / 2) || 125;
  const [calculatorFee, setCalculatorFee] = useState<number>(defaultFeeD);

  const [refunds, setRefunds] = useState({
    withinGraceMinutes: String(t.withinGraceMinutes),
    grace: String(t.grace),
    beforeEnRoute: String(t.beforeEnRoute),
    afterEnRoute: String(t.afterEnRoute),
    afterArrived: String(t.afterArrived),
  });
  const setRefund = (key: keyof typeof refunds, value: string) => setRefunds((prev) => ({ ...prev, [key]: value }));

  const refundNum = (raw: string, max: number) => {
    const n = Math.round(Number(raw));
    return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0;
  };

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
  const _overall = quickStopSectionsState(reviews);

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
    setPendingPreset(null);
    expandAll();
  }

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

      <p className="workspace-details-copy" style={{ marginTop: 0, marginBottom: '0.5rem' }}>
        Quick Stop lets nearby customers pay for priority visits on your route sooner than normal booking. You review every request, choose the arrival window, and set the fee before anything is booked.
      </p>

      {/* Collapsible Learn More */}
      <details style={{ marginBottom: '1rem', padding: '0.4rem 0', fontSize: '0.85rem' }}>
        <summary style={{ cursor: 'pointer', color: 'var(--muted)', fontWeight: 600 }}>
          Learn more about routing, clearing, and mid-day arrival windows
        </summary>
        <div style={{ marginTop: '0.5rem', padding: '0.75rem 1rem', borderRadius: '8px', background: 'rgba(var(--tint, 255,255,255), 0.02)', border: '1px solid var(--edge-t10, rgba(255,255,255,0.08))', lineHeight: 1.5 }}>
          <p style={{ margin: '0 0 0.5rem' }}>
            <strong>A Quick Stop can land mid-day or at the end of the day</strong> — wherever it fits your route. A gap between two booked jobs is as valid as tacking one onto the end.
          </p>
          <p style={{ margin: 0 }}>
            Customers pay upon approving your offer. Nothing is booked until payment clears, and you retain 100% control over which jobs to accept.
          </p>
        </div>
      </details>

      {/* Top-Level Setup Summary Bar */}
      <div className="qs-summary-bar" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', marginBottom: '1rem', alignItems: 'center' }}>
        {SECTIONS.map((sec) => {
          const rev = reviewFor(sec.key);
          const isWarn = rev?.state === 'warn';
          const isTodo = rev?.state === 'todo';
          const isOk = !isWarn && !isTodo;
          return (
            <button
              key={sec.key}
              type="button"
              onClick={() => {
                if (!isOpen(sec.key)) toggleSection(sec.key);
                refs.current[sec.key]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.35rem 0.65rem',
                borderRadius: '999px',
                fontSize: '0.78rem',
                fontWeight: 600,
                border: '1px solid',
                borderColor: isWarn ? '#ff7a21' : isTodo ? 'rgba(255,209,102,0.4)' : 'rgba(52,199,123,0.3)',
                background: isWarn ? 'rgba(255,122,33,0.1)' : isTodo ? 'rgba(255,209,102,0.1)' : 'rgba(52,199,123,0.08)',
                color: isWarn ? '#ff7a21' : isTodo ? '#ffd166' : '#34c77b',
                cursor: 'pointer',
                minHeight: '36px',
              }}
            >
              <span>{isOk ? '✓' : isWarn ? '⚠' : '○'}</span>
              <span>{sec.title}</span>
            </button>
          );
        })}
      </div>

      {/* Safe Collapsible Presets with Preview */}
      <details className="qs-presets-strip" style={{ marginBottom: '1.25rem' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem', color: '#ff9a52', listStyle: 'none', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span>⚡ 1-Click Quick-Start Trade Presets</span>
          <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--muted)' }}>(Click to view &amp; preview)</span>
        </summary>

        <div style={{ marginTop: '0.75rem' }}>
          <p className="qs-presets-hint" style={{ margin: '0 0 0.65rem', fontSize: '0.82rem', color: 'var(--muted)' }}>
            Select a trade preset below to preview recommended categories, detour radii, and fee bands:
          </p>
          <div className="qs-presets-grid">
            {TRADE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="qs-preset-btn"
                onClick={() => setPendingPreset(preset)}
                title={`Preview ${preset.name} settings`}
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

          {pendingPreset ? (
            <div
              className="qs-preset-confirm-dialog"
              style={{
                marginTop: '0.85rem',
                padding: '0.85rem 1rem',
                background: 'rgba(255, 122, 33, 0.09)',
                border: '1px solid rgba(255, 122, 33, 0.3)',
                borderRadius: '8px',
              }}
            >
              <strong style={{ color: '#ff9a52', fontSize: '0.9rem' }}>
                Load {pendingPreset.name} Preset ({pendingPreset.icon})
              </strong>
              <p style={{ margin: '0.25rem 0 0.5rem', fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.45 }}>
                Will update: Categories ({pendingPreset.categories.slice(0, 45)}…), Visit max {pendingPreset.maxVisitMinutes}m, Detour {pendingPreset.maxDetourMiles} mi, Fee ${pendingPreset.minFeeDollars}–${pendingPreset.maxFeeDollars}, Hours {pendingPreset.earliestTime}–{pendingPreset.latestEnd}.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => applyPreset(pendingPreset)}
                  style={{ minHeight: '38px', fontSize: '0.82rem' }}
                >
                  Apply {pendingPreset.name} Settings
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setPendingPreset(null)}
                  style={{ minHeight: '38px', fontSize: '0.82rem' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </details>

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
        {SECTIONS.map((section) => (
          <section
            className="bset-section"
            key={section.key}
            ref={(el) => {
              refs.current[section.key] = el;
            }}
          >
            <button
              type="button"
              className="bset-section-head"
              onClick={() => toggleSection(section.key)}
              aria-expanded={isOpen(section.key)}
              aria-controls={`qs-section-${section.key}`}
            >
              <span className="bset-num">{section.num}</span>
              <span className="bset-section-copy">
                <strong>{section.title}</strong>
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

            <div id={`qs-section-${section.key}`} className="bset-section-body" hidden={!isOpen(section.key)}>
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
                    <small className="field-hint">The days a Quick Stop is allowed to land. To pause entirely, use the switch at the top.</small>
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
                      By mid-afternoon there is often no room left today, and a customer is usually fine with tomorrow.
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
                      placeholder="e.g. leak repair, running toilet, faucet replacement"
                    />
                    <small className="field-hint">Comma-separated list of short jobs you are willing to fit in.</small>
                  </div>

                  <div className="field">
                    <label htmlFor="quickStopMaxVisitMinutes">Maximum visit duration (minutes)</label>
                    <input id="quickStopMaxVisitMinutes" name="quickStopMaxVisitMinutes" type="number" min="5" max="600" step="5" inputMode="numeric" defaultValue={s.maxVisitMinutes} />
                    <small className="field-hint">Jobs estimated longer than this are screened out.</small>
                  </div>

                  <div className="field">
                    <label htmlFor="quickStopRequiredPhotos">Photos the customer must send</label>
                    <input id="quickStopRequiredPhotos" name="quickStopRequiredPhotos" type="number" min="0" max="6" step="1" inputMode="numeric" defaultValue={s.requiredPhotos} />
                    <small className="field-hint">0 makes photos optional. 1 helps assess scope accurately.</small>
                  </div>

                  <p className="field full field-hint quick-stop-always-on">
                    <span aria-hidden="true">🛡</span> Every request is screened before it reaches you. Exclusions (gas, mould, permits, multi-day work) are refused outright. You see what passed and make the final decision.
                  </p>
                </div>
              ) : null}

              {section.key === 'far' ? (
                <div className="form-grid compact-form">
                  <div className="field">
                    <label htmlFor="quickStopMaxDetourMiles">Max detour off your route (miles)</label>
                    <input id="quickStopMaxDetourMiles" name="quickStopMaxDetourMiles" type="number" min="0" max="500" step="1" inputMode="numeric" defaultValue={s.maxDetourMiles} />
                    <small className="field-hint">Measured from the closest scheduled stop on that day.</small>
                  </div>

                  <div className="field">
                    <label htmlFor="quickStopMaxDetourMinutes">Max added drive time (minutes)</label>
                    <input id="quickStopMaxDetourMinutes" name="quickStopMaxDetourMinutes" type="number" min="0" max="600" step="5" inputMode="numeric" defaultValue={s.maxDetourMinutes} />
                    <small className="field-hint">Traffic-adjusted drive time from closest stop.</small>
                  </div>

                  <div className="field full" style={{ marginTop: '0.4rem', padding: '0.65rem 0.85rem', borderRadius: '8px', background: 'rgba(167, 139, 250, 0.08)', border: '1px solid rgba(167, 139, 250, 0.25)' }}>
                    <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text)' }}>
                      📍 <strong>Priority Areas:</strong> Want to accept Quick Stops in specific neighborhoods regardless of route detour? Scroll to the <em>Priority Areas</em> section below.
                    </p>
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
                      hint="You set the exact fee on each offer within this band. A 10% platform fee applies to the visit fee; invoice labor & parts separately."
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
                      <div className="qs-calc-grid">
                        <div className="qs-calc-item">
                          <span>Customer Pays</span>
                          <strong>${calculatorFee}</strong>
                        </div>
                        <div className="qs-calc-item">
                          <span>10% LGQ Platform Fee</span>
                          <span style={{ color: 'var(--muted)' }}>-${(calculatorFee * 0.10).toFixed(2)}</span>
                        </div>
                        <div className="qs-calc-item">
                          <span>Stripe Processing (~2.9% + 30¢)</span>
                          <span style={{ color: 'var(--muted)' }}>-${(calculatorFee * 0.029 + 0.30).toFixed(2)}</span>
                        </div>
                        <div className="qs-calc-item qs-calc-total">
                          <span>Net Direct Deposit</span>
                          <strong>${Math.max(0, calculatorFee - (calculatorFee * 0.10) - (calculatorFee * 0.029 + 0.30)).toFixed(2)}</strong>
                        </div>
                      </div>
                      <p className="qs-calc-note">
                        ✨ <strong>Paid out on booking clearance:</strong> You get paid before turning the ignition. Any repair, labor, or parts work performed during the visit is invoiced separately.
                      </p>
                    </div>
                  </div>

                  <div className="field">
                    <label htmlFor="quickStopMaxPerDay">Max Quick Stops per day</label>
                    <input id="quickStopMaxPerDay" name="quickStopMaxPerDay" type="number" min="1" max="50" step="1" inputMode="numeric" defaultValue={s.maxPerDay} />
                    <small className="field-hint">Separate daily cap for Quick Stops.</small>
                  </div>
                </div>
              ) : null}

              {section.key === 'terms' ? (
                <div className="form-grid compact-form">
                  <div className="field">
                    <label htmlFor="quickStopResponseDeadline">Your response deadline (minutes)</label>
                    <input id="quickStopResponseDeadline" name="quickStopResponseDeadline" type="number" min="1" max="720" step="1" inputMode="numeric" defaultValue={s.responseDeadlineMins} />
                    <small className="field-hint">Time you have to make an offer before request expires. Default 30.</small>
                  </div>

                  <div className="field">
                    <label htmlFor="quickStopPaymentDeadline">Customer payment deadline (minutes)</label>
                    <input id="quickStopPaymentDeadline" name="quickStopPaymentDeadline" type="number" min="1" max="720" step="1" inputMode="numeric" defaultValue={s.paymentDeadlineMins} />
                    <small className="field-hint">Time customer has to pay and lock the window. Default 15.</small>
                  </div>

                  <div className="field full" style={{ marginTop: '.4rem', paddingTop: '.7rem', borderTop: '1px solid rgba(255,255,255,.1)' }}>
                    <label>Cancellation refunds</label>
                    <small className="field-hint">
                      Percentage refunded to customer based on journey stage. {CONTRACTOR_REFUND_SCOPE_NOTE}
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
                    <small className="field-hint">Full refund if cancelled this soon after paying.</small>
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

                  {refundWarnings.length > 0 ? (
                    <ul className="refund-warnings" role="status" aria-live="polite">
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

        <div className="qs-savebar" role="region" aria-label="Unsaved changes">
          <div className="qs-savebar-inner">
            <div className="qs-savebar-copy">
              <strong>Unsaved changes</strong>
              <small>
                {flagged > 0 ? `${flagged} section${flagged === 1 ? '' : 's'} to check` : 'Ready to save'}
              </small>
            </div>
            <SaveButton onlyWhenChanged>Save Quick Stop settings</SaveButton>
          </div>
        </div>
      </form>
    </section>
  );
}
