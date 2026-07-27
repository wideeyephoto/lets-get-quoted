'use client';

import { useMemo, useState } from 'react';
import { platformFeeForVolume, marginalTierForVolume } from '@/lib/pricing';

function money(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}

// A representative single job, priced at the contractor's current marginal rate.
const SAMPLE_JOB = 5000;

export default function PricingCalculator() {
  const [volume, setVolume] = useState(120_000);
  const [monthlySub, setMonthlySub] = useState(99);

  const stats = useMemo(() => {
    const tier = marginalTierForVolume(volume);
    const yearlyFee = platformFeeForVolume(volume);
    const effectiveRate = volume > 0 ? (yearlyFee / volume) * 100 : 0;
    const sampleJobFee = SAMPLE_JOB * (tier.ratePct / 100);
    const subYearly = Math.max(0, monthlySub) * 12;
    return { tier, yearlyFee, effectiveRate, sampleJobFee, subYearly };
  }, [volume, monthlySub]);

  return (
    <div className="calc">
      <div className="calc-controls">
        <label className="calc-field" htmlFor="calc-volume">
          <span className="calc-label">How much do you collect through the platform a year?</span>
          <span className="calc-value">{money(volume)}</span>
          <input
            id="calc-volume"
            type="range"
            min={0}
            max={1_000_000}
            step={5_000}
            value={volume}
            onChange={(event) => setVolume(Number(event.target.value))}
          />
          <span className="calc-range-ends"><span>$0</span><span>$1M+</span></span>
        </label>
      </div>

      <div className="calc-readout">
        <div className="calc-stat accent">
          <span className="calc-stat-label">Your platform rate</span>
          <strong>{stats.tier.rate}</strong>
          <span className="calc-stat-note">Tier {stats.tier.tier} · on the next dollar you collect</span>
        </div>
        <div className="calc-stat">
          <span className="calc-stat-label">Platform fee for the year</span>
          <strong>{money(stats.yearlyFee)}</strong>
          <span className="calc-stat-note">{stats.effectiveRate.toFixed(2)}% blended, across brackets</span>
        </div>
        <div className="calc-stat">
          <span className="calc-stat-label">Fee on a {money(SAMPLE_JOB)} job</span>
          <strong>{money(stats.sampleJobFee)}</strong>
          <span className="calc-stat-note">at your current rate</span>
        </div>
      </div>

      <div className="calc-compare">
        <div className="calc-compare-row">
          <label className="calc-inline" htmlFor="calc-sub">
            <span>Compare to a monthly software plan of</span>
            <span className="calc-inline-input">
              $
              <input
                id="calc-sub"
                type="number"
                min={0}
                max={2000}
                step={1}
                value={monthlySub}
                onChange={(event) => setMonthlySub(Number(event.target.value))}
                aria-label="Monthly subscription cost to compare against"
              />
              <span>/mo</span>
            </span>
          </label>
          <span className="calc-compare-out">
            = <strong>{money(stats.subYearly)}</strong>/yr, billed whether you book work or not
          </span>
        </div>
        <p className="calc-honest">
          A subscription charges that flat amount every month — at $0 booked or $1M. Let&apos;s Get Quoted charges
          nothing until a homeowner pays you, and the rate drops as you grow. At high volume a flat plan can look
          cheaper on paper — but it bills you in your slow months, and it doesn&apos;t include your website, quotes,
          scheduling, and CRM. Standard Stripe processing (about 2.9% + 30&cent; per card charge) applies separately in
          both cases.
        </p>
      </div>
    </div>
  );
}
