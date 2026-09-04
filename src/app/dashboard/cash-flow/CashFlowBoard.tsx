'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import SaveButton from '@/components/save-button';
import ModalDialog from '@/components/modal-dialog';
import { buildForecast, KIND_LABEL, type CashEvent } from '@/lib/cash-forecast';
import { cashOutlook } from '@/lib/cash-outlook';
import {
  CASH_SCENARIOS,
  applyScenario,
  summariseScenarios,
  scenarioDelta,
  type ScenarioKey,
} from '@/lib/cash-scenarios';
import { cashLowPanel } from '@/lib/cash-causes';
import { cashFlags, cashConfidence } from '@/lib/cash-quality';
import { accuracySentence, type ForecastAccuracy } from '@/lib/cash-accuracy';
import CashChart, { type LineKey } from './CashChart';
import ScheduledPaymentForm from './ScheduledPaymentForm';

// The interactive half of the cash-flow page.
//
// Everything here recomputes in the browser. The server hands over a list of
// dated money movements once; moving the balance slider re-runs the same pure
// forecast the server would have run, which is what makes dragging it feel like
// a dial rather than a page load.

type Props = {
  windows: { key: string; label: string; days: number }[];
  selectedKey: string;
  events: CashEvent[];
  todayKey: string;
  horizonDays: number;
  /**
   * How far the EVENTS reach, which is not how far the chart draws.
   *
   * The 30-day view used to report "First warning: None" while the account went
   * negative on day 33 — a drawing choice reported as a fact about the
   * business. Risk is looked for out here and worded against the window.
   */
  longDays?: number;
  savedBalance: number | null;
  savedBuffer: number;
  savedCreditLine: number;
  balanceAt: string | null;
  paymentLagDays: number;
  paymentLagMeasured: boolean;
  unbilled: { count: number; total: number };
  /** How the last forecast actually did. Null when there's nothing honest to say. */
  accuracy: ForecastAccuracy | null;
  settingsAvailable: boolean;
  saveSettings: (formData: FormData) => void | Promise<void>;
  /**
   * The bills panel, passed in as a slot rather than rendered by the page after
   * this component. It has to sit ABOVE the day-by-day list — you add what
   * leaves the account, then read what that does to each day — and the day list
   * can't move out of here because it's built from the same forecast state.
   */
  billsPanel?: ReactNode;
  /** False on the public demo, where the Server Action behind the form
      requires an owner and would bounce a visitor to /login. */
  canAddExpense?: boolean;
  /**
   * Where the 30/60/90 tabs point. Hardcoded to /dashboard, they were the one
   * broken control on the demo's forecast: a prospect changing the window got
   * the login wall instead of a different chart. The demo passes '/demo'.
   */
  basePath?: string;
};

// A fixed ceiling, not one derived from the account's own numbers. A track that
// re-scales to whatever you last saved moves under the thumb as you drag it, and
// a shop holding half a million in the bank shouldn't hit the end of the slider.
// The dollar box beside it is there for anything the track is too coarse for.
const BALANCE_SLIDER_MAX = 500_000;
/* An overdraft is a real state of a real account, and the exact box above the
   slider can now say so. Deliberately shallow against the max: the slider is
   for "roughly where am I", and a symmetric range would spend half its travel
   on balances almost nobody has. */
const BALANCE_SLIDER_MIN = -50_000;

// 'worst' is not in here any more. It was a second line drawn beside the first,
// and reading a scenario off two overlapping curves is what the scenario tabs
// replaced — those change every number on the page rather than adding a line to
// compare by eye.
const OPTIONAL_LINES: { key: LineKey; label: string; hint: string }[] = [
  { key: 'required', label: 'Minimum cash needed', hint: 'What you need on each day to cover everything still ahead.' },
  { key: 'incoming', label: 'Expected money in', hint: 'Running total of customer payments expected.' },
  { key: 'outgoing', label: 'Committed money out', hint: 'Running total of payroll, bills and materials.' },
  { key: 'credit', label: 'Credit floor', hint: 'How far below zero your overdraft or credit line reaches.' },
];

const BUFFER_PRESETS = [0, 2500, 5000, 10000];

/** Days of movements shown before "Show all". A week is the horizon of the
 *  question this list answers; the other 50-odd are one press away. */
const DAYS_SHOWN = 7;

const STATUS_TONE: Record<'unknown' | 'safe' | 'tight' | 'shortfall', 'ok' | 'warn' | 'alert'> = {
  unknown: 'warn',
  safe: 'ok',
  tight: 'warn',
  shortfall: 'alert',
};

function money(value: number): string {
  const rounded = Math.round(value);
  return `${rounded < 0 ? '−' : ''}$${Math.abs(rounded).toLocaleString('en-US')}`;
}

function moneyExact(value: number): string {
  return `${value < 0 ? '−' : ''}$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dayLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1)).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function daysAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export default function CashFlowBoard({
  windows,
  selectedKey,
  events,
  todayKey,
  horizonDays,
  longDays,
  savedBalance,
  savedBuffer,
  savedCreditLine,
  balanceAt,
  paymentLagDays,
  paymentLagMeasured,
  unbilled,
  accuracy,
  settingsAvailable,
  saveSettings,
  billsPanel,
  canAddExpense = true,
  basePath = '/dashboard',
}: Props) {
  const base = basePath;
  // Where an expense added from the popup lands. The popup writes it and the
  // page revalidates, so the new row appears in the bills panel further down —
  // out of sight from the top of a long page. Scrolling there on success is what
  // makes the add feel like it did something rather than like it vanished.
  const billsRef = useRef<HTMLDetailsElement>(null);
  const revealBills = useCallback(() => {
    const panel = billsRef.current;
    if (!panel) return;
    // Opened as well as scrolled to. Scrolling somebody to a closed section and
    // calling that "here is the thing you just added" is worse than not moving.
    panel.open = true;
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  /**
   * A link to #cash-bills has to arrive somewhere readable.
   *
   * The actions in the low panel point here, and a fragment landing on a closed
   * <details> scrolls to a one-line summary with the answer still hidden behind
   * it. Opened on arrival, and on every later hash change, because clicking the
   * same link twice is a real thing people do.
   */
  useEffect(() => {
    const openOnHash = () => {
      if (window.location.hash === '#cash-bills' && billsRef.current) billsRef.current.open = true;
    };
    openOnHash();
    window.addEventListener('hashchange', openOnHash);
    return () => window.removeEventListener('hashchange', openOnHash);
  }, []);

  /**
   * "Add your bank balance to start the forecast" used to be a <span> styled as
   * a pill. It looked like the button it needed to be, and clicking it did
   * nothing — the field it was asking for was several hundred pixels further
   * down, unlinked. Now the prompt is a real button and it puts the cursor in
   * the field, so the ask and the answer are one press apart.
   */
  const balanceRef = useRef<HTMLInputElement>(null);
  const settingsRef = useRef<HTMLDetailsElement>(null);
  const focusBalance = useCallback(() => {
    // The field now lives inside the Advanced settings drawer, and a <details>
    // does not open itself because something inside it was focused — the
    // browser only does that for find-in-page and fragment navigation. So open
    // it first, or the ask lands on an element with no layout.
    if (settingsRef.current) settingsRef.current.open = true;
    const field = balanceRef.current;
    if (!field) return;
    field.scrollIntoView({ behavior: 'smooth', block: 'center' });
    field.focus({ preventScroll: true });
    field.select();
  }, []);
  /**
   * STARTS AT ZERO — AND EVERY FIGURE THAT WOULD BE A CLAIM ABOUT THE ACCOUNT
   * RATHER THAN ABOUT THE MONTH WAITS FOR A REAL NUMBER.
   *
   * This was null until somebody entered a number, and null propagated: a setup
   * callout above the title, three readouts printing an em-dash, and "Starting
   * balance needed" where "Funding needed" belonged. That cost landed on every
   * visit before the one where somebody finally looked up their bank balance,
   * and the page it was protecting them from is the page they came to see. So
   * the forecast opens from $0. The SHAPE of the month — what leaves, what
   * arrives, on which days — is real either way, and $0 is a starting point a
   * contractor can read and correct.
   *
   * What the placeholder cannot carry came back. "Funding needed $8,412" and a
   * red "Shortfall projected" are not facts about the shape; they are arithmetic
   * on a balance nobody gave, stated to the dollar. So the status, the headroom
   * and the funding figure go through `balanceSaved` and say they are waiting on
   * the number instead of deriving a precise one from the zero — see the
   * `cashOutlook` call below and the Funding needed card. Everything the
   * movements alone support (the curve, the day list, safe starting cash) is
   * unaffected, and no callout stands between the title and the chart.
   *
   * `savedBalance` stays nullable end to end — nothing writes a zero to the
   * database on their behalf (see `balanceTouched` and the save block below).
   */
  const [balance, setBalance] = useState<number>(savedBalance ?? 0);
  /**
   * Whether this visit has MOVED the balance, which is not the same as what it
   * currently reads.
   *
   * A fresh account opens at 0 with `savedBalance` null, so a value comparison
   * called the page dirty before anybody had touched it — and the Save button
   * that sat enabled underneath wrote that placeholder in as a confirmed,
   * timestamped bank balance, flipped off the "starting from $0" note, and
   * seeded a forecast-accuracy snapshot from it. Tracking the touch rather than
   * the value also keeps a genuine $0 saveable: type it and you meant it.
   */
  const [balanceTouched, setBalanceTouched] = useState(false);
  const changeBalance = useCallback((next: number) => {
    setBalance(next);
    setBalanceTouched(true);
  }, []);
  const [buffer, setBuffer] = useState<number>(savedBuffer);
  const [creditLine, setCreditLine] = useState<number>(savedCreditLine);
  /**
   * Base / Payments late / Stress test, up beside the horizon tabs.
   *
   * This was a checkbox in the settings panel below the chart, which drew a
   * dashed line and changed nothing else — so the question it answers, does the
   * warning move if everybody pays me a week late, could only be answered by
   * comparing a second curve to a card that had not budged. Selecting a
   * scenario now moves the events themselves, so every number on the page is
   * about the scenario you are looking at.
   */
  const [scenario, setScenario] = useState<ScenarioKey>('base');
  const [showAllDays, setShowAllDays] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [lines, setLines] = useState<Record<LineKey, boolean>>({
    confirmed: true,
    worst: false,
    incoming: false,
    outgoing: false,
    credit: false,
    required: false,
  });

  // Whether a HUMAN has ever given us this number, which is a different
  // question from what the forecast is currently starting from. What is stored
  // is what the hint under the field and the Save button's label are about.
  const balanceSaved = savedBalance !== null;
  /**
   * Stored, or typed in this visit and not stored yet — "has somebody told us
   * what is in the account", which is the question the withheld figures are
   * actually asking.
   *
   * Gating them on `balanceSaved` alone split the page down the middle. This
   * board is a dial: the exact box, the slider and the chart's own drag handle
   * all feed `startingBalance`, so the moment a number goes in, the curve, the
   * day balances, the lowest point and the warning date all redraw around it.
   * The status pill, the headroom and the funding figure would have gone on
   * saying "Needs today's bank balance" at a reader who had just typed it —
   * the three figures they were dialling toward, frozen, beside a chart moving
   * under their hands. A number nobody has pressed Save on is still a number
   * they gave us.
   */
  const balanceGiven = balanceSaved || balanceTouched;
  const startingBalance = balance;
  const longHorizon = Math.max(horizonDays, longDays ?? horizonDays);

  const scenarioDef = CASH_SCENARIOS.find((option) => option.key === scenario) ?? CASH_SCENARIOS[0];
  // The shift lands on the events, so buildForecast's own numbers — the warning
  // date, the low, the required starting balance — are all about this scenario.
  // lateDays stays 0 below or the delay would be applied twice.
  const scenarioEvents = useMemo(() => applyScenario(events, scenarioDef), [events, scenarioDef]);

  const forecast = useMemo(
    () =>
      buildForecast(scenarioEvents, {
        todayKey,
        days: horizonDays,
        startingBalance,
        buffer,
        lateDays: 0,
        creditLine,
      }),
    [scenarioEvents, todayKey, horizonDays, startingBalance, buffer, creditLine],
  );

  /**
   * The same forecast, run out as far as the data goes.
   *
   * Only the chart is 30 days. A dip on day 33 is not less real for being off
   * the right-hand edge, and reporting "None" because of where the axis stops
   * is how somebody misses a payroll they had a month's notice of. Built even
   * when the window already IS the long horizon — the memo collapses to the
   * same work and the branch would only be there to save a pass over 90 days
   * of arithmetic.
   */
  const longForecast = useMemo(
    () =>
      longHorizon === horizonDays
        ? forecast
        : buildForecast(scenarioEvents, {
            todayKey,
            days: longHorizon,
            startingBalance,
            buffer,
            lateDays: 0,
            creditLine,
          }),
    [forecast, longHorizon, scenarioEvents, todayKey, horizonDays, startingBalance, buffer, creditLine],
  );

  const outlook = useMemo(
    () =>
      cashOutlook({
        long: longForecast,
        todayKey,
        windowDays: horizonDays,
        longDays: longHorizon,
        buffer,
        // The one input this page cannot work out for itself. Hardcoded true,
        // it read the placeholder zero as a bank balance and reported a dated
        // shortfall and a funding figure to the dollar off it. False keeps the
        // status honest ("Starting balance needed") and the headroom and
        // funding null — the curve and the movements are unaffected.
        balanceKnown: balanceGiven,
        balance: startingBalance,
      }),
    [longForecast, todayKey, horizonDays, longHorizon, buffer, balanceGiven, startingBalance],
  );

  const balanceAge = balanceAt && balanceSaved ? daysAgo(balanceAt) : null;

  /**
   * The three scenarios summarised side by side, always from the RAW events.
   *
   * Each tab has to be able to say what it would do, which means comparing all
   * three whichever one is selected — summarising the already-shifted list
   * would compound the selected scenario onto the other two.
   */
  const scenarios = useMemo(
    () =>
      summariseScenarios({
        events,
        todayKey,
        days: longHorizon,
        startingBalance,
        buffer,
        creditLine,
      }),
    [events, todayKey, longHorizon, startingBalance, buffer, creditLine],
  );
  const baseScenario = scenarios[0];

  /** The day worth acting on, and the movements that made it. */
  const lowPanel = useMemo(
    () => cashLowPanel(longForecast, { todayKey, base, buffer }),
    [longForecast, todayKey, base, buffer],
  );

  /** Questions about the inputs, and how much of the line is pinned down. */
  const flags = useMemo(
    () => cashFlags(events, { base, balanceAgeDays: balanceAge }),
    [events, base, balanceAge],
  );
  const confidence = useMemo(() => cashConfidence(forecast), [forecast]);

  /** The floor over the whole horizon — the last of the lows is the deepest. */
  const longLow = outlook.lows[outlook.lows.length - 1];
  /** Where the window ends if every estimate turns out to be nothing. */
  const confirmedEnding = forecast.days[forecast.days.length - 1]?.confirmedOnly ?? 0;

  // An untouched placeholder is not an edit. `savedBalance` is null on a fresh
  // account and the board starts from 0, so `balance !== savedBalance` reported
  // a change nobody had made and left Save live on first paint.
  const dirty =
    (balanceSaved ? balance !== savedBalance : balanceTouched) ||
    buffer !== savedBuffer ||
    creditLine !== savedCreditLine;
  const stale = balanceAge !== null && balanceAge >= 7;

  const activeDays = forecast.days.filter((day) => day.events.length > 0);
  /**
   * The next seven days of movements, then the rest on request.
   *
   * A 90-day window is 60-odd days with something in them, and rendering all of
   * them made the page 10,000px on a phone. Seven is the horizon of the
   * question this list actually answers — what is coming — and a day the reader
   * has selected on the chart is always shown whether or not it is inside it,
   * because otherwise selecting a marker scrolls to nothing.
   */
  const shownDays =
    showAllDays || activeDays.length <= DAYS_SHOWN
      ? activeDays
      : activeDays.filter((day, index) => index < DAYS_SHOWN || day.index === selected);
  const hiddenDays = activeDays.length - shownDays.length;

  const tone = STATUS_TONE[outlook.status];

  const chart = (
    <>
      <CashChart
        forecast={forecast}
        buffer={buffer}
        creditLine={creditLine}
        lines={lines}
        lateDays={scenarioDef.lateDays}
        onBufferChange={setBuffer}
        onBalanceChange={changeBalance}
        selected={selected}
        onSelect={setSelected}
      />

      <div className="cash-legend">
        <span className="cash-legend-item">
          <i className="cash-swatch projected" />{' '}
          {scenario === 'base' ? 'Projected balance' : `Projected balance — ${scenarioDef.label.toLowerCase()}`}
        </span>
        <span className="cash-legend-item">
          <i className="cash-swatch confirmed" /> Confirmed money only
        </span>
        <span className="cash-legend-item">
          <i className="cash-swatch buffer" /> Safety buffer
        </span>
        <span className="cash-legend-item">
          <i className="cash-marker-key solid" /> Confirmed event
        </span>
        <span className="cash-legend-item">
          <i className="cash-marker-key hollow" /> Estimated event
        </span>
      </div>

      <details className="cash-line-toggles">
        <summary>Add more lines</summary>
        <div className="cash-toggle-grid">
          <label className="cash-toggle">
            <input
              type="checkbox"
              checked={lines.confirmed}
              onChange={(event) => setLines((current) => ({ ...current, confirmed: event.target.checked }))}
            />
            <span>
              <strong>Confirmed money only</strong>
              <small>Ignores every estimate. The gap between the two lines is how much of this forecast is a guess.</small>
            </span>
          </label>
          {OPTIONAL_LINES.map((option) => (
            <label className="cash-toggle" key={option.key}>
              <input
                type="checkbox"
                checked={lines[option.key]}
                disabled={option.key === 'credit' && creditLine <= 0}
                onChange={(event) => setLines((current) => ({ ...current, [option.key]: event.target.checked }))}
              />
              <span>
                <strong>{option.label}</strong>
                <small>{option.key === 'credit' && creditLine <= 0 ? 'Set a credit line above to use this.' : option.hint}</small>
              </span>
            </label>
          ))}
        </div>
      </details>
    </>
  );

  return (
    <>
      {/* Single column, not the usual two: the chart is the hero, and a 340px
          plot squeezed into a 1.3fr text column is a sparkline. */}
      <section className="workspace-hero panel workspace-hero-solo cash-hero">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Cash flow</p>
          <h1 className="workspace-title">Cash-flow forecast</h1>
          <p className="workspace-lead">
            Payroll, bills and materials going out; deposits, invoices and plans coming in — your balance day by
            day, and the first day it falls below its safety buffer.
          </p>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.6rem', marginBottom: '0.85rem' }}>
            <Link className="btn secondary" href="/dashboard/expenses" style={{ fontSize: '0.82rem', padding: '0.35rem 0.65rem' }}>
              💳 All Expenses Ledger →
            </Link>
            <Link className="btn secondary" href="/dashboard/payments" style={{ fontSize: '0.82rem', padding: '0.35rem 0.65rem' }}>
              💰 Revenue &amp; Payments →
            </Link>
            <Link className="btn secondary" href="/dashboard/reports" style={{ fontSize: '0.82rem', padding: '0.35rem 0.65rem' }}>
              📑 Tax &amp; P&amp;L Reports →
            </Link>
          </div>

          {/* THE SETUP WALL IS GONE.
              A callout headed "Preview — starting balance needed", with its own
              paragraph and its own button, stood between the page's title and
              its first number on every load until somebody had gone and looked
              up their bank balance. The forecast underneath it was already
              working: the SHAPE of the month — what leaves, what arrives, on
              which days — is real whether or not anyone has typed a balance.
              The page now opens from $0 and says so quietly, in the field, where
              the fix is. See the note on `balance` above. */}

          {/* THE DECISION, ABOVE THE PICTURE OF IT.
              Status, when it goes wrong, how much room there is, and what it
              would take to fix — before the chart, because those four are what
              somebody opened the page to find out. The chart is the evidence
              for them, not the way to work them out. */}
          <div className={`cash-decision tone-${tone}`}>
            <div className="cash-decision-head">
              <span className={`cash-status-pill tone-${tone}`}>{outlook.label}</span>
              <p className="cash-decision-sentence">{outlook.sentence}</p>
            </div>

            <dl className="cash-decision-facts">
              <div>
                <dt>Next warning</dt>
                <dd className={outlook.risk ? 'is-risk' : ''}>
                  {outlook.risk ? outlook.risk.label : `None in ${longHorizon} days`}
                </dd>
                <small>
                  {outlook.risk
                    ? outlook.risk.beyondWindow
                      ? `${outlook.risk.daysAway} days out — past the ${horizonDays}-day chart.`
                      : `${outlook.risk.daysAway === 0 ? 'Today' : `In ${outlook.risk.daysAway} days`}, at ${money(outlook.risk.balance)}.`
                    : 'Checked past the edge of the chart, not just inside it.'}
                </small>
              </div>
              <div>
                <dt>Headroom above buffer</dt>
                <dd className={outlook.headroom !== null && outlook.headroom < 0 ? 'is-risk' : ''}>
                  {outlook.headroom === null ? '—' : money(outlook.headroom)}
                </dd>
                <small>
                  {outlook.headroom === null
                    ? 'Needs today’s bank balance.'
                    : `At the lowest point in ${longHorizon} days, against a ${money(buffer)} buffer.`}
                </small>
              </div>
              <div>
                <dt>Funding needed</dt>
                {/* A gap is the difference between what the movements need and
                    what is in the account, so with no balance saved there is no
                    gap to state — only a placeholder subtracted from a real
                    figure. Safe starting cash below is the half of it the
                    movements alone do support. */}
                <dd className={balanceGiven && outlook.funding > 0 ? 'is-risk' : ''}>
                  {balanceGiven ? money(outlook.funding) : '—'}
                </dd>
                <small>
                  {!balanceGiven
                    ? 'Needs today’s bank balance.'
                    : outlook.funding > 0
                      ? 'Cash that has to arrive before the low point.'
                      : 'Nothing needed — the movements clear the buffer on their own.'}
                </small>
              </div>
            </dl>

            {/* THE RISKY DATE AS SOMETHING TO DO, not a number to worry about.
                Naming the day and stopping leaves the actual work — finding the
                four rows out of eighty that made it, then working out which of
                them you have any control over — on the reader. */}
            {lowPanel ? (
              <div className="cash-low-panel">
                <p className="cash-low-headline">
                  <strong>{lowPanel.headline}</strong>{' '}
                  {money(lowPanel.drop)} leaves the account that day, taking it to {money(lowPanel.balance)}.
                </p>
                <ul className="cash-low-causes">
                  {lowPanel.causes.map((cause) => (
                    <li key={cause.event.id}>
                      <span className="cash-low-cause">
                        <strong>{cause.event.label}</strong>
                        <small>
                          {KIND_LABEL[cause.event.kind]} · {money(Math.abs(cause.event.amount))}
                          {cause.share > 0 ? ` · ${Math.round(cause.share * 100)}% of the day` : ''}
                        </small>
                      </span>
                      <span className="cash-low-actions">
                        {cause.actions.map((action) =>
                          action.href ? (
                            <Link key={action.kind} href={action.href} className="btn ghost" title={action.why}>
                              {action.label}
                            </Link>
                          ) : (
                            <span key={action.kind} className="cash-low-advice" title={action.why}>
                              {action.label}
                            </span>
                          ),
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          {/* WHAT WE ARE UNSURE OF, and what looks wrong.
              Nothing here corrects anything — a forecast that silently fixes
              its inputs is worse than one that draws them wrong, because at
              least the wrong one can be spotted. */}
          {flags.length > 0 ? (
            <div className="cash-flags">
              {flags.map((flag) => (
                <div key={flag.kind + flag.question} className="cash-flag">
                  <p className="cash-flag-q">{flag.question}</p>
                  <p className="cash-flag-detail">{flag.detail}</p>
                  {/* One link per side when the two sides live on different
                      pages. "Check the entries →" always landed in the bills
                      panel, which holds scheduled payments only — so a bill
                      colliding with a payroll run or a customer payment sent
                      somebody to a list containing at most half the question. */}
                  {flag.entries.length > 0 ? (
                    <p className="cash-flag-detail">
                      {flag.entries.map((entry, index) => (
                        <span key={entry.href}>
                          {index > 0 ? ' · ' : ''}
                          <Link href={entry.href} className="linklike">
                            {entry.label} →
                          </Link>
                        </span>
                      ))}
                    </p>
                  ) : flag.href ? (
                    <Link href={flag.href} className="linklike">
                      Check the entries →
                    </Link>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          <div className="cash-hero-chart">
            <div className="cash-hero-chart-head">
              <span className="cash-hero-chart-label">Projected account balance</span>
              <span className="cash-hero-chart-sub">
                <span className={`cash-confidence is-${confidence.level}`}>{confidence.sentence}</span>
                {balanceAge === null ? null : (
                  <span className="cash-confidence-age">
                    {' '}
                    Balance last updated{' '}
                    {balanceAge === 0 ? 'today' : balanceAge === 1 ? 'yesterday' : `${balanceAge} days ago`}.
                  </span>
                )}
              </span>
            </div>
            {chart}
            {/* One line under the chart rather than a callout above the title.
                It is worth saying that the curve is starting from a zero nobody
                confirmed — it is not worth blocking the page to say it. It goes
                as soon as a number is typed, saved or not: the sentence names
                $0 outright, and by then the line above it starts somewhere
                else. */}
            {balanceGiven ? null : (
              <p className="cash-provisional-note">
                Starting from <strong>$0</strong>, because no bank balance has been saved yet. Put today&rsquo;s number
                in <button type="button" className="cash-inline-link" onClick={focusBalance}>below</button> and every
                figure on this page moves with it.
              </p>
            )}
          </div>

          {/* Directly under the lead, above the chart: whether to believe the
              curve is the first thing you need, not a footnote under it. */}
          {accuracy ? (
            <div className={`cash-accuracy tone-${accuracy.direction}`}>
              <p className="cash-accuracy-line">{accuracySentence(accuracy)}</p>
              <p className="cash-accuracy-note">
                {accuracy.direction === 'on'
                  ? 'Worth knowing the next number is coming from something that has been right before.'
                  : 'Some of that gap is money that moved without passing through here — cash jobs, transfers, anything you paid on a card. The rest is worth chasing.'}
              </p>
            </div>
          ) : null}

          <div className="cash-window-row">
            <div className="insight-window-tabs" role="tablist" aria-label="Forecast window">
              {windows.map((option) => (
                <Link
                  key={option.key}
                  href={`${base}/cash-flow?window=${option.key}`}
                  className={`insight-window-tab${option.key === selectedKey ? ' is-active' : ''}`}
                  aria-selected={option.key === selectedKey}
                  role="tab"
                >
                  {option.label}
                </Link>
              ))}
            </div>

            {/* THE SCENARIOS, beside the horizon rather than buried below it.
                Each tab carries what it assumes and what that does — when the
                warning lands and what it would take to cover — so the
                comparison is readable without selecting all three in turn. */}
            <div className="cash-scenario-tabs" role="group" aria-label="Scenario">
              {scenarios.map((summary) => {
                const delta = scenarioDelta(baseScenario, summary, todayKey);
                const isOn = summary.key === scenario;
                return (
                  <button
                    key={summary.key}
                    type="button"
                    className={`cash-scenario${isOn ? ' is-on' : ''}`}
                    aria-pressed={isOn}
                    onClick={() => setScenario(summary.key)}
                  >
                    <strong>{summary.label}</strong>
                    <small>
                      {summary.warningLabel ? `Warning ${summary.warningLabel}` : `No warning in ${longHorizon} days`}
                      {/* The same subtraction the Funding needed card refuses
                          to print without a balance — `required` minus what is
                          in the account — so with no balance given it is the
                          withheld figure, to the dollar, 200px below the card
                          that withheld it. The warning DATE stays: that comes
                          off the shape of the month either way. */}
                      {balanceGiven && summary.funding > 0 ? ` · ${money(summary.funding)} needed` : ''}
                      {summary.key !== 'base' && delta.daysEarlier && delta.daysEarlier > 0
                        ? ` · ${delta.daysEarlier} days sooner`
                        : ''}
                    </small>
                    {/* The assumption, on the tab. It was a title tooltip and a
                        line in the settings drawer — neither of which a touch
                        reader can reach — so "Warning Sep 10" was a date with
                        no stated reason to believe it. */}
                    <small>{summary.hint}</small>
                  </button>
                );
              })}
            </div>

            {/* Up here because this is where somebody is looking at the line
                dipping and thinking "that's the insurance I haven't put in yet".
                The same form is still in the bills panel below; this is the same
                thing reachable without scrolling past the whole forecast.

                Shown but inert on the demo, like the other demo buttons: the
                form posts to a Server Action that requires an owner, so on a
                public page it would bounce a visitor to /login mid-demo. */}
            {canAddExpense ? (
              <ModalDialog
                triggerLabel="+ Add expense"
                triggerClassName="btn secondary cash-add-expense"
                title="Add an expense"
                onSuccess={revealBills}
              >
                <ScheduledPaymentForm todayKey={todayKey} inModal />
              </ModalDialog>
            ) : (
              <span className="btn secondary cash-add-expense" aria-disabled="true">+ Add expense</span>
            )}
          </div>
        </div>
      </section>

      {/* THREE DIALS, BEHIND ONE DOOR.
          Money in the bank, the safety buffer and the credit line are all
          settings: you set them once, correct the first one occasionally, and
          spend the rest of your visits reading the chart above. Fully unrolled
          they were a panel of three sliders, four presets and three paragraphs
          of explanation sitting between the forecast and the list of what
          actually moves money — a permanent configuration screen in the middle
          of a page nobody opened to configure anything.

          Closed, always — including on a fresh account with nothing saved. The
          forecast starts from $0 and works; opening the settings for somebody
          who has not asked for them is the same nag the setup callout was. The
          way in is the line under the chart, which says which zero the curve is
          starting from and links straight to the field.

          The current values ride on the summary, so the numbers the forecast is
          built on are readable without opening it. The balance field is what
          focusBalance targets, and a <details> does not open itself for a
          focus() call — see the ref. */}
      <details ref={settingsRef} className="panel cash-controls">
        <summary className="cash-controls-summary">
          <span className="cash-controls-summary-label">
            <strong>Advanced settings</strong>
            <small>The numbers this forecast is built on</small>
          </span>
          <span className="cash-controls-summary-values">
            <span>{money(startingBalance)} in the bank</span>
            <span>{money(buffer)} buffer</span>
            <span>{creditLine > 0 ? `${money(creditLine)} credit` : 'No credit line'}</span>
          </span>
        </summary>
      <form action={saveSettings} className="cash-controls-form">
        <div className="cash-control-grid">
          <div className="cash-control">
            <div className="cash-control-head">
              <label htmlFor="cash-balance-exact">Money in the bank today</label>
              <div className="cash-amount-field">
                <span aria-hidden="true">$</span>
                {/* NO FLOOR AND NO STEP. This box is the one place the owner
                    states a FACT about their own account, and it refused two
                    true answers:

                    min={0} made an overdraft unsayable — which is precisely the
                    account this whole screen exists to help, and it silently
                    clamped the typed number to zero rather than warning.

                    step={100} is a validity rule on a number input, not a
                    nudge: a real balance of 2,847.13 is not a multiple of 100,
                    so the field went :invalid and the browser could refuse the
                    submit. The slider below is where round hundreds belong. */}
                <input
                  id="cash-balance-exact"
                  ref={balanceRef}
                  type="number"
                  step="any"
                  // Clearing the box is 0, not "unset". The forecast starts
                  // from a number either way now, and a field that can hold a
                  // third state the page cannot show is a field that lies.
                  value={balance}
                  // A keystroke in this box is an answer, even when it does not
                  // move the value. React drops onChange when the typed string
                  // matches what the input already held, so an owner who is
                  // genuinely at zero — select the placeholder 0, type 0 —
                  // never reached changeBalance, the field stayed untouched,
                  // and the one balance the page most needs to hear stayed
                  // unsaveable. Editing keys only: Tab and Escape are leaving,
                  // not answering.
                  onKeyDown={(event) => {
                    if (event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete') {
                      setBalanceTouched(true);
                    }
                  }}
                  onChange={(event) => {
                    const raw = event.target.value.trim();
                    if (raw === '' || raw === '-') {
                      changeBalance(0);
                      return;
                    }
                    const next = Number(raw);
                    // NaN keeps the last good value rather than snapping to 0 —
                    // a half-typed "1.2e" should not wipe the number.
                    if (Number.isFinite(next)) changeBalance(next);
                  }}
                />
              </div>
            </div>
            {/* The coarse control, and it reaches below zero too — otherwise an
                overdrawn owner types -1,200 above and watches the slider under
                it sit at 0, which reads as the number not having taken. */}
            <input
              className="cash-range"
              type="range"
              min={BALANCE_SLIDER_MIN}
              max={BALANCE_SLIDER_MAX}
              step={100}
              value={Math.min(Math.max(startingBalance, BALANCE_SLIDER_MIN), BALANCE_SLIDER_MAX)}
              aria-label="Starting bank balance"
              aria-valuetext={money(startingBalance)}
              onChange={(event) => changeBalance(Number(event.target.value))}
            />
            <small className="field-hint">
              {balanceAt && balanceSaved ? (
                stale ? (
                  <>
                    <strong>Last checked {balanceAge} days ago.</strong> Open your banking app and put today&rsquo;s number in —
                    everything below is built on it.
                  </>
                ) : (
                  <>Last saved {balanceAge === 0 ? 'today' : balanceAge === 1 ? 'yesterday' : `${balanceAge} days ago`}.</>
                )
              ) : balanceTouched ? (
                // The page is already using this number. What is outstanding is
                // the press that keeps it for next time, not the typing.
                <>Not saved yet. Save it and the forecast opens from this number next time.</>
              ) : (
                <>Nothing saved yet, so this page is starting from $0. Type what your account actually says and save it.</>
              )}
            </small>
          </div>

          <div className="cash-control">
            <div className="cash-control-head">
              <label htmlFor="cash-buffer-exact">Safety buffer</label>
              <div className="cash-amount-field">
                <span aria-hidden="true">$</span>
                <input
                  id="cash-buffer-exact"
                  type="number"
                  min={0}
                  step={100}
                  value={buffer}
                  onChange={(event) => setBuffer(Math.max(0, Number(event.target.value) || 0))}
                />
              </div>
            </div>
            <div className="cash-preset-row">
              {BUFFER_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`cash-preset${buffer === preset ? ' is-on' : ''}`}
                  onClick={() => setBuffer(preset)}
                >
                  {/* Not "None". In a row of dollar amounts it reads as "no
                      preset selected" rather than "a buffer of zero", which is
                      a real and rather different choice. */}
                  {preset === 0 ? 'No buffer ($0)' : money(preset)}
                </button>
              ))}
            </div>
            {/* "Drag" names one input device. The dashed line is keyboard- and
                touch-adjustable too, and this box is the way to set it exactly. */}
            <small className="field-hint">The lowest you&rsquo;re willing to let the account get. Adjust the dashed line to move it.</small>
          </div>

          <div className="cash-control">
            <div className="cash-control-head">
              <label htmlFor="cash-credit-exact">Overdraft / credit line</label>
              <div className="cash-amount-field">
                <span aria-hidden="true">$</span>
                <input
                  id="cash-credit-exact"
                  type="number"
                  min={0}
                  step={100}
                  value={creditLine}
                  onChange={(event) => setCreditLine(Math.max(0, Number(event.target.value) || 0))}
                />
              </div>
            </div>
            <small className="field-hint">
              Money you can reach but don&rsquo;t have. Kept off the balance on purpose — borrowing to make payroll and having
              the cash are not the same day.
            </small>
          </div>
        </div>

        <div className="cash-controls-foot">
          {/* "Model customer payments arriving late" was a checkbox here. It is
              the Payments late tab now, up beside the horizon, where selecting
              it moves every number rather than adding a line to compare by
              eye. */}
          <p className="cash-controls-note">
            Currently showing <strong>{scenarioDef.label}</strong> — {scenarioDef.hint.toLowerCase()}
          </p>

          {settingsAvailable ? (
            <div className="cash-save">
              {/* Left out of the post entirely until somebody has moved it. The
                  action reads a missing field as "no balance given" and leaves
                  cash_balance, its timestamp and the accuracy snapshot alone —
                  so saving a buffer on a fresh account cannot confirm the
                  placeholder zero the forecast opened from. Once it has been
                  touched, whatever it reads is a deliberate answer, $0
                  included. */}
              {balanceGiven ? <input type="hidden" name="balance" value={balance} /> : null}
              <input type="hidden" name="buffer" value={buffer} />
              <input type="hidden" name="creditLine" value={creditLine} />
              {/* "Saved" is only true if something ever was. On a fresh account
                  the button sits disabled saying what it will do, not claiming
                  it already did it. */}
              <SaveButton className="btn secondary" disabled={!dirty} pendingLabel="Saving…">
                {dirty || !balanceSaved ? 'Save these numbers' : 'Saved'}
              </SaveButton>
            </div>
          ) : null}
        </div>
      </form>
      </details>

      {/* THE MEASUREMENTS, under the decision rather than instead of it.
          "First warning" used to live here and reported None whenever the dip
          fell past the right edge of the chart; it has moved up into the
          decision block, where it is answered against the whole horizon. */}
      <div className="workspace-metric-grid four-up cash-stat-grid">
        <article className={`workspace-metric-card${forecast.lowest.balance < buffer ? ' is-loss' : ''}`}>
          <span className="workspace-metric-label">Lowest balance</span>
          <strong className={`workspace-metric-value${forecast.lowest.balance < 0 ? ' is-negative' : ''}`}>
            {money(forecast.lowest.balance)}
          </strong>
          <p className="workspace-metric-note">
            {dayLabel(forecast.lowest.dateKey)} — the tightest day ahead.
          </p>
        </article>

        {longHorizon > horizonDays ? (
          <article className={`workspace-metric-card${longLow.balance < buffer ? ' is-loss' : ''}`}>
            <span className="workspace-metric-label">Lowest in {longHorizon} days</span>
            <strong className={`workspace-metric-value${longLow.balance < 0 ? ' is-negative' : ''}`}>
              {money(longLow.balance)}
            </strong>
            <p className="workspace-metric-note">
              {longLow.label} — past the edge of the {horizonDays}-day chart, which is why it is here.
            </p>
          </article>
        ) : (
          <article className="workspace-metric-card">
            <span className="workspace-metric-label">If no estimate lands</span>
            <strong className={`workspace-metric-value${confirmedEnding < 0 ? ' is-negative' : ''}`}>
              {money(confirmedEnding)}
            </strong>
            <p className="workspace-metric-note">
              Confirmed money only — the gap to {money(forecast.ending)} is how much of this is a guess.
            </p>
          </article>
        )}

        <article className="workspace-metric-card">
          <span className="workspace-metric-label">Ending cash</span>
          <strong className={`workspace-metric-value${forecast.ending < 0 ? ' is-negative' : ''}`}>
            {money(forecast.ending)}
          </strong>
          <p className="workspace-metric-note">
            {money(forecast.totals.incoming)} in and {money(forecast.totals.outgoing)} out.
          </p>
        </article>

        <article className="workspace-metric-card accent">
          <span className="workspace-metric-label">Safe starting cash</span>
          <strong className="workspace-metric-value">{money(outlook.required)}</strong>
          <p className="workspace-metric-note">
            {/* "More than you have today" needs a today. The figure itself is
                read off the movements and stands without one. */}
            {balanceGiven && outlook.funding > 0
              ? `${money(outlook.funding)} more than you have today.`
              : `What you need today to stay above the buffer for ${longHorizon} days.`}
          </p>
        </article>
      </div>

      <section className="panel workspace-section-card cash-events-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">The next {horizonDays} days</p>
          <h2>Everything that moves money</h2>
        </div>

        <div className="cash-source-note">
          <p>
            Customer payments land{' '}
            <strong>
              {paymentLagDays === 1 ? 'the day after' : `${paymentLagDays} days after`}
            </strong>{' '}
            they&rsquo;re asked for
            {paymentLagMeasured ? ' — measured on your own paid invoices.' : ', which is a starting guess until you have paid invoices to measure.'}
          </p>
          {unbilled.count > 0 ? (
            <p className="cash-source-warn">
              <strong>{money(unbilled.total)}</strong> of finished work has never been invoiced
              {unbilled.count > 1 ? ` across ${unbilled.count} jobs` : ' on 1 job'}. It&rsquo;s left off this forecast on
              purpose — there&rsquo;s no date to put it on until you ask for it. <Link href={`${base}/jobs`}>Send those invoices →</Link>
            </p>
          ) : null}
        </div>

        {activeDays.length === 0 ? (
          <p className="empty-state">
            Nothing scheduled in this window. Add your bills and payroll below and the forecast will have something to draw.
          </p>
        ) : (
          <ol className="cash-event-list">
            {shownDays.map((day) => (
              <li
                key={day.dateKey}
                className={`cash-event-day${selected === day.index ? ' is-selected' : ''}${day.projected < 0 ? ' is-unfunded' : ''}`}
              >
                <button type="button" className="cash-event-daybtn" onClick={() => setSelected(selected === day.index ? null : day.index)}>
                  <span className="cash-event-date">{dayLabel(day.dateKey)}</span>
                  <span className="cash-event-balance">
                    balance {money(day.projected)}
                  </span>
                </button>
                <ul className="cash-event-rows">
                  {day.events.map((event) => (
                    <li key={event.id} className={`cash-event-row ${event.amount >= 0 ? 'is-in' : 'is-out'}`}>
                      <span className="cash-event-main">
                        {event.href ? <Link href={event.href}>{event.label}</Link> : <span>{event.label}</span>}
                        <small>
                          {KIND_LABEL[event.kind]} · {event.detail}
                        </small>
                      </span>
                      <span className="cash-event-amount">
                        {event.amount >= 0 ? '+' : '−'}
                        {moneyExact(Math.abs(event.amount))}
                        <small className={event.confirmed ? 'is-confirmed' : 'is-estimated'}>
                          {event.confirmed ? 'Confirmed' : 'Estimated'}
                        </small>
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}

        {/* A quarter of movements is 60-odd rows, and on a phone that is most
            of a 10,000px page nobody scrolls to the end of. The next week is
            what "what moves money" means on the day you ask it; the rest is
            still here, one press away. */}
        {hiddenDays > 0 ? (
          <button type="button" className="btn secondary cash-show-all" onClick={() => setShowAllDays(true)}>
            Show all {activeDays.length} days ({hiddenDays} more)
          </button>
        ) : null}
      </section>

      {/* BELOW THE MOVEMENTS, AND CLOSED.
          The order used to be the other way round on the reasoning that you add
          what leaves the account and then read what it does to each day. That
          holds the first time and never again — and the add-expense button
          moved up beside the chart, so the reason it was up here went with it.
          What is left is a list of standing costs that changes about twice a
          year, sitting between somebody and the week they came to look at. */}
      <details ref={billsRef} id="cash-bills" className="panel cash-collapse">
        <summary>
          <span>Bills &amp; scheduled payments</span>
          <small>Insurance, the truck payment, rent, quarterly tax — what leaves on its own.</small>
        </summary>
        {billsPanel}
      </details>
    </>
  );
}
