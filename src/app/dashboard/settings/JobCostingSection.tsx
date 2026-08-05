'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { loadedHourlyRate } from '@/lib/cost-truth';
import { setJobCostingAction } from './actions';

/**
 * True labor cost — the two numbers that decide what a job was really worth.
 *
 * "Labor burden" is the trade term and it is nowhere in this UI on purpose. A
 * contractor who has never run payroll software has no reason to know it, and a
 * setting whose LABEL has to be looked up is a setting that gets left at its
 * default. The term lives in one tooltip, for the people who came here looking
 * for it by name.
 *
 * The worked sum at the top is the whole explanation. It used to be a paragraph
 * about payroll taxes with an example built from the SAVED value — so at the
 * default of 0 it read "a $30/hr wage costs you $30/hr", which is true and reads
 * like the field is broken. Now it moves as you type.
 */

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** The wage the worked example is built on. A round number, and a common one. */
const SAMPLE_WAGE = 30;

/**
 * An hourly rate, with cents.
 *
 * formatMoney rounds to whole dollars, which is right for a job total and wrong
 * here: 25% on $30 is $37.50 and rendering it "$38" makes the one sum on the
 * card that has to be checkable not add up. Over a 40-hour week that rounding
 * is $20 of imaginary cost.
 */
function rate(value: number): string {
  return `$${value.toFixed(2)}`;
}

/** Whole dollars when it is whole, cents when it isn't — for the headline sum. */
function shortRate(value: number): string {
  return Number.isInteger(value) ? `$${value}` : `$${value.toFixed(2)}`;
}

function Hint({ text }: { text: string }) {
  return (
    <span className="jc-hint" tabIndex={0} role="note" aria-label={text} title={text}>
      <span aria-hidden="true">?</span>
    </span>
  );
}

/** −/+ stepper. Coarse enough to be useful, bounded so it cannot go silly. */
function Stepper({
  label, value, min, max, step, onChange,
}: { label: string; value: number; min: number; max: number; step: number; onChange: (next: number) => void }) {
  const clamp = (next: number) => Math.min(max, Math.max(min, Math.round(next * 2) / 2));
  return (
    <div className="jc-stepper">
      <button type="button" aria-label={`Decrease ${label}`} disabled={value <= min} onClick={() => onChange(clamp(value - step))}>−</button>
      <button type="button" aria-label={`Increase ${label}`} disabled={value >= max} onClick={() => onChange(clamp(value + step))}>+</button>
    </div>
  );
}

export default function JobCostingSection({
  burdenPct: initialBurden,
  minMarginPct: initialMargin,
}: {
  burdenPct: number;
  minMarginPct: number;
}) {
  const [burden, setBurden] = useState(initialBurden);
  const [margin, setMargin] = useState(initialMargin);
  const [save, setSave] = useState<SaveState>('idle');
  const [, startSaving] = useTransition();
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stored = useRef({ burden: initialBurden, margin: initialMargin });

  useEffect(() => () => {
    if (savedTimer.current) clearTimeout(savedTimer.current);
    if (debounce.current) clearTimeout(debounce.current);
  }, []);

  function persist(next: { burden: number; margin: number }) {
    if (next.burden === stored.current.burden && next.margin === stored.current.margin) return;
    const previous = { ...stored.current };
    setSave('saving');
    startSaving(async () => {
      try {
        await setJobCostingAction({ burdenPct: next.burden, minMarginPct: next.margin });
        stored.current = next;
        setSave('saved');
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSave('idle'), 2400);
      } catch {
        // Put it back. A rate left showing the new number after a failed save
        // tells a contractor their jobs are being costed a way they aren't.
        setBurden(previous.burden);
        setMargin(previous.margin);
        setSave('error');
      }
    });
  }

  /** Steppers save at once; typing waits, so it doesn't save on every keystroke. */
  function edit(field: 'burden' | 'margin', value: number, immediate: boolean) {
    const next = field === 'burden' ? { burden: value, margin } : { burden, margin: value };
    if (field === 'burden') setBurden(value); else setMargin(value);
    if (debounce.current) clearTimeout(debounce.current);
    if (immediate) persist(next);
    else debounce.current = setTimeout(() => persist(next), 700);
  }

  const loaded = loadedHourlyRate(SAMPLE_WAGE, burden);
  const typical = burden >= 20 && burden <= 40;
  const marginAdvised = margin >= 10 && margin <= 20;

  return (
    <div className="jc-card">
      <div className="jc-top">
        <span className="jc-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="2.5" width="16" height="19" rx="2.6" />
            <path d="M8 6.5h8M8 11h2m3 0h3M8 15h2m3 0h3M8 18.6h2m3 0h3" />
          </svg>
        </span>
        <div className="jc-top-text">
          <p className="eyebrow">Job costing</p>
          <h2>True labor cost</h2>
          <p className="jc-lead">
            Include payroll taxes, workers&rsquo; comp, unemployment, paid time off, and other employee costs so
            every clocked hour reflects what labor really costs you.
          </p>
        </div>
        <span className={`jc-save jc-save-${save}`} aria-live="polite">
          {save === 'saving' ? 'Saving…' : save === 'saved' ? '✓ Saved' : save === 'error' ? 'Couldn’t save' : ''}
        </span>
      </div>

      {/* The sum, live. A paragraph about payroll taxes never lands the way one
          worked example does. */}
      <div className="jc-example">
        <span className="jc-example-mark" aria-hidden="true">$</span>
        <span className="jc-example-tag">Example</span>
        <span className="jc-example-part">
          <strong>{shortRate(SAMPLE_WAGE)}</strong> <small>/hr wage</small>
        </span>
        <span className="jc-example-op" aria-hidden="true">+</span>
        <span className="jc-example-part">
          <strong>{burden}%</strong> <small>added labor costs</small>
        </span>
        <span className="jc-example-op" aria-hidden="true">=</span>
        <span className="jc-example-part is-total">
          <strong>{shortRate(loaded)}</strong> <small>/hr true labor cost</small>
        </span>
      </div>

      <div className="jc-grid">
        <div className="jc-block">
          <p className="jc-block-head">
            Added labor costs (%)
            <Hint text="Also commonly called labor burden or loaded labor rate." />
          </p>
          <div className="jc-value-row">
            <span className="jc-value">{burden}%</span>
            <Stepper label="added labor costs" value={burden} min={0} max={200} step={5} onChange={(next) => edit('burden', next, true)} />
          </div>
          <label className="jc-exact">
            <span>Exact</span>
            <input
              type="number" min={0} max={200} step={0.5} value={burden}
              aria-label="Added labor costs percent"
              onChange={(event) => edit('burden', Math.min(200, Math.max(0, Number(event.target.value) || 0)), false)}
            />
            <i aria-hidden="true">%</i>
          </label>
          {burden > 0 ? (
            <>
              <p className="jc-note">Most trades land between 20% and 40%.</p>
              <span className={`jc-tag${typical ? ' is-ok' : ' is-warn'}`}>
                {typical ? '✓ Industry typical' : '⚠ Outside the usual 20–40%'}
              </span>
            </>
          ) : (
            <>
              <p className="jc-note">Hours are costed at the bare wage, so every job will look more profitable than it was.</p>
              <span className="jc-tag is-warn">⚠ Nothing added</span>
            </>
          )}
        </div>

        <div className="jc-block">
          {/* "Warn me below (%)" left you to work out below WHAT. The name says
              what the setting is; the sentence under the number says what it
              does, in the order somebody reads them. */}
          <p className="jc-block-head">
            Low-margin warning
            <Hint text="Compares each job's estimated profit margin against this number." />
          </p>
          <div className="jc-value-row">
            <span className="jc-value">{margin}%</span>
            <Stepper label="low-margin warning" value={margin} min={0} max={100} step={5} onChange={(next) => edit('margin', next, true)} />
          </div>
          <label className="jc-exact">
            <span>Exact</span>
            <input
              type="number" min={0} max={100} step={1} value={margin}
              aria-label="Warn below margin percent"
              onChange={(event) => edit('margin', Math.min(100, Math.max(0, Number(event.target.value) || 0)), false)}
            />
            <i aria-hidden="true">%</i>
          </label>
          {margin > 0 ? (
            <>
              <p className="jc-note">Warn me when a job&rsquo;s estimated margin falls below {margin}%.</p>
              <span className={`jc-tag${marginAdvised ? ' is-ok' : ' is-warn'}`}>
                {marginAdvised ? '✓ Recommended range' : '⚠ Recommended: 10%–20%'}
              </span>
            </>
          ) : (
            <>
              <p className="jc-note">
                No job is ever flagged. A warning that shows on everything gets ignored on everything, so off is a
                real answer.
              </p>
              <span className="jc-tag">Off</span>
            </>
          )}
        </div>

        <div className="jc-block jc-effect">
          <p className="jc-block-head">
            How this affects job cost
            <Hint text="What a crew hour is costed at, and when a job gets a margin flag." />
          </p>
          <ul className="jc-effect-list">
            <li>
              <span className="jc-effect-mark" aria-hidden="true">◍</span>
              <span className="jc-effect-label">Hourly wage</span>
              <span className="jc-effect-value">{rate(SAMPLE_WAGE)}<small>/hr</small></span>
            </li>
            <li>
              <span className="jc-effect-mark is-money" aria-hidden="true">▦</span>
              <span className="jc-effect-label">True hourly cost</span>
              <span className="jc-effect-value is-total">{rate(loaded)}<small>/hr</small></span>
            </li>
            <li>
              <span className="jc-effect-mark is-flag" aria-hidden="true">⚑</span>
              <span className="jc-effect-label">Margin warning</span>
              <span className="jc-effect-value is-flag">{margin > 0 ? `${margin}%` : 'Off'}</span>
            </li>
          </ul>
          <p className="jc-note">
            Shows on every job&rsquo;s costs, in <Link href="/dashboard/crew?tab=jobs">Labor by job</Link>, and as a
            margin badge on <Link href="/dashboard/jobs">the job itself</Link>. A crew member with a different rate
            can be set on <Link href="/dashboard/crew">their own record</Link>.
          </p>
        </div>
      </div>

      <div className="jc-foot">
        <span className="jc-foot-mark" aria-hidden="true">i</span>
        <span>
          Changes only affect future cost records. Past jobs keep the margin they closed with, because the rate is
          stamped onto each cost as it happens.
        </span>
      </div>
    </div>
  );
}
