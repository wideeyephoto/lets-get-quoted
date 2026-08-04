'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { loadedHourlyRate } from '@/lib/cost-truth';
import { formatMoney } from '@/lib/jobs';
import { setJobCostingAction } from './actions';

/**
 * The two numbers that decide what a job was really worth.
 *
 * They used to sit in one form under "What an hour really costs, and when to
 * warn you" — two unrelated settings sharing a heading, an explanation written
 * as a paragraph, and a worked example that only reflected the SAVED value. At
 * the default of 0 that example read "a $30/hr wage costs you $30/hr", which is
 * true and reads like the field is broken.
 *
 * Now: one block each, presets for people who don't know their number, and the
 * arithmetic shown live as you type. Each block also says where its effect
 * turns up, because a setting whose result you can't find is a setting you
 * can't check.
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

const BURDEN_PRESETS = [
  { value: 0, label: 'None' },
  { value: 20, label: '20%' },
  { value: 25, label: '25%' },
  { value: 30, label: '30%' },
  { value: 40, label: '40%' },
];

const MARGIN_PRESETS = [
  { value: 0, label: 'Never' },
  { value: 20, label: '20%' },
  { value: 30, label: '30%' },
  { value: 40, label: '40%' },
];

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

  /** Presets save at once; typing waits, so it doesn't save on every keystroke. */
  function edit(field: 'burden' | 'margin', value: number, immediate: boolean) {
    const next = field === 'burden' ? { burden: value, margin } : { burden, margin: value };
    if (field === 'burden') setBurden(value); else setMargin(value);
    if (debounce.current) clearTimeout(debounce.current);
    if (immediate) persist(next);
    else debounce.current = setTimeout(() => persist(next), 700);
  }

  const loaded = loadedHourlyRate(SAMPLE_WAGE, burden);
  const extra = loaded - SAMPLE_WAGE;

  return (
    <div className="jc-card">
      <div className="jc-block">
        <div className="jc-block-head">
          <span className="jc-num" aria-hidden="true">1</span>
          <div>
            <strong>What you pay on top of wages</strong>
            <small>
              Payroll taxes, workers&apos; comp, unemployment and paid time off all land on you. Somebody on{' '}
              {rate(SAMPLE_WAGE)}/hr never costs you {rate(SAMPLE_WAGE)}/hr.
            </small>
          </div>
        </div>

        <div className="jc-presets" role="group" aria-label="Common burden rates">
          {BURDEN_PRESETS.map((preset) => (
            <button
              type="button"
              key={preset.value}
              className={`jc-preset${burden === preset.value ? ' is-on' : ''}`}
              aria-pressed={burden === preset.value}
              onClick={() => edit('burden', preset.value, true)}
            >
              {preset.label}
            </button>
          ))}
          <label className="jc-custom">
            <input
              type="number"
              min={0}
              max={200}
              step={0.5}
              value={burden}
              aria-label="Labour burden percent"
              onChange={(event) => edit('burden', Math.min(200, Math.max(0, Number(event.target.value) || 0)), false)}
            />
            <span>%</span>
          </label>
        </div>

        {/* The arithmetic, live. This is the whole explanation — a paragraph
            about payroll taxes never lands the way one worked sum does. */}
        <div className="jc-math">
          {burden > 0 ? (
            <>
              <span className="jc-math-from">{rate(SAMPLE_WAGE)}/hr wage</span>
              <span className="jc-math-arrow" aria-hidden="true">→</span>
              <span className="jc-math-to">{rate(loaded)}/hr</span>
              <span className="jc-math-note">
                what an hour actually costs you — {rate(extra)} more than the wage
              </span>
            </>
          ) : (
            <span className="jc-math-note is-warn">
              Hours are costed at the bare wage. Every job will look more profitable than it was.
            </span>
          )}
        </div>

        <p className="jc-where">
          Most trades land between 20% and 40%. Shows up on every job&apos;s costs, in{' '}
          <Link href="/dashboard/crew?tab=jobs">Labor by job</Link>, and in your margin. A crew member with a
          different rate can be set on <Link href="/dashboard/crew">their own record</Link>.
        </p>
      </div>

      <div className="jc-block">
        <div className="jc-block-head">
          <span className="jc-num" aria-hidden="true">2</span>
          <div>
            <strong>Warn me when a job keeps too little</strong>
            <small>Puts a flag on a job whose margin falls under your line, while you can still do something.</small>
          </div>
        </div>

        <div className="jc-presets" role="group" aria-label="Margin warning threshold">
          {MARGIN_PRESETS.map((preset) => (
            <button
              type="button"
              key={preset.value}
              className={`jc-preset${margin === preset.value ? ' is-on' : ''}`}
              aria-pressed={margin === preset.value}
              onClick={() => edit('margin', preset.value, true)}
            >
              {preset.label}
            </button>
          ))}
          <label className="jc-custom">
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={margin}
              aria-label="Warn below margin percent"
              onChange={(event) => edit('margin', Math.min(100, Math.max(0, Number(event.target.value) || 0)), false)}
            />
            <span>%</span>
          </label>
        </div>

        <div className="jc-math">
          {margin > 0 ? (
            <span className="jc-math-note">
              A {formatMoney(1000)} job is flagged once its costs pass{' '}
              <strong>{formatMoney(1000 * (1 - margin / 100))}</strong> — that&apos;s keeping less than {margin}%.
            </span>
          ) : (
            <span className="jc-math-note">
              No job is ever flagged. A warning that shows on everything gets ignored on everything, so off is a
              real answer.
            </span>
          )}
        </div>

        <p className="jc-where">
          Shows as a margin badge on <Link href="/dashboard/jobs">the job itself</Link>.
        </p>
      </div>

      <div className="jc-foot">
        <span>
          Changing these never rewrites work already recorded. Burden is stamped onto each cost as it happens, so a
          job you closed last month keeps the margin it closed at.
        </span>
        <span className={`jc-save jc-save-${save}`} aria-live="polite">
          {save === 'saving' ? 'Saving…' : save === 'saved' ? '✓ Saved' : save === 'error' ? 'Couldn’t save' : ''}
        </span>
      </div>
    </div>
  );
}
