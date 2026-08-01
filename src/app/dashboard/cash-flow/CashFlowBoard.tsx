'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import SaveButton from '@/components/save-button';
import { buildForecast, KIND_LABEL, type CashEvent } from '@/lib/cash-forecast';
import CashChart, { type LineKey } from './CashChart';

// The interactive half of the cash-flow page.
//
// Everything here recomputes in the browser. The server hands over a list of
// dated money movements once; moving the balance slider re-runs the same pure
// forecast the server would have run, which is what makes dragging it feel like
// a dial rather than a page load.

type Props = {
  events: CashEvent[];
  todayKey: string;
  horizonDays: number;
  savedBalance: number | null;
  savedBuffer: number;
  savedCreditLine: number;
  balanceAt: string | null;
  paymentLagDays: number;
  paymentLagMeasured: boolean;
  unbilled: { count: number; total: number };
  settingsAvailable: boolean;
  saveSettings: (formData: FormData) => void | Promise<void>;
};

const LATE_DAYS_DEFAULT = 7;

const OPTIONAL_LINES: { key: LineKey; label: string; hint: string }[] = [
  { key: 'worst', label: 'Late-payment scenario', hint: 'Customer money arrives late and estimated costs run 10% over.' },
  { key: 'required', label: 'Minimum cash needed', hint: 'What you need on each day to cover everything still ahead.' },
  { key: 'incoming', label: 'Expected money in', hint: 'Running total of customer payments expected.' },
  { key: 'outgoing', label: 'Committed money out', hint: 'Running total of payroll, bills and materials.' },
  { key: 'credit', label: 'Credit floor', hint: 'How far below zero your overdraft or credit line reaches.' },
];

const BUFFER_PRESETS = [0, 2500, 5000, 10000];

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
  events,
  todayKey,
  horizonDays,
  savedBalance,
  savedBuffer,
  savedCreditLine,
  balanceAt,
  paymentLagDays,
  paymentLagMeasured,
  unbilled,
  settingsAvailable,
  saveSettings,
}: Props) {
  const [balance, setBalance] = useState<number>(savedBalance ?? 0);
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

  const forecast = useMemo(
    () =>
      buildForecast(events, {
        todayKey,
        days: horizonDays,
        startingBalance: balance,
        buffer,
        // The dashed line only means anything when it's actually modelling a
        // delay, so turning the line on turns the delay on with it.
        lateDays: lines.worst ? lateDays || LATE_DAYS_DEFAULT : 0,
        creditLine,
      }),
    [events, todayKey, horizonDays, balance, buffer, lateDays, lines.worst, creditLine],
  );

  const dirty =
    balance !== (savedBalance ?? 0) || buffer !== savedBuffer || creditLine !== savedCreditLine;
  const balanceAge = balanceAt ? daysAgo(balanceAt) : null;
  const stale = balanceAge !== null && balanceAge >= 7;

  // The slider's ceiling is fixed on first render. Deriving it from the current
  // balance would make the track grow under the thumb as you drag it right.
  const sliderMax = useMemo(() => {
    const basis = Math.max(savedBalance ?? 0, forecast.totals.outgoing * 1.5, 10000);
    return Math.ceil((basis * 2) / 1000) * 1000;
  }, [savedBalance, forecast.totals.outgoing]);

  const activeDays = forecast.days.filter((day) => day.events.length > 0);
  const worstLine = lines.worst;

  const status: { tone: 'ok' | 'warn' | 'alert'; text: string } = forecast.overdraft
    ? { tone: 'alert', text: `Overdrawn ${dayLabel(forecast.overdraft.dateKey)}` }
    : forecast.firstBelowBuffer
      ? { tone: 'warn', text: `Dips into your buffer ${dayLabel(forecast.firstBelowBuffer.dateKey)}` }
      : { tone: 'ok', text: 'Stays above your buffer' };

  return (
    <>
      <form action={saveSettings} className="panel cash-controls">
        <div className="cash-control-grid">
          <div className="cash-control">
            <div className="cash-control-head">
              <label htmlFor="cash-balance-exact">Money in the bank today</label>
              <div className="cash-amount-field">
                <span aria-hidden="true">$</span>
                <input
                  id="cash-balance-exact"
                  type="number"
                  min={0}
                  step={100}
                  value={balance}
                  onChange={(event) => setBalance(Math.max(0, Number(event.target.value) || 0))}
                />
              </div>
            </div>
            <input
              className="cash-range"
              type="range"
              min={0}
              max={sliderMax}
              step={100}
              value={Math.min(balance, sliderMax)}
              aria-label="Starting bank balance"
              aria-valuetext={money(balance)}
              onChange={(event) => setBalance(Number(event.target.value))}
            />
            <small className="field-hint">
              {balanceAt ? (
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
                  {preset === 0 ? 'None' : money(preset)}
                </button>
              ))}
            </div>
            <small className="field-hint">The lowest you&rsquo;re willing to let the account get. Drag the dashed line to move it.</small>
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
              <input type="hidden" name="balance" value={balance} />
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

      <div className="workspace-metric-grid four-up cash-stat-grid">
        <article className={`workspace-metric-card${forecast.lowest.balance < buffer ? ' is-loss' : ''}`}>
          <span className="workspace-metric-label">Lowest balance</span>
          <strong className={`workspace-metric-value${forecast.lowest.balance < 0 ? ' is-negative' : ''}`}>
            {money(forecast.lowest.balance)}
          </strong>
          <p className="workspace-metric-note">{dayLabel(forecast.lowest.dateKey)} — the tightest day ahead.</p>
        </article>
        <article className="workspace-metric-card">
          <span className="workspace-metric-label">Ending cash</span>
          <strong className={`workspace-metric-value${forecast.ending < 0 ? ' is-negative' : ''}`}>{money(forecast.ending)}</strong>
          <p className="workspace-metric-note">After {horizonDays} days, {money(forecast.totals.incoming)} in and {money(forecast.totals.outgoing)} out.</p>
        </article>
        <article className={`workspace-metric-card${status.tone === 'ok' ? '' : ' is-loss'}`}>
          <span className="workspace-metric-label">First warning</span>
          <strong className={`workspace-metric-value${status.tone === 'alert' ? ' is-negative' : ''}`}>
            {forecast.overdraft
              ? dayLabel(forecast.overdraft.dateKey)
              : forecast.firstBelowBuffer
                ? dayLabel(forecast.firstBelowBuffer.dateKey)
                : 'None'}
          </strong>
          <p className="workspace-metric-note">
            {forecast.overdraft
              ? 'The day the account goes negative.'
              : forecast.firstBelowBuffer
                ? `First day under your ${money(buffer)} buffer.`
                : 'Stays above your buffer the whole time.'}
          </p>
        </article>
        <article className="workspace-metric-card accent">
          <span className="workspace-metric-label">Safe starting cash</span>
          <strong className="workspace-metric-value">{money(forecast.safeStartingCash)}</strong>
          <p className="workspace-metric-note">
            {forecast.safeStartingCash > balance
              ? `${money(forecast.safeStartingCash - balance)} more than you have today.`
              : 'What you need today to stay above the buffer all month.'}
          </p>
        </article>
      </div>

      <section className="panel workspace-section-card cash-chart-card">
        <div className="section-heading workspace-section-heading cash-chart-heading">
          <div>
            <p className="eyebrow">Projected account balance</p>
            <h2>What the bank should say each day</h2>
          </div>
          <span className={`cash-status-pill tone-${status.tone}`}>{status.text}</span>
        </div>

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
      </section>

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
              purpose — there&rsquo;s no date to put it on until you ask for it. <Link href="/dashboard/jobs">Send those invoices →</Link>
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
