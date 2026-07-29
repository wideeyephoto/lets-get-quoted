'use client';

import { useState } from 'react';
import { platformFeeForVolume } from '@/lib/pricing';

// Dead-simple fee calculator: one input (money collected per year) → the real
// platform fee for the year, next to the fixed monthly stack it replaces.
// The point is to demystify the fee (contractors imagine a scary number), not
// to claim we're always cheaper — so we show the honest number and the
// structural difference ($0 in slow months), never a fabricated "you save $X".

const MIN = 50_000;
const MAX = 1_500_000;
const STEP = 10_000;
const PRESETS = [250_000, 500_000, 1_000_000];

const usd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const compact = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M` : `$${Math.round(n / 1_000)}k`;
const round100 = (n: number) => Math.round(n / 100) * 100;

export default function HomeFeeCalculator() {
  const [volume, setVolume] = useState(300_000);

  const fee = platformFeeForVolume(volume);
  const blended = volume > 0 ? (fee / volume) * 100 : 0;

  // A like-for-like monthly stack this replaces (a website + a per-seat
  // field-service CRM), sized to the operation — bigger volume tends to mean
  // more seats. Ranges track the page's cited $16–49/mo site and $50–300+/mo-
  // per-seat CRM figures, so the comparison stays realistic across the slider.
  const seats = Math.min(6, Math.max(1, Math.round(volume / 300_000)));
  const stackLow = round100((30 + seats * 80) * 12);
  const stackHigh = round100((30 + seats * 250) * 12);

  const pct = ((volume - MIN) / (MAX - MIN)) * 100;

  return (
    <div className="hcalc">
      <p className="hcalc-eyebrow">Do the math on your own number</p>
      <p className="hcalc-vol">
        If you collect <strong>{compact(volume)}</strong> a year through the platform&hellip;
      </p>

      <input
        className="hcalc-slider"
        type="range"
        min={MIN}
        max={MAX}
        step={STEP}
        value={volume}
        onChange={(e) => setVolume(Number(e.target.value))}
        style={{ ['--pct' as string]: `${pct}%` }}
        aria-label="Money collected through the platform per year"
      />
      <div className="hcalc-presets">
        {PRESETS.map((p) => (
          <button
            type="button"
            key={p}
            className={`hcalc-chip${volume === p ? ' is-on' : ''}`}
            onClick={() => setVolume(p)}
          >
            {compact(p)}
          </button>
        ))}
      </div>

      <div className="hcalc-result">
        <span className="hcalc-result-l">Your platform fee for the whole year</span>
        <span className="hcalc-result-v">~{usd(fee)}</span>
        <span className="hcalc-result-s">
          &asymp; {blended.toFixed(2)}% blended &middot; and <strong>$0 of it up front</strong>
        </span>
      </div>

      <p className="hcalc-compare">
        The monthly website&nbsp;+&nbsp;CRM stack this replaces, for an operation your size, runs about{' '}
        <strong>
          {usd(stackLow)}&ndash;{usd(stackHigh)}/yr
        </strong>{' '}
        &mdash; billed every month, even in a month you book nothing.
      </p>
      <p className="hcalc-kicker">
        You only ever pay out of a payment a homeowner actually made. <strong>Slow month, no jobs? $0.</strong>
      </p>
    </div>
  );
}
