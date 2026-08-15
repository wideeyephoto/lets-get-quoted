'use client';

import { useId, useMemo, useState } from 'react';
import {
  platformFeeForVolume,
  marginalTierForVolume,
  volumeForPlatformFee,
  paymentBreakdown,
  type PaymentMethod,
  STRIPE_ACH_CAP,
  STRIPE_ACH_PCT,
  STRIPE_CARD_FIXED,
  STRIPE_CARD_PCT,
  ACH_MIN_AMOUNT,
} from '@/lib/pricing';

function money(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}

/** Two decimals — the fees on one job are small enough that rounding hides them. */
function moneyExact(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  const [ticket, setTicket] = useState(2_400);
  const [method, setMethod] = useState<PaymentMethod>('card');
  const methodName = useId();

  /* WHAT ACTUALLY LANDS IN THE BANK.
     The page named Stripe's processing fee in a parenthetical and then computed
     everything without it, so the only number a contractor could take away was
     the smaller of the two costs. This block adds the other one and does the
     subtraction: one payment, both fees, the deposit.

     ACH is offered only at or above ACH_MIN_AMOUNT, which is the product's own
     rule (lib/payments.ts) and not a display choice — so the control follows it
     rather than letting somebody model a $200 bank payment the checkout would
     never offer them. */
  const achAvailable = ticket >= ACH_MIN_AMOUNT;
  const effectiveMethod: PaymentMethod = achAvailable ? method : 'card';
  const breakdown = useMemo(
    () => paymentBreakdown(ticket, effectiveMethod, volume),
    [ticket, effectiveMethod, volume],
  );

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

      {/* ONE PAYMENT, END TO END. */}
      <div className="calc-net">
        <p className="calc-net-head">What lands in your bank on one job</p>

        <div className="calc-net-controls">
          <label className="calc-inline" htmlFor="calc-ticket">
            <span>Typical job</span>
            <span className="calc-inline-input">
              $
              <input
                id="calc-ticket"
                type="number"
                min={50}
                max={100_000}
                step={50}
                value={ticket}
                onChange={(event) => setTicket(Number(event.target.value))}
                aria-label="Typical amount a customer pays you in one payment"
              />
            </span>
          </label>

          <fieldset className="calc-method">
            <legend>Paid by</legend>
            <label>
              <input
                type="radio"
                name={methodName}
                value="card"
                checked={effectiveMethod === 'card'}
                onChange={() => setMethod('card')}
              />
              <span>Card</span>
            </label>
            <label data-disabled={!achAvailable}>
              <input
                type="radio"
                name={methodName}
                value="ach"
                checked={effectiveMethod === 'ach'}
                disabled={!achAvailable}
                onChange={() => setMethod('ach')}
              />
              <span>Bank (ACH)</span>
            </label>
          </fieldset>
        </div>

        {!achAvailable ? (
          <p className="calc-net-note">
            Bank payment is offered automatically at {money(ACH_MIN_AMOUNT)} and above, where its capped fee
            beats the card percentage. Below that, checkout is card-only.
          </p>
        ) : null}

        <ul className="calc-net-rows">
          <li>
            <span>Customer pays</span>
            <b>{moneyExact(breakdown.amount)}</b>
          </li>
          <li>
            <span>Stripe processing</span>
            <b className="calc-net-minus">
              &minus;{moneyExact(breakdown.stripeFee)}
            </b>
            <small>
              {effectiveMethod === 'ach'
                ? `${STRIPE_ACH_PCT}%, capped at ${money(STRIPE_ACH_CAP)}`
                : `${STRIPE_CARD_PCT}% + ${Math.round(STRIPE_CARD_FIXED * 100)}¢`}
            </small>
          </li>
          <li>
            <span>Platform fee</span>
            <b className="calc-net-minus">&minus;{moneyExact(breakdown.platformFee)}</b>
            <small>{stats.tier.rate} at {money(volume)} of yearly volume</small>
          </li>
          <li className="calc-net-total">
            <span>Deposited to your bank</span>
            <b>{moneyExact(breakdown.net)}</b>
            <small>
              {((breakdown.net / (breakdown.amount || 1)) * 100).toFixed(1)}% of what the customer paid
            </small>
          </li>
        </ul>

        <p className="calc-net-note">
          An estimate. Stripe&apos;s published US rates are used above; a real bill can differ &mdash;
          international and AmEx cards cost more, and an account can hold negotiated rates. Stripe&apos;s
          share goes to Stripe, not to us. Refund a payment and our platform fee comes back with it.
        </p>
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
