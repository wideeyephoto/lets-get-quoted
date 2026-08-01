'use client';

import { useId, useState } from 'react';

// A two-handle range. Two number boxes side by side stated a floor and a ceiling
// but never showed the SPAN between them, which is the thing you are actually
// choosing — and let you type a minimum above the maximum, which the form then
// accepted.
//
// Built from two native <input type="range">. That keeps arrow keys, Home/End,
// screen-reader announcements and touch targets for free; a div-and-pointer-
// events version would have to reimplement all of it and would get some of it
// wrong. The handles are clamped so they can cross visually but never in value.
//
// Values are submitted through hidden inputs, so this drops into a plain form
// action with no client state plumbing at the page level.

export type RangeSliderProps = {
  /** Submitted field names for the two ends. */
  nameMin: string;
  nameMax: string;
  min: number;
  max: number;
  step?: number;
  valueMin: number;
  valueMax: number;
  label: string;
  hint?: string;
  /** Renders a raw number as it should read (money, a clock time, a count). */
  format?: (value: number) => string;
  /** Converts a raw number into what the server should receive. */
  serialize?: (value: number) => string;
  minLabel?: string;
  maxLabel?: string;
};

export default function RangeSlider({
  nameMin,
  nameMax,
  min,
  max,
  step = 1,
  valueMin,
  valueMax,
  label,
  hint,
  format = (value) => String(value),
  serialize = (value) => String(value),
  minLabel = 'Minimum',
  maxLabel = 'Maximum',
}: RangeSliderProps) {
  const id = useId();
  const [low, setLow] = useState(Math.min(valueMin, valueMax));
  const [high, setHigh] = useState(Math.max(valueMin, valueMax));

  // One step of daylight between the handles, so "min" and "max" can never be
  // the same value and the span never reads as zero.
  const span = max - min || 1;
  const lowPct = ((low - min) / span) * 100;
  const highPct = ((high - min) / span) * 100;

  return (
    <div className="range-slider">
      <div className="range-slider-head">
        <span className="range-slider-label">{label}</span>
        <output className="range-slider-value" htmlFor={`${id}-low ${id}-high`}>
          {format(low)} <span aria-hidden="true">–</span> {format(high)}
        </output>
      </div>

      <div className="range-slider-track" style={{ ['--low' as string]: `${lowPct}%`, ['--high' as string]: `${highPct}%` }}>
        <span className="range-slider-fill" aria-hidden="true" />
        <input
          id={`${id}-low`}
          className="range-slider-input range-slider-low"
          type="range"
          min={min}
          max={max}
          step={step}
          value={low}
          aria-label={`${minLabel} — ${label}`}
          aria-valuetext={format(low)}
          onChange={(event) => setLow(Math.min(Number(event.target.value), high - step))}
        />
        <input
          id={`${id}-high`}
          className="range-slider-input range-slider-high"
          type="range"
          min={min}
          max={max}
          step={step}
          value={high}
          aria-label={`${maxLabel} — ${label}`}
          aria-valuetext={format(high)}
          onChange={(event) => setHigh(Math.max(Number(event.target.value), low + step))}
        />
      </div>

      <div className="range-slider-ends" aria-hidden="true">
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </div>

      {hint ? <small className="field-hint">{hint}</small> : null}

      <input type="hidden" name={nameMin} value={serialize(low)} />
      <input type="hidden" name={nameMax} value={serialize(high)} />
    </div>
  );
}

// --- helpers for the two shapes this is used in ------------------------------

export function formatMoneyValue(value: number): string {
  return `$${value.toLocaleString('en-US')}`;
}

// Minutes past midnight <-> "HH:MM", so a clock can ride on a numeric slider.
export function minutesToClock(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function clockToMinutes(clock: string, fallback: number): number {
  const match = /^(\d{1,2}):(\d{2})/.exec(clock ?? '');
  if (!match) return fallback;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return Number.isFinite(minutes) ? minutes : fallback;
}

export function formatClockValue(minutes: number): string {
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}
