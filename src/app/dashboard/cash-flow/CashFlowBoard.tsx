'use client';

import Link from 'next/link';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import SaveButton from '@/components/save-button';
import ModalDialog from '@/components/modal-dialog';
import { buildForecast, KIND_LABEL, type CashEvent } from '@/lib/cash-forecast';
import { cashOutlook } from '@/lib/cash-outlook';
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

const LATE_DAYS_DEFAULT = 7;

// A fixed ceiling, not one derived from the account's own numbers. A track that
// re-scales to whatever you last saved moves under the thumb as you drag it, and
// a shop holding half a million in the bank shouldn't hit the end of the slider.
// The dollar box beside it is there for anything the track is too coarse for.
const BALANCE_SLIDER_MAX = 500_000;

const OPTIONAL_LINES: { key: LineKey; label: string; hint: string }[] = [
  { key: 'worst', label: 'Late-payment scenario', hint: 'Customer money arrives late and estimated costs run 10% over.' },
  { key: 'required', label: 'Minimum cash needed', hint: 'What you need on each day to cover everything still ahead.' },
  { key: 'incoming', label: 'Expected money in', hint: 'Running total of customer payments expected.' },
  { key: 'outgoing', label: 'Committed money out', hint: 'Running total of payroll, bills and materials.' },
  { key: 'credit', label: 'Credit floor', hint: 'How far below zero your overdraft or credit line reaches.' },
];

const BUFFER_PRESETS = [0, 2500, 5000, 10000];

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
  const billsRef = useRef<HTMLDivElement>(null);
  const revealBills = useCallback(() => {
    billsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  /**
   * "Add your bank balance to start the forecast" used to be a <span> styled as
   * a pill. It looked like the button it needed to be, and clicking it did
   * nothing — the field it was asking for was several hundred pixels further
   * down, unlinked. Now the prompt is a real button and it puts the cursor in
   * the field, so the ask and the answer are one press apart.
   */
  const balanceRef = useRef<HTMLInputElement>(null);
  const focusBalance = useCallback(() => {
    const field = balanceRef.current;
    if (!field) return;
    field.scrollIntoView({ behavior: 'smooth', block: 'center' });
    field.focus({ preventScroll: true });
    field.select();
  }, []);
  /**
   * NULL IS A VALUE HERE, and it is the whole point.
   *
   * This used to be `savedBalance ?? 0`, which quietly turned "nobody has told
   * us" into "there is nothing in the account". Every balance on the curve was
   * then a fiction, and the page printed those fictions to the dollar next to
   * the word "Overdrawn". Kept as null, the same forecast still runs — the
   * SHAPE of the month is real either way — and the readouts that depend on a
   * starting point can decline to answer.
   *
   * Typing or dragging fills it in immediately, before saving: the forecast
   * becoming yours is the reward for entering the number.
   */
  const [balance, setBalance] = useState<number | null>(savedBalance);
  const [buffer, setBuffer] = useState<number>(savedBuffer);
  const [creditLine, setCreditLine] = useState<number>(savedCreditLine);
  const [lateDays, setLateDays] = useState<number>(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [lines, setLines] = useState<Record<LineKey, boolean>>({
    confirmed: true,
    worst: false,
    incoming: false,
    outgoing: false,
    credit: false,
    required: false,
  });

  // `savedBalance`, not `balance`: dragging the slider explores a scenario, it
  // does not commit a figure. Once a number is in the box the projection is
  // theirs, saved or not.
  const balanceKnown = balance !== null;
  const startingBalance = balance ?? 0;
  const longHorizon = Math.max(horizonDays, longDays ?? horizonDays);

  const modelledLateDays = lines.worst ? lateDays || LATE_DAYS_DEFAULT : 0;

  const forecast = useMemo(
    () =>
      buildForecast(events, {
        todayKey,
        days: horizonDays,
        startingBalance,
        buffer,
        // The dashed line only means anything when it's actually modelling a
        // delay, so turning the line on turns the delay on with it.
        lateDays: modelledLateDays,
        creditLine,
      }),
    [events, todayKey, horizonDays, startingBalance, buffer, modelledLateDays, creditLine],
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
        : buildForecast(events, {
            todayKey,
            days: longHorizon,
            startingBalance,
            buffer,
            lateDays: modelledLateDays,
            creditLine,
          }),
    [forecast, longHorizon, events, todayKey, horizonDays, startingBalance, buffer, modelledLateDays, creditLine],
  );

  const outlook = useMemo(
    () =>
      cashOutlook({
        long: longForecast,
        todayKey,
        windowDays: horizonDays,
        longDays: longHorizon,
        buffer,
        balanceKnown,
        balance: startingBalance,
      }),
    [longForecast, todayKey, horizonDays, longHorizon, buffer, balanceKnown, startingBalance],
  );

  /** The floor over the whole horizon — the last of the lows is the deepest. */
  const longLow = outlook.lows[outlook.lows.length - 1];
  /** Where the window ends if every estimate turns out to be nothing. */
  const confirmedEnding = forecast.days[forecast.days.length - 1]?.confirmedOnly ?? 0;

  const dirty = balance !== savedBalance || buffer !== savedBuffer || creditLine !== savedCreditLine;
  const balanceAge = balanceAt ? daysAgo(balanceAt) : null;
  const stale = balanceAge !== null && balanceAge >= 7;

  // The slider's ceiling is fixed on first render. Deriving it from the current
  // balance would make the track grow under the thumb as you drag it right.
  const activeDays = forecast.days.filter((day) => day.events.length > 0);
  const worstLine = lines.worst;

  const tone = STATUS_TONE[outlook.status];

  const chart = (
    <>
      <CashChart
        forecast={forecast}
        buffer={buffer}
        creditLine={creditLine}
        lines={lines}
        lateDays={lateDays || LATE_DAYS_DEFAULT}
        onBufferChange={setBuffer}
        onBalanceChange={setBalance}
        selected={selected}
        onSelect={setSelected}
      />

      <div className="cash-legend">
        <span className="cash-legend-item">
          <i className="cash-swatch projected" /> Projected balance
        </span>
        <span className="cash-legend-item">
          <i className="cash-swatch confirmed" /> Confirmed money only
        </span>
        {worstLine ? (
          <span className="cash-legend-item">
            <i className="cash-swatch worst" /> Payments {lateDays || LATE_DAYS_DEFAULT} days late
          </span>
        ) : null}
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
            {balanceKnown
              ? 'Payroll, bills and materials going out; deposits, invoices and plans coming in — your balance day by day, and the first day it falls below its safety buffer.'
              : 'See how expected payments and planned spending could change your bank balance day by day. We’ll flag the first day it’s projected to fall below your minimum cash buffer.'}
          </p>

          {/* STEP ONE, AND ONLY WHEN IT IS MISSING.
              The page used to open on a forecast and keep the one number that
              makes a forecast possible in a settings row below three charts.
              Everything above this line is a shape; everything below it is a
              balance. */}
          {balanceKnown ? null : (
            <div className="cash-setup">
              <p className="cash-setup-eyebrow">Preview — starting balance needed</p>
              <p className="cash-setup-note">
                Expected money in and planned spending are included, but projected balances and
                low-cash warnings won&rsquo;t reflect your actual position until you enter
                today&rsquo;s bank balance.
              </p>
              <button type="button" className="btn primary cash-setup-cta" onClick={focusBalance}>
                Enter today&rsquo;s bank balance
              </button>
            </div>
          )}

          {/* THE DECISION, ABOVE THE PICTURE OF IT.
              Status, when it goes wrong, how much room there is, and what it
              would take to fix — before the chart, because those four are what
              somebody opened the page to find out. The chart is the evidence
              for them, not the way to work them out. */}
          <div className={`cash-decision tone-${tone}`}>
            <div className="cash-decision-head">
              {balanceKnown ? (
                <span className={`cash-status-pill tone-${tone}`}>{outlook.label}</span>
              ) : (
                <button type="button" className={`cash-status-pill is-action tone-${tone}`} onClick={focusBalance}>
                  {outlook.label}
                </button>
              )}
              <p className="cash-decision-sentence">{outlook.sentence}</p>
            </div>

            <dl className="cash-decision-facts">
              <div>
                <dt>Next warning</dt>
                <dd className={outlook.risk ? 'is-risk' : ''}>
                  {balanceKnown ? (outlook.risk ? outlook.risk.label : `None in ${longHorizon} days`) : '—'}
                </dd>
                <small>
                  {!balanceKnown
                    ? 'Needs today’s bank balance.'
                    : outlook.risk
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
                <dt>{balanceKnown ? 'Funding needed' : 'Starting balance needed'}</dt>
                <dd className={outlook.funding > 0 ? 'is-risk' : ''}>{money(outlook.funding)}</dd>
                <small>
                  {!balanceKnown
                    ? 'What the account has to start with to clear the buffer — true whether or not you’ve entered a balance.'
                    : outlook.funding > 0
                      ? 'Cash that has to arrive before the low point.'
                      : 'Nothing needed — the movements clear the buffer on their own.'}
                </small>
              </div>
            </dl>
          </div>

          <div className="cash-hero-chart">
            <div className="cash-hero-chart-head">
              <span className="cash-hero-chart-label">
                {balanceKnown ? 'Projected account balance' : 'Cash movement preview'}
              </span>
              <span className="cash-hero-chart-sub">
                After {horizonDays} days: {balanceKnown ? money(forecast.ending) : money(forecast.ending) + ' net'}, with{' '}
                {money(forecast.totals.incoming)} in and {money(forecast.totals.outgoing)} out.
              </span>
            </div>
            {chart}
            {/* Under the chart rather than instead of it. The shape of the
                week — what lands when — is real and useful even with the
                starting point missing; it is only the absolute balance, and
                therefore every claim about running out, that is not. */}
            {balanceKnown ? null : (
              <p className="cash-provisional-note">
                <strong>Movement, not balance.</strong> This line starts from zero, so it shows
                what the month does to your account rather than where the account ends up. Enter
                today&rsquo;s balance and the same line becomes a projected balance with real
                warnings on it.
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

      <form action={saveSettings} className="panel cash-controls">
        <div className="cash-control-grid">
          <div className="cash-control">
            <div className="cash-control-head">
              <label htmlFor="cash-balance-exact">Money in the bank today</label>
              <div className="cash-amount-field">
                <span aria-hidden="true">$</span>
                <input
                  id="cash-balance-exact"
                  ref={balanceRef}
                  type="number"
                  min={0}
                  step={100}
                  // Empty, not 0. A zero sitting in the box the moment the page
                  // loads is the same lie as a zero on the curve — it reads as
                  // an answer somebody gave.
                  value={balance === null ? '' : balance}
                  placeholder="Not set"
                  onChange={(event) => {
                    const raw = event.target.value.trim();
                    setBalance(raw === '' ? null : Math.max(0, Number(raw) || 0));
                  }}
                />
              </div>
            </div>
            <input
              className="cash-range"
              type="range"
              min={0}
              max={BALANCE_SLIDER_MAX}
              step={100}
              value={Math.min(startingBalance, BALANCE_SLIDER_MAX)}
              aria-label="Starting bank balance"
              aria-valuetext={balanceKnown ? money(startingBalance) : 'Not set'}
              onChange={(event) => setBalance(Number(event.target.value))}
            />
            <small className="field-hint">
              {balanceAt && balanceKnown ? (
                stale ? (
                  <>
                    <strong>Last checked {balanceAge} days ago.</strong> Open your banking app and put today&rsquo;s number in —
                    everything below is built on it.
                  </>
                ) : (
                  <>Last saved {balanceAge === 0 ? 'today' : balanceAge === 1 ? 'yesterday' : `${balanceAge} days ago`}.</>
                )
              ) : (
                <>Nothing saved yet. Type what your account actually says and save it, so this page starts from the truth.</>
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
          <label className="cash-switch">
            <input
              type="checkbox"
              checked={worstLine}
              onChange={(event) => {
                setLines((current) => ({ ...current, worst: event.target.checked }));
                if (event.target.checked && lateDays === 0) setLateDays(LATE_DAYS_DEFAULT);
              }}
            />
            <span>
              <strong>Model customer payments arriving late</strong>
              <small>
                {worstLine ? (
                  <>
                    Shifts every customer payment{' '}
                    <select
                      className="cash-inline-select"
                      value={lateDays || LATE_DAYS_DEFAULT}
                      onChange={(event) => setLateDays(Number(event.target.value))}
                      aria-label="How many days late"
                    >
                      {[3, 7, 14, 21].map((option) => (
                        <option key={option} value={option}>
                          {option} days
                        </option>
                      ))}
                    </select>{' '}
                    later and runs estimated costs 10% over.
                  </>
                ) : (
                  'Adds a dashed stress-test line — the same month if everyone pays you late.'
                )}
              </small>
            </span>
          </label>

          {settingsAvailable ? (
            <div className="cash-save">
              {/* Omitted rather than sent as 0 when nobody has entered one —
                  saving a zero here would write the very fiction the null is
                  there to prevent. */}
              {balance === null ? null : <input type="hidden" name="balance" value={balance} />}
              <input type="hidden" name="buffer" value={buffer} />
              <input type="hidden" name="creditLine" value={creditLine} />
              {/* "Saved" is only true if something ever was. On a fresh account
                  the button sits disabled saying what it will do, not claiming
                  it already did it. */}
              <SaveButton className="btn secondary" disabled={!dirty} pendingLabel="Saving…">
                {dirty || savedBalance === null ? 'Save these numbers' : 'Saved'}
              </SaveButton>
            </div>
          ) : null}
        </div>
      </form>

      {/* THE MEASUREMENTS, under the decision rather than instead of it.
          "First warning" used to live here and reported None whenever the dip
          fell past the right edge of the chart; it has moved up into the
          decision block, where it is answered against the whole horizon. */}
      <div className="workspace-metric-grid four-up cash-stat-grid">
        <article className={`workspace-metric-card${balanceKnown && forecast.lowest.balance < buffer ? ' is-loss' : ''}`}>
          <span className="workspace-metric-label">
            {balanceKnown ? 'Lowest balance' : `Biggest dip in ${horizonDays} days`}
          </span>
          <strong className={`workspace-metric-value${forecast.lowest.balance < 0 ? ' is-negative' : ''}`}>
            {money(forecast.lowest.balance)}
          </strong>
          <p className="workspace-metric-note">
            {dayLabel(forecast.lowest.dateKey)} —{' '}
            {balanceKnown ? 'the tightest day ahead.' : 'how far below today the month takes you.'}
          </p>
        </article>

        {longHorizon > horizonDays ? (
          <article className={`workspace-metric-card${balanceKnown && longLow.balance < buffer ? ' is-loss' : ''}`}>
            <span className="workspace-metric-label">
              {balanceKnown ? `Lowest in ${longHorizon} days` : `Biggest dip in ${longHorizon} days`}
            </span>
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
          <span className="workspace-metric-label">{balanceKnown ? 'Ending cash' : `Net change in ${horizonDays} days`}</span>
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
            {!balanceKnown
              ? `What the account has to start with to clear the buffer for ${longHorizon} days.`
              : outlook.funding > 0
                ? `${money(outlook.funding)} more than you have today.`
                : `What you need today to stay above the buffer for ${longHorizon} days.`}
          </p>
        </article>
      </div>

      <div ref={billsRef} id="cash-bills">{billsPanel}</div>

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
            {activeDays.map((day) => (
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
      </section>
    </>
  );
}
