'use client';

import { useMemo, useState } from 'react';
import { platformFeeForVolume, marginalTierForVolume, volumeForPlatformFee } from '@/lib/pricing';

function money(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}

// A representative single job, priced at the contractor's current marginal rate.
const SAMPLE_JOB = 5000;

/**
 * What the one fee stands in for.
 *
 * Deliberately a list and not a price. The page's whole policy is that it will
 * not quote anybody else's number — plans vary by vendor and change often — so
 * "what the extra buys" has to be said in tools, not in dollars. Each of these
 * is a separate line item in the conventional stack and a thing this account
 * already has.
 */
const REPLACES = [
  'Website + hosting',
  'CRM + client records',
  'Quotes and e-signature',
  'Scheduling and dispatch',
  'Invoicing and payment links',
  'Reviews and marketing',
];

export default function PricingCalculator() {
  const [volume, setVolume] = useState(120_000);
  const [monthlySub, setMonthlySub] = useState(99);

  const stats = useMemo(() => {
    const tier = marginalTierForVolume(volume);
    const yearlyFee = platformFeeForVolume(volume);
    const effectiveRate = volume > 0 ? (yearlyFee / volume) * 100 : 0;
    const sampleJobFee = SAMPLE_JOB * (tier.ratePct / 100);
    const subYearly = Math.max(0, monthlySub) * 12;
    // The number the page was raising and refusing to answer. At the default
    // settings the fee is $1,450 against a $1,188 plan — 22% more, said out
    // loud below, with the volume where the two cross.
    const breakEven = volumeForPlatformFee(subYearly);
    const difference = yearlyFee - subYearly;
    return { tier, yearlyFee, effectiveRate, sampleJobFee, subYearly, breakEven, difference };
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
          {/* The MARGINAL rate — what the next dollar is charged at, not the
              blended rate across everything collected. Calling it "your platform
              rate" invited people to multiply it by their whole volume and get a
              number lower than the bill. */}
          <span className="calc-stat-label">Rate on your next dollar</span>
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

        {/* THE ANSWER, NOT THE SETUP.
            This block used to end at the sentence above and leave the reader to
            do the subtraction. At the default settings that subtraction comes
            out against us — $1,450 of platform fee beside a $1,188 plan — and a
            pricing page that quietly hopes nobody does the arithmetic is worse
            than one that does it for them. So: the difference, in dollars and
            as a percentage, in whichever direction it falls, and the volume
            where the two models cross. */}
        {stats.subYearly > 0 ? (
          <div className="calc-verdict" data-side={stats.difference > 0 ? 'higher' : 'lower'}>
            <p className="calc-verdict-line">
              {stats.difference > 0 ? (
                <>
                  At {money(volume)} a year the platform fee is{' '}
                  <strong>{money(stats.difference)} more</strong> than that plan
                  {stats.subYearly > 0 ? <> ({Math.round((stats.difference / stats.subYearly) * 100)}% more)</> : null}.
                </>
              ) : stats.difference < 0 ? (
                <>
                  At {money(volume)} a year the platform fee is{' '}
                  <strong>{money(-stats.difference)} less</strong> than that plan.
                </>
              ) : (
                <>At {money(volume)} a year the two come to the same figure.</>
              )}
            </p>
            <p className="calc-verdict-break">
              The two models cross at about <strong>{money(stats.breakEven)}</strong> of yearly volume. Below that you
              pay less than the plan; above it you pay more &mdash; and you pay nothing at all in a month nobody pays
              you.
            </p>
            <div className="calc-stack">
              <p className="calc-stack-head">
                {stats.difference > 0 ? 'What that difference is buying' : 'And it still covers'}
              </p>
              <ul>
                {REPLACES.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        <p className="calc-honest">
          A subscription charges that flat amount every month &mdash; at $0 booked or $1M. Let&apos;s Get Quoted
          charges nothing until a homeowner pays you, and the rate drops as you grow. At high volume a flat plan can
          look cheaper on paper &mdash; but it bills you in your slow months, and the entry price of one rarely
          includes everything listed above.{' '}
          {/* Was "applies separately in both cases", which quietly assumed the
              other product processes payments at all, let alone at the same
              rate. It is excluded from the comparison because it is not ours to
              quote for anybody. */}
          Card processing is excluded from this comparison on both sides: rates vary by provider and by payment
          method, and ours goes to Stripe (about 2.9% + 30&cent; per card charge), not to us.
        </p>
      </div>
    </div>
  );
}
